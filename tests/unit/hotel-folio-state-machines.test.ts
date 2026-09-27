import { describe, it, expect } from "vitest";
import {
  validateFolioStatusTransition,
  calculateFolioBalances,
  getEntryDirection,
  isFolioEntryType,
  type HotelFolioEntryType,
} from "@/lib/hotel/folio-state-machines";
import { BusinessRuleError } from "@/lib/api/errors";

describe("Phase 7 Hotel Vertical — Slice 9 (Folio & Billing) Unit State Machines", () => {
  describe("1. Folio Status Lifecycle State Machine", () => {
    it("allows legal transition: OPEN -> CLOSED", () => {
      expect(() => validateFolioStatusTransition("OPEN", "CLOSED")).not.toThrow();
    });

    it("allows legal transition: CLOSED -> OPEN (reopening)", () => {
      expect(() => validateFolioStatusTransition("CLOSED", "OPEN")).not.toThrow();
    });

    it("allows idempotent same-status transition: OPEN -> OPEN, CLOSED -> CLOSED", () => {
      expect(() => validateFolioStatusTransition("OPEN", "OPEN")).not.toThrow();
      expect(() => validateFolioStatusTransition("CLOSED", "CLOSED")).not.toThrow();
    });

    it("rejects unknown statuses", () => {
      expect(() => validateFolioStatusTransition("OPEN", "INVALID" as any)).toThrow(BusinessRuleError);
      expect(() => validateFolioStatusTransition("INVALID" as any, "CLOSED")).toThrow(BusinessRuleError);
    });
  });

  describe("2. Folio Entry Types & Direction Validation", () => {
    it("validates recognized entry types", () => {
      expect(isFolioEntryType("ROOM_CHARGE")).toBe(true);
      expect(isFolioEntryType("FOOD_CHARGE")).toBe(true);
      expect(isFolioEntryType("SERVICE_CHARGE")).toBe(true);
      expect(isFolioEntryType("TAX")).toBe(true);
      expect(isFolioEntryType("PAYMENT")).toBe(true);
      expect(isFolioEntryType("ADJUSTMENT")).toBe(true);
      expect(isFolioEntryType("REFUND")).toBe(true);
      expect(isFolioEntryType("REVERSAL")).toBe(true);
      expect(isFolioEntryType("RANDOM_TYPE")).toBe(false);
    });

    it("correctly identifies debit vs credit directions", () => {
      expect(getEntryDirection("ROOM_CHARGE", 2500)).toBe("DEBIT");
      expect(getEntryDirection("FOOD_CHARGE", 450)).toBe("DEBIT");
      expect(getEntryDirection("SERVICE_CHARGE", 150)).toBe("DEBIT");
      expect(getEntryDirection("TAX", 22.5)).toBe("DEBIT");
      expect(getEntryDirection("REFUND", 500)).toBe("DEBIT");

      expect(getEntryDirection("PAYMENT", -2000)).toBe("CREDIT");
      expect(getEntryDirection("ADJUSTMENT", -100)).toBe("CREDIT");
      expect(getEntryDirection("ADJUSTMENT", 100)).toBe("DEBIT");
      expect(getEntryDirection("REVERSAL", -500)).toBe("CREDIT");
    });
  });

  describe("3. Deterministic Ledger Balance Calculation", () => {
    it("computes zero balance for empty entries", () => {
      const balances = calculateFolioBalances([]);
      expect(balances.totalCharges).toBe("0.0000");
      expect(balances.totalPayments).toBe("0.0000");
      expect(balances.balanceDue).toBe("0.0000");
    });

    it("accumulates multiple room and food charges accurately", () => {
      const entries = [
        { entryType: "ROOM_CHARGE", amount: "3500.0000" },
        { entryType: "FOOD_CHARGE", amount: "525.0000" },
        { entryType: "SERVICE_CHARGE", amount: "150.0000" },
      ];
      const balances = calculateFolioBalances(entries);
      expect(balances.totalCharges).toBe("4175.0000");
      expect(balances.totalPayments).toBe("0.0000");
      expect(balances.balanceDue).toBe("4175.0000");
    });

    it("correctly deducts payments from outstanding balance due", () => {
      const entries = [
        { entryType: "ROOM_CHARGE", amount: "5000.0000" },
        { entryType: "PAYMENT", amount: "-3000.0000" },
        { entryType: "PAYMENT", amount: "-2000.0000" },
      ];
      const balances = calculateFolioBalances(entries);
      expect(balances.totalCharges).toBe("5000.0000");
      expect(balances.totalPayments).toBe("5000.0000");
      expect(balances.balanceDue).toBe("0.0000");
    });

    it("handles credit adjustments and partial refunds deterministically", () => {
      const entries = [
        { entryType: "ROOM_CHARGE", amount: "4000.0000" },
        { entryType: "PAYMENT", amount: "-4000.0000" },
        { entryType: "REFUND", amount: "500.0000" }, // Guest was refunded 500
        { entryType: "ADJUSTMENT", amount: "-200.0000" }, // Courtesy discount
      ];
      const balances = calculateFolioBalances(entries);
      // Total charges: 4000 + 500 = 4500
      // Total payments/credits: 4000 + 200 = 4200
      // Balance due: 4500 - 4200 = 300
      expect(balances.totalCharges).toBe("4500.0000");
      expect(balances.totalPayments).toBe("4200.0000");
      expect(balances.balanceDue).toBe("300.0000");
    });
  });
});
