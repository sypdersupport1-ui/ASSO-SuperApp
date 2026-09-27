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
    expect(() => validateReservationStatusTransition("CONFIRMED", "CHECKED_IN")).not.toThrow();
  });

  it("3. Allows valid transitions from CHECKED_IN to COMPLETED", () => {
    expect(() => validateReservationStatusTransition("CHECKED_IN", "COMPLETED")).not.toThrow();
    expect(() => validateReservationStatusTransition("CHECKED_IN", "CANCELLED")).toThrow(ValidationError);
  });

  it("4. Allows no-op transitions (same status)", () => {
    expect(() => validateReservationStatusTransition("PENDING", "PENDING")).not.toThrow();
    expect(() => validateReservationStatusTransition("CONFIRMED", "CONFIRMED")).not.toThrow();
    expect(() => validateReservationStatusTransition("CHECKED_IN", "CHECKED_IN")).not.toThrow();
    expect(() => validateReservationStatusTransition("COMPLETED", "COMPLETED")).not.toThrow();
  });

  it("5. Blocks invalid transitions from CONFIRMED back to PENDING", () => {
    expect(() => validateReservationStatusTransition("CONFIRMED", "PENDING")).toThrow(ValidationError);
  });

  it("6. Blocks all transitions from terminal CANCELLED state", () => {
    expect(() => validateReservationStatusTransition("CANCELLED", "CONFIRMED")).toThrow(ValidationError);
    expect(() => validateReservationStatusTransition("CANCELLED", "PENDING")).toThrow(ValidationError);
  });

  it("7. Blocks all transitions from terminal NO_SHOW state", () => {
    expect(() => validateReservationStatusTransition("NO_SHOW", "CONFIRMED")).toThrow(ValidationError);
    expect(() => validateReservationStatusTransition("NO_SHOW", "PENDING")).toThrow(ValidationError);
  });

  it("8. Blocks all transitions from terminal COMPLETED state", () => {
    expect(() => validateReservationStatusTransition("COMPLETED", "CONFIRMED")).toThrow(ValidationError);
    expect(() => validateReservationStatusTransition("COMPLETED", "CHECKED_IN")).toThrow(ValidationError);
  });

  it("9. Type guard validates strings accurately", () => {
    expect(isReservationStatus("PENDING")).toBe(true);
    expect(isReservationStatus("CONFIRMED")).toBe(true);
    expect(isReservationStatus("CHECKED_IN")).toBe(true);
    expect(isReservationStatus("COMPLETED")).toBe(true);
    expect(isReservationStatus("UNKNOWN")).toBe(false);
  });
});
