import {
  type HotelHousekeepingTaskStatus,
  type HotelHousekeepingTaskType,
  type HotelHousekeepingTaskPriority,
  HOTEL_HOUSEKEEPING_TASK_STATUSES,
  HOTEL_HOUSEKEEPING_TASK_TYPES,
  HOTEL_HOUSEKEEPING_TASK_PRIORITIES,
} from "@/db/schema/hotel";
import { ValidationError } from "@/lib/api/errors";

const VALID_TASK_TRANSITIONS: Record<HotelHousekeepingTaskStatus, HotelHousekeepingTaskStatus[]> = {
  PENDING: ["ASSIGNED", "IN_PROGRESS", "CANCELLED"],
  ASSIGNED: ["PENDING", "IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["PENDING", "CLEANED", "CANCELLED"],
  CLEANED: ["INSPECTED", "PENDING"], // INSPECTED if passed; PENDING if failed and returned for re-cleaning
  INSPECTED: [], // terminal
  CANCELLED: [], // terminal
};

export function validateHousekeepingTaskStatusTransition(
  currentStatus: HotelHousekeepingTaskStatus,
  nextStatus: HotelHousekeepingTaskStatus
): void {
  if (currentStatus === nextStatus) {
    return; // No-op transition
  }

  const allowed = VALID_TASK_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(nextStatus)) {
    throw new ValidationError(
      `Invalid housekeeping task transition from '${currentStatus}' to '${nextStatus}'. Allowed transitions: ${
        allowed && allowed.length > 0 ? allowed.join(", ") : "none (terminal state)"
      }.`
    );
  }
}

export function isHousekeepingTaskStatus(value: string): value is HotelHousekeepingTaskStatus {
  return HOTEL_HOUSEKEEPING_TASK_STATUSES.includes(value as HotelHousekeepingTaskStatus);
}

export function isHousekeepingTaskType(value: string): value is HotelHousekeepingTaskType {
  return HOTEL_HOUSEKEEPING_TASK_TYPES.includes(value as HotelHousekeepingTaskType);
}

export function isHousekeepingTaskPriority(value: string): value is HotelHousekeepingTaskPriority {
  return HOTEL_HOUSEKEEPING_TASK_PRIORITIES.includes(value as HotelHousekeepingTaskPriority);
}
