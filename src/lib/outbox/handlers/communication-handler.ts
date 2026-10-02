import { OutboxEvent, OutboxEventHandler, ProcessEventResult } from "../types";
import { getCommunicationEngine } from "@/lib/communication/engine";
import { DomainEvent, DomainEventType, VerticalType } from "@/lib/events/types";
import { getDb } from "@/db/client";
import { communicationDeliveryLogs } from "@/db/schema/communication";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";

/**
 * Handles communication dispatch (In-App, SMS DLT, WhatsApp) for domain outbox events.
 * 
 * Duplicate-Safety Guarantee:
 * - Checks whether a successful communication_delivery_logs entry already exists for this outboxId
 *   prior to invoking external communication providers.
 */
export class CommunicationEventHandler implements OutboxEventHandler {
  supports(event: OutboxEvent): boolean {
    // Communication engine supports all standard business notifications
    return Boolean(event.eventType);
  }

  async handle(event: OutboxEvent): Promise<ProcessEventResult> {
    try {
      const db = getDb();

      // Check if delivery was already accomplished in a prior partial run
      const existingSuccess = await db
        .select()
        .from(communicationDeliveryLogs)
        .where(
          and(
            eq(communicationDeliveryLogs.outboxId, event.outboxId),
            eq(communicationDeliveryLogs.status, "DELIVERED")
          )
        )
        .limit(1);

      if (existingSuccess.length > 0) {
        logger.info({
          message: "Communication delivery already succeeded on previous attempt; skipping external provider dispatch",
          module: "OUTBOX_COMMUNICATION",
          tenantId: event.tenantId,
          details: { outboxId: event.outboxId, eventId: event.eventId },
        });
        return { success: true, providerRef: existingSuccess[0].providerReference || undefined };
      }

      const domainEvent: DomainEvent<Record<string, unknown>> = {
        eventId: event.eventId,
        eventType: event.eventType as DomainEventType,
        tenantId: event.tenantId,
        outletId: event.outletId || undefined,
        vertical: event.vertical as VerticalType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        occurredAt: event.createdAt.toISOString(),
        payload: (event.payload || {}) as Record<string, unknown>,
        idempotencyKey: event.idempotencyKey,
      };

      const commEngine = getCommunicationEngine();
      const summary = await commEngine.processEvent(domainEvent, {
        outboxId: event.outboxId,
      });

      const hasFailures = summary.failedChannels.length > 0;
      if (hasFailures && summary.successfulChannels.length === 0) {
        return {
          success: false,
          retryable: true,
          error: `Failed to dispatch communication channels: ${summary.failedChannels.join(", ")}`,
        };
      }

      return {
        success: true,
        providerRef: summary.successfulChannels.join(","),
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isRetryable = !errMsg.includes("MALFORMED") && !errMsg.includes("INVALID_ARGUMENT");
      return {
        success: false,
        retryable: isRetryable,
        error: errMsg,
      };
    }
  }
}
