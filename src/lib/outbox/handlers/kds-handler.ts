import { OutboxEvent, OutboxEventHandler, ProcessEventResult } from "../types";
import { generateKdsTasksFromOrderConfirmed } from "@/lib/restaurant/kds-service";
import { logger } from "@/lib/logger";

/**
 * Handles Kitchen Display System (KDS) task generation from ORDER_CONFIRMED events.
 * 
 * Duplicate-Safety Guarantee:
 * - generateKdsTasksFromOrderConfirmed queries existing kdsTasks rows matching orderItemId
 *   before insertion to guarantee idempotent task creation across retries.
 */
export class KdsEventHandler implements OutboxEventHandler {
  supports(event: OutboxEvent): boolean {
    return (
      event.eventType === "ORDER_CONFIRMED" &&
      (event.vertical === "RESTAURANT" || event.vertical === "HOTEL")
    );
  }

  async handle(event: OutboxEvent): Promise<ProcessEventResult> {
    try {
      const orderId = event.aggregateId;
      await generateKdsTasksFromOrderConfirmed(event.tenantId, orderId);

      return {
        success: true,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({
        message: "Failed to generate KDS tasks from outbox event",
        module: "OUTBOX_KDS",
        tenantId: event.tenantId,
        details: { outboxId: event.outboxId, orderId: event.aggregateId, error: errMsg },
      });

      return {
        success: false,
        retryable: true,
        error: errMsg,
      };
    }
  }
}
