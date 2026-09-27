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

  describe("Development Demo-Token Security Gates", () => {
    it("7. Demo token route issues valid staff token in local/development mode with fixed claims", async () => {
      const origAppEnv = process.env.APP_ENV;
      try {
        (process.env as Record<string, string | undefined>).APP_ENV = "development";
        const { GET } = await import("@/app/api/v1/auth/demo-token/route");
        const { NextRequest } = await import("next/server");

        const req = new NextRequest("http://localhost:3000/api/v1/auth/demo-token");
        const res = await GET(req);
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.data?.token).toBeDefined();

        const decoded = verifyJwt(json.data.token);
        expect(decoded.sub).toBe("00000000-0000-0000-0000-000000000001");
        expect(decoded.isSuperAdmin).toBe(false);
        expect(decoded.sessionType).toBe("STAFF");
        expect(decoded.roles).toContain("HOTEL_ADMIN");
        expect(decoded.tenantId).toBe("11111111-1111-1111-1111-111111111111");
      } finally {
        (process.env as Record<string, string | undefined>).APP_ENV = origAppEnv;
      }
    });

    it("8. Demo token route is strictly blocked in PREVIEW environment (returns 403)", async () => {
      const origAppEnv = process.env.APP_ENV;
      const origVercelEnv = process.env.VERCEL_ENV;
      try {
        (process.env as Record<string, string | undefined>).APP_ENV = "preview";
        delete (process.env as Record<string, string | undefined>).VERCEL_ENV;
        const { GET } = await import("@/app/api/v1/auth/demo-token/route");
        const { NextRequest } = await import("next/server");

        const req = new NextRequest("http://localhost:3000/api/v1/auth/demo-token");
        const res = await GET(req);
        expect(res.status).toBe(403);

        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.error?.code).toBe("PERMISSION_DENIED");
      } finally {
        (process.env as Record<string, string | undefined>).APP_ENV = origAppEnv;
        (process.env as Record<string, string | undefined>).VERCEL_ENV = origVercelEnv;
      }
    });

    it("9. Demo token route is strictly blocked in STAGING environment (returns 403)", async () => {
      const origAppEnv = process.env.APP_ENV;
      try {
        (process.env as Record<string, string | undefined>).APP_ENV = "staging";
        const { GET } = await import("@/app/api/v1/auth/demo-token/route");
        const { NextRequest } = await import("next/server");

        const req = new NextRequest("http://localhost:3000/api/v1/auth/demo-token");
        const res = await GET(req);
        expect(res.status).toBe(403);

        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.error?.code).toBe("PERMISSION_DENIED");
      } finally {
        (process.env as Record<string, string | undefined>).APP_ENV = origAppEnv;
      }
    });

    it("10. Demo token route is strictly blocked in PRODUCTION environment (returns 403)", async () => {
      const origNodeEnv = process.env.NODE_ENV;
      const origAppEnv = process.env.APP_ENV;
      try {
        (process.env as Record<string, string | undefined>).APP_ENV = "production";
        (process.env as Record<string, string | undefined>).NODE_ENV = "production";
        const { GET } = await import("@/app/api/v1/auth/demo-token/route");
        const { NextRequest } = await import("next/server");

        const req = new NextRequest("http://localhost:3000/api/v1/auth/demo-token");
        const res = await GET(req);
        expect(res.status).toBe(403);

        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.error?.code).toBe("PERMISSION_DENIED");
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv;
        (process.env as Record<string, string | undefined>).APP_ENV = origAppEnv;
      }
    });

    it("11. Demo token ignores query parameter attempts to mint Super Admin or arbitrary tenant", async () => {
      const origAppEnv = process.env.APP_ENV;
      try {
        (process.env as Record<string, string | undefined>).APP_ENV = "development";
        const { GET } = await import("@/app/api/v1/auth/demo-token/route");
        const { NextRequest } = await import("next/server");

        const maliciousUrl = "http://localhost:3000/api/v1/auth/demo-token?isSuperAdmin=true&tenantId=99999999-9999-9999-9999-999999999999&sub=hacker";
        const req = new NextRequest(maliciousUrl);
        const res = await GET(req);
        expect(res.status).toBe(200);

        const json = await res.json();
        const decoded = verifyJwt(json.data.token);

        expect(decoded.isSuperAdmin).toBe(false);
        expect(decoded.sub).toBe("00000000-0000-0000-0000-000000000001");
        expect(decoded.tenantId).toBe("11111111-1111-1111-1111-111111111111");
      } finally {
        (process.env as Record<string, string | undefined>).APP_ENV = origAppEnv;
      }
    });
  });
});


