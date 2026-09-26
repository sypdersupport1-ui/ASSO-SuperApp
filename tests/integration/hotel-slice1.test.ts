import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET as propertiesGet, POST as propertiesPost } from "@/app/api/v1/hotel/properties/route";
import { GET as roomTypesGet, POST as roomTypesPost } from "@/app/api/v1/hotel/room-types/route";
import { PATCH as roomTypePatch } from "@/app/api/v1/hotel/room-types/[id]/route";
import { GET as roomsGet, POST as roomsPost } from "@/app/api/v1/hotel/rooms/route";
import { PATCH as roomPatch } from "@/app/api/v1/hotel/rooms/[id]/route";
import { GET as dashboardGet } from "@/app/api/v1/hotel/dashboard/route";
import { signJwt } from "@/lib/auth/jwt";
import { setTenantEntitlements } from "@/lib/entitlements/checker";

describe("Phase 7 Hotel Vertical — Slice 1 Integration Suite", () => {
  const TENANT_A = "11111111-1111-1111-1111-111111111111";
  const TENANT_B = "22222222-2222-2222-2222-222222222222";

  // Auth tokens
  const hotelAdminToken = signJwt({
    sub: "usr_hotel_admin",
    tenantId: TENANT_A,
    roles: ["HOTEL_ADMIN"],
    permissions: ["hotel.*"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const frontDeskToken = signJwt({
    sub: "usr_front_desk",
    tenantId: TENANT_A,
    roles: ["FRONT_DESK"],
    permissions: ["hotel.read"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const unprivilegedToken = signJwt({
    sub: "usr_guest",
    tenantId: TENANT_A,
    roles: ["CUSTOMER"],
    permissions: ["orders.read"],
    sessionType: "CUSTOMER",
    isSuperAdmin: false,
  });

  beforeAll(() => {
    // Entitle Tenant A for HOTEL and CORE
    setTenantEntitlements(TENANT_A, ["CORE", "HOTEL", "POS", "ORDERING"]);
    // Tenant B only has RESTAURANT (not entitled for HOTEL)
    setTenantEntitlements(TENANT_B, ["CORE", "POS", "ORDERING"]);
  });

  describe("1. Hotel Module Entitlement & RBAC Enforcement", () => {
    it("rejects request if tenant is NOT entitled to HOTEL module (403)", async () => {
      const tenantBToken = signJwt({
        sub: "usr_tenant_b",
        tenantId: TENANT_B,
        roles: ["HOTEL_ADMIN"],
        permissions: ["hotel.*"],
        sessionType: "STAFF",
        isSuperAdmin: false,
      });

      const req = new NextRequest("http://localhost:3000/api/v1/hotel/properties", {
        headers: { Authorization: `Bearer ${tenantBToken}` },
      });
      const res = await propertiesGet(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("MODULE_NOT_ENTITLED");
    });

    it("rejects request if user lacks required permission (403)", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/hotel/properties", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${frontDeskToken}`, // Front desk only has hotel.read, not hotel.manage
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Unauthorized Hotel", code: "UNAUTH" }),
      });
      const res = await propertiesPost(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("PERMISSION_DENIED");
    });
  });

  describe("2. Hotel Property Management", () => {
    it("creates a hotel property with valid input and hotel admin token", async () => {
      const uniqueCode = `HPROP_${Date.now().toString().slice(-4)}`;
      const req = new NextRequest("http://localhost:3000/api/v1/hotel/properties", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "ASSO Boutique Heritage Hotel",
          code: uniqueCode,
          timezone: "Asia/Kolkata",
          currency: "INR",
        }),
      });

      const res = await propertiesPost(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.code).toBe(uniqueCode);
      expect(json.data.verticalType).toBe("HOTEL");
    });

    it("lists hotel properties for the entitled tenant", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/hotel/properties", {
        headers: { Authorization: `Bearer ${frontDeskToken}` },
      });

      const res = await propertiesGet(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);
      expect(json.data.every((p: any) => p.verticalType === "HOTEL")).toBe(true);
    });

    it("supports idempotency on property creation", async () => {
      const uniqueCode = `IDEMP_${Date.now().toString().slice(-4)}`;
      const idempKey = `key_prop_${Date.now()}`;
      const payload = {
        name: "Idempotent Hotel",
        code: uniqueCode,
        currency: "INR",
      };

      const req1 = new NextRequest("http://localhost:3000/api/v1/hotel/properties", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempKey,
        },
        body: JSON.stringify(payload),
      });

      const res1 = await propertiesPost(req1);
      const json1 = await res1.json();
      expect(res1.status).toBe(201);

      // Replay identical request with same idempotency key
      const req2 = new NextRequest("http://localhost:3000/api/v1/hotel/properties", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempKey,
        },
        body: JSON.stringify(payload),
      });

      const res2 = await propertiesPost(req2);
      const json2 = await res2.json();
      expect(res2.headers.get("x-idempotent-replay")).toBe("true");
      expect(json2.data.code).toBe(json1.data.code);
    });
  });

  describe("3. Room Types & Rooms Operational Workflow", () => {
    let outletId: string;
    let createdRoomTypeId: string;
    let createdRoomId: string;

    beforeAll(async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/hotel/properties", {
        headers: { Authorization: `Bearer ${hotelAdminToken}` },
      });
      const res = await propertiesGet(req);
      const json = await res.json();
      outletId = json.data[0].outletId;
    });

    it("creates a new room type with validation", async () => {
      const typeCode = `TEST_${Date.now().toString().slice(-4)}`;
      const req = new NextRequest("http://localhost:3000/api/v1/hotel/room-types", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          code: typeCode,
          name: "Test Ocean Suite",
          baseOccupancy: 2,
          maxOccupancy: 4,
          baseRate: 7500,
        }),
      });

      const res = await roomTypesPost(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.code).toBe(typeCode);
      createdRoomTypeId = json.data.roomTypeId;
    });

    it("rejects room type with invalid occupancy (max < base)", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/hotel/room-types", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          code: "INVALID_OCC",
          name: "Invalid Room",
          baseOccupancy: 4,
          maxOccupancy: 2, // invalid
          baseRate: 5000,
        }),
      });

      const res = await roomTypesPost(req);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("VALIDATION_FAILED");
    });

    it("creates a room and verifies 1:1 business context association", async () => {
      const roomNum = `R${Date.now().toString().slice(-4)}`;
      const req = new NextRequest("http://localhost:3000/api/v1/hotel/rooms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          roomTypeId: createdRoomTypeId,
          roomNumber: roomNum,
          floorNumber: "4",
          operationalStatus: "AVAILABLE",
          housekeepingStatus: "CLEAN",
        }),
      });

      const res = await roomsPost(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.roomNumber).toBe(roomNum);
      expect(json.data.contextId).toBeDefined(); // Confirms business context abstraction
      expect(json.data.operationalStatus).toBe("AVAILABLE");
      expect(json.data.housekeepingStatus).toBe("CLEAN");
      createdRoomId = json.data.roomId;
    });

    it("updates room status with explicit state machine transition validation", async () => {
      // Transition from AVAILABLE -> OCCUPIED (guest check-in simulation)
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/rooms/${createdRoomId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          operationalStatus: "OCCUPIED",
          housekeepingStatus: "DIRTY",
        }),
      });

      const res = await roomPatch(req, { params: Promise.resolve({ id: createdRoomId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.operationalStatus).toBe("OCCUPIED");
      expect(json.data.housekeepingStatus).toBe("DIRTY");
      expect(json.data.isOccupied).toBe(true);
    });

    it("blocks invalid room state transitions", async () => {
      // Cannot jump from OCCUPIED directly to RESERVED without checkout
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/rooms/${createdRoomId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          operationalStatus: "RESERVED",
        }),
      });

      const res = await roomPatch(req, { params: Promise.resolve({ id: createdRoomId }) });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("4. Hotel Dashboard Operational Metrics (Calculated from DB)", () => {
    it("returns real operational metrics calculated from live PostgreSQL state", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/hotel/dashboard", {
        headers: { Authorization: `Bearer ${frontDeskToken}` },
      });

      const res = await dashboardGet(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.totalRooms).toBeGreaterThan(0);
      expect(typeof json.data.occupancyRatePct).toBe("number");
      expect(json.data.housekeepingBreakdown).toBeDefined();
      expect(typeof json.data.housekeepingBreakdown.clean).toBe("number");
      expect(typeof json.data.housekeepingBreakdown.dirty).toBe("number");
      expect(Array.isArray(json.data.roomTypeBreakdown)).toBe(true);
    });
  });
});
