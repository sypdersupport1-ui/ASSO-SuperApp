import { ValidationError } from "@/lib/api/errors";

export const ORDER_STATUSES = [
  "PENDING",
  "PLACED",
  "ACCEPTED",
  "CONFIRMED",
  "PREPARING",
  "IN_PREPARATION",
  "PARTIALLY_READY",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "SERVED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_SOURCES = [
  "CUSTOMER_WEB",
  "POS",
  "QR_CUSTOMER",
  "STAFF_POS",
  "DESK_ORDER",
] as const;

export type OrderSource = (typeof ORDER_SOURCES)[number];

export const DINING_CONTEXTS = [
  "DINE_IN",
  "ROOM_SERVICE",
  "TAKEAWAY",
  "DELIVERY",
] as const;

export type DiningContext = (typeof DINING_CONTEXTS)[number];

export const ITEM_STATUSES = [
  "PENDING",
  "PLACED",
  "PREPARING",
  "READY",
  "SERVED",
  "DELIVERED",
  "CANCELLED",
] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const VALID_ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PLACED", "CONFIRMED", "ACCEPTED", "CANCELLED"],
  PLACED: ["ACCEPTED", "CONFIRMED", "PREPARING", "IN_PREPARATION", "CANCELLED"],
  ACCEPTED: ["CONFIRMED", "PREPARING", "IN_PREPARATION", "CANCELLED"],
  CONFIRMED: ["PREPARING", "IN_PREPARATION", "PARTIALLY_READY", "READY", "CANCELLED"],
  PREPARING: ["IN_PREPARATION", "PARTIALLY_READY", "READY", "OUT_FOR_DELIVERY", "SERVED", "DELIVERED", "CANCELLED"],
  IN_PREPARATION: ["PARTIALLY_READY", "READY", "OUT_FOR_DELIVERY", "SERVED", "DELIVERED", "CANCELLED"],
  PARTIALLY_READY: ["READY", "OUT_FOR_DELIVERY", "SERVED", "DELIVERED", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "SERVED", "DELIVERED", "COMPLETED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "COMPLETED", "CANCELLED"],
  SERVED: ["COMPLETED"],
  DELIVERED: ["COMPLETED"],
  COMPLETED: [], // Terminal state
  CANCELLED: [], // Terminal state
};

export const KDS_TASK_STATUSES = [
  "PENDING",
  "PREPARING",
  "READY",
  "DONE",
  "CANCELLED",
] as const;

export type KdsTaskStatus = (typeof KDS_TASK_STATUSES)[number];

export const VALID_KDS_TASK_TRANSITIONS: Record<KdsTaskStatus, KdsTaskStatus[]> = {
  PENDING: ["PREPARING", "READY", "CANCELLED"],
  PREPARING: ["READY", "DONE", "CANCELLED"],
  READY: ["DONE", "CANCELLED"],
  DONE: [], // Terminal state
  CANCELLED: [], // Terminal state
};

export const KDS_STATIONS = [
  "KITCHEN",
  "TANDOOR",
  "BEVERAGE",
  "DESSERT",
] as const;

export type KdsStation = (typeof KDS_STATIONS)[number] | (string & {});

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
 * Validates whether a KDS task state transition from `currentStatus` to `nextStatus` is allowed.
 */
export function validateKdsTaskStatusTransition(
  currentStatus: KdsTaskStatus,
  nextStatus: KdsTaskStatus
): void {
  if (currentStatus === nextStatus) {
    return; // Idempotent no-op
  }

  const allowed = VALID_KDS_TASK_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(nextStatus)) {
    throw new ValidationError(
      `Invalid KDS task status transition from '${currentStatus}' to '${nextStatus}'. Allowed transitions: ${
        allowed && allowed.length > 0 ? allowed.join(", ") : "none (terminal state)"
      }.`
    );
  }
}

/**
 * Validates whether a customer can cancel an order.
 * Only orders in pre-preparation state can be cancelled by a guest.
 */
export function canCustomerCancelOrder(status: OrderStatus): boolean {
  return status === "PENDING" || status === "PLACED" || status === "ACCEPTED" || status === "CONFIRMED";
}

/**
 * Type guard for OrderStatus
 */
export function isOrderStatus(value: string): value is OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus);
}

/**
 * Type guard for OrderSource
 */
export function isOrderSource(value: string): value is OrderSource {
  return ORDER_SOURCES.includes(value as OrderSource);
}

/**
 * Type guard for DiningContext
 */
export function isDiningContext(value: string): value is DiningContext {
  return DINING_CONTEXTS.includes(value as DiningContext);
}

export type CustomerDisplayOrderStatus =
  | "Received"
  | "Confirmed"
  | "Preparing"
  | "Partially Ready"
  | "Ready"
  | "On the way"
  | "Served"
  | "Delivered"
  | "Completed"
  | "Cancelled";

/**
 * Maps raw backend order status to guest-friendly display vocabulary.
 */
export function mapToCustomerOrderStatus(status: string): CustomerDisplayOrderStatus {
  switch (status) {
    case "PENDING":
    case "PLACED":
      return "Received";
    case "ACCEPTED":
    case "CONFIRMED":
      return "Confirmed";
    case "PREPARING":
    case "IN_PREPARATION":
      return "Preparing";
    case "PARTIALLY_READY":
      return "Partially Ready";
    case "READY":
      return "Ready";
    case "OUT_FOR_DELIVERY":
      return "On the way";
    case "SERVED":
      return "Served";
    case "DELIVERED":
      return "Delivered";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Received";
  }
}
