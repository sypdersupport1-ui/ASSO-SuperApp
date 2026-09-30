import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET as outletsGet, POST as outletsPost } from "@/app/api/v1/restaurant/outlets/route";
import { GET as tablesGet, POST as tablesPost } from "@/app/api/v1/restaurant/tables/route";
import { GET as tableGet, PATCH as tablePatch } from "@/app/api/v1/restaurant/tables/[id]/route";
import { POST as tableStatusPost } from "@/app/api/v1/restaurant/tables/[id]/status/route";
import { GET as tableQrGet } from "@/app/api/v1/restaurant/tables/[id]/qr/route";
import { POST as tableQrRotatePost } from "@/app/api/v1/restaurant/tables/[id]/qr/rotate/route";
import { POST as tableQrRevokePost } from "@/app/api/v1/restaurant/tables/[id]/qr/revoke/route";
import { GET as summaryGet } from "@/app/api/v1/restaurant/tables/summary/route";
import { GET as sessionsGet, POST as sessionsPost } from "@/app/api/v1/restaurant/sessions/route";
import { POST as sessionClosePost } from "@/app/api/v1/restaurant/sessions/[id]/close/route";
import { GET as customerQrGet } from "@/app/api/v1/customer/qr/[token]/route";
import { signJwt } from "@/lib/auth/jwt";
import { setTenantEntitlements } from "@/lib/entitlements/checker";

describe("ASSO Restaurant Vertical — Slice 1 Integration Suite", () => {
  const TENANT_A = "11111111-1111-1111-1111-111111111111";
  const TENANT_B = "22222222-2222-2222-2222-222222222222";

  // Tokens
  const restaurantAdminTokenA = signJwt({
    sub: "usr_rest_admin_a",
    tenantId: TENANT_A,
    roles: ["RESTAURANT_ADMIN"],
    permissions: ["restaurant.*"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const restaurantStaffTokenA = signJwt({
    sub: "usr_rest_staff_a",
    tenantId: TENANT_A,
    roles: ["RESTAURANT_STAFF"],
    permissions: ["restaurant.tables.view", "restaurant.tables.status", "restaurant.sessions.manage"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const unprivilegedTokenA = signJwt({
    sub: "usr_unprivileged_a",
    tenantId: TENANT_A,
    roles: ["GUEST"],
    permissions: ["orders.read"],
    sessionType: "CUSTOMER",
    isSuperAdmin: false,
  });

  const restaurantAdminTokenB = signJwt({
    sub: "usr_rest_admin_b",
    tenantId: TENANT_B,
    roles: ["RESTAURANT_ADMIN"],
    permissions: ["restaurant.*"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  let outletIdA: string;
  let outletIdB: string;
  let testTableId: string;
  let testTableNumber: string;

  beforeAll(async () => {
    // Entitle Tenant A and Tenant B for RESTAURANT
    setTenantEntitlements(TENANT_A, ["CORE", "HOTEL", "RESTAURANT", "POS", "ORDERING"]);
    setTenantEntitlements(TENANT_B, ["CORE", "RESTAURANT", "POS", "ORDERING"]);

    // Create Restaurant Outlet for Tenant A
    const outACode = `REST_A_${Date.now().toString().slice(-4)}`;
    const reqA = new NextRequest("http://localhost:3000/api/v1/restaurant/outlets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${restaurantAdminTokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Saffron Dining Lounge",
        code: outACode,
      }),
    });
    const resA = await outletsPost(reqA);
    const jsonA = await resA.json();
    expect(resA.status).toBe(201);
    outletIdA = jsonA.data.outletId;

    // Create Restaurant Outlet for Tenant B
    const outBCode = `REST_B_${Date.now().toString().slice(-4)}`;
    const reqB = new NextRequest("http://localhost:3000/api/v1/restaurant/outlets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${restaurantAdminTokenB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Bistro Blue",
        code: outBCode,
      }),
    });
    const resB = await outletsPost(reqB);
    const jsonB = await resB.json();
    expect(resB.status).toBe(201);
    outletIdB = jsonB.data.outletId;
  });

  describe("1. Entitlement & RBAC Enforcement", () => {
    it("rejects request if tenant is NOT entitled to RESTAURANT module (403)", async () => {
      const TENANT_NO_REST = "33333333-3333-3333-3333-333333333333";
      setTenantEntitlements(TENANT_NO_REST, ["CORE", "HOTEL"]); // Lacks RESTAURANT

      const tokenNoRest = signJwt({
        sub: "usr_no_rest",
        tenantId: TENANT_NO_REST,
        roles: ["ADMIN"],
        permissions: ["restaurant.*"],
        sessionType: "STAFF",
        isSuperAdmin: false,
      });

      const req = new NextRequest("http://localhost:3000/api/v1/restaurant/tables", {
        headers: { Authorization: `Bearer ${tokenNoRest}` },
      });
      const res = await tablesGet(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("MODULE_NOT_ENTITLED");
    });

    it("rejects table creation if user lacks restaurant.tables.manage permission (403)", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/restaurant/tables", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantStaffTokenA}`, // Has view and status, but not manage
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          tableNumber: "T-UNAUTH",
          capacity: 4,
        }),
      });
      const res = await tablesPost(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("PERMISSION_DENIED");
    });

    it("allows table listing for user with restaurant.tables.view permission", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables?outletId=${outletIdA}`, {
        headers: { Authorization: `Bearer ${restaurantStaffTokenA}` },
      });
      const res = await tablesGet(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
    });
  });

  describe("2. Table Creation & CRUD Management", () => {
    it("creates a restaurant table with physical capacity, section, and automatic QR code", async () => {
      testTableNumber = `T-${Date.now().toString().slice(-4)}`;
      const req = new NextRequest("http://localhost:3000/api/v1/restaurant/tables", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantAdminTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          tableNumber: testTableNumber,
          displayLabel: "Window Booth Table",
          capacity: 4,
          section: "Main Dining",
        }),
      });
      const res = await tablesPost(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.tableNumber).toBe(testTableNumber);
      expect(json.data.capacity).toBe(4);
      expect(json.data.status).toBe("AVAILABLE");
      expect(json.data.hasActiveQr).toBe(true);
      expect(json.data.qrOpaqueToken).toBeDefined();

      testTableId = json.data.tableId;
    });

    it("rejects duplicate table number within the same outlet", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/restaurant/tables", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantAdminTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          tableNumber: testTableNumber,
          capacity: 4,
        }),
      });
      const res = await tablesPost(req);
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain("already exists");
    });

    it("allows the same table number in a DIFFERENT outlet (scoped uniqueness)", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/restaurant/tables", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantAdminTokenB}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdB,
          tableNumber: testTableNumber, // Same table number, but in Tenant B / Outlet B
          capacity: 6,
          section: "Patio",
        }),
      });
      const res = await tablesPost(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.tableNumber).toBe(testTableNumber);
      expect(json.data.outletId).toBe(outletIdB);
    });

    it("fetches single table details including active QR and session", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${testTableId}?outletId=${outletIdA}`, {
        headers: { Authorization: `Bearer ${restaurantAdminTokenA}` },
      });
      const res = await tableGet(req, { params: Promise.resolve({ id: testTableId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.tableId).toBe(testTableId);
      expect(json.data.hasActiveQr).toBe(true);
    });

    it("updates table physical properties (capacity, section, display label)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${testTableId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${restaurantAdminTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          displayLabel: "Updated Window Booth 99",
          capacity: 6,
          section: "Terrace Garden",
        }),
      });
      const res = await tablePatch(req, { params: Promise.resolve({ id: testTableId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.capacity).toBe(6);
      expect(json.data.section).toBe("Terrace Garden");
      expect(json.data.displayLabel).toBe("Updated Window Booth 99");
    });

    it("activates and deactivates table", async () => {
      // Deactivate
      const reqDeact = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${testTableId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${restaurantAdminTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          isActive: false,
        }),
      });
      const resDeact = await tablePatch(reqDeact, { params: Promise.resolve({ id: testTableId }) });
      const jsonDeact = await resDeact.json();
      expect(jsonDeact.data.isActive).toBe(false);

      // Reactivate
      const reqAct = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${testTableId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${restaurantAdminTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          isActive: true,
        }),
      });
      const resAct = await tablePatch(reqAct, { params: Promise.resolve({ id: testTableId }) });
      const jsonAct = await resAct.json();
      expect(jsonAct.data.isActive).toBe(true);
    });
  });

  describe("3. Controlled Status Transitions & State Machine", () => {
    it("transitions AVAILABLE -> RESERVED", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${testTableId}/status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantStaffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          status: "RESERVED",
          reason: "VIP party arriving at 8pm",
        }),
      });
      const res = await tableStatusPost(req, { params: Promise.resolve({ id: testTableId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("RESERVED");
    });

    it("transitions RESERVED -> OCCUPIED", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${testTableId}/status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantStaffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          status: "OCCUPIED",
        }),
      });
      const res = await tableStatusPost(req, { params: Promise.resolve({ id: testTableId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("OCCUPIED");
    });

    it("rejects impossible transition from OCCUPIED -> OUT_OF_SERVICE without clearing table", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${testTableId}/status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantStaffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          status: "OUT_OF_SERVICE",
        }),
      });
      const res = await tableStatusPost(req, { params: Promise.resolve({ id: testTableId }) });
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("INVALID_STATE_TRANSITION");
    });

    it("transitions OCCUPIED -> CLEANING", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${testTableId}/status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantStaffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          status: "CLEANING",
        }),
      });
      const res = await tableStatusPost(req, { params: Promise.resolve({ id: testTableId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("CLEANING");
    });

    it("transitions CLEANING -> AVAILABLE", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${testTableId}/status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantStaffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          status: "AVAILABLE",
          reason: "Table cleaned, sanitized and reset",
        }),
      });
      const res = await tableStatusPost(req, { params: Promise.resolve({ id: testTableId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("AVAILABLE");
    });
  });

  describe("4. Table Dining Sessions Foundation", () => {
    let activeSessionId: string;

    it("opens a valid active dining session on an available table", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/restaurant/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantStaffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          tableId: testTableId,
          guestCount: 3,
          customerName: "Priya Patel",
          customerPhone: "+91 98765 43210",
          notes: "Anniversary celebration",
        }),
      });
      const res = await sessionsPost(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("ACTIVE");
      expect(json.data.guestCount).toBe(3);
      expect(json.data.customerName).toBe("Priya Patel");
      expect(json.data.sessionNumber).toMatch(/^TS-/);

      activeSessionId = json.data.sessionId;

      // Verify table status transitioned to OCCUPIED
      const tableCheck = await tableGet(
        new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${testTableId}?outletId=${outletIdA}`, {
          headers: { Authorization: `Bearer ${restaurantAdminTokenA}` },
        }),
        { params: Promise.resolve({ id: testTableId }) }
      );
      const tableJson = await tableCheck.json();
      expect(tableJson.data.status).toBe("OCCUPIED");
      expect(tableJson.data.activeSession).toBeDefined();
    });

    it("strictly prevents duplicate active session on the same table", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/restaurant/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantStaffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          tableId: testTableId,
          guestCount: 2,
          customerName: "Another Party",
        }),
      });
      const res = await sessionsPost(req);
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain("already OCCUPIED");
    });

    it("closes active dining session and transitions table to CLEANING", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/sessions/${activeSessionId}/close`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantStaffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          nextTableStatus: "CLEANING",
          notes: "Guests completed dining",
        }),
      });
      const res = await sessionClosePost(req, { params: Promise.resolve({ id: activeSessionId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("COMPLETED");
      expect(json.data.closedAt).toBeDefined();

      // Verify table is now CLEANING
      const tableCheck = await tableGet(
        new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${testTableId}?outletId=${outletIdA}`, {
          headers: { Authorization: `Bearer ${restaurantAdminTokenA}` },
        }),
        { params: Promise.resolve({ id: testTableId }) }
      );
      const tableJson = await tableCheck.json();
      expect(tableJson.data.status).toBe("CLEANING");
      expect(tableJson.data.activeSession).toBeNull();
    });
  });

  describe("5. Table QR Code Lifecycle & Customer QR Context", () => {
    let opaqueToken: string;

    it("retrieves table QR code with 256-bit entropy token and SVG data URI", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${testTableId}/qr?outletId=${outletIdA}`, {
        headers: { Authorization: `Bearer ${restaurantAdminTokenA}` },
      });
      const res = await tableQrGet(req, { params: Promise.resolve({ id: testTableId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.tokenStatus).toBe("ACTIVE");
      expect(json.data.opaqueToken).toBeDefined();
      expect(json.data.qrSvgDataUri).toContain("data:image/svg+xml");
      expect(json.data.qrUrl).toContain("/restaurant/table?token=");

      opaqueToken = json.data.opaqueToken;
    });

    it("public customer endpoint resolves QR token to restaurant table context (no hotel room/stay requirements)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/customer/qr/${encodeURIComponent(opaqueToken)}`);
      const res = await customerQrGet(req, { params: Promise.resolve({ token: opaqueToken }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.context.contextType).toBe("TABLE");
      expect(json.data.context.tableNumber).toBe(testTableNumber);
      expect(json.data.table).toBeDefined();
      expect(json.data.table.tableId).toBe(testTableId);
      expect(json.data.sessionToken).toBeDefined();
      // Verifies no hotel stay concepts are leaked or present
      expect(json.data.stay).toBeUndefined();
    });

    it("rotates table QR token: revokes old token and generates new active token", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${testTableId}/qr/rotate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantAdminTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          reason: "Periodic security rotation",
        }),
      });
      const res = await tableQrRotatePost(req, { params: Promise.resolve({ id: testTableId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.tokenStatus).toBe("ACTIVE");
      expect(json.data.opaqueToken).not.toBe(opaqueToken); // Fresh opaque token

      // Previous token must now be revoked
      const oldReq = new NextRequest(`http://localhost:3000/api/v1/customer/qr/${encodeURIComponent(opaqueToken)}`);
      const oldRes = await customerQrGet(oldReq, { params: Promise.resolve({ token: opaqueToken }) });
      const oldJson = await oldRes.json();

      expect(oldRes.status).toBe(422);
      expect(oldJson.success).toBe(false);
      expect(oldJson.error.message).toContain("revoked or replaced");

      opaqueToken = json.data.opaqueToken;
    });

    it("revokes QR code: marks token REVOKED and blocks customer resolution", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${testTableId}/qr/revoke`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantAdminTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          reason: "Table damaged and removed from floor",
        }),
      });
      const res = await tableQrRevokePost(req, { params: Promise.resolve({ id: testTableId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.revokedCount).toBeGreaterThanOrEqual(1);

      // Subsequent scan of revoked token fails
      const scanReq = new NextRequest(`http://localhost:3000/api/v1/customer/qr/${encodeURIComponent(opaqueToken)}`);
      const scanRes = await customerQrGet(scanReq, { params: Promise.resolve({ token: opaqueToken }) });
      const scanJson = await scanRes.json();

      expect(scanRes.status).toBe(422);
      expect(scanJson.success).toBe(false);
    });
  });

  describe("6. Strict Multi-Tenant Isolation", () => {
    it("prevents Tenant B from reading Tenant A's tables (cross-tenant read returns 404/empty)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${testTableId}?outletId=${outletIdA}`, {
        headers: { Authorization: `Bearer ${restaurantAdminTokenB}` }, // Tenant B admin
      });
      const res = await tableGet(req, { params: Promise.resolve({ id: testTableId }) });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it("prevents Tenant B from mutating Tenant A's table (cross-tenant mutation blocked)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${testTableId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${restaurantAdminTokenB}`, // Tenant B admin
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          displayLabel: "Hacked by Tenant B",
        }),
      });
      const res = await tablePatch(req, { params: Promise.resolve({ id: testTableId }) });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it("prevents Tenant B from changing status of Tenant A's table", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${testTableId}/status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantAdminTokenB}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          status: "OUT_OF_SERVICE",
        }),
      });
      const res = await tableStatusPost(req, { params: Promise.resolve({ id: testTableId }) });
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
    });

    it("prevents Tenant B from opening session on Tenant A's table", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/restaurant/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantAdminTokenB}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          tableId: testTableId,
          guestCount: 2,
        }),
      });
      const res = await sessionsPost(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.success).toBe(false);
    });
  });

  describe("7. Operations Dashboard Summary Metrics", () => {
    it("returns correct table counts and metrics for restaurant operations", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/summary?outletId=${outletIdA}`, {
        headers: { Authorization: `Bearer ${restaurantAdminTokenA}` },
      });
      const res = await summaryGet(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.totalTables).toBeGreaterThanOrEqual(1);
      expect(typeof json.data.availableTables).toBe("number");
      expect(typeof json.data.occupiedTables).toBe("number");
      expect(typeof json.data.cleaningTables).toBe("number");
      expect(typeof json.data.totalCapacity).toBe("number");
      expect(Array.isArray(json.data.sectionBreakdown)).toBe(true);
    });
  });
});
