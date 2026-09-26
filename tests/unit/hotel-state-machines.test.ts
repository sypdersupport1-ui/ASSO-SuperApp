import { describe, it, expect } from "vitest";
import {
  validateOperationalStatusTransition,
  validateHousekeepingStatusTransition,
  isOperationalStatus,
  isHousekeepingStatus,
} from "@/lib/hotel/state-machines";
import { ValidationError } from "@/lib/api/errors";

describe("Hotel State Machine Transition Rules (Slice 1)", () => {
  describe("Operational Status Transitions", () => {
    it("1. Allows valid transitions from AVAILABLE", () => {
      expect(() => validateOperationalStatusTransition("AVAILABLE", "OCCUPIED")).not.toThrow();
      expect(() => validateOperationalStatusTransition("AVAILABLE", "RESERVED")).not.toThrow();
      expect(() => validateOperationalStatusTransition("AVAILABLE", "OUT_OF_SERVICE")).not.toThrow();
      expect(() => validateOperationalStatusTransition("AVAILABLE", "OUT_OF_ORDER")).not.toThrow();
    });

    it("2. Allows valid transition from OCCUPIED to AVAILABLE (checkout)", () => {
      expect(() => validateOperationalStatusTransition("OCCUPIED", "AVAILABLE")).not.toThrow();
      expect(() => validateOperationalStatusTransition("OCCUPIED", "OUT_OF_SERVICE")).not.toThrow();
    });

    it("3. Allows no-op transition (same status)", () => {
      expect(() => validateOperationalStatusTransition("AVAILABLE", "AVAILABLE")).not.toThrow();
      expect(() => validateOperationalStatusTransition("OCCUPIED", "OCCUPIED")).not.toThrow();
    });

    it("4. Blocks invalid direct transitions", () => {
      // Cannot transition directly from OCCUPIED to RESERVED without checkout
      expect(() => validateOperationalStatusTransition("OCCUPIED", "RESERVED")).toThrow(ValidationError);
      // Cannot transition from RESERVED to OUT_OF_ORDER directly
      expect(() => validateOperationalStatusTransition("RESERVED", "OUT_OF_ORDER")).toThrow(ValidationError);
    });

    it("5. Type guards validate strings correctly", () => {
      expect(isOperationalStatus("AVAILABLE")).toBe(true);
      expect(isOperationalStatus("OCCUPIED")).toBe(true);
      expect(isOperationalStatus("UNKNOWN_STATUS")).toBe(false);
    });
  });

  describe("Housekeeping Status Transitions", () => {
    it("1. Allows valid housekeeping cleaning lifecycle", () => {
      // CLEAN -> DIRTY -> CLEANING -> CLEAN
      expect(() => validateHousekeepingStatusTransition("CLEAN", "DIRTY")).not.toThrow();
      expect(() => validateHousekeepingStatusTransition("DIRTY", "CLEANING")).not.toThrow();
      expect(() => validateHousekeepingStatusTransition("CLEANING", "CLEAN")).not.toThrow();
      expect(() => validateHousekeepingStatusTransition("CLEANING", "MAINTENANCE")).not.toThrow();
    });

    it("2. Allows inspection transitions", () => {
      expect(() => validateHousekeepingStatusTransition("CLEAN", "INSPECTED")).not.toThrow();
      expect(() => validateHousekeepingStatusTransition("INSPECTED", "DIRTY")).not.toThrow();
    });

    it("3. Blocks invalid transitions", () => {
      // Cannot jump from DIRTY directly to INSPECTED without cleaning
      expect(() => validateHousekeepingStatusTransition("DIRTY", "INSPECTED")).toThrow(ValidationError);
      // Cannot jump from DIRTY directly to CLEAN without cleaning
      expect(() => validateHousekeepingStatusTransition("DIRTY", "CLEAN")).toThrow(ValidationError);
    });

    it("4. Type guards validate housekeeping values correctly", () => {
      expect(isHousekeepingStatus("CLEAN")).toBe(true);
      expect(isHousekeepingStatus("DIRTY")).toBe(true);
      expect(isHousekeepingStatus("INVENTED_STATUS")).toBe(false);
    });
  });
});
