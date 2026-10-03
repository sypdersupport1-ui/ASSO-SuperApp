import crypto from "crypto";
import { env } from "@/config/env";

export type VerticalType = "HOTEL" | "RESTAURANT" | "CINEMA";

export const DOMAIN_EVENT_TYPES = {
  // HOTEL Events
  HOTEL_CHECK_IN_SUCCESS: "HOTEL_CHECK_IN_SUCCESS",
  HOTEL_CHECK_OUT_SUCCESS: "HOTEL_CHECK_OUT_SUCCESS",
  // RESTAURANT & CINEMA Events
  ORDER_CONFIRMED: "ORDER_CONFIRMED",
  RESTAURANT_RESERVATION_CONFIRMED: "RESTAURANT_RESERVATION_CONFIRMED",
  RESTAURANT_RESERVATION_CANCELLED: "RESTAURANT_RESERVATION_CANCELLED",
  RESTAURANT_WAITLIST_CALLED: "RESTAURANT_WAITLIST_CALLED",
  // Shared Financial Events
  BILL_PAYMENT_SUCCESS: "BILL_PAYMENT_SUCCESS",
  BILL_GENERATED: "BILL_GENERATED",
} as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[keyof typeof DOMAIN_EVENT_TYPES];

export interface DomainEvent<TPayload = Record<string, unknown>> {
  eventId: string;
  eventType: DomainEventType;
  tenantId: string;
  outletId?: string;
  vertical: VerticalType;
  aggregateType: string; // 'STAY', 'ORDER', 'FOLIO', 'BILL'
  aggregateId: string;
  occurredAt: string; // ISO 8601
  payload: TPayload;
  idempotencyKey: string;
}

// ----------------------------------------------------------------------------
// Typed Payload Definitions
// ----------------------------------------------------------------------------

export interface HotelCheckInPayload {
  stayId: string;
  stayNumber: string;
  reservationId: string;
  reservationNumber: string;
  guestId: string;
  customerId?: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail?: string | null;
  roomId: string;
  roomNumber: string;
  expectedCheckOutAt: string;
}

export interface HotelCheckOutPayload {
  stayId: string;
  stayNumber: string;
  reservationId?: string;
  guestId: string;
  customerId?: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail?: string | null;
  roomId: string;
  roomNumber: string;
  actualCheckOutAt: string;
  folioId?: string;
  balanceDue: string;
  receiptUrl?: string;
}

export interface OrderConfirmedPayload {
  vertical: VerticalType;
  orderId: string;
  orderNumber: string;
  orderSource: "CUSTOMER_WEB" | "STAFF_POS";
  contextId?: string;
  contextType?: string;
  roomNumber?: string;
  tableNumber?: string;
  totalAmount: string;
  itemCount: number;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
}

export interface BillPaymentSuccessPayload {
  vertical: VerticalType;
  folioId?: string;
  billId?: string;
  stayId?: string;
  orderId?: string;
  amount: string;
  paymentMethod: string;
  referenceNumber?: string | null;
  newBalanceDue: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string | null;
  receiptUrl?: string;
}

export interface BillGeneratedPayload {
  vertical: VerticalType;
  folioId?: string;
  billId?: string;
  stayId?: string;
  totalCharges: string;
  totalPayments: string;
  balanceDue: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string | null;
  receiptUrl?: string;
}

export interface RestaurantReservationConfirmedPayload {
  reservationId: string;
  tenantId: string;
  outletId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  partySize: number;
  reservationDate: string;
  reservationTime: string;
  tableNumber?: string | null;
}

export interface RestaurantReservationCancelledPayload {
  reservationId: string;
  tenantId: string;
  outletId: string;
  customerName: string;
  customerPhone: string;
  reason?: string;
}

export interface RestaurantWaitlistCalledPayload {
  waitlistId: string;
  tenantId: string;
  outletId: string;
  customerName: string;
  customerPhone: string;
  partySize: number;
  tableNumber?: string | null;
}

// ----------------------------------------------------------------------------
// Secure Tamper-Proof Bill / Receipt URL Generation
// ----------------------------------------------------------------------------

export interface SecureReceiptParams {
  tenantId: string;
  vertical: VerticalType;
  referenceType: "FOLIO" | "BILL" | "ORDER";
  referenceId: string;
  amount?: string;
}

export interface VerifiedReceiptToken {
  tenantId: string;
  vertical: VerticalType;
  referenceType: "FOLIO" | "BILL" | "ORDER";
  referenceId: string;
  amount?: string;
  expiresAt: number;
}

/**
 * Generates an HMAC-signed secure receipt URL that conceals raw database identifiers
 * and prevents unauthorized parameter tampering.
 */
export function generateSecureReceiptUrl(params: SecureReceiptParams): string {
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days valid
  const rawData = `${params.tenantId}:${params.vertical}:${params.referenceType}:${params.referenceId}:${params.amount || "0"}:${expiresAt}`;
  
  const hmac = crypto
    .createHmac("sha256", env.JWT_SECRET)
    .update(rawData)
    .digest("hex");

  const tokenData = Buffer.from(
    JSON.stringify({
      t: params.tenantId,
      v: params.vertical,
      rt: params.referenceType,
      rid: params.referenceId,
      a: params.amount,
      exp: expiresAt,
      sig: hmac,
    })
  ).toString("base64url");

  return `/api/v1/bills/receipt?token=${tokenData}`;
}

/**
 * Validates the HMAC signature and expiration of a secure receipt token.
 */
export function verifySecureReceiptToken(token: string): VerifiedReceiptToken | null {
  try {
    const jsonStr = Buffer.from(token, "base64url").toString("utf-8");
    const data = JSON.parse(jsonStr);

    if (!data.t || !data.v || !data.rt || !data.rid || !data.exp || !data.sig) {
      return null;
    }

    if (Date.now() > data.exp) {
      return null;
    }

    const rawData = `${data.t}:${data.v}:${data.rt}:${data.rid}:${data.a || "0"}:${data.exp}`;
    const expectedSig = crypto
      .createHmac("sha256", env.JWT_SECRET)
      .update(rawData)
      .digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(data.sig, "hex"), Buffer.from(expectedSig, "hex"))) {
      return null;
    }

    return {
      tenantId: data.t,
      vertical: data.v,
      referenceType: data.rt,
      referenceId: data.rid,
      amount: data.a,
      expiresAt: data.exp,
    };
  } catch {
    return null;
  }
}
