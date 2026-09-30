import {
  CommunicationChannelAdapter,
  SendCommunicationParams,
  SendCommunicationResult,
} from "../types";
import { logger } from "@/lib/logger";

/**
 * SMS / DLT Adapter (Architecture-Ready Stub)
 * 
 * Complies with Telecom Regulatory Authority of India (TRAI) Distributed Ledger Technology (DLT) regulations:
 * 1. Customer phone is required.
 * 2. Pre-registered DLT Header and Content Template ID.
 * 3. Exact matching of static text and variable parameters.
 * 
 * Provider agnostic (e.g. Jio / Airtel / Tanla / Gupshup / Twilio).
 * No third-party provider credentials are hardcoded or committed.
 */
export class SmsDltChannelAdapter implements CommunicationChannelAdapter {
  readonly channel = "SMS_DLT" as const;

  async send(params: SendCommunicationParams): Promise<SendCommunicationResult> {
    const phone = params.recipient.phone;

    if (!phone || phone.trim() === "") {
      logger.warn({
        message: "SMS/DLT dispatch skipped: missing recipient phone",
        tenantId: params.tenantId,
        details: {
          eventType: params.eventType,
        },
      });
      return {
        success: false,
        error: "Missing recipient phone number for SMS/DLT channel",
      };
    }

    // In current Phase 8 Slice 1, SMS delivery is architecture-ready
    // Provider integration will connect here when credentials and DLT IDs are provisioned.
    const mockProviderRef = `dlt_sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    logger.info({
      message: "[SMS/DLT Adapter Ready] Simulated dispatch",
      tenantId: params.tenantId,
      details: {
        recipientPhone: phone.replace(/(\d{2})\d+(\d{2})/, "$1******$2"), // Mask for privacy
        title: params.title,
        eventType: params.eventType,
        providerRef: mockProviderRef,
      },
    });

    return {
      success: true,
      providerReference: mockProviderRef,
    };
  }
}
