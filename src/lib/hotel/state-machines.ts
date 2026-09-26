import {
  type HotelOperationalStatus,
  type HotelHousekeepingStatus,
  HOTEL_OPERATIONAL_STATUSES,
  HOTEL_HOUSEKEEPING_STATUSES,
} from "@/db/schema/hotel";
import { ValidationError } from "@/lib/api/errors";

const VALID_OPERATIONAL_TRANSITIONS: Record<HotelOperationalStatus, HotelOperationalStatus[]> = {
  AVAILABLE: ["OCCUPIED", "RESERVED", "OUT_OF_SERVICE", "OUT_OF_ORDER"],
  OCCUPIED: ["AVAILABLE", "OUT_OF_SERVICE", "OUT_OF_ORDER"],
  RESERVED: ["OCCUPIED", "AVAILABLE"],
  OUT_OF_SERVICE: ["AVAILABLE", "OUT_OF_ORDER"],
  OUT_OF_ORDER: ["AVAILABLE", "OUT_OF_SERVICE"],
};

const VALID_HOUSEKEEPING_TRANSITIONS: Record<HotelHousekeepingStatus, HotelHousekeepingStatus[]> = {
  CLEAN: ["DIRTY", "INSPECTED", "CLEANING"],
  DIRTY: ["CLEANING", "MAINTENANCE"],
  CLEANING: ["CLEAN", "DIRTY", "MAINTENANCE"],
  INSPECTED: ["CLEAN", "DIRTY"],
  MAINTENANCE: ["CLEANING", "DIRTY", "CLEAN"],
};

export function validateOperationalStatusTransition(
  currentStatus: HotelOperationalStatus,
  nextStatus: HotelOperationalStatus
): void {
  if (currentStatus === nextStatus) {
    return; // No-op transition is valid
  }
  const allowed = VALID_OPERATIONAL_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(nextStatus)) {
    throw new ValidationError(
      `Invalid operational status transition from '${currentStatus}' to '${nextStatus}'. Allowed transitions: ${allowed ? allowed.join(", ") : "none"}.`
    );
  }
}

export function validateHousekeepingStatusTransition(
  currentStatus: HotelHousekeepingStatus,
  nextStatus: HotelHousekeepingStatus
): void {
  if (currentStatus === nextStatus) {
    return; // No-op transition is valid
  }
  const allowed = VALID_HOUSEKEEPING_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(nextStatus)) {
    throw new ValidationError(
      `Invalid housekeeping status transition from '${currentStatus}' to '${nextStatus}'. Allowed transitions: ${allowed ? allowed.join(", ") : "none"}.`
    );
  }
}

export function isOperationalStatus(value: string): value is HotelOperationalStatus {
  return HOTEL_OPERATIONAL_STATUSES.includes(value as HotelOperationalStatus);
}

export function isHousekeepingStatus(value: string): value is HotelHousekeepingStatus {
  return HOTEL_HOUSEKEEPING_STATUSES.includes(value as HotelHousekeepingStatus);
}
