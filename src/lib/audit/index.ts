import { getDb } from "@/db/client";
import { auditEvents } from "@/db/schema/system";
import { logger } from "@/lib/logger";

export interface RecordAuditEventParams {
  tenantId?: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function recordAuditEvent(params: RecordAuditEventParams): Promise<void> {
  try {
    const db = getDb();
    const isUuid = params.userId && UUID_REGEX.test(params.userId);
    const payload = {
      ...(params.payload || {}),
      ...(params.userId && !isUuid ? { userIdentifier: params.userId } : {}),
    };

    await db.insert(auditEvents).values({
      tenantId: params.tenantId || null,
      userId: isUuid ? params.userId : null,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId || null,
      payload,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
    });
  } catch (error) {
    // Audit logging failure should log an error but not necessarily crash the business flow
    logger.error({
      message: "Failed to persist audit event",
      error,
      details: { action: params.action, resourceType: params.resourceType, resourceId: params.resourceId },
    });
  }
}
