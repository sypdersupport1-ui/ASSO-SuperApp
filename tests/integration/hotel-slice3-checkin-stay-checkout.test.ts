import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET as staysGet } from "@/app/api/v1/hotel/stays/route";
import { GET as stayIdGet } from "@/app/api/v1/hotel/stays/[id]/route";
import { POST as checkInPost } from "@/app/api/v1/hotel/reservations/[id]/check-in/route";
import { POST as checkOutPost } from "@/app/api/v1/hotel/stays/[id]/check-out/route";
import { POST as reservationsPost } from "@/app/api/v1/hotel/reservations/route";
import { POST as guestsPost } from "@/app/api/v1/hotel/guests/route";
import { GET as propertiesGet } from "@/app/api/v1/hotel/properties/route";
import { POST as roomTypesPost } from "@/app/api/v1/hotel/room-types/route";
import { POST as roomsPost, GET as roomsGet } from "@/app/api/v1/hotel/rooms/route";
import { signJwt } from "@/lib/auth/jwt";
import { setTenantEntitlements } from "@/lib/entitlements/checker";

describe("Phase 7 Hotel Vertical — Slice 3 (Check-in, Stays & Check-out) Integration Suite", () => {
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

  const readOnlyToken = signJwt({
    sub: "00000000-0000-0000-0000-000000000004",
    tenantId: TENANT_A,
    roles: ["RECEPTIONIST_VIEWER"],
    permissions: ["hotel.read", "hotel.stays.read"],
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
  let roomId: string;
  let roomNumber: string;
  let guestId: string;
  let reservationId1: string;
  let reservationId2: string;
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
          code: `S3_${uniqueSuffix}`,
          name: `Deluxe Suite ${uniqueSuffix}`,
          baseOccupancy: 2,
          maxOccupancy: 3,
          baseRate: 9500,
        }),
      })
    );
    const typeJson = await typeRes.json();
    roomTypeId = typeJson.data.roomTypeId;

    // 3. Create isolated Physical Room
    roomNumber = `3${Math.floor(1000 + Math.random() * 9000)}`;
    const roomRes = await roomsPost(
      new NextRequest("http://localhost:3000/api/v1/hotel/rooms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          roomTypeId,
          roomNumber,
          floorNumber: "3",
        }),
      })
    );
    const roomJson = await roomRes.json();
    roomId = roomJson.data.roomId;

    // 4. Create Guest
    const guestRes = await guestsPost(
      new NextRequest("http://localhost:3000/api/v1/hotel/guests", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: `Vikramaditya Singhania ${uniqueSuffix}`,
          phone: `+9198765${uniqueSuffix}`,
          email: `vikram.${uniqueSuffix}@luxurytravel.in`,
          idProofType: "PASSPORT",
          idProofNumberMasked: "PXXXX987",
          nationality: "INDIAN",
          vipStatus: "VIP",
        }),
      })
    );
    const guestJson = await guestRes.json();
    guestId = guestJson.data.guestId;

    // 5. Create 2 Confirmed Reservations
    const arrival1 = new Date();
    const departure1 = new Date(arrival1.getTime() + 2 * 24 * 60 * 60 * 1000);

    const res1 = await reservationsPost(
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
          assignedRoomId: roomId,
          arrivalDate: arrival1.toISOString(),
          departureDate: departure1.toISOString(),
          adultCount: 2,
          status: "CONFIRMED",
        }),
      })
    );
    const resJson1 = await res1.json();
    reservationId1 = resJson1.data.reservationId;

    const arrival2 = new Date(arrival1.getTime() + 5 * 24 * 60 * 60 * 1000);
    const departure2 = new Date(arrival2.getTime() + 2 * 24 * 60 * 60 * 1000);

    const res2 = await reservationsPost(
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
          assignedRoomId: roomId,
          arrivalDate: arrival2.toISOString(),
          departureDate: departure2.toISOString(),
          adultCount: 1,
          status: "CONFIRMED",
        }),
      })
    );
    const resJson2 = await res2.json();
    reservationId2 = resJson2.data.reservationId;
  });

  describe("1. Reservation vs Stay vs Room Occupancy Invariant", () => {
    it("confirms room remains AVAILABLE before check-in (planned booking != occupied)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/rooms?outletId=${outletId}`, {
        headers: { Authorization: `Bearer ${frontDeskToken}` },
      });
      const res = await roomsGet(req);
      const json = await res.json();
      const targetRoom = json.data.find((r: { roomId: string }) => r.roomId === roomId);

      expect(targetRoom).toBeDefined();
      expect(targetRoom.operationalStatus).toBe("AVAILABLE");
      expect(targetRoom.isOccupied).toBe(false);
      expect(targetRoom.currentStayId).toBeNull();
    });

    it("executes valid check-in: creates Stay, sets room OCCUPIED, updates reservation to CHECKED_IN", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/reservations/${reservationId1}/check-in`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${frontDeskToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roomId,
            notes: "Checked in at front desk by staff.",
          }),
        }
      );

      const res = await checkInPost(req, { params: Promise.resolve({ id: reservationId1 }) });
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.stayNumber).toMatch(/^STY-\d{4}-\d{4}$/);
      expect(json.data.status).toBe("ACTIVE");
      expect(json.data.roomId).toBe(roomId);
      expect(json.data.reservationId).toBe(reservationId1);
      expect(json.data.guestId).toBe(guestId);
      expect(json.data.actualCheckOutAt).toBeNull();

      activeStayId = json.data.stayId;

      // Verify physical room state is now OCCUPIED
      const roomReq = new NextRequest(`http://localhost:3000/api/v1/hotel/rooms?outletId=${outletId}`, {
        headers: { Authorization: `Bearer ${frontDeskToken}` },
      });
      const roomRes = await roomsGet(roomReq);
      const roomJson = await roomRes.json();
      const targetRoom = roomJson.data.find((r: { roomId: string }) => r.roomId === roomId);

      expect(targetRoom.operationalStatus).toBe("OCCUPIED");
      expect(targetRoom.isOccupied).toBe(true);
      expect(targetRoom.currentStayId).toBe(activeStayId);
      expect(targetRoom.currentOccupant).toContain("Vikramaditya");
    });

    it("prevents double occupancy: blocks checking in another reservation to an already OCCUPIED room", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/reservations/${reservationId2}/check-in`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${frontDeskToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roomId, // Trying to check in to the same room which is currently OCCUPIED
          }),
        }
      );

      const res = await checkInPost(req, { params: Promise.resolve({ id: reservationId2 }) });
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("BUSINESS_RULE_VIOLATION");
      expect(json.error.message).toContain("already occupied");
    });

    it("prevents duplicate check-in: blocks second check-in attempt on the same reservation", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/reservations/${reservationId1}/check-in`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${frontDeskToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ roomId }),
        }
      );

      const res = await checkInPost(req, { params: Promise.resolve({ id: reservationId1 }) });
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("BUSINESS_RULE_VIOLATION");
      expect(json.error.message).toContain("already checked in");
    });
  });

  describe("2. Front Office Stays Ledger & Retrieval", () => {
    it("lists active stays for the outlet with room and guest information", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/stays?outletId=${outletId}&status=ACTIVE`,
        {
          headers: { Authorization: `Bearer ${frontDeskToken}` },
        }
      );

      const res = await staysGet(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      const foundStay = json.data.find((s: { stayId: string }) => s.stayId === activeStayId);
      expect(foundStay).toBeDefined();
      expect(foundStay.roomNumber).toBe(roomNumber);
      expect(foundStay.guestName).toContain("Vikramaditya");
      expect(foundStay.status).toBe("ACTIVE");
    });

    it("retrieves stay detail by ID", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/stays/${activeStayId}`,
        {
          headers: { Authorization: `Bearer ${frontDeskToken}` },
        }
      );

      const res = await stayIdGet(req, { params: Promise.resolve({ id: activeStayId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.stayId).toBe(activeStayId);
      expect(json.data.vipStatus).toBe("VIP");
      expect(json.data.roomTypeName).toContain("Deluxe Suite");
    });

    it("filters stays by search keyword (room number or guest name)", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/stays?outletId=${outletId}&search=${roomNumber}`,
        {
          headers: { Authorization: `Bearer ${frontDeskToken}` },
        }
      );

      const res = await staysGet(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.length).toBeGreaterThanOrEqual(1);
      expect(json.data[0].roomNumber).toBe(roomNumber);
    });
  });

  describe("3. Idempotency on Check-In and Check-Out", () => {
    it("replays cached response on check-in retry with same idempotency key", async () => {
      // Create a 3rd reservation for idempotency check-in testing
      const arrival = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
      const departure = new Date(arrival.getTime() + 2 * 24 * 60 * 60 * 1000);

      // Create another room
      const uniqueSuffix = Date.now().toString().slice(-4);
      const roomRes = await roomsPost(
        new NextRequest("http://localhost:3000/api/v1/hotel/rooms", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hotelAdminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            outletId,
            roomTypeId,
            roomNumber: `Idemp-${uniqueSuffix}`,
            floorNumber: "5",
          }),
        })
      );
      const roomJson = await roomRes.json();
      const idempRoomId = roomJson.data.roomId;

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
            assignedRoomId: idempRoomId,
            arrivalDate: arrival.toISOString(),
            departureDate: departure.toISOString(),
            adultCount: 1,
            status: "CONFIRMED",
          }),
        })
      );
      const resJson = await resRes.json();
      const idempReservationId = resJson.data.reservationId;

      const idempKey = `key_checkin_${Date.now()}`;
      const payload = { roomId: idempRoomId };

      const req1 = new NextRequest(
        `http://localhost:3000/api/v1/hotel/reservations/${idempReservationId}/check-in`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${frontDeskToken}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempKey,
          },
          body: JSON.stringify(payload),
        }
      );

      const res1 = await checkInPost(req1, { params: Promise.resolve({ id: idempReservationId }) });
      const json1 = await res1.json();
      expect(res1.status).toBe(201);

      // Replay same request
      const req2 = new NextRequest(
        `http://localhost:3000/api/v1/hotel/reservations/${idempReservationId}/check-in`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${frontDeskToken}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempKey,
          },
          body: JSON.stringify(payload),
        }
      );

      const res2 = await checkInPost(req2, { params: Promise.resolve({ id: idempReservationId }) });
      const json2 = await res2.json();
      expect(res2.headers.get("x-idempotent-replay")).toBe("true");
      expect(json2.data.stayNumber).toBe(json1.data.stayNumber);
    });
  });

  describe("4. Check-Out Workflow & Room State Segregation", () => {
    it("executes checkout: completes Stay, releases room to AVAILABLE and sets housekeeping DIRTY", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/stays/${activeStayId}/check-out`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${frontDeskToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            notes: "Guest departed on schedule. Key cards returned.",
          }),
        }
      );

      const res = await checkOutPost(req, { params: Promise.resolve({ id: activeStayId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("CHECKED_OUT");
      expect(json.data.actualCheckOutAt).toBeDefined();

      // Verify physical room state: operationalStatus is AVAILABLE, isOccupied is false
      // BUT housekeepingStatus is DIRTY (not overwritten to clean)
      const roomReq = new NextRequest(`http://localhost:3000/api/v1/hotel/rooms?outletId=${outletId}`, {
        headers: { Authorization: `Bearer ${frontDeskToken}` },
      });
      const roomRes = await roomsGet(roomReq);
      const roomJson = await roomRes.json();
      const targetRoom = roomJson.data.find((r: { roomId: string }) => r.roomId === roomId);

      expect(targetRoom.operationalStatus).toBe("AVAILABLE");
      expect(targetRoom.isOccupied).toBe(false);
      expect(targetRoom.housekeepingStatus).toBe("DIRTY");
      expect(targetRoom.currentStayId).toBeNull();
    });

    it("blocks checkout on already completed stay (terminal state)", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/stays/${activeStayId}/check-out`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${frontDeskToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ notes: "Duplicate checkout attempt" }),
        }
      );

      const res = await checkOutPost(req, { params: Promise.resolve({ id: activeStayId }) });
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("BUSINESS_RULE_VIOLATION");
      expect(json.error.message).toContain("already been checked out");
    });
  });

  describe("5. Security, RBAC & Cross-Tenant Boundary Enforcement", () => {
    it("denies check-in when tenant lacks HOTEL module entitlement (403)", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/reservations/${reservationId1}/check-in`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tenantBToken}`, // Tenant B NOT entitled to HOTEL
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ roomId }),
        }
      );

      const res = await checkInPost(req, { params: Promise.resolve({ id: reservationId1 }) });
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("MODULE_NOT_ENTITLED");
    });

    it("denies check-in when user lacks required permission (403)", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/reservations/${reservationId2}/check-in`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${readOnlyToken}`, // lacks hotel.stays.manage
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ roomId }),
        }
      );

      const res = await checkInPost(req, { params: Promise.resolve({ id: reservationId2 }) });
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("PERMISSION_DENIED");
    });

    it("cross-tenant denial: Tenant B cannot access Tenant A stay (404/RLS)", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/stays/${activeStayId}`,
        {
          headers: {
            Authorization: `Bearer ${tenantBToken}`, // Cross-tenant
          },
        }
      );

      const res = await stayIdGet(req, { params: Promise.resolve({ id: activeStayId }) });
      expect([403, 404]).toContain(res.status);
    });
  });

  describe("6. Native PostgreSQL Concurrency Verification", () => {
    it("handles concurrent check-in race condition: exactly one check-in succeeds for the same room", async () => {
      // 1. Create a fresh room
      const uniqueSuffix = Date.now().toString().slice(-4);
      const roomRes = await roomsPost(
        new NextRequest("http://localhost:3000/api/v1/hotel/rooms", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hotelAdminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            outletId,
            roomTypeId,
            roomNumber: `Race-${uniqueSuffix}`,
            floorNumber: "6",
          }),
        })
      );
      const roomJson = await roomRes.json();
      const raceRoomId = roomJson.data.roomId;

      // 2. Create 2 separate reservations targeting this room
      const arrival = new Date(Date.now() + 50 * 24 * 60 * 60 * 1000);
      const departure = new Date(arrival.getTime() + 2 * 24 * 60 * 60 * 1000);

      const r1 = await reservationsPost(
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
            arrivalDate: arrival.toISOString(),
            departureDate: departure.toISOString(),
            adultCount: 1,
            status: "CONFIRMED",
          }),
        })
      );
      const rJson1 = await r1.json();
      expect(r1.status).toBe(201);
      const raceResId1 = rJson1.data.reservationId;

      const r2 = await reservationsPost(
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
            arrivalDate: arrival.toISOString(),
            departureDate: departure.toISOString(),
            adultCount: 1,
            status: "CONFIRMED",
          }),
        })
      );
      const rJson2 = await r2.json();
      expect(r2.status).toBe(201);
      const raceResId2 = rJson2.data.reservationId;

      // 3. Fire simultaneous check-ins
      const promise1 = checkInPost(
        new NextRequest(`http://localhost:3000/api/v1/hotel/reservations/${raceResId1}/check-in`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${frontDeskToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ roomId: raceRoomId }),
        }),
        { params: Promise.resolve({ id: raceResId1 }) }
      );

      const promise2 = checkInPost(
        new NextRequest(`http://localhost:3000/api/v1/hotel/reservations/${raceResId2}/check-in`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${frontDeskToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ roomId: raceRoomId }),
        }),
        { params: Promise.resolve({ id: raceResId2 }) }
      );

      const [res1, res2] = await Promise.all([promise1, promise2]);
      const statuses = [res1.status, res2.status].sort();

      // Exactly ONE succeeds (201), the other is rejected (422) by transactional lock or database constraint
      expect(statuses).toEqual([201, 422]);
    }, 20000);
  });
});
