import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET as tasksGet, POST as tasksPost } from "@/app/api/v1/hotel/housekeeping/tasks/route";
import { GET as taskIdGet } from "@/app/api/v1/hotel/housekeeping/tasks/[id]/route";
import { POST as taskAssignPost } from "@/app/api/v1/hotel/housekeeping/tasks/[id]/assign/route";
import { POST as taskStartPost } from "@/app/api/v1/hotel/housekeeping/tasks/[id]/start/route";
import { POST as taskCompletePost } from "@/app/api/v1/hotel/housekeeping/tasks/[id]/complete/route";
import { POST as taskInspectPost } from "@/app/api/v1/hotel/housekeeping/tasks/[id]/inspect/route";
import { GET as summaryGet } from "@/app/api/v1/hotel/housekeeping/summary/route";
import { POST as checkInPost } from "@/app/api/v1/hotel/reservations/[id]/check-in/route";
import { POST as checkOutPost } from "@/app/api/v1/hotel/stays/[id]/check-out/route";
import { POST as reservationsPost } from "@/app/api/v1/hotel/reservations/route";
import { POST as guestsPost } from "@/app/api/v1/hotel/guests/route";
import { GET as propertiesGet } from "@/app/api/v1/hotel/properties/route";
import { POST as roomTypesPost } from "@/app/api/v1/hotel/room-types/route";
import { POST as roomsPost, GET as roomsGet } from "@/app/api/v1/hotel/rooms/route";
import { signJwt } from "@/lib/auth/jwt";
import { setTenantEntitlements } from "@/lib/entitlements/checker";
import { getDb } from "@/db/client";
import { users } from "@/db/schema/core";

describe("Phase 7 Hotel Vertical — Slice 5 (Housekeeping) Integration Suite", () => {
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

  const housekeepingLeadToken = signJwt({
    sub: "00000000-0000-0000-0000-000000000006",
    tenantId: TENANT_A,
    roles: ["HOUSEKEEPING_SUPERVISOR"],
    permissions: [
      "hotel.read",
      "hotel.housekeeping.read",
      "hotel.housekeeping.manage",
      "hotel.housekeeping.clean",
      "hotel.housekeeping.inspect",
    ],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const housekeeperToken = signJwt({
    sub: "00000000-0000-0000-0000-000000000007",
    tenantId: TENANT_A,
    roles: ["HOUSEKEEPER"],
    permissions: [
      "hotel.read",
      "hotel.housekeeping.read",
      "hotel.housekeeping.clean",
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
  let room1Id: string;
  let room1Number: string;
  let room2Id: string;
  let room2Number: string;
  let guestId: string;
  let reservationId: string;
  let activeStayId: string;
  let createdTaskId: string;

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
          email: "admin_hk@example.com",
          fullName: "Admin Staff",
        },
        {
          userId: "00000000-0000-0000-0000-000000000006",
          email: "lead_hk@example.com",
          fullName: "Housekeeping Lead",
        },
        {
          userId: "00000000-0000-0000-0000-000000000007",
          email: "housekeeper_hk@example.com",
          fullName: "Mary Housekeeper",
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

    // 2. Create isolated Room Type
    const uniqueSuffix = `${Date.now().toString().slice(-4)}${Math.floor(10 + Math.random() * 90)}`;
    const typeRes = await roomTypesPost(
      new NextRequest("http://localhost:3000/api/v1/hotel/room-types", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          code: `HK_${uniqueSuffix}`,
          name: `Housekeeping Suite ${uniqueSuffix}`,
          baseOccupancy: 2,
          maxOccupancy: 4,
          baseRate: 8500,
        }),
      })
    );
    const typeJson = await typeRes.json();
    roomTypeId = typeJson.data.roomTypeId;

    // 3. Create isolated Physical Rooms (Room 1 and Room 2)
    room1Number = `5${uniqueSuffix}`;
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
          floorNumber: "5",
        }),
      })
    );
    const r1Json = await r1Res.json();
    room1Id = r1Json.data.roomId;

    room2Number = `6${uniqueSuffix}`;
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
          floorNumber: "5",
        }),
      })
    );
    const r2Json = await r2Res.json();
    room2Id = r2Json.data.roomId;

    // 4. Create Hotel Guest & Confirmed Reservation for Room 2
    const guestRes = await guestsPost(
      new NextRequest("http://localhost:3000/api/v1/hotel/guests", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: `HK Guest ${uniqueSuffix}`,
          email: `hkguest_${uniqueSuffix}@example.com`,
          phone: `+1888${uniqueSuffix}`,
        }),
      })
    );
    const guestJson = await guestRes.json();
    guestId = guestJson.data.guestId;

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
          assignedRoomId: room2Id,
          arrivalDate: new Date().toISOString(),
          departureDate: new Date(Date.now() + 86400000).toISOString(),
          adultCount: 2,
          roomRate: 8500,
        }),
      })
    );
    const resJson = await resRes.json();
    reservationId = resJson.data.reservationId;
  });

  describe("1. Security, Entitlement & RBAC Enforcement", () => {
    it("rejects unauthenticated requests (401)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/housekeeping/tasks?outletId=${outletId}`);
      const res = await tasksGet(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("AUTHENTICATION_REQUIRED");
    });

    it("rejects tenant without HOTEL module entitlement (403)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/housekeeping/tasks?outletId=${outletId}`, {
        headers: { Authorization: `Bearer ${tenantBToken}` },
      });
      const res = await tasksGet(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("MODULE_NOT_ENTITLED");
    });

    it("rejects user without hotel.read or housekeeping permission (403)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/housekeeping/tasks?outletId=${outletId}`, {
        headers: { Authorization: `Bearer ${noPermToken}` },
      });
      const res = await tasksGet(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("PERMISSION_DENIED");
    });

    it("rejects task creation from user lacking housekeeping.manage permission (403)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/housekeeping/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${housekeeperToken}`, // Housekeeper has .clean but lacks .manage
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          roomId: room1Id,
          taskType: "ROUTINE_CLEANING",
        }),
      });
      const res = await tasksPost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("PERMISSION_DENIED");
    });

    it("rejects request if property outletId belongs to another tenant or is invalid (404)", async () => {
      const fakeOutlet = "99999999-9999-9999-9999-999999999999";
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/housekeeping/tasks?outletId=${fakeOutlet}`, {
        headers: { Authorization: `Bearer ${housekeepingLeadToken}` },
      });
      const res = await tasksGet(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error.code).toBe("RESOURCE_NOT_FOUND");
    });
  });

  describe("2. Task Lifecycle: Create, Assign, Start, Complete & Inspection Rejection / Pass", () => {
    it("creates a new manual housekeeping task in PENDING status", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/housekeeping/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${housekeepingLeadToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          roomId: room1Id,
          taskType: "DEPARTURE_TURNOVER",
          priority: "HIGH",
          notes: "Deep turnover before VIP check-in",
        }),
      });
      const res = await tasksPost(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("PENDING");
      expect(json.data.priority).toBe("HIGH");
      expect(json.data.roomId).toBe(room1Id);
      expect(json.data.roomNumber).toBe(room1Number);

      createdTaskId = json.data.taskId;
    });

    it("assigns staff member to task and transitions status to ASSIGNED", async () => {
      const housekeeperUserId = "00000000-0000-0000-0000-000000000007";
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/housekeeping/tasks/${createdTaskId}/assign`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${housekeepingLeadToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignedStaffId: housekeeperUserId,
        }),
      });
      const res = await taskAssignPost(req, {
        params: Promise.resolve({ id: createdTaskId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("ASSIGNED");
      expect(json.data.assignedStaffId).toBe(housekeeperUserId);
    });

    it("starts cleaning: task transitions to IN_PROGRESS, room housekeepingStatus becomes CLEANING", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/housekeeping/tasks/${createdTaskId}/start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${housekeeperToken}`,
        },
      });
      const res = await taskStartPost(req, {
        params: Promise.resolve({ id: createdTaskId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("IN_PROGRESS");
      expect(json.data.startedAt).toBeDefined();

      // Verify physical room state is now CLEANING
      const roomReq = new NextRequest(`http://localhost:3000/api/v1/hotel/rooms?outletId=${outletId}`, {
        headers: { Authorization: `Bearer ${housekeeperToken}` },
      });
      const roomRes = await roomsGet(roomReq);
      const roomJson = await roomRes.json();
      const room = roomJson.data.find((r: any) => r.roomId === room1Id);
      expect(room.housekeepingStatus).toBe("CLEANING");
    });

    it("completes cleaning: task transitions to CLEANED, room housekeepingStatus becomes CLEAN", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/housekeeping/tasks/${createdTaskId}/complete`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${housekeeperToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notes: "Turnover finished, linework replaced.",
        }),
      });
      const res = await taskCompletePost(req, {
        params: Promise.resolve({ id: createdTaskId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("CLEANED");
      expect(json.data.completedAt).toBeDefined();

      // Verify physical room state is now CLEAN (awaiting inspection)
      const roomReq = new NextRequest(`http://localhost:3000/api/v1/hotel/rooms?outletId=${outletId}`, {
        headers: { Authorization: `Bearer ${housekeeperToken}` },
      });
      const roomRes = await roomsGet(roomReq);
      const roomJson = await roomRes.json();
      const room = roomJson.data.find((r: any) => r.roomId === room1Id);
      expect(room.housekeepingStatus).toBe("CLEAN");
    });

    it("inspection REJECTION / FAILURE: room transitions back to DIRTY and task reopens as PENDING", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/housekeeping/tasks/${createdTaskId}/inspect`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${housekeepingLeadToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          passed: false,
          notes: "Bathroom mirror streaked, needs retowel.",
        }),
      });
      const res = await taskInspectPost(req, {
        params: Promise.resolve({ id: createdTaskId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("PENDING");
      expect(json.data.triggerSource).toBe("INSPECTION_FAILED");

      // Verify physical room state reverted back to DIRTY
      const roomReq = new NextRequest(`http://localhost:3000/api/v1/hotel/rooms?outletId=${outletId}`, {
        headers: { Authorization: `Bearer ${housekeepingLeadToken}` },
      });
      const roomRes = await roomsGet(roomReq);
      const roomJson = await roomRes.json();
      const room = roomJson.data.find((r: any) => r.roomId === room1Id);
      expect(room.housekeepingStatus).toBe("DIRTY");
    });

    it("re-cleans and inspection PASSES: task -> INSPECTED, room -> INSPECTED (Ready for sale)", async () => {
      // Re-start
      await taskStartPost(
        new NextRequest(`http://localhost:3000/api/v1/hotel/housekeeping/tasks/${createdTaskId}/start`, {
          method: "POST",
          headers: { Authorization: `Bearer ${housekeeperToken}` },
        }),
        { params: Promise.resolve({ id: createdTaskId }) }
      );

      // Re-complete
      await taskCompletePost(
        new NextRequest(`http://localhost:3000/api/v1/hotel/housekeeping/tasks/${createdTaskId}/complete`, {
          method: "POST",
          headers: { Authorization: `Bearer ${housekeeperToken}` },
        }),
        { params: Promise.resolve({ id: createdTaskId }) }
      );

      // Inspect with PASS
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/housekeeping/tasks/${createdTaskId}/inspect`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${housekeepingLeadToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          passed: true,
          notes: "Verified spotless and restocked.",
        }),
      });
      const res = await taskInspectPost(req, {
        params: Promise.resolve({ id: createdTaskId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("INSPECTED");
      expect(json.data.inspectedAt).toBeDefined();

      // Verify physical room state is now INSPECTED
      const roomReq = new NextRequest(`http://localhost:3000/api/v1/hotel/rooms?outletId=${outletId}`, {
        headers: { Authorization: `Bearer ${housekeepingLeadToken}` },
      });
      const roomRes = await roomsGet(roomReq);
      const roomJson = await roomRes.json();
      const room = roomJson.data.find((r: any) => r.roomId === room1Id);
      expect(room.housekeepingStatus).toBe("INSPECTED");
      expect(room.operationalStatus).toBe("AVAILABLE");
    });
  });

  describe("3. Checkout Auto-Turnover Integration & Occupied Protection", () => {
    it("automatically creates a DEPARTURE_TURNOVER task upon guest checkout", async () => {
      // 1. Check in guest into Room 2
      const checkInReq = new NextRequest(
        `http://localhost:3000/api/v1/hotel/reservations/${reservationId}/check-in`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hotelAdminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roomId: room2Id,
            notes: "Checked in for housekeeping checkout test",
          }),
        }
      );
      const checkInRes = await checkInPost(checkInReq, {
        params: Promise.resolve({ id: reservationId }),
      });
      expect(checkInRes.status).toBe(201);
      const checkInJson = await checkInRes.json();
      activeStayId = checkInJson.data.stayId;

      // 2. Perform checkout
      const checkOutReq = new NextRequest(
        `http://localhost:3000/api/v1/hotel/stays/${activeStayId}/check-out`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hotelAdminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ notes: "Guest departed." }),
        }
      );
      const checkOutRes = await checkOutPost(checkOutReq, {
        params: Promise.resolve({ id: activeStayId }),
      });
      expect(checkOutRes.status).toBe(200);

      // 3. Verify physical room state: AVAILABLE + DIRTY
      const roomReq = new NextRequest(`http://localhost:3000/api/v1/hotel/rooms?outletId=${outletId}`, {
        headers: { Authorization: `Bearer ${hotelAdminToken}` },
      });
      const roomRes = await roomsGet(roomReq);
      const roomJson = await roomRes.json();
      const room2 = roomJson.data.find((r: any) => r.roomId === room2Id);
      expect(room2.operationalStatus).toBe("AVAILABLE");
      expect(room2.housekeepingStatus).toBe("DIRTY");

      // 4. Verify automated DEPARTURE_TURNOVER task was created
      const tasksReq = new NextRequest(
        `http://localhost:3000/api/v1/hotel/housekeeping/tasks?outletId=${outletId}&roomId=${room2Id}&taskType=DEPARTURE_TURNOVER`,
        {
          headers: { Authorization: `Bearer ${housekeepingLeadToken}` },
        }
      );
      const tasksRes = await tasksGet(tasksReq);
      expect(tasksRes.status).toBe(200);
      const tasksJson = await tasksRes.json();
      expect(tasksJson.success).toBe(true);

      const turnoverTask = tasksJson.data.find(
        (t: any) => t.roomId === room2Id && t.taskType === "DEPARTURE_TURNOVER"
      );
      expect(turnoverTask).toBeDefined();
      expect(turnoverTask.status).toBe("PENDING");
      expect(turnoverTask.triggerSource).toBe("CHECKOUT");
    });

    it("verifies Housekeeping Summary aggregates reflect live data", async () => {
      const summaryReq = new NextRequest(
        `http://localhost:3000/api/v1/hotel/housekeeping/summary?outletId=${outletId}`,
        {
          headers: { Authorization: `Bearer ${housekeepingLeadToken}` },
        }
      );
      const summaryRes = await summaryGet(summaryReq);
      expect(summaryRes.status).toBe(200);
      const json = await summaryRes.json();
      expect(json.success).toBe(true);
      expect(json.data.taskCounts).toBeDefined();
      expect(typeof json.data.taskCounts.pending).toBe("number");
      expect(typeof json.data.roomCounts.totalRooms).toBe("number");
      expect(typeof json.data.roomCounts.readyForOccupancy).toBe("number");
    });
  });

  describe("4. Concurrency & Race-Condition Protection", () => {
    it("handles concurrent task starts safely with row locking", async () => {
      // 1. Create a fresh routine cleaning task
      const createReq = new NextRequest(`http://localhost:3000/api/v1/hotel/housekeeping/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${housekeepingLeadToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          roomId: room2Id,
          taskType: "ROUTINE_CLEANING",
          priority: "NORMAL",
        }),
      });
      const createRes = await tasksPost(createReq);
      const createJson = await createRes.json();
      const concurrencyTaskId = createJson.data.taskId;

      // 2. Fire two concurrent start requests
      const startReq1 = new NextRequest(
        `http://localhost:3000/api/v1/hotel/housekeeping/tasks/${concurrencyTaskId}/start`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${housekeeperToken}` },
        }
      );
      const startReq2 = new NextRequest(
        `http://localhost:3000/api/v1/hotel/housekeeping/tasks/${concurrencyTaskId}/start`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${housekeeperToken}` },
        }
      );

      const [res1, res2] = await Promise.all([
        taskStartPost(startReq1, { params: Promise.resolve({ id: concurrencyTaskId }) }),
        taskStartPost(startReq2, { params: Promise.resolve({ id: concurrencyTaskId }) }),
      ]);

      const statuses = [res1.status, res2.status];
      // One request must succeed (200) and the other must be rejected (422 business rule violation)
      expect(statuses).toContain(200);
      expect(statuses).toContain(422);
    });

    it("rejects inspection on a task that is not in CLEANED state", async () => {
      // Create a pending task
      const createReq = new NextRequest(`http://localhost:3000/api/v1/hotel/housekeeping/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${housekeepingLeadToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId,
          roomId: room1Id,
          taskType: "DEEP_CLEANING",
        }),
      });
      const createRes = await tasksPost(createReq);
      const createJson = await createRes.json();
      const freshTaskId = createJson.data.taskId;

      // Attempt to inspect directly while still PENDING
      const inspectReq = new NextRequest(
        `http://localhost:3000/api/v1/hotel/housekeeping/tasks/${freshTaskId}/inspect`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${housekeepingLeadToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            passed: true,
          }),
        }
      );
      const inspectRes = await taskInspectPost(inspectReq, {
        params: Promise.resolve({ id: freshTaskId }),
      });
      expect(inspectRes.status).toBe(422);
      const inspectJson = await inspectRes.json();
      expect(inspectJson.success).toBe(false);
      expect(inspectJson.error.message).toContain("Only tasks in 'CLEANED' status can be inspected");
    });
  });
});

