import { describe, it, expect } from "vitest";
import { Decimal, calculateExactOrderTotals } from "@/lib/decimal";

describe("Exact Decimal & Monetary Arithmetic Engine (BigInt Arbitrary Precision)", () => {
  describe("Decimal Construction & Parsing", () => {
    it("parses integer strings, decimals, bigints, and numbers", () => {
      expect(Decimal.from("100").toFixed(2)).toBe("100.00");
      expect(Decimal.from("100.50").toFixed(2)).toBe("100.50");
      expect(Decimal.from("-50.25").toFixed(2)).toBe("-50.25");
      expect(Decimal.from(100n).toFixed(2)).toBe("100.00");
      expect(Decimal.from(".75").toFixed(2)).toBe("0.75");
      expect(Decimal.from("-.5").toFixed(2)).toBe("-0.50");
      expect(Decimal.from("1e-2").toFixed(4)).toBe("0.0100");
      expect(Decimal.from(Decimal.from("42.00")).toFixed(2)).toBe("42.00");
    });

    it("rejects invalid decimal strings", () => {
      expect(() => Decimal.from("")).toThrow();
      expect(() => Decimal.from("abc")).toThrow();
      expect(() => Decimal.from("12.34.56")).toThrow();
    });
  });

  describe("Floating-Point Edge Cases Solved Exactly", () => {
    it("0.1 + 0.2 equals exactly 0.30 (not 0.30000000000000004)", () => {
      const a = Decimal.from("0.1");
      const b = Decimal.from("0.2");
      const sum = a.plus(b);
      expect(sum.toFixed(2)).toBe("0.30");
      expect(sum.toFixed(4)).toBe("0.3000");
      expect(sum.equals("0.3")).toBe(true);
    });

    it("10.10 * 7 equals exactly 70.70 (not 70.69999999999999)", () => {
      const price = Decimal.from("10.10");
      const total = price.times(7);
      expect(total.toFixed(2)).toBe("70.70");
      expect(total.toFixed(4)).toBe("70.7000");
    });

    it("19.99 * 3 equals exactly 59.97 (not 59.970000000000006)", () => {
      const price = Decimal.from("19.99");
      const total = price.times(3);
      expect(total.toFixed(2)).toBe("59.97");
      expect(total.toFixed(4)).toBe("59.9700");
    });

    it("1.005 rounded half-up to 2 decimals gives 1.01 (not 1.00 due to binary float underflow)", () => {
      const val = Decimal.from("1.005");
      expect(val.toFixed(2)).toBe("1.01");
    });

    it("2.005 rounded half-up to 2 decimals gives 2.01", () => {
      const val = Decimal.from("2.005");
      expect(val.toFixed(2)).toBe("2.01");
    });
  });

  describe("Exact Order Financial Invariants", () => {
    it("case: 10.10 x 7 with zero tax and zero platform fee", () => {
      const res = calculateExactOrderTotals({
        items: [{ unitPrice: "10.1000", quantity: 7 }],
      });

      expect(res.subtotalAmountDb).toBe("70.7000");
      expect(res.subtotalAmountDto).toBe("70.70");
      expect(res.taxAmountDb).toBe("0.0000");
      expect(res.taxAmountDto).toBe("0.00");
      expect(res.platformFeeAmountDb).toBe("0.0000");
      expect(res.platformFeeAmountDto).toBe("0.00");
      expect(res.totalAmountDb).toBe("70.7000");
      expect(res.totalAmountDto).toBe("70.70");

      expect(res.lineItems[0].subtotalDb).toBe("70.7000");
      expect(res.lineItems[0].subtotalDto).toBe("70.70");
    });

    it("case: 19.99 x 3 with 5% GST", () => {
      const res = calculateExactOrderTotals({
        items: [{ unitPrice: "19.9900", quantity: 3 }],
        taxRate: "0.0500",
      });

      // Subtotal = 59.9700
      expect(res.subtotalAmountDb).toBe("59.9700");
      expect(res.subtotalAmountDto).toBe("59.97");

      // Tax = 59.97 * 0.05 = 2.9985 -> HALF_UP 2 decimals = 3.00
      expect(res.taxAmountDb).toBe("3.0000");
      expect(res.taxAmountDto).toBe("3.00");

      // Total = 59.97 + 3.00 = 62.97
      expect(res.totalAmountDb).toBe("62.9700");
      expect(res.totalAmountDto).toBe("62.97");
    });

    it("case: repeating GST decimal (33.33 x 1 with 18% GST)", () => {
      const res = calculateExactOrderTotals({
        items: [{ unitPrice: "33.3300", quantity: 1 }],
        taxRate: "0.1800",
      });

      // Subtotal: 33.3300
      // 33.33 * 0.18 = 5.9994 -> HALF_UP 2 decimals = 6.00
      expect(res.subtotalAmountDb).toBe("33.3300");
      expect(res.taxAmountDb).toBe("6.0000");
      expect(res.taxAmountDto).toBe("6.00");
      expect(res.totalAmountDb).toBe("39.3300");
      expect(res.totalAmountDto).toBe("39.33");
    });

    it("case: repeating percentage platform fee (19.99 x 1 with 2.5% fee)", () => {
      const res = calculateExactOrderTotals({
        items: [{ unitPrice: "19.9900", quantity: 1 }],
        platformFeeType: "PERCENTAGE",
        platformFeeRate: "0.0250",
      });

      // Subtotal: 19.9900
      // Fee = 19.99 * 0.025 = 0.49975 -> HALF_UP 2 decimals = 0.50
      expect(res.subtotalAmountDb).toBe("19.9900");
      expect(res.platformFeeAmountDb).toBe("0.5000");
      expect(res.platformFeeAmountDto).toBe("0.50");
      expect(res.totalAmountDb).toBe("20.4900");
      expect(res.totalAmountDto).toBe("20.49");
    });

    it("case: combined GST + platform fee (strictly non-compounding)", () => {
      const res = calculateExactOrderTotals({
        items: [
          { unitPrice: "10.1000", quantity: 7 }, // 70.70
          { unitPrice: "19.9900", quantity: 3 }, // 59.97
        ], // Subtotal: 130.67
        taxRate: "0.0500", // 5% GST
        platformFeeType: "PERCENTAGE",
        platformFeeRate: "0.0250", // 2.5% Platform Fee
      });

      // Subtotal: 70.70 + 59.97 = 130.67
      expect(res.subtotalAmountDb).toBe("130.6700");
      expect(res.subtotalAmountDto).toBe("130.67");

      // GST: 130.67 * 0.05 = 6.5335 -> HALF_UP = 6.53 (NOT applied on fee)
      expect(res.taxAmountDb).toBe("6.5300");
      expect(res.taxAmountDto).toBe("6.53");

      // Fee: 130.67 * 0.025 = 3.26675 -> HALF_UP = 3.27 (NOT applied on GST)
      expect(res.platformFeeAmountDb).toBe("3.2700");
      expect(res.platformFeeAmountDto).toBe("3.27");

      // Total = 130.67 + 6.53 + 3.27 = 140.47
      expect(res.totalAmountDb).toBe("140.4700");
      expect(res.totalAmountDto).toBe("140.47");
    });

    it("case: fixed platform fee", () => {
      const res = calculateExactOrderTotals({
        items: [{ unitPrice: "250.0000", quantity: 2 }], // 500.00
        taxRate: "0.1200", // 12% GST = 60.00
        platformFeeType: "FIXED",
        platformFeeFixed: "25.0000",
      });

      expect(res.subtotalAmountDb).toBe("500.0000");
      expect(res.taxAmountDb).toBe("60.0000");
      expect(res.platformFeeAmountDb).toBe("25.0000");
      expect(res.platformFeeAmountDto).toBe("25.00");
      expect(res.totalAmountDb).toBe("585.0000");
      expect(res.totalAmountDto).toBe("585.00");
    });

    it("case: discount + tax + fee calculation", () => {
      const res = calculateExactOrderTotals({
        items: [{ unitPrice: "100.0000", quantity: 2 }], // 200.00
        taxRate: "0.0500", // 10.00
        platformFeeType: "FIXED",
        platformFeeFixed: "15.0000", // 15.00
        discountAmount: "25.0000", // 25.00
      });

      // Total = 200 + 10 + 15 - 25 = 200.00
      expect(res.subtotalAmountDb).toBe("200.0000");
      expect(res.taxAmountDb).toBe("10.0000");
      expect(res.platformFeeAmountDb).toBe("15.0000");
      expect(res.discountAmountDb).toBe("25.0000");
      expect(res.totalAmountDb).toBe("200.0000");
      expect(res.totalAmountDto).toBe("200.00");
    });
  });
});
