import { OutboxEvent, OutboxEventHandler, ProcessEventResult } from "../types";
import { projectOrderEvent } from "@/lib/analytics/projector";
import { logger } from "@/lib/logger";

/**
 * Projector Handler: Asynchronously updates Analytics Read Model projections
 * from authoritative domain events without blocking customer checkout or financial transactions.
 */
export class AnalyticsEventHandler implements OutboxEventHandler {
  supports(event: OutboxEvent): boolean {
    return (
      (event.eventType === "ORDER_CONFIRMED" ||
       event.eventType === "ORDER_COMPLETED" ||
       event.eventType === "ORDER_CANCELLED") &&
      (event.vertical === "RESTAURANT" || event.vertical === "HOTEL")
    );
  }

  async handle(event: OutboxEvent): Promise<ProcessEventResult> {
    try {
      const payload = (event.payload as any) || {};

      await projectOrderEvent({
        tenantId: event.tenantId,
        outletId: event.outletId || payload.outletId,
        vertical: event.vertical,
        eventId: event.eventId,
        orderId: event.aggregateId,
        eventType: event.eventType,
        occurredAt: event.createdAt ? new Date(event.createdAt).toISOString() : undefined,
        totalAmount: payload.totalAmount || "0",
        subtotalAmount: payload.subtotalAmount || "0",
        taxAmount: payload.taxAmount || "0",
        platformFeeAmount: payload.platformFeeAmount || "0",
        discountAmount: payload.discountAmount || "0",
      });

      return {
        success: true,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({
        message: "Failed to project outbox event into analytics",
        module: "OUTBOX_ANALYTICS",
        tenantId: event.tenantId,
        details: { outboxId: event.outboxId, eventType: event.eventType, error: errMsg },
      });

      return {
        success: false,
        retryable: true,
        error: errMsg,
      };
    }
  }
}
