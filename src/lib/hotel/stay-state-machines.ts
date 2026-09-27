import {
  type HotelStayStatus,
  HOTEL_STAY_STATUSES,
} from "@/db/schema/hotel";
import { ValidationError } from "@/lib/api/errors";

const VALID_STAY_TRANSITIONS: Record<HotelStayStatus, HotelStayStatus[]> = {
  ACTIVE: ["CHECKED_OUT"],
  CHECKED_OUT: [],
};

export function validateStayStatusTransition(
  currentStatus: HotelStayStatus,
  nextStatus: HotelStayStatus
): void {
  if (currentStatus === nextStatus) {
    return; // No-op transition
  }
  const allowed = VALID_STAY_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(nextStatus)) {
    throw new ValidationError(
      `Invalid stay status transition from '${currentStatus}' to '${nextStatus}'. ${
        allowed && allowed.length > 0
          ? `Allowed transitions: ${allowed.join(", ")}.`
          : `State '${currentStatus}' is terminal and cannot transition further.`
      }`
    );
  }
}

export function isStayStatus(value: string): value is HotelStayStatus {
  return HOTEL_STAY_STATUSES.includes(value as HotelStayStatus);
}
