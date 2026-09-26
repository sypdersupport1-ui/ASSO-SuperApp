import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET as healthGet } from "@/app/api/v1/health/route";
import { POST as protectedPost } from "@/app/api/v1/test/protected/route";
import { signJwt } from "@/lib/auth/jwt";
import { setTenantEntitlements } from "@/lib/entitlements/checker";

describe("API v1 Foundation Endpoints Integration", () => {
  const tenantId = "11111111-1111-1111-1111-111111111111";

  it("1. GET /api/v1/health returns truthful platform status (degraded when DB unreachable)", async () => {
    delete process.env.ASSO_DB_MODE;
    const req = new NextRequest("http://localhost:3000/api/v1/health");
    const res = await healthGet(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.service).toBe("ASSO Platform Core");
    // When DB is unreachable, status truthfully reports degraded
    expect(body.data.status).toBe("degraded");
    expect(body.data.database.status).toBe("disconnected");
    expect(body.data.testDatabase.engine).toBe("pg-mem");
    expect(body.meta.requestId).toBeDefined();
  });

  it("1b. GET /api/v1/health returns healthy when explicit mock mode is active", async () => {
    process.env.ASSO_DB_MODE = "mock";
    const req = new NextRequest("http://localhost:3000/api/v1/health");
    const res = await healthGet(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("healthy");
    expect(body.data.database.status).toBe("mock");
    delete process.env.ASSO_DB_MODE;
  });

  it("2. POST /api/v1/test/protected rejects unauthorized request (401)", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/test/protected", {
      method: "POST",
      body: JSON.stringify({ action: "adjust" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await protectedPost(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("3. POST /api/v1/test/protected rejects request when module is not entitled (403)", async () => {
    // Entitle only POS, omitting INVENTORY
    setTenantEntitlements(tenantId, ["POS"]);

    const token = signJwt({
      sub: "usr_staff",
      tenantId,
      roles: ["MANAGER"],
      permissions: ["inventory.adjust"],
      sessionType: "STAFF",
    });

    const req = new NextRequest("http://localhost:3000/api/v1/test/protected", {
      method: "POST",
      body: JSON.stringify({ action: "adjust" }),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await protectedPost(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe("MODULE_NOT_ENTITLED");
  });

  it("4. POST /api/v1/test/protected executes successfully with valid auth, entitlement, and permission", async () => {
    setTenantEntitlements(tenantId, ["INVENTORY"]);

    const token = signJwt({
      sub: "usr_inventory_manager",
      tenantId,
      roles: ["MANAGER"],
      permissions: ["inventory.adjust"],
      sessionType: "STAFF",
    });

    const req = new NextRequest("http://localhost:3000/api/v1/test/protected", {
      method: "POST",
      body: JSON.stringify({ action: "adjust", amount: 100 }),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await protectedPost(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe("Protected mutation executed successfully");
    expect(body.data.tenantId).toBe(tenantId);
  });

  it("5. GET /api/v1/realtime establishes Server-Sent Events (SSE) stream", async () => {
    const { GET: realtimeGet } = await import("@/app/api/v1/realtime/route");
    const req = new NextRequest("http://localhost:3000/api/v1/realtime", {
      headers: { "x-tenant-id": tenantId },
    });

    const res = await realtimeGet(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    // Read the first chunk from the readable stream
    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    const chunk = await reader?.read();
    expect(chunk?.done).toBe(false);

    const text = new TextDecoder().decode(chunk?.value);
    expect(text).toContain("event: system.connected");
    expect(text).toContain(tenantId);

    // Cancel stream cleanly
    await reader?.cancel();
  });
});

