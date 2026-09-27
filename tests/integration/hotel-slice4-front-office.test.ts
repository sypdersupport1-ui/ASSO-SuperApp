import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET as frontOfficeGet } from "@/app/api/v1/hotel/front-office/route";
import { POST as checkInPost } from "@/app/api/v1/hotel/reservations/[id]/check-in/route";
import { POST as checkOutPost } from "@/app/api/v1/hotel/stays/[id]/check-out/route";
import { POST as reservationsPost } from "@/app/api/v1/hotel/reservations/route";
import { POST as guestsPost } from "@/app/api/v1/hotel/guests/route";
import { GET as propertiesGet } from "@/app/api/v1/hotel/properties/route";
import { POST as roomTypesPost } from "@/app/api/v1/hotel/room-types/route";
import { POST as roomsPost } from "@/app/api/v1/hotel/rooms/route";
import { signJwt } from "@/lib/auth/jwt";
import { setTenantEntitlements } from "@/lib/entitlements/checker";

describe("Phase 7 Hotel Vertical — Slice 4 (Front Office Operations) Integration Suite", () => {
  const TENANT_A = "11111111-1111-1111-1111-111111111111";
  const TENANT_B = "22222222-2222-2222-2222-222222222222";

  const hotelAdminToken = signJwt({
    sub: "00000000-0000-0000-0000-000000000001",
    tenantId: TENANT_A,
    roles: ["HOTEL_ADMIN"],
    permissions: ["hotel.*"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const frontDeskToken = signJwt({
    sub: "00000000-0000-0000-0000-000000000002",
    tenantId: TENANT_A,
    roles: ["FRONT_DESK"],
    permissions: ["hotel.read", "hotel.reservations.read", "hotel.stays.read", "hotel.stays.manage", "hotel.checkin", "hotel.checkout"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const noPermToken = signJwt({
    sub: "00000000-0000-0000-0000-000000000005",
    tenantId: TENANT_A,
    roles: ["ANONYMOUS_ROLE"],
    permissions: ["pos.read"], // lacks hotel.read
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
  let room1Id: string;
  let room1Number: string;
  let room2Id: string;
  let room2Number: string;
  let guestId: string;
  let guestName: string;
  let reservationId: string;
  let activeStayId: string;

  beforeAll(async () => {
    setTenantEntitlements(TENANT_A, ["CORE", "HOTEL", "POS", "ORDERING"]);
    setTenantEntitlements(TENANT_B, ["CORE", "POS", "ORDERING"]); // Tenant B NOT entitled for HOTEL

    // 1. Fetch Property
    const propReq = new NextRequest("http://localhost:3000/api/v1/hotel/properties", {
      headers: { Authorization: `Bearer ${hotelAdminToken}` },
    });
    const propRes = await propertiesGet(propReq);
    const propJson = await propRes.json();
    outletId = propJson.data[0].outletId;

    // 2. Create isolated Room Type
    const uniqueSuffix = Date.now().toString().slice(-4);
    const typeRes = await roomTypesPost(
      new NextRequest("http://localhost:3000/api/v1/hotel/room-types", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          code: `FO_${uniqueSuffix}`,
          name: `Front Office Suite ${uniqueSuffix}`,
          baseOccupancy: 2,
          maxOccupancy: 3,
          baseRate: 11000,
        }),
      })
    );
    const typeJson = await typeRes.json();
    roomTypeId = typeJson.data.roomTypeId;

    // 3. Create isolated Physical Rooms (Room 1 and Room 2)
    room1Number = `40${uniqueSuffix.slice(-2)}`;
    const r1Res = await roomsPost(
      new NextRequest("http://localhost:3000/api/v1/hotel/rooms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          roomTypeId,
          roomNumber: room1Number,
          floorNumber: "4",
        }),
      })
    );
    const r1Json = await r1Res.json();
    room1Id = r1Json.data.roomId;

    room2Number = `41${uniqueSuffix.slice(-2)}`;
    const r2Res = await roomsPost(
      new NextRequest("http://localhost:3000/api/v1/hotel/rooms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          roomTypeId,
          roomNumber: room2Number,
          floorNumber: "4",
        }),
      })
    );
    const r2Json = await r2Res.json();
    room2Id = r2Json.data.roomId;

    // 4. Create Hotel Guest
    guestName = `FO Guest ${uniqueSuffix}`;
    const guestRes = await guestsPost(
      new NextRequest("http://localhost:3000/api/v1/hotel/guests", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: guestName,
          email: `foguest_${uniqueSuffix}@example.com`,
          phone: `+1999${uniqueSuffix}`,
          vipStatus: "VIP",
        }),
      })
    );
    const guestJson = await guestRes.json();
    guestId = guestJson.data.guestId;

    // 5. Create Confirmed Reservation arriving TODAY for Room 1
    const today = new Date();
    const tomorrow = new Date(Date.now() + 86400000);

    const resRes = await reservationsPost(
      new NextRequest("http://localhost:3000/api/v1/hotel/reservations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          guestId,
          roomTypeId,
          assignedRoomId: room1Id,
          arrivalDate: today.toISOString(),
          departureDate: tomorrow.toISOString(),
          adultCount: 2,
          roomRate: 11000,
        }),
      })
    );
    const resJson = await resRes.json();
    reservationId = resJson.data.reservationId;
  });

  describe("1. Security, Entitlement & RBAC Enforcement", () => {
    it("rejects unauthenticated requests (401)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/front-office?outletId=${outletId}`);
      const res = await frontOfficeGet(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("AUTHENTICATION_REQUIRED");
    });

    it("rejects tenant without HOTEL module entitlement (403)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/front-office?outletId=${outletId}`, {
        headers: { Authorization: `Bearer ${tenantBToken}` },
      });
      const res = await frontOfficeGet(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("MODULE_NOT_ENTITLED");
    });

    it("rejects user without hotel.read permission (403)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/front-office?outletId=${outletId}`, {
        headers: { Authorization: `Bearer ${noPermToken}` },
      });
      const res = await frontOfficeGet(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("PERMISSION_DENIED");
    });

    it("rejects request if property outletId belongs to another tenant or is invalid (404)", async () => {
      const fakeOutlet = "99999999-9999-9999-9999-999999999999";
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/front-office?outletId=${fakeOutlet}`, {
        headers: { Authorization: `Bearer ${frontDeskToken}` },
      });
      const res = await frontOfficeGet(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error.code).toBe("RESOURCE_NOT_FOUND");
    });
  });

  describe("2. Front Office Aggregate Summary & Live KPIs", () => {
    it("retrieves operational dashboard with live data", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/front-office?outletId=${outletId}`, {
        headers: { Authorization: `Bearer ${frontDeskToken}` },
      });
      const res = await frontOfficeGet(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.data.kpis).toBeDefined();
      expect(typeof json.data.kpis.totalRoomsCount).toBe("number");
      expect(typeof json.data.kpis.todayArrivalsCount).toBe("number");
      expect(typeof json.data.kpis.todayDeparturesCount).toBe("number");
      expect(typeof json.data.kpis.activeStaysCount).toBe("number");
      expect(typeof json.data.kpis.availableCleanRoomsCount).toBe("number");
      expect(Array.isArray(json.data.arrivals)).toBe(true);
      expect(Array.isArray(json.data.departures)).toBe(true);
      expect(Array.isArray(json.data.inHouse)).toBe(true);
      expect(Array.isArray(json.data.attentionItems)).toBe(true);
      expect(json.data.roomReadiness).toBeDefined();

      // Verify the newly created reservation appears in today's arrivals
      const foundArrival = json.data.arrivals.find(
        (a: any) => a.reservationId === reservationId
      );
      expect(foundArrival).toBeDefined();
      expect(foundArrival.guestName).toBe(guestName);
      expect(foundArrival.assignedRoomNumber).toBe(room1Number);
      expect(foundArrival.vipStatus).toBe("VIP");
    });

    it("filters Front Office in-house results using search query", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/front-office?outletId=${outletId}&search=${encodeURIComponent(guestName)}`,
        {
          headers: { Authorization: `Bearer ${frontDeskToken}` },
        }
      );
      const res = await frontOfficeGet(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe("3. Operational Lifecycle & Domain State Synchronization", () => {
    it("checks in the arriving guest and moves record from arrivals to inHouse", async () => {
      // Perform Check-in using authoritative Slice 3 endpoint
      const checkInReq = new NextRequest(
        `http://localhost:3000/api/v1/hotel/reservations/${reservationId}/check-in`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${frontDeskToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roomId: room1Id,
            notes: "Checked in from Front Desk console",
          }),
        }
      );
      const checkInRes = await checkInPost(checkInReq, {
        params: Promise.resolve({ id: reservationId }),
      });
      expect(checkInRes.status).toBe(201);
      const checkInJson = await checkInRes.json();
      expect(checkInJson.success).toBe(true);
      activeStayId = checkInJson.data.stayId;

      // Re-fetch Front Office summary
      const foReq = new NextRequest(`http://localhost:3000/api/v1/hotel/front-office?outletId=${outletId}`, {
        headers: { Authorization: `Bearer ${frontDeskToken}` },
      });
      const foRes = await frontOfficeGet(foReq);
      const foJson = await foRes.json();
      expect(foJson.success).toBe(true);

      // Reservation should no longer be in arrivals
      const foundInArrivals = foJson.data.arrivals.find(
        (a: any) => a.reservationId === reservationId
      );
      expect(foundInArrivals).toBeUndefined();

      // Stay should now appear in inHouse
      const foundInHouse = foJson.data.inHouse.find(
        (s: any) => s.stayId === activeStayId
      );
      expect(foundInHouse).toBeDefined();
      expect(foundInHouse.guestName).toBe(guestName);
      expect(foundInHouse.roomNumber).toBe(room1Number);

      // Room readiness shows occupied room count >= 1
      expect(foJson.data.roomReadiness.occupied).toBeGreaterThanOrEqual(1);
      expect(foJson.data.kpis.occupiedRoomsCount).toBeGreaterThanOrEqual(1);
    });

    it("checks out the active stay and releases room to AVAILABLE + DIRTY", async () => {
      // Perform Check-out using authoritative Slice 3 endpoint
      const checkOutReq = new NextRequest(
        `http://localhost:3000/api/v1/hotel/stays/${activeStayId}/check-out`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${frontDeskToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            notes: "Checked out from Front Desk console",
          }),
        }
      );
      const checkOutRes = await checkOutPost(checkOutReq, {
        params: Promise.resolve({ id: activeStayId }),
      });
      expect(checkOutRes.status).toBe(200);
      const checkOutJson = await checkOutRes.json();
      expect(checkOutJson.success).toBe(true);

      // Re-fetch Front Office summary
      const foReq = new NextRequest(`http://localhost:3000/api/v1/hotel/front-office?outletId=${outletId}`, {
        headers: { Authorization: `Bearer ${frontDeskToken}` },
      });
      const foRes = await frontOfficeGet(foReq);
      const foJson = await foRes.json();
      expect(foJson.success).toBe(true);

      // Stay should no longer be in inHouse active stays
      const foundInHouse = foJson.data.inHouse.find(
        (s: any) => s.stayId === activeStayId
      );
      expect(foundInHouse).toBeUndefined();

      // Room readiness shows dirty available rooms count >= 1
      expect(foJson.data.roomReadiness.dirtyAvailable).toBeGreaterThanOrEqual(1);
      expect(foJson.data.kpis.availableDirtyRoomsCount).toBeGreaterThanOrEqual(1);
    });
  });
});
