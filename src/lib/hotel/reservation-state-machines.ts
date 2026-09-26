import {
  type HotelReservationStatus,
  HOTEL_RESERVATION_STATUSES,
} from "@/db/schema/hotel";
import { ValidationError } from "@/lib/api/errors";

const VALID_RESERVATION_TRANSITIONS: Record<HotelReservationStatus, HotelReservationStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CANCELLED", "NO_SHOW"],
  CANCELLED: [],
  NO_SHOW: [],
};

export function validateReservationStatusTransition(
  currentStatus: HotelReservationStatus,
  nextStatus: HotelReservationStatus
): void {
  if (currentStatus === nextStatus) {
    return; // No-op transition
  }
  const allowed = VALID_RESERVATION_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(nextStatus)) {
    throw new ValidationError(
      `Invalid reservation status transition from '${currentStatus}' to '${nextStatus}'. ${
        allowed && allowed.length > 0
          ? `Allowed transitions: ${allowed.join(", ")}.`
          : `State '${currentStatus}' is terminal and cannot transition further.`
      }`
    );
  }
}

export function isReservationStatus(value: string): value is HotelReservationStatus {
  return HOTEL_RESERVATION_STATUSES.includes(value as HotelReservationStatus);
}
