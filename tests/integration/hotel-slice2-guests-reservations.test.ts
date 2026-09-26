import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET as guestsGet, POST as guestsPost } from "@/app/api/v1/hotel/guests/route";
import { GET as guestIdGet, PATCH as guestIdPatch } from "@/app/api/v1/hotel/guests/[id]/route";
import { GET as reservationsGet, POST as reservationsPost } from "@/app/api/v1/hotel/reservations/route";
import { GET as reservationIdGet, PATCH as reservationIdPatch } from "@/app/api/v1/hotel/reservations/[id]/route";
import { GET as availabilityGet } from "@/app/api/v1/hotel/reservations/availability/route";
import { GET as propertiesGet } from "@/app/api/v1/hotel/properties/route";
import { GET as roomTypesGet } from "@/app/api/v1/hotel/room-types/route";
import { GET as roomsGet } from "@/app/api/v1/hotel/rooms/route";
import { signJwt } from "@/lib/auth/jwt";
import { setTenantEntitlements } from "@/lib/entitlements/checker";

describe("Phase 7 Hotel Vertical — Slice 2 (Guests & Reservations) Integration Suite", () => {
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
    permissions: ["hotel.read", "hotel.guests.read", "hotel.reservations.read"],
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
  let specificRoomId: string;
  let createdGuestId: string;
  let createdReservationId: string;

  beforeAll(async () => {
    setTenantEntitlements(TENANT_A, ["CORE", "HOTEL", "POS", "ORDERING"]);
    setTenantEntitlements(TENANT_B, ["CORE", "POS", "ORDERING"]); // Tenant B NOT entitled for HOTEL

    // Fetch active rooms to find an existing room, property, and room type
    const roomsReq = new NextRequest("http://localhost:3000/api/v1/hotel/rooms", {
      headers: { Authorization: `Bearer ${hotelAdminToken}` },
    });
    const roomsRes = await roomsGet(roomsReq);
    const roomsJson = await roomsRes.json();
    
    if (roomsJson.data && roomsJson.data.length > 0) {
      const room = roomsJson.data[0];
      specificRoomId = room.roomId;
      roomTypeId = room.roomTypeId;
      outletId = room.outletId;
    } else {
      const propReq = new NextRequest("http://localhost:3000/api/v1/hotel/properties", {
        headers: { Authorization: `Bearer ${hotelAdminToken}` },
      });
      const propRes = await propertiesGet(propReq);
      const propJson = await propRes.json();
      outletId = propJson.data[0].outletId;

      const typeReq = new NextRequest(`http://localhost:3000/api/v1/hotel/room-types?outletId=${outletId}`, {
        headers: { Authorization: `Bearer ${hotelAdminToken}` },
      });
      const typeRes = await roomTypesGet(typeReq);
      const typeJson = await typeRes.json();
      roomTypeId = typeJson.data[0].roomTypeId;
    }
  });

  describe("1. Hotel Guests Domain & Shared Customer Integration", () => {
    it("creates a hotel guest attached to shared Customer identity", async () => {
      const uniqueSuffix = Date.now().toString().slice(-4);
      const req = new NextRequest("http://localhost:3000/api/v1/hotel/guests", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: `Anita Sharma ${uniqueSuffix}`,
          phone: `+91998877${uniqueSuffix}`,
          email: `anita.${uniqueSuffix}@example.com`,
          idProofType: "AADHAAR",
          idProofNumberMasked: "XXXX-XXXX-1234",
          nationality: "INDIAN",
          vipStatus: "VIP",
          notes: "Frequent corporate traveler",
        }),
      });

      const res = await guestsPost(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.customerId).toBeDefined(); // Confirms shared customer link
      expect(json.data.fullName).toContain("Anita Sharma");
      expect(json.data.vipStatus).toBe("VIP");
      createdGuestId = json.data.guestId;
    });

    it("lists hotel guests with pagination and search", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/hotel/guests?search=Anita", {
        headers: { Authorization: `Bearer ${frontDeskToken}` },
      });

      const res = await guestsGet(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);
      expect(json.meta.total).toBeGreaterThan(0);
    });

    it("gets guest details by ID including reservations array", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/guests/${createdGuestId}`, {
        headers: { Authorization: `Bearer ${frontDeskToken}` },
      });

      const res = await guestIdGet(req, { params: Promise.resolve({ id: createdGuestId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.guestId).toBe(createdGuestId);
      expect(Array.isArray(json.data.reservations)).toBe(true);
    });

    it("updates guest details and customer identity", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/guests/${createdGuestId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vipStatus: "VVIP",
          notes: "Upgraded to VVIP status on preference",
        }),
      });

      const res = await guestIdPatch(req, { params: Promise.resolve({ id: createdGuestId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.vipStatus).toBe("VVIP");
      expect(json.data.notes).toContain("Upgraded");
    });
  });

  describe("2. Reservation Domain & Date Rules", () => {
    it("rejects reservation when arrival date is after departure date (400)", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/hotel/reservations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          guestId: createdGuestId,
          roomTypeId,
          arrivalDate: "2026-12-10T14:00:00Z",
          departureDate: "2026-12-05T11:00:00Z", // Invalid: departure before arrival
          adultCount: 1,
        }),
      });

      const res = await reservationsPost(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("VALIDATION_FAILED");
    });

    it("creates a planned reservation with room-type allocation", async () => {
      const arrival = new Date();
      arrival.setDate(arrival.getDate() + 10);
      const departure = new Date();
      departure.setDate(departure.getDate() + 12);

      const req = new NextRequest("http://localhost:3000/api/v1/hotel/reservations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          guestId: createdGuestId,
          roomTypeId,
          assignedRoomId: specificRoomId,
          arrivalDate: arrival.toISOString(),
          departureDate: departure.toISOString(),
          adultCount: 2,
          childrenCount: 1,
          specialRequests: "Airport transfer required",
          status: "CONFIRMED",
        }),
      });

      const res = await reservationsPost(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.reservationNumber).toMatch(/^RES-\d{8}-\d{4}$/);
      expect(json.data.status).toBe("CONFIRMED");
      expect(json.data.assignedRoomId).toBe(specificRoomId);
      expect(Number(json.data.totalAmount)).toBeGreaterThan(0);
      createdReservationId = json.data.reservationId;
    });

    it("verifies server-side specific room conflict prevention", async () => {
      // Attempt to book the EXACT SAME physical room on overlapping dates
      const arrival = new Date();
      arrival.setDate(arrival.getDate() + 11); // Overlaps with day 10–12
      const departure = new Date();
      departure.setDate(departure.getDate() + 14);

      const req = new NextRequest("http://localhost:3000/api/v1/hotel/reservations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          guestId: createdGuestId,
          roomTypeId,
          assignedRoomId: specificRoomId, // Same room
          arrivalDate: arrival.toISOString(),
          departureDate: departure.toISOString(),
          adultCount: 1,
        }),
      });

      const res = await reservationsPost(req);
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("BUSINESS_RULE_VIOLATION");
      expect(json.error.message).toContain("already has an overlapping active reservation");
    });

    it("calculates room type availability accurately", async () => {
      const arrival = new Date();
      arrival.setDate(arrival.getDate() + 10);
      const departure = new Date();
      departure.setDate(departure.getDate() + 12);

      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/reservations/availability?outletId=${outletId}&arrivalDate=${arrival.toISOString()}&departureDate=${departure.toISOString()}&roomTypeId=${roomTypeId}`,
        {
          headers: { Authorization: `Bearer ${frontDeskToken}` },
        }
      );

      const res = await availabilityGet(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data[0].reservedRooms).toBeGreaterThanOrEqual(1);
    });

    it("supports idempotency on reservation creation", async () => {
      const idempKey = `key_res_${Date.now()}`;
      const arrival = new Date();
      arrival.setDate(arrival.getDate() + 35);
      const departure = new Date();
      departure.setDate(departure.getDate() + 38);

      const payload = {
        outletId,
        guestId: createdGuestId,
        roomTypeId,
        arrivalDate: arrival.toISOString(),
        departureDate: departure.toISOString(),
        adultCount: 1,
      };

      const req1 = new NextRequest("http://localhost:3000/api/v1/hotel/reservations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempKey,
        },
        body: JSON.stringify(payload),
      });

      const res1 = await reservationsPost(req1);
      const json1 = await res1.json();
      expect(res1.status).toBe(201);

      // Replay identical request with same key
      const req2 = new NextRequest("http://localhost:3000/api/v1/hotel/reservations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempKey,
        },
        body: JSON.stringify(payload),
      });

      const res2 = await reservationsPost(req2);
      const json2 = await res2.json();
      expect(res2.headers.get("x-idempotent-replay")).toBe("true");
      expect(json2.data.reservationNumber).toBe(json1.data.reservationNumber);
    });
  });

  describe("3. Reservation State Transitions & Cancellation", () => {
    it("transitions reservation from CONFIRMED to CANCELLED", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/reservations/${createdReservationId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${hotelAdminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            outletId,
            status: "CANCELLED",
          }),
        }
      );

      const res = await reservationIdPatch(req, {
        params: Promise.resolve({ id: createdReservationId }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("CANCELLED");
    });

    it("blocks illegal transition from terminal CANCELLED state", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/reservations/${createdReservationId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${hotelAdminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            outletId,
            status: "CONFIRMED",
          }),
        }
      );

      const res = await reservationIdPatch(req, {
        params: Promise.resolve({ id: createdReservationId }),
      });
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("VALIDATION_FAILED");
    });
  });

  describe("4. Security & Module Entitlement Enforcement", () => {
    it("denies access when tenant is NOT entitled to HOTEL module (403)", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/hotel/reservations", {
        headers: { Authorization: `Bearer ${tenantBToken}` },
      });

      const res = await reservationsGet(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("MODULE_NOT_ENTITLED");
    });

    it("denies mutation when staff role lacks required RBAC permission (403)", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/hotel/guests", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${frontDeskToken}`, // only has hotel.guests.read, not hotel.guests.manage
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fullName: "Unauthorized Guest" }),
      });

      const res = await guestsPost(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("PERMISSION_DENIED");
    });
  });
});
