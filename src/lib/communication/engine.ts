import { getDb } from "@/db/client";
import { communicationDeliveryLogs } from "@/db/schema/communication";
import { DomainEvent } from "@/lib/events/types";
import {
  CommunicationChannel,
  CommunicationChannelAdapter,
  CommunicationRecipient,
  SendCommunicationParams,
} from "./types";
import { InAppChannelAdapter } from "./adapters/in-app";
import { SmsDltChannelAdapter } from "./adapters/sms-dlt";
import { WhatsAppChannelAdapter } from "./adapters/whatsapp";
import { interpolateTemplate, resolveTemplate } from "./templates";
import { logger } from "@/lib/logger";

export interface CommunicationDispatchSummary {
  eventId: string;
  totalChannels: number;
  successfulChannels: string[];
  failedChannels: string[];
}

export class CommunicationEngine {
  private adapters: Map<CommunicationChannel, CommunicationChannelAdapter> = new Map();

  constructor() {
    this.registerAdapter(new InAppChannelAdapter());
    this.registerAdapter(new SmsDltChannelAdapter());
    this.registerAdapter(new WhatsAppChannelAdapter());
  }

  registerAdapter(adapter: CommunicationChannelAdapter) {
    this.adapters.set(adapter.channel, adapter);
  }

  getAdapter(channel: CommunicationChannel): CommunicationChannelAdapter | undefined {
    return this.adapters.get(channel);
  }

  /**
   * Processes a trusted DomainEvent through the communication channel pipeline.
   */
  async processEvent(
    event: DomainEvent<Record<string, unknown>>,
    options: {
      outboxId?: string;
      channels?: CommunicationChannel[];
      tx?: any;
    } = {}
  ): Promise<CommunicationDispatchSummary> {
    const channelsToDispatch: CommunicationChannel[] =
      options.channels || ["IN_APP", "SMS_DLT", "WHATSAPP"];

    const summary: CommunicationDispatchSummary = {
      eventId: event.eventId,
      totalChannels: channelsToDispatch.length,
      successfulChannels: [],
      failedChannels: [],
    };

    const recipient = this.resolveRecipient(event);
    const dbExecutor = options.tx || getDb();

    for (const channel of channelsToDispatch) {
      const adapter = this.adapters.get(channel);
      if (!adapter) {
        continue;
      }

      // Check channel prerequisites (e.g. phone required for SMS & WhatsApp)
      if ((channel === "SMS_DLT" || channel === "WHATSAPP") && !recipient.phone) {
        logger.debug({
          message: `Skipping ${channel} dispatch: no recipient phone available`,
          tenantId: event.tenantId,
          details: {
            eventId: event.eventId,
            eventType: event.eventType,
          },
        });
        continue;
      }

      // Resolve and render message template
      const template = await resolveTemplate({
        tenantId: event.tenantId,
        vertical: event.vertical,
        eventType: event.eventType,
        channel,
      });

      if (!template) {
        continue;
      }

      const renderedTitle = interpolateTemplate(template.title, event.payload);
      const renderedBody = interpolateTemplate(template.body, event.payload);

      const params: SendCommunicationParams = {
        tenantId: event.tenantId,
        outletId: event.outletId,
        vertical: event.vertical,
        channel,
        eventType: event.eventType,
        recipient,
        title: renderedTitle,
        body: renderedBody,
        metadata: {
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          eventId: event.eventId,
        },
      };

      const result = await adapter.send(params, options.tx);

      if (result.success) {
        summary.successfulChannels.push(channel);
      } else {
        summary.failedChannels.push(channel);
      }

      // Log delivery outcome
      try {
        await dbExecutor.insert(communicationDeliveryLogs).values({
          tenantId: event.tenantId,
          outboxId: options.outboxId || null,
          eventId: event.eventId,
          channel,
          recipient: recipient.phone || recipient.customerId || recipient.staffId || "RECIPIENT",
          status: result.success ? "DELIVERED" : "FAILED",
          providerReference: result.providerReference || null,
          errorMessage: result.error || null,
          attemptNumber: 1,
        });
      } catch (logErr: unknown) {
        logger.warn({
          message: "Failed to persist communication delivery log",
          tenantId: event.tenantId,
          details: {
            error: String(logErr),
            eventId: event.eventId,
            channel,
          },
        });
      }
    }

    return summary;
  }

  /**
   * Resolves recipient information strictly from authoritative event payload.
   */
  private resolveRecipient(event: DomainEvent<Record<string, unknown>>): CommunicationRecipient {
    const payload = event.payload;

    return {
      customerId: (payload.customerId as string) || (payload.guestId as string) || undefined,
      staffId: (payload.staffId as string) || undefined,
      roleScope: (payload.roleScope as string) || undefined,
      name:
        (payload.guestName as string) ||
        (payload.customerName as string) ||
        (payload.name as string) ||
        undefined,
      phone:
        (payload.guestPhone as string) ||
        (payload.customerPhone as string) ||
        (payload.phone as string) ||
        null,
      email:
        (payload.guestEmail as string) ||
        (payload.customerEmail as string) ||
        (payload.email as string) ||
        null,
    };
  }
}

// Global Singleton Instance
let communicationEngineInstance: CommunicationEngine | null = null;

export function getCommunicationEngine(): CommunicationEngine {
  if (!communicationEngineInstance) {
    communicationEngineInstance = new CommunicationEngine();
  }
  return communicationEngineInstance;
}
