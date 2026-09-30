import { getDb } from "@/db/client";
import { inAppNotifications } from "@/db/schema/communication";
import {
  CommunicationChannelAdapter,
  SendCommunicationParams,
  SendCommunicationResult,
} from "../types";
import { logger } from "@/lib/logger";

export class InAppChannelAdapter implements CommunicationChannelAdapter {
  readonly channel = "IN_APP" as const;

  async send(
    params: SendCommunicationParams,
    tx?: any
  ): Promise<SendCommunicationResult> {
    try {
      const recipientType = params.recipient.customerId ? "CUSTOMER" : "STAFF";
      const recipientId =
        params.recipient.customerId ||
        params.recipient.staffId ||
        params.recipient.roleScope ||
        "SYSTEM";

      const dbExecutor = tx || getDb();

      const [notification] = await dbExecutor
        .insert(inAppNotifications)
        .values({
          tenantId: params.tenantId,
          outletId: params.outletId,
          recipientType,
          recipientId,
          roleScope: params.recipient.roleScope || null,
          title: params.title,
          body: params.body,
          eventType: params.eventType,
          isRead: false,
          deepLink: params.deepLink || null,
          metadata: params.metadata || {},
        })
        .returning();

      logger.info({
        message: "In-app notification created successfully",
        tenantId: params.tenantId,
        details: {
          notificationId: notification.notificationId,
          recipientId,
          eventType: params.eventType,
        },
      });

      return {
        success: true,
        providerReference: notification.notificationId,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({
        message: "Failed to dispatch in-app notification",
        error: errMsg,
        tenantId: params.tenantId,
      });
      return {
        success: false,
        error: errMsg,
      };
    }
  }
}
