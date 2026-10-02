import { OutboxEvent, OutboxEventHandler, ProcessEventResult } from "./types";
import { CommunicationEventHandler } from "./handlers/communication-handler";
import { KdsEventHandler } from "./handlers/kds-handler";
import { logger } from "@/lib/logger";

export class OutboxDispatcher {
  private handlers: OutboxEventHandler[] = [];

  constructor() {
    this.registerHandler(new CommunicationEventHandler());
    this.registerHandler(new KdsEventHandler());
  }

  registerHandler(handler: OutboxEventHandler): void {
    this.handlers.push(handler);
  }

  async dispatch(event: OutboxEvent): Promise<ProcessEventResult> {
    const matching = this.handlers.filter((h) => h.supports(event));

    if (matching.length === 0) {
      logger.info({
        message: "No specific handler registered for outbox event; marking complete",
        module: "OUTBOX_DISPATCHER",
        details: { eventType: event.eventType, vertical: event.vertical },
      });
      return { success: true };
    }

    const providerRefs: string[] = [];

    for (const handler of matching) {
      const result = await handler.handle(event);
      if (!result.success) {
        return result;
      }
      if (result.providerRef) {
        providerRefs.push(result.providerRef);
      }
    }

    return {
      success: true,
      providerRef: providerRefs.length > 0 ? providerRefs.join(";") : undefined,
    };
  }
}

export const defaultDispatcher = new OutboxDispatcher();
