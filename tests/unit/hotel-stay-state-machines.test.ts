import { describe, it, expect } from "vitest";
import {
  validateStayStatusTransition,
  isStayStatus,
} from "@/lib/hotel/stay-state-machines";
import { ValidationError } from "@/lib/api/errors";

describe("Hotel Stay State Machine (Slice 3)", () => {
  it("1. Allows valid transition from ACTIVE to CHECKED_OUT", () => {
    expect(() => validateStayStatusTransition("ACTIVE", "CHECKED_OUT")).not.toThrow();
  });

  it("2. Allows no-op transitions (same status)", () => {
    expect(() => validateStayStatusTransition("ACTIVE", "ACTIVE")).not.toThrow();
    expect(() => validateStayStatusTransition("CHECKED_OUT", "CHECKED_OUT")).not.toThrow();
  });

  it("3. Blocks all transitions from terminal CHECKED_OUT state", () => {
    expect(() => validateStayStatusTransition("CHECKED_OUT", "ACTIVE")).toThrow(ValidationError);
    expect(() => validateStayStatusTransition("CHECKED_OUT", "ACTIVE")).toThrow(
      "State 'CHECKED_OUT' is terminal and cannot transition further"
    );
  });

  it("4. Blocks invalid unknown target status", () => {
    // @ts-expect-error testing invalid status runtime input
    expect(() => validateStayStatusTransition("ACTIVE", "CANCELLED")).toThrow(ValidationError);
    // @ts-expect-error testing invalid status runtime input
    expect(() => validateStayStatusTransition("ACTIVE", "UNKNOWN")).toThrow(ValidationError);
  });

  it("5. Type guard validates strings accurately", () => {
    expect(isStayStatus("ACTIVE")).toBe(true);
    expect(isStayStatus("CHECKED_OUT")).toBe(true);
    expect(isStayStatus("CONFIRMED")).toBe(false); // Reservation status, not stay status
    expect(isStayStatus("OCCUPIED")).toBe(false); // Room status, not stay status
    expect(isStayStatus("UNKNOWN")).toBe(false);
  });
});
