import { describe, it, expect } from "vitest";
import {
  validateOrderStatusTransition,
  canCustomerCancelOrder,
  mapToCustomerOrderStatus,
  isOrderStatus,
  type OrderStatus,
} from "@/lib/ordering/order-state-machines";
import { ValidationError } from "@/lib/api/errors";

describe("Hotel Slice 8 — Order State Machine Unit Tests", () => {
  describe("1. Legal Order State Transitions", () => {
    it("allows PLACED -> ACCEPTED", () => {
      expect(() => validateOrderStatusTransition("PLACED", "ACCEPTED")).not.toThrow();
    });

    it("allows PLACED -> PREPARING directly if auto-accepted", () => {
      expect(() => validateOrderStatusTransition("PLACED", "PREPARING")).not.toThrow();
    });

    it("allows ACCEPTED -> PREPARING", () => {
      expect(() => validateOrderStatusTransition("ACCEPTED", "PREPARING")).not.toThrow();
    });

    it("allows PREPARING -> READY", () => {
      expect(() => validateOrderStatusTransition("PREPARING", "READY")).not.toThrow();
    });

    it("allows READY -> OUT_FOR_DELIVERY", () => {
      expect(() => validateOrderStatusTransition("READY", "OUT_FOR_DELIVERY")).not.toThrow();
    });

    it("allows OUT_FOR_DELIVERY -> DELIVERED", () => {
      expect(() => validateOrderStatusTransition("OUT_FOR_DELIVERY", "DELIVERED")).not.toThrow();
    });

    it("allows idempotent no-op transitions (current === next)", () => {
      expect(() => validateOrderStatusTransition("PREPARING", "PREPARING")).not.toThrow();
    });

    it("allows PLACED -> CANCELLED and ACCEPTED -> CANCELLED", () => {
      expect(() => validateOrderStatusTransition("PLACED", "CANCELLED")).not.toThrow();
      expect(() => validateOrderStatusTransition("ACCEPTED", "CANCELLED")).not.toThrow();
    });
  });

  describe("2. Illegal Order State Transitions", () => {
    it("rejects jumping from PLACED directly to DELIVERED", () => {
      expect(() => validateOrderStatusTransition("PLACED", "DELIVERED")).toThrow(ValidationError);
    });

    it("rejects transition from DELIVERED (terminal state) to any other state", () => {
      expect(() => validateOrderStatusTransition("DELIVERED", "PREPARING")).toThrow(ValidationError);
      expect(() => validateOrderStatusTransition("DELIVERED", "CANCELLED")).toThrow(ValidationError);
    });

    it("rejects transition from CANCELLED (terminal state) to any other state", () => {
      expect(() => validateOrderStatusTransition("CANCELLED", "PLACED")).toThrow(ValidationError);
      expect(() => validateOrderStatusTransition("CANCELLED", "ACCEPTED")).toThrow(ValidationError);
    });

    it("allows cancelling an order that is already PREPARING or READY (staff action)", () => {
      expect(() => validateOrderStatusTransition("PREPARING", "CANCELLED")).not.toThrow();
      expect(() => validateOrderStatusTransition("READY", "CANCELLED")).not.toThrow();
    });
  });

  describe("3. Customer Cancellation Window", () => {
    it("permits customer cancellation in PLACED and ACCEPTED states", () => {
      expect(canCustomerCancelOrder("PLACED")).toBe(true);
      expect(canCustomerCancelOrder("ACCEPTED")).toBe(true);
    });

    it("forbids customer cancellation once cooking has started (PREPARING, READY, OUT_FOR_DELIVERY, DELIVERED)", () => {
      expect(canCustomerCancelOrder("PREPARING")).toBe(false);
      expect(canCustomerCancelOrder("READY")).toBe(false);
      expect(canCustomerCancelOrder("OUT_FOR_DELIVERY")).toBe(false);
      expect(canCustomerCancelOrder("DELIVERED")).toBe(false);
      expect(canCustomerCancelOrder("CANCELLED")).toBe(false);
    });
  });

  describe("4. Customer Status Mapping & Type Guards", () => {
    it("maps raw statuses to user-friendly customer vocabulary", () => {
      expect(mapToCustomerOrderStatus("PLACED")).toBe("Received");
      expect(mapToCustomerOrderStatus("ACCEPTED")).toBe("Confirmed");
      expect(mapToCustomerOrderStatus("PREPARING")).toBe("Preparing");
      expect(mapToCustomerOrderStatus("READY")).toBe("Ready");
      expect(mapToCustomerOrderStatus("OUT_FOR_DELIVERY")).toBe("On the way");
      expect(mapToCustomerOrderStatus("DELIVERED")).toBe("Delivered");
      expect(mapToCustomerOrderStatus("CANCELLED")).toBe("Cancelled");
    });

    it("correctly identifies valid and invalid order status strings", () => {
      expect(isOrderStatus("PLACED")).toBe(true);
      expect(isOrderStatus("OUT_FOR_DELIVERY")).toBe(true);
      expect(isOrderStatus("INVALID_STATUS")).toBe(false);
    });
  });
});
