import { describe, it, expect } from "vitest";
import {
  validateMaintenanceStatusTransition,
  isMaintenanceStatus,
  isMaintenancePriority,
  isMaintenanceCategory,
} from "@/lib/hotel/maintenance-state-machines";
import { ValidationError } from "@/lib/api/errors";

describe("Hotel Maintenance Service Request State Machine (Slice 6)", () => {
  it("1. Allows valid standard progression: OPEN -> ASSIGNED -> IN_PROGRESS -> RESOLVED -> CLOSED", () => {
    expect(() => validateMaintenanceStatusTransition("OPEN", "ASSIGNED")).not.toThrow();
    expect(() => validateMaintenanceStatusTransition("ASSIGNED", "IN_PROGRESS")).not.toThrow();
    expect(() => validateMaintenanceStatusTransition("IN_PROGRESS", "RESOLVED")).not.toThrow();
    expect(() => validateMaintenanceStatusTransition("RESOLVED", "CLOSED")).not.toThrow();
  });

  it("2. Allows direct start without prior assignment: OPEN -> IN_PROGRESS", () => {
    expect(() => validateMaintenanceStatusTransition("OPEN", "IN_PROGRESS")).not.toThrow();
  });

  it("3. Allows unassigning: ASSIGNED -> OPEN", () => {
    expect(() => validateMaintenanceStatusTransition("ASSIGNED", "OPEN")).not.toThrow();
  });

  it("4. Allows reopening from RESOLVED and CLOSED", () => {
    expect(() => validateMaintenanceStatusTransition("RESOLVED", "OPEN")).not.toThrow();
    expect(() => validateMaintenanceStatusTransition("CLOSED", "OPEN")).not.toThrow();
  });

  it("5. Allows cancellation from OPEN, ASSIGNED, or IN_PROGRESS", () => {
    expect(() => validateMaintenanceStatusTransition("OPEN", "CANCELLED")).not.toThrow();
    expect(() => validateMaintenanceStatusTransition("ASSIGNED", "CANCELLED")).not.toThrow();
    expect(() => validateMaintenanceStatusTransition("IN_PROGRESS", "CANCELLED")).not.toThrow();
  });

  it("6. Blocks transitions from terminal CANCELLED state", () => {
    expect(() => validateMaintenanceStatusTransition("CANCELLED", "OPEN")).toThrow(ValidationError);
    expect(() => validateMaintenanceStatusTransition("CANCELLED", "IN_PROGRESS")).toThrow(ValidationError);
  });

  it("7. Blocks invalid skip transitions (e.g. OPEN directly to RESOLVED or CLOSED)", () => {
    expect(() => validateMaintenanceStatusTransition("OPEN", "RESOLVED")).toThrow(ValidationError);
    expect(() => validateMaintenanceStatusTransition("OPEN", "CLOSED")).toThrow(ValidationError);
    expect(() => validateMaintenanceStatusTransition("ASSIGNED", "RESOLVED")).toThrow(ValidationError);
  });

  it("8. Validates status, category, and priority type guards", () => {
    expect(isMaintenanceStatus("OPEN")).toBe(true);
    expect(isMaintenanceStatus("RESOLVED")).toBe(true);
    expect(isMaintenanceStatus("INVALID_STATUS")).toBe(false);

    expect(isMaintenancePriority("LOW")).toBe(true);
    expect(isMaintenancePriority("URGENT")).toBe(true);
    expect(isMaintenancePriority("CRITICAL")).toBe(false);

    expect(isMaintenanceCategory("PLUMBING")).toBe(true);
    expect(isMaintenanceCategory("HVAC")).toBe(true);
    expect(isMaintenanceCategory("ELECTRICAL")).toBe(true);
    expect(isMaintenanceCategory("NUCLEAR")).toBe(false);
  });
});
