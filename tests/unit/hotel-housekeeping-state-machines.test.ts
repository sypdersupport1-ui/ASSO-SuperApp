import { describe, it, expect } from "vitest";
import {
  validateHousekeepingTaskStatusTransition,
  isHousekeepingTaskStatus,
  isHousekeepingTaskType,
  isHousekeepingTaskPriority,
} from "@/lib/hotel/housekeeping-state-machines";
import { ValidationError } from "@/lib/api/errors";

describe("Hotel Housekeeping Task State Machine (Slice 5)", () => {
  it("1. Allows valid progression: PENDING -> ASSIGNED -> IN_PROGRESS -> CLEANED -> INSPECTED", () => {
    expect(() => validateHousekeepingTaskStatusTransition("PENDING", "ASSIGNED")).not.toThrow();
    expect(() => validateHousekeepingTaskStatusTransition("ASSIGNED", "IN_PROGRESS")).not.toThrow();
    expect(() => validateHousekeepingTaskStatusTransition("IN_PROGRESS", "CLEANED")).not.toThrow();
    expect(() => validateHousekeepingTaskStatusTransition("CLEANED", "INSPECTED")).not.toThrow();
  });

  it("2. Allows direct start: PENDING -> IN_PROGRESS", () => {
    expect(() => validateHousekeepingTaskStatusTransition("PENDING", "IN_PROGRESS")).not.toThrow();
  });

  it("3. Allows inspection failure: CLEANED -> PENDING (reopen for re-cleaning)", () => {
    expect(() => validateHousekeepingTaskStatusTransition("CLEANED", "PENDING")).not.toThrow();
  });

  it("4. Allows cancellation from PENDING, ASSIGNED, or IN_PROGRESS", () => {
    expect(() => validateHousekeepingTaskStatusTransition("PENDING", "CANCELLED")).not.toThrow();
    expect(() => validateHousekeepingTaskStatusTransition("ASSIGNED", "CANCELLED")).not.toThrow();
    expect(() => validateHousekeepingTaskStatusTransition("IN_PROGRESS", "CANCELLED")).not.toThrow();
  });

  it("5. Allows no-op transitions (same status)", () => {
    expect(() => validateHousekeepingTaskStatusTransition("PENDING", "PENDING")).not.toThrow();
    expect(() => validateHousekeepingTaskStatusTransition("IN_PROGRESS", "IN_PROGRESS")).not.toThrow();
    expect(() => validateHousekeepingTaskStatusTransition("CLEANED", "CLEANED")).not.toThrow();
    expect(() => validateHousekeepingTaskStatusTransition("INSPECTED", "INSPECTED")).not.toThrow();
  });

  it("6. Blocks transitions from terminal INSPECTED and CANCELLED states", () => {
    expect(() => validateHousekeepingTaskStatusTransition("INSPECTED", "PENDING")).toThrow(ValidationError);
    expect(() => validateHousekeepingTaskStatusTransition("INSPECTED", "CLEANED")).toThrow(ValidationError);
    expect(() => validateHousekeepingTaskStatusTransition("CANCELLED", "PENDING")).toThrow(ValidationError);
  });

  it("7. Blocks invalid skip transitions (e.g. PENDING directly to INSPECTED or CLEANED)", () => {
    expect(() => validateHousekeepingTaskStatusTransition("PENDING", "INSPECTED")).toThrow(ValidationError);
    expect(() => validateHousekeepingTaskStatusTransition("PENDING", "CLEANED")).toThrow(ValidationError);
    expect(() => validateHousekeepingTaskStatusTransition("ASSIGNED", "INSPECTED")).toThrow(ValidationError);
  });

  it("8. Validates status, type, and priority type guards", () => {
    expect(isHousekeepingTaskStatus("PENDING")).toBe(true);
    expect(isHousekeepingTaskStatus("INSPECTED")).toBe(true);
    expect(isHousekeepingTaskStatus("OCCUPIED")).toBe(false);

    expect(isHousekeepingTaskType("DEPARTURE_TURNOVER")).toBe(true);
    expect(isHousekeepingTaskType("ROUTINE_CLEANING")).toBe(true);
    expect(isHousekeepingTaskType("DEEP_CLEANING")).toBe(true);
    expect(isHousekeepingTaskType("INSPECTION")).toBe(true);
    expect(isHousekeepingTaskType("UNKNOWN")).toBe(false);

    expect(isHousekeepingTaskPriority("LOW")).toBe(true);
    expect(isHousekeepingTaskPriority("URGENT")).toBe(true);
    expect(isHousekeepingTaskPriority("EXTREME")).toBe(false);
  });
});
