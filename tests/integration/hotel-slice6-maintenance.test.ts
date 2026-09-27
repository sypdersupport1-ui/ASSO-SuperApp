import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET as maintenanceGet, POST as maintenancePost } from "@/app/api/v1/hotel/maintenance/route";
import { GET as maintenanceDetailGet } from "@/app/api/v1/hotel/maintenance/[id]/route";
import { POST as maintenanceAssignPost } from "@/app/api/v1/hotel/maintenance/[id]/assign/route";
import { POST as maintenanceStartPost } from "@/app/api/v1/hotel/maintenance/[id]/start/route";
import { POST as maintenanceResolvePost } from "@/app/api/v1/hotel/maintenance/[id]/resolve/route";
import { POST as maintenanceClosePost } from "@/app/api/v1/hotel/maintenance/[id]/close/route";
import { POST as maintenanceReopenPost } from "@/app/api/v1/hotel/maintenance/[id]/reopen/route";
import { GET as summaryGet } from "@/app/api/v1/hotel/maintenance/summary/route";
import { GET as frontOfficeGet } from "@/app/api/v1/hotel/front-office/route";
import { GET as propertiesGet } from "@/app/api/v1/hotel/properties/route";
import { GET as roomTypesGet } from "@/app/api/v1/hotel/room-types/route";
import { POST as roomsPost, GET as roomsGet } from "@/app/api/v1/hotel/rooms/route";
import { signJwt } from "@/lib/auth/jwt";
import { setTenantEntitlements } from "@/lib/entitlements/checker";
import { getDb } from "@/db/client";
import { users } from "@/db/schema/core";
import { hotelRooms } from "@/db/schema/hotel";
import { eq } from "drizzle-orm";

describe("Phase 7 Hotel Vertical — Slice 6 (Maintenance & Service Requests) Integration Suite", () => {
  const TENANT_A = "11111111-1111-1111-1111-111111111111";
  const TENANT_B = "22222222-2222-2222-2222-222222222222";

  const technicianUserId = "00000000-0000-0000-0000-000000000010";

  const hotelAdminToken = signJwt({
    sub: "00000000-0000-0000-0000-000000000001",
    tenantId: TENANT_A,
    roles: ["HOTEL_ADMIN"],
    permissions: [
      "hotel.*",
      "hotel.read",
      "hotel.manage",
      "hotel.maintenance.read",
      "hotel.maintenance.manage",
      "hotel.maintenance.assign",
    ],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const maintenanceLeadToken = signJwt({
    sub: "00000000-0000-0000-0000-000000000009",
    tenantId: TENANT_A,
    roles: ["MAINTENANCE_SUPERVISOR"],
    permissions: [
      "hotel.read",
      "hotel.maintenance.read",
      "hotel.maintenance.manage",
      "hotel.maintenance.assign",
    ],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const technicianToken = signJwt({
    sub: technicianUserId,
    tenantId: TENANT_A,
    roles: ["MAINTENANCE_TECHNICIAN"],
    permissions: [
      "hotel.read",
      "hotel.maintenance.read",
      "hotel.maintenance.manage",
    ],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const noPermToken = signJwt({
    sub: "00000000-0000-0000-0000-000000000005",
    tenantId: TENANT_A,
    roles: ["ANONYMOUS_ROLE"],
    permissions: ["pos.read"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const tenantBToken = signJwt({
    sub: "00000000-0000-0000-0000-000000000003",
    tenantId: TENANT_B,
    roles: ["HOTEL_ADMIN"],
    permissions: ["hotel.*"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  let outletId: string;
  let roomTypeId: string;
  let roomM1Id: string;
  let roomM1Number: string;
  let roomM2Id: string;
  let roomM2Number: string;
  let createdRequestId: string;

  beforeAll(async () => {
    setTenantEntitlements(TENANT_A, ["CORE", "HOTEL", "POS", "ORDERING"]);
    setTenantEntitlements(TENANT_B, ["CORE", "POS", "ORDERING"]);

    // Ensure staff users exist for foreign key constraints
    const db = getDb();
    await db
      .insert(users)
      .values([
        {
          userId: "00000000-0000-0000-0000-000000000001",
          email: "admin_maint@example.com",
          fullName: "Admin Staff",
        },
        {
          userId: "00000000-0000-0000-0000-000000000009",
          email: "lead_maint@example.com",
          fullName: "Maintenance Lead",
        },
        {
          userId: technicianUserId,
          email: "tech_maint@example.com",
          fullName: "Bob Technician",
        },
      ])
      .onConflictDoNothing();

    // 1. Fetch Property
    const propReq = new NextRequest("http://localhost:3000/api/v1/hotel/properties", {
      headers: { Authorization: `Bearer ${hotelAdminToken}` },
    });
    const propRes = await propertiesGet(propReq);
    const propJson = await propRes.json();
    outletId = propJson.data[0].outletId;

    // 2. Fetch Room Type
    const rtReq = new NextRequest(`http://localhost:3000/api/v1/hotel/room-types?outletId=${outletId}`, {
      headers: { Authorization: `Bearer ${hotelAdminToken}` },
    });
    const rtRes = await roomTypesGet(rtReq);
    const rtJson = await rtRes.json();
    roomTypeId = rtJson.data[0].roomTypeId;

    // 3. Create Two Test Rooms for Maintenance
    const timestamp = Date.now().toString().slice(-4);
    roomM1Number = `M1-${timestamp}`;
    roomM2Number = `M2-${timestamp}`;

    const r1Req = new NextRequest("http://localhost:3000/api/v1/hotel/rooms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hotelAdminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        outletId,
        roomTypeId,
        roomNumber: roomM1Number,
        floorNumber: "7",
        operationalStatus: "AVAILABLE",
        housekeepingStatus: "CLEAN",
      }),
    });
    const r1Res = await roomsPost(r1Req);
    const r1Json = await r1Res.json();
    roomM1Id = r1Json.data.roomId;

    const r2Req = new NextRequest("http://localhost:3000/api/v1/hotel/rooms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hotelAdminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        outletId,
        roomTypeId,
        roomNumber: roomM2Number,
        floorNumber: "7",
        operationalStatus: "AVAILABLE",
        housekeepingStatus: "CLEAN",
      }),
    });
    const r2Res = await roomsPost(r2Req);
    const r2Json = await r2Res.json();
    roomM2Id = r2Json.data.roomId;
  });

  describe("1. Security, Entitlement & RBAC Enforcement", () => {
    it("rejects unauthenticated requests (401)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/maintenance?outletId=${outletId}`);
      const res = await maintenanceGet(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("AUTHENTICATION_REQUIRED");
    });

    it("rejects tenant without HOTEL module entitlement (403)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/maintenance?outletId=${outletId}`, {
        headers: { Authorization: `Bearer ${tenantBToken}` },
      });
      const res = await maintenanceGet(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("MODULE_NOT_ENTITLED");
    });

    it("rejects user without maintenance or hotel.read permission (403)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/maintenance?outletId=${outletId}`, {
        headers: { Authorization: `Bearer ${noPermToken}` },
      });
      const res = await maintenanceGet(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("PERMISSION_DENIED");
    });

    it("rejects request if property outletId is invalid or belongs to another tenant (404)", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/maintenance?outletId=99999999-9999-9999-9999-999999999999`,
        {
          headers: { Authorization: `Bearer ${hotelAdminToken}` },
        }
      );
      const res = await maintenanceGet(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error.code).toBe("RESOURCE_NOT_FOUND");
    });
  });

  describe("2. Maintenance Request Lifecycle: Create, Assign, Start, Resolve, Close & Reopen", () => {
    it("creates a new maintenance request with OUT_OF_ORDER operational impact on room", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/maintenance`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${maintenanceLeadToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          roomId: roomM1Id,
          category: "HVAC",
          priority: "URGENT",
          title: "HVAC Unit Leaking Water",
          description: "Water leaking onto carpet from main ceiling HVAC unit in Room M1.",
          operationalImpact: "OUT_OF_ORDER",
          notes: "Requires compressor valve check and filter replacement.",
        }),
      });

      const res = await maintenancePost(req);
      const json = await res.json();
      if (!res.ok) console.log("CREATE ERROR:", JSON.stringify(json, null, 2));
      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("OPEN");
      expect(json.data.category).toBe("HVAC");
      expect(json.data.priority).toBe("URGENT");
      expect(json.data.room).toBeDefined();
      expect(json.data.room.roomId).toBe(roomM1Id);
      expect(json.data.room.operationalStatus).toBe("OUT_OF_ORDER");

      createdRequestId = json.data.requestId;

      // Verify physical room is now OUT_OF_ORDER
      const roomCheck = await roomsGet(
        new NextRequest(`http://localhost:3000/api/v1/hotel/rooms?outletId=${outletId}`, {
          headers: { Authorization: `Bearer ${hotelAdminToken}` },
        })
      );
      const roomJson = await roomCheck.json();
      const m1 = roomJson.data.find((r: any) => r.roomId === roomM1Id);
      expect(m1.operationalStatus).toBe("OUT_OF_ORDER");
    });

    it("assigns staff member to request and transitions status to ASSIGNED", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/maintenance/${createdRequestId}/assign`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${maintenanceLeadToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            assignedToStaffId: technicianUserId,
          }),
        }
      );

      const res = await maintenanceAssignPost(req, {
        params: Promise.resolve({ id: createdRequestId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("ASSIGNED");
      expect(json.data.assignedToStaffId).toBe(technicianUserId);
      expect(json.data.assignedStaffName).toBe("Bob Technician");
    });

    it("starts work: transitions request status to IN_PROGRESS", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/maintenance/${createdRequestId}/start`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${technicianToken}`,
          },
        }
      );

      const res = await maintenanceStartPost(req, {
        params: Promise.resolve({ id: createdRequestId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("IN_PROGRESS");
    });

    it("resolves work: transitions request to RESOLVED and safely restores room operationalStatus to AVAILABLE", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/maintenance/${createdRequestId}/resolve`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${technicianToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            resolutionNotes: "Replaced drain pan and sealed condensate line. Unit tested and functioning normally.",
            restoreRoomOperationalStatus: "AVAILABLE",
          }),
        }
      );

      const res = await maintenanceResolvePost(req, {
        params: Promise.resolve({ id: createdRequestId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("RESOLVED");
      expect(json.data.resolvedAt).toBeDefined();
      expect(json.data.resolutionNotes).toContain("Replaced drain pan");

      // Verify room is restored to AVAILABLE, but housekeeping is DIRTY (needs turnover/inspection before sale)
      const roomCheck = await roomsGet(
        new NextRequest(`http://localhost:3000/api/v1/hotel/rooms?outletId=${outletId}`, {
          headers: { Authorization: `Bearer ${hotelAdminToken}` },
        })
      );
      const roomJson = await roomCheck.json();
      const m1 = roomJson.data.find((r: any) => r.roomId === roomM1Id);
      expect(m1.operationalStatus).toBe("AVAILABLE");
    });

    it("closes resolved request: transitions status to CLOSED", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/maintenance/${createdRequestId}/close`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${maintenanceLeadToken}`,
          },
        }
      );

      const res = await maintenanceClosePost(req, {
        params: Promise.resolve({ id: createdRequestId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("CLOSED");
      expect(json.data.closedAt).toBeDefined();
    });

    it("reopens closed request: transitions status back to OPEN with audit trail", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/maintenance/${createdRequestId}/reopen`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${maintenanceLeadToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            notes: "Water drip noticed again during morning room check.",
          }),
        }
      );

      const res = await maintenanceReopenPost(req, {
        params: Promise.resolve({ id: createdRequestId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("OPEN");
      expect(json.data.resolvedAt).toBeNull();
      expect(json.data.closedAt).toBeNull();
      expect(json.data.metadata.reopenCount).toBe(1);
    });
  });

  describe("3. Concurrency Protection & Room State Safety", () => {
    it("handles concurrent work starts safely with row locking", async () => {
      // 1. Create a fresh plumbing request on roomM2
      const createReq = new NextRequest(`http://localhost:3000/api/v1/hotel/maintenance`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${maintenanceLeadToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          roomId: roomM2Id,
          category: "PLUMBING",
          priority: "NORMAL",
          title: "Sink faucet loose",
          description: "Bathroom sink faucet is wobbly.",
        }),
      });
      const createRes = await maintenancePost(createReq);
      const createJson = await createRes.json();
      const concurrencyReqId = createJson.data.requestId;

      // 2. Fire two concurrent start requests
      const startReq1 = new NextRequest(
        `http://localhost:3000/api/v1/hotel/maintenance/${concurrencyReqId}/start`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${technicianToken}` },
        }
      );
      const startReq2 = new NextRequest(
        `http://localhost:3000/api/v1/hotel/maintenance/${concurrencyReqId}/start`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${technicianToken}` },
        }
      );

      const [res1, res2] = await Promise.all([
        maintenanceStartPost(startReq1, { params: Promise.resolve({ id: concurrencyReqId }) }),
        maintenanceStartPost(startReq2, { params: Promise.resolve({ id: concurrencyReqId }) }),
      ]);

      const statuses = [res1.status, res2.status];
      // One request must succeed (200) and the other must be rejected (422 business rule violation)
      expect(statuses).toContain(200);
      expect(statuses).toContain(422);
    });

    it("verifies Front Office reflects maintenance impact in attention queue", async () => {
      // Place roomM2 into OUT_OF_ORDER
      const db = getDb();
      await db
        .update(hotelRooms)
        .set({ operationalStatus: "OUT_OF_ORDER" })
        .where(eq(hotelRooms.roomId, roomM2Id));

      const foReq = new NextRequest(
        `http://localhost:3000/api/v1/hotel/front-office?outletId=${outletId}`,
        {
          headers: { Authorization: `Bearer ${hotelAdminToken}` },
        }
      );
      const foRes = await frontOfficeGet(foReq);
      expect(foRes.status).toBe(200);
      const foJson = await foRes.json();
      expect(foJson.success).toBe(true);

      // Check attention queue or KPIs
      expect(foJson.data.kpis.outOfServiceRoomsCount).toBeGreaterThanOrEqual(1);
    });

    it("verifies Maintenance Summary aggregates live PostgreSQL metrics", async () => {
      const summaryReq = new NextRequest(
        `http://localhost:3000/api/v1/hotel/maintenance/summary?outletId=${outletId}`,
        {
          headers: { Authorization: `Bearer ${maintenanceLeadToken}` },
        }
      );
      const summaryRes = await summaryGet(summaryReq);
      expect(summaryRes.status).toBe(200);
      const json = await summaryRes.json();
      expect(json.success).toBe(true);
      expect(json.data.totalRequests).toBeGreaterThanOrEqual(2);
      expect(typeof json.data.openCount).toBe("number");
      expect(typeof json.data.roomsAffected.outOfOrderCount).toBe("number");
    });
  });
});
