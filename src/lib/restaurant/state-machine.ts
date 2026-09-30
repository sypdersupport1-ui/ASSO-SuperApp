import {
  RESTAURANT_TABLE_STATUSES,
  type RestaurantTableStatus,
} from "@/db/schema/restaurant";
import { BusinessRuleError, ValidationError, InvalidStateTransitionError } from "@/lib/api/errors";

/**
 * State Transition Matrix for Restaurant Physical Tables.
 * 
 * Rules:
 * - AVAILABLE: Table is clean, unset/set, and ready for seating or reservation.
 * - OCCUPIED: Guests are seated and active dining session is underway.
 * - RESERVED: Table held for an upcoming dining reservation.
 * - CLEANING: Guests have vacated; table requires bussing, sanitizing, and resetting.
 * - OUT_OF_SERVICE: Table is physically damaged, under maintenance, or withdrawn from floor rotation.
 */
export const ALLOWED_TABLE_TRANSITIONS: Record<
  RestaurantTableStatus,
  ReadonlyArray<RestaurantTableStatus>
> = {
  AVAILABLE: ["OCCUPIED", "RESERVED", "CLEANING", "OUT_OF_SERVICE"],
  OCCUPIED: ["CLEANING", "AVAILABLE"],
  RESERVED: ["OCCUPIED", "AVAILABLE", "OUT_OF_SERVICE"],
  CLEANING: ["AVAILABLE", "OUT_OF_SERVICE"],
  OUT_OF_SERVICE: ["AVAILABLE", "CLEANING"],
};

export function isValidTableStatus(status: unknown): status is RestaurantTableStatus {
  return typeof status === "string" && (RESTAURANT_TABLE_STATUSES as readonly string[]).includes(status);
}

export function isTableStatusTransitionAllowed(
  currentStatus: RestaurantTableStatus,
  nextStatus: RestaurantTableStatus
): boolean {
  if (currentStatus === nextStatus) {
    return true; // Idempotent no-op transition
  }

  const allowed = ALLOWED_TABLE_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(nextStatus) : false;
}

export function assertTableStatusTransition(
  currentStatus: RestaurantTableStatus,
  nextStatus: RestaurantTableStatus,
  tableNumber?: string
): void {
  if (!isValidTableStatus(nextStatus)) {
    throw new ValidationError(`Invalid restaurant table status: '${nextStatus}'.`);
  }

  if (!isTableStatusTransitionAllowed(currentStatus, nextStatus)) {
    const tableRef = tableNumber ? `Table ${tableNumber}` : "Table";
    throw new InvalidStateTransitionError(
      `Cannot transition ${tableRef} from status '${currentStatus}' to '${nextStatus}'. Allowed transitions from '${currentStatus}' are: ${ALLOWED_TABLE_TRANSITIONS[currentStatus].join(", ")}.`,
      {
        code: "INVALID_TABLE_STATUS_TRANSITION",
        currentStatus,
        nextStatus,
        allowedTransitions: ALLOWED_TABLE_TRANSITIONS[currentStatus],
      }
    );
  }
}
