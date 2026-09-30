import { VerticalType, DomainEventType } from "@/lib/events/types";

export type CommunicationChannel = "IN_APP" | "SMS_DLT" | "WHATSAPP";

export interface CommunicationRecipient {
  customerId?: string;
  staffId?: string;
  roleScope?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
}

export interface SendCommunicationParams {
  tenantId: string;
  outletId?: string;
  vertical: VerticalType;
  channel: CommunicationChannel;
  eventType: DomainEventType;
  recipient: CommunicationRecipient;
  title: string;
  body: string;
  deepLink?: string;
  metadata?: Record<string, unknown>;
}

export interface SendCommunicationResult {
  success: boolean;
  providerReference?: string;
  error?: string;
}

export interface CommunicationChannelAdapter {
  readonly channel: CommunicationChannel;
  send(params: SendCommunicationParams, tx?: any): Promise<SendCommunicationResult>;
}
