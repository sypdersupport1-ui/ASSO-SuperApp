import {
  type ServiceRequestStatus,
  type ServiceRequestPriority,
  type HotelMaintenanceCategory,
  SERVICE_REQUEST_STATUSES,
  SERVICE_REQUEST_PRIORITIES,
  HOTEL_MAINTENANCE_CATEGORIES,
} from "@/db/schema/operations";
import { ValidationError } from "@/lib/api/errors";

const VALID_MAINTENANCE_TRANSITIONS: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
  OPEN: ["ASSIGNED", "IN_PROGRESS", "CANCELLED"],
  ASSIGNED: ["OPEN", "IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "OPEN"], // CLOSED when confirmed resolved; OPEN if reopened
  CLOSED: ["OPEN"], // OPEN if reopened due to recurring defect
  CANCELLED: [], // Terminal state
};

export function validateMaintenanceStatusTransition(
  currentStatus: ServiceRequestStatus,
  nextStatus: ServiceRequestStatus
): void {
  if (currentStatus === nextStatus) {
    return; // No-op transition
  }

  const allowed = VALID_MAINTENANCE_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(nextStatus)) {
    throw new ValidationError(
      `Invalid maintenance status transition from '${currentStatus}' to '${nextStatus}'. Allowed transitions: ${
        allowed && allowed.length > 0 ? allowed.join(", ") : "none (terminal state)"
      }.`
    );
  }
}

export function isMaintenanceStatus(value: string): value is ServiceRequestStatus {
  return SERVICE_REQUEST_STATUSES.includes(value as ServiceRequestStatus);
}

export function isMaintenancePriority(value: string): value is ServiceRequestPriority {
  return SERVICE_REQUEST_PRIORITIES.includes(value as ServiceRequestPriority);
}

export function isMaintenanceCategory(value: string): value is HotelMaintenanceCategory {
  return HOTEL_MAINTENANCE_CATEGORIES.includes(value as HotelMaintenanceCategory);
}
