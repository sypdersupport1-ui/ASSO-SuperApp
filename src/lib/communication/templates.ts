import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { communicationTemplates } from "@/db/schema/communication";
import { CommunicationChannel } from "./types";
import { DomainEventType, VerticalType } from "@/lib/events/types";

export interface RenderedMessage {
  title: string;
  body: string;
}

export interface DefaultTemplateDefinition {
  vertical: VerticalType;
  eventType: DomainEventType;
  channel: CommunicationChannel;
  templateIdentifier: string;
  titleTemplate: string;
  bodyTemplate: string;
  supportedVariables: string[];
}

export const BUILTIN_COMMUNICATION_TEMPLATES: DefaultTemplateDefinition[] = [
  // HOTEL_CHECK_IN_SUCCESS
  {
    vertical: "HOTEL",
    eventType: "HOTEL_CHECK_IN_SUCCESS",
    channel: "IN_APP",
    templateIdentifier: "HOTEL_CHECK_IN_IN_APP",
    titleTemplate: "Welcome to Your Stay!",
    bodyTemplate: "Welcome {{guestName}}! You are checked in to Room {{roomNumber}}. Expected checkout: {{expectedCheckOutAt}}.",
    supportedVariables: ["guestName", "roomNumber", "stayNumber", "expectedCheckOutAt"],
  },
  {
    vertical: "HOTEL",
    eventType: "HOTEL_CHECK_IN_SUCCESS",
    channel: "SMS_DLT",
    templateIdentifier: "HOTEL_CHECK_IN_SMS",
    titleTemplate: "Check-In Confirmation",
    bodyTemplate: "Dear {{guestName}}, welcome to your stay in Room {{roomNumber}}. Your stay ID is {{stayNumber}}.",
    supportedVariables: ["guestName", "roomNumber", "stayNumber"],
  },
  {
    vertical: "HOTEL",
    eventType: "HOTEL_CHECK_IN_SUCCESS",
    channel: "WHATSAPP",
    templateIdentifier: "HOTEL_CHECK_IN_WA",
    titleTemplate: "Welcome to Your Hotel Experience",
    bodyTemplate: "Hello {{guestName}}, welcome! Your Room {{roomNumber}} is ready. We look forward to hosting you.",
    supportedVariables: ["guestName", "roomNumber", "stayNumber"],
  },

  // HOTEL_CHECK_OUT_SUCCESS
  {
    vertical: "HOTEL",
    eventType: "HOTEL_CHECK_OUT_SUCCESS",
    channel: "IN_APP",
    templateIdentifier: "HOTEL_CHECK_OUT_IN_APP",
    titleTemplate: "Thank You for Staying With Us",
    bodyTemplate: "Your checkout for Room {{roomNumber}} is completed. Outstanding balance: INR {{balanceDue}}.",
    supportedVariables: ["guestName", "roomNumber", "stayNumber", "balanceDue", "receiptUrl"],
  },
  {
    vertical: "HOTEL",
    eventType: "HOTEL_CHECK_OUT_SUCCESS",
    channel: "SMS_DLT",
    templateIdentifier: "HOTEL_CHECK_OUT_SMS",
    titleTemplate: "Check-Out Confirmation",
    bodyTemplate: "Dear {{guestName}}, your checkout for Room {{roomNumber}} is complete. Balance due: INR {{balanceDue}}.",
    supportedVariables: ["guestName", "roomNumber", "balanceDue"],
  },
  {
    vertical: "HOTEL",
    eventType: "HOTEL_CHECK_OUT_SUCCESS",
    channel: "WHATSAPP",
    templateIdentifier: "HOTEL_CHECK_OUT_WA",
    titleTemplate: "Departure Folio & Receipt",
    bodyTemplate: "Thank you for staying with us, {{guestName}}! Your checkout is complete. Receipt link: {{receiptUrl}}",
    supportedVariables: ["guestName", "roomNumber", "balanceDue", "receiptUrl"],
  },

  // BILL_PAYMENT_SUCCESS
  {
    vertical: "HOTEL",
    eventType: "BILL_PAYMENT_SUCCESS",
    channel: "IN_APP",
    templateIdentifier: "BILL_PAYMENT_IN_APP",
    titleTemplate: "Payment Received",
    bodyTemplate: "Payment of INR {{amount}} received via {{paymentMethod}}. Remaining balance: INR {{newBalanceDue}}.",
    supportedVariables: ["amount", "paymentMethod", "newBalanceDue", "receiptUrl"],
  },
  {
    vertical: "HOTEL",
    eventType: "BILL_PAYMENT_SUCCESS",
    channel: "SMS_DLT",
    templateIdentifier: "BILL_PAYMENT_SMS",
    titleTemplate: "Payment Confirmation",
    bodyTemplate: "Payment of INR {{amount}} received via {{paymentMethod}}. Remaining balance: INR {{newBalanceDue}}.",
    supportedVariables: ["amount", "paymentMethod", "newBalanceDue"],
  },
  {
    vertical: "HOTEL",
    eventType: "BILL_PAYMENT_SUCCESS",
    channel: "WHATSAPP",
    templateIdentifier: "BILL_PAYMENT_WA",
    titleTemplate: "Payment Receipt",
    bodyTemplate: "Thank you! We received your payment of INR {{amount}} via {{paymentMethod}}. View receipt: {{receiptUrl}}",
    supportedVariables: ["amount", "paymentMethod", "newBalanceDue", "receiptUrl"],
  },

  // BILL_GENERATED
  {
    vertical: "HOTEL",
    eventType: "BILL_GENERATED",
    channel: "IN_APP",
    templateIdentifier: "BILL_GENERATED_IN_APP",
    titleTemplate: "Folio Bill Generated",
    bodyTemplate: "Folio statement finalized. Total charges: INR {{totalCharges}}, Total payments: INR {{totalPayments}}, Balance due: INR {{balanceDue}}.",
    supportedVariables: ["totalCharges", "totalPayments", "balanceDue", "receiptUrl"],
  },
  {
    vertical: "HOTEL",
    eventType: "BILL_GENERATED",
    channel: "SMS_DLT",
    templateIdentifier: "BILL_GENERATED_SMS",
    titleTemplate: "Folio Summary",
    bodyTemplate: "Your folio statement is ready. Total: INR {{totalCharges}}, Balance: INR {{balanceDue}}.",
    supportedVariables: ["totalCharges", "balanceDue"],
  },
  {
    vertical: "HOTEL",
    eventType: "BILL_GENERATED",
    channel: "WHATSAPP",
    templateIdentifier: "BILL_GENERATED_WA",
    titleTemplate: "Your Bill is Ready",
    bodyTemplate: "Your bill statement has been generated. Total: INR {{totalCharges}}, Balance due: INR {{balanceDue}}. View: {{receiptUrl}}",
    supportedVariables: ["totalCharges", "balanceDue", "receiptUrl"],
  },

  // ORDER_CONFIRMED
  {
    vertical: "HOTEL",
    eventType: "ORDER_CONFIRMED",
    channel: "IN_APP",
    templateIdentifier: "ORDER_CONFIRMED_IN_APP",
    titleTemplate: "Order Confirmed",
    bodyTemplate: "Your order #{{orderNumber}} with {{itemCount}} item(s) has been confirmed and is being prepared. Total: INR {{totalAmount}}.",
    supportedVariables: ["orderNumber", "itemCount", "totalAmount", "orderSource", "roomNumber"],
  },
  {
    vertical: "HOTEL",
    eventType: "ORDER_CONFIRMED",
    channel: "SMS_DLT",
    templateIdentifier: "ORDER_CONFIRMED_SMS",
    titleTemplate: "Order Confirmation",
    bodyTemplate: "Order #{{orderNumber}} confirmed for Room {{roomNumber}}. Total: INR {{totalAmount}}.",
    supportedVariables: ["orderNumber", "roomNumber", "totalAmount"],
  },
  {
    vertical: "HOTEL",
    eventType: "ORDER_CONFIRMED",
    channel: "WHATSAPP",
    templateIdentifier: "ORDER_CONFIRMED_WA",
    titleTemplate: "Order in Kitchen",
    bodyTemplate: "Order #{{orderNumber}} is confirmed and being prepared for Room {{roomNumber}}! Total: INR {{totalAmount}}.",
    supportedVariables: ["orderNumber", "roomNumber", "totalAmount"],
  },
];

/**
 * Replaces {{variable}} placeholders with values from context data.
 */
export function interpolateTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const val = data[key];
    if (val === undefined || val === null) {
      return "";
    }
    return String(val);
  });
}

/**
 * Resolves the appropriate template for a given tenant, vertical, event, and channel.
 * Prefers tenant custom template if present and active; otherwise falls back to system defaults.
 */
export async function resolveTemplate(params: {
  tenantId: string;
  vertical: VerticalType;
  eventType: DomainEventType;
  channel: CommunicationChannel;
}): Promise<RenderedMessage | null> {
  const db = getDb();

  try {
    // 1. Look for tenant override in DB
    const [custom] = await db
      .select()
      .from(communicationTemplates)
      .where(
        and(
          eq(communicationTemplates.tenantId, params.tenantId),
          eq(communicationTemplates.vertical, params.vertical),
          eq(communicationTemplates.eventType, params.eventType),
          eq(communicationTemplates.channel, params.channel),
          eq(communicationTemplates.isActive, true)
        )
      )
      .limit(1);

    if (custom) {
      return {
        title: custom.titleTemplate,
        body: custom.bodyTemplate,
      };
    }
  } catch {
    // Fall back to built-in defaults
  }

  // 2. Built-in defaults lookup
  const builtin = BUILTIN_COMMUNICATION_TEMPLATES.find(
    (t) =>
      t.eventType === params.eventType &&
      t.channel === params.channel &&
      (t.vertical === params.vertical || t.vertical === "HOTEL")
  );

  if (builtin) {
    return {
      title: builtin.titleTemplate,
      body: builtin.bodyTemplate,
    };
  }

  return null;
}
