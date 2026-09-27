import { ValidationError } from "@/lib/api/errors";

export const ORDER_STATUSES = [
  "PLACED",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_SOURCES = [
  "QR_CUSTOMER",
  "STAFF_POS",
  "DESK_ORDER",
] as const;

export type OrderSource = (typeof ORDER_SOURCES)[number];

export const VALID_ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ["ACCEPTED", "PREPARING", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "OUT_FOR_DELIVERY", "DELIVERED"],
  READY: ["OUT_FOR_DELIVERY", "DELIVERED"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [], // Terminal state
  CANCELLED: [], // Terminal state
};

/**
 * Validates whether a state transition from `currentStatus` to `nextStatus` is allowed.
 */
export function validateOrderStatusTransition(
  currentStatus: OrderStatus,
  nextStatus: OrderStatus
): void {
  if (currentStatus === nextStatus) {
    return; // Idempotent no-op
  }

  const allowed = VALID_ORDER_STATUS_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(nextStatus)) {
    throw new ValidationError(
      `Invalid order status transition from '${currentStatus}' to '${nextStatus}'. Allowed transitions: ${
        allowed && allowed.length > 0 ? allowed.join(", ") : "none (terminal state)"
      }.`
    );
  }
}

/**
 * Validates whether a customer can cancel an order.
 * Only orders in 'PLACED' or 'ACCEPTED' state (prior to preparation) can be cancelled by a guest.
 */
export function canCustomerCancelOrder(status: OrderStatus): boolean {
  return status === "PLACED" || status === "ACCEPTED";
}

/**
 * Type guard for OrderStatus
 */
export function isOrderStatus(value: string): value is OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus);
}

export type CustomerDisplayOrderStatus =
  | "Received"
  | "Confirmed"
  | "Preparing"
  | "Ready"
  | "On the way"
  | "Delivered"
  | "Cancelled";

/**
 * Maps raw backend order status to guest-friendly display vocabulary.
 */
export function mapToCustomerOrderStatus(status: string): CustomerDisplayOrderStatus {
  switch (status) {
    case "PLACED":
      return "Received";
    case "ACCEPTED":
      return "Confirmed";
    case "PREPARING":
      return "Preparing";
    case "READY":
      return "Ready";
    case "OUT_FOR_DELIVERY":
      return "On the way";
    case "DELIVERED":
      return "Delivered";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Received";
  }
}
