import { describe, it, expect } from "vitest";
import {
  validateReservationStatusTransition,
  isReservationStatus,
} from "@/lib/hotel/reservation-state-machines";
import { ValidationError } from "@/lib/api/errors";

describe("Hotel Reservation State Machine (Slice 2)", () => {
  it("1. Allows valid transitions from PENDING", () => {
    expect(() => validateReservationStatusTransition("PENDING", "CONFIRMED")).not.toThrow();
    expect(() => validateReservationStatusTransition("PENDING", "CANCELLED")).not.toThrow();
  });

  it("2. Allows valid transitions from CONFIRMED", () => {
    expect(() => validateReservationStatusTransition("CONFIRMED", "CANCELLED")).not.toThrow();
    expect(() => validateReservationStatusTransition("CONFIRMED", "NO_SHOW")).not.toThrow();
  });

  it("3. Allows no-op transitions (same status)", () => {
    expect(() => validateReservationStatusTransition("PENDING", "PENDING")).not.toThrow();
    expect(() => validateReservationStatusTransition("CONFIRMED", "CONFIRMED")).not.toThrow();
  });

  it("4. Blocks invalid transitions from CONFIRMED back to PENDING", () => {
    expect(() => validateReservationStatusTransition("CONFIRMED", "PENDING")).toThrow(ValidationError);
  });

  it("5. Blocks all transitions from terminal CANCELLED state", () => {
    expect(() => validateReservationStatusTransition("CANCELLED", "CONFIRMED")).toThrow(ValidationError);
    expect(() => validateReservationStatusTransition("CANCELLED", "PENDING")).toThrow(ValidationError);
  });

  it("6. Blocks all transitions from terminal NO_SHOW state", () => {
    expect(() => validateReservationStatusTransition("NO_SHOW", "CONFIRMED")).toThrow(ValidationError);
    expect(() => validateReservationStatusTransition("NO_SHOW", "PENDING")).toThrow(ValidationError);
  });

  it("7. Type guard validates strings accurately", () => {
    expect(isReservationStatus("PENDING")).toBe(true);
    expect(isReservationStatus("CONFIRMED")).toBe(true);
    expect(isReservationStatus("CHECKED_IN")).toBe(false); // Stay state, not reservation
    expect(isReservationStatus("UNKNOWN")).toBe(false);
  });
});
