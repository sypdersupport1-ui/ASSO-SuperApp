import { describe, it, expect, beforeEach } from "vitest";
import {
  isModuleEntitled,
  assertModuleEntitlement,
  setTenantEntitlements,
} from "@/lib/entitlements/checker";
import { evaluatePolicy, assertPolicy } from "@/lib/policy/engine";
import { ModuleNotEntitledError, PolicyViolationError } from "@/lib/api/errors";
import type { JwtPayload } from "@/lib/auth/jwt";

describe("Module Entitlements & Business Policy Verification", () => {
  const tenantId = "11111111-1111-1111-1111-111111111111";

  const staffUser: JwtPayload = {
    sub: "usr_cashier",
    tenantId,
    roles: ["CASHIER"],
    permissions: ["orders.create", "payments.refund"],
    sessionType: "STAFF",
  };

  const managerUser: JwtPayload = {
    sub: "usr_mgr",
    tenantId,
    roles: ["MANAGER"],
    permissions: ["orders.*", "payments.*"],
    sessionType: "STAFF",
  };

  beforeEach(() => {
    // Configure tenant entitlements
    setTenantEntitlements(tenantId, ["POS", "ORDERING", "INVENTORY"]);
  });

  describe("Module Entitlements", () => {
    it("1. Allows access to entitled modules", () => {
      expect(isModuleEntitled(tenantId, "INVENTORY")).toBe(true);
      expect(isModuleEntitled(tenantId, "POS")).toBe(true);
      expect(() => assertModuleEntitlement(tenantId, "INVENTORY")).not.toThrow();
    });

    it("2. Blocks access to unentitled modules (MODULE_NOT_ENTITLED)", () => {
      expect(isModuleEntitled(tenantId, "CINEMA_CORE")).toBe(false);
      expect(() => assertModuleEntitlement(tenantId, "CINEMA_CORE")).toThrow(
        ModuleNotEntitledError
      );
    });
  });

  describe("Business Policy Engine", () => {
    it("1. Allows standard operations within policy threshold", () => {
      const result = evaluatePolicy({
        tenantId,
        user: staffUser,
        action: "payments.refund",
        amount: 500, // <= 5,000 threshold
      });

      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(false);
      expect(() =>
        assertPolicy({
          tenantId,
          user: staffUser,
          action: "payments.refund",
          amount: 500,
        })
      ).not.toThrow();
    });

    it("2. Blocks cashier from high-value refunds (> ₹5,000) requiring manager approval", () => {
      const result = evaluatePolicy({
        tenantId,
        user: staffUser,
        action: "payments.refund",
        amount: 6000,
      });

      expect(result.allowed).toBe(false);
      expect(result.requiresApproval).toBe(true);
      expect(() =>
        assertPolicy({
          tenantId,
          user: staffUser,
          action: "payments.refund",
          amount: 6000,
        })
      ).toThrow(PolicyViolationError);
    });

    it("3. Allows manager to execute high-value refund (> ₹5,000)", () => {
      const result = evaluatePolicy({
        tenantId,
        user: managerUser,
        action: "payments.refund",
        amount: 6000,
      });

      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(false);
    });
  });
});
