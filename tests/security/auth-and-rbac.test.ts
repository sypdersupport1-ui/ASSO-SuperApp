import { describe, it, expect } from "vitest";
import { signJwt, verifyJwt, type JwtPayload } from "@/lib/auth/jwt";
import { hasPermission, assertPermission } from "@/lib/auth/rbac";
import { AuthenticationError, PermissionDeniedError } from "@/lib/api/errors";

describe("Authentication & RBAC Security Verification", () => {
  const mockStaffUser: Omit<JwtPayload, "iat" | "exp"> = {
    sub: "usr_12345",
    email: "waiter@assohospitality.com",
    tenantId: "11111111-1111-1111-1111-111111111111",
    outletId: "out_restaurant_01",
    roles: ["WAITER"],
    permissions: ["orders.create", "orders.read"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  };

  it("1. Generates and verifies valid staff JWT token", () => {
    const token = signJwt(mockStaffUser, 900);
    const decoded = verifyJwt(token);

    expect(decoded.sub).toBe("usr_12345");
    expect(decoded.tenantId).toBe("11111111-1111-1111-1111-111111111111");
    expect(decoded.permissions).toContain("orders.create");
  });

  it("2. Rejects expired JWT tokens", () => {
    // Generate token that expired 10 seconds ago
    const expiredToken = signJwt(mockStaffUser, -10);
    expect(() => verifyJwt(expiredToken)).toThrow(AuthenticationError);
  });

  it("3. Rejects tampered JWT signatures", () => {
    const validToken = signJwt(mockStaffUser, 900);
    const tamperedToken = validToken.slice(0, -5) + "abcde";
    expect(() => verifyJwt(tamperedToken)).toThrow(AuthenticationError);
  });

  it("4. Enforces RBAC permissions accurately", () => {
    const user: JwtPayload = { ...mockStaffUser, iat: Date.now(), exp: Date.now() + 900 };

    expect(hasPermission(user, "orders.create")).toBe(true);
    expect(hasPermission(user, "orders.read")).toBe(true);
    expect(hasPermission(user, "billing.settle")).toBe(false);

    expect(() => assertPermission(user, "orders.create")).not.toThrow();
    expect(() => assertPermission(user, "billing.settle")).toThrow(PermissionDeniedError);
  });

  it("5. Supports wildcard permission patterns", () => {
    const managerUser: JwtPayload = {
      sub: "usr_mgr",
      roles: ["MANAGER"],
      permissions: ["orders.*"],
      sessionType: "STAFF",
      iat: Date.now(),
      exp: Date.now() + 900,
    };

    expect(hasPermission(managerUser, "orders.create")).toBe(true);
    expect(hasPermission(managerUser, "orders.cancel")).toBe(true);
    expect(hasPermission(managerUser, "inventory.adjust")).toBe(false);
  });

  it("6. Super Admin possesses universal permission scope", () => {
    const superAdmin: JwtPayload = {
      sub: "usr_admin",
      roles: ["SUPER_ADMIN"],
      permissions: [],
      sessionType: "SUPER_ADMIN",
      isSuperAdmin: true,
      iat: Date.now(),
      exp: Date.now() + 900,
    };

    expect(hasPermission(superAdmin, "anything.anywhere")).toBe(true);
  });
});
