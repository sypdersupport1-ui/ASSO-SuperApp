import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET as reservationsGet, POST as reservationsPost } from "@/app/api/v1/restaurant/reservations/route";
import { GET as availabilityGet } from "@/app/api/v1/restaurant/reservations/availability/route";
import {
  GET as reservationDetailGet,
  PATCH as reservationDetailPatch,
} from "@/app/api/v1/restaurant/reservations/[id]/route";
import { POST as reservationAssignPost } from "@/app/api/v1/restaurant/reservations/[id]/assign/route";
import { POST as reservationStatusPost } from "@/app/api/v1/restaurant/reservations/[id]/status/route";
import { POST as reservationSeatPost } from "@/app/api/v1/restaurant/reservations/[id]/seat/route";
import { GET as waitlistGet, POST as waitlistPost } from "@/app/api/v1/restaurant/waitlist/route";
import { GET as waitlistDetailGet } from "@/app/api/v1/restaurant/waitlist/[id]/route";
import { POST as waitlistStatusPost } from "@/app/api/v1/restaurant/waitlist/[id]/status/route";
import { POST as waitlistSeatPost } from "@/app/api/v1/restaurant/waitlist/[id]/seat/route";
import { GET as tablesGet, POST as tablesPost } from "@/app/api/v1/restaurant/tables/route";
import { GET as outletsGet, POST as outletsPost } from "@/app/api/v1/restaurant/outlets/route";
import { GET as tableQrGet } from "@/app/api/v1/restaurant/tables/[id]/qr/route";
import { signJwt } from "@/lib/auth/jwt";
import { setTenantEntitlements } from "@/lib/entitlements/checker";
import { getDb } from "@/db/client";
import { restaurantReservations, restaurantWaitlist, restaurantTables, restaurantTableSessions } from "@/db/schema/restaurant";
import { customers } from "@/db/schema/core";
import { eq, and } from "drizzle-orm";

describe("ASSO Restaurant Vertical — Slice 3.5 Reservations & Waitlist Management", () => {
  const TENANT_A = "11111111-1111-1111-1111-111111111111";
  const TENANT_B = "22222222-2222-2222-2222-222222222222";

  // Auth tokens
  const managerTokenA = signJwt({
    sub: "usr_rest_manager_a",
    tenantId: TENANT_A,
    roles: ["RESTAURANT_MANAGER"],
    permissions: ["restaurant.*"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const staffTokenA = signJwt({
    sub: "usr_rest_staff_a",
    tenantId: TENANT_A,
    roles: ["RESTAURANT_STAFF"],
    permissions: [
      "restaurant.tables.view",
      "restaurant.tables.status",
      "restaurant.sessions.manage",
      "restaurant.reservations.view",
      "restaurant.reservations.manage",
      "restaurant.waitlist.view",
      "restaurant.waitlist.manage",
    ],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const guestTokenA = signJwt({
    sub: "usr_guest_a",
    tenantId: TENANT_A,
    roles: ["GUEST"],
    permissions: ["customer.read"],
    sessionType: "CUSTOMER",
    isSuperAdmin: false,
  });

  const hotelAdminTokenA = signJwt({
    sub: "usr_hotel_admin_a",
    tenantId: TENANT_A,
    roles: ["HOTEL_ADMIN"],
    permissions: ["hotel.*"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const managerTokenB = signJwt({
    sub: "usr_rest_manager_b",
    tenantId: TENANT_B,
    roles: ["RESTAURANT_MANAGER"],
    permissions: ["restaurant.*"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  let outletIdA: string;
  let outletIdB: string;
  let tableA1Id: string; // 4 seats
  let tableA2Id: string; // 2 seats
  let tableA3Id: string; // 6 seats

  beforeAll(async () => {
    // Enable module entitlements for both test tenants
    setTenantEntitlements(TENANT_A, ["CORE", "RESTAURANT", "ORDERING", "POS", "TABLE_MANAGEMENT", "QR_ORDERING", "ORDERS"]);
    setTenantEntitlements(TENANT_B, ["CORE", "RESTAURANT", "ORDERING", "POS", "TABLE_MANAGEMENT", "QR_ORDERING", "ORDERS"]);

    // Create Outlet for Tenant A
    const outACode = `OUT_R35_${Date.now().toString().slice(-4)}`;
    const reqA = new NextRequest("http://localhost:3000/api/v1/restaurant/outlets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerTokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Emerald Dining R35", code: outACode }),
    });
    const resA = await outletsPost(reqA);
    const jsonA = await resA.json();
    expect(resA.status).toBe(201);
    outletIdA = jsonA.data.outletId;

    // Create Outlet for Tenant B
    const outBCode = `OUT_B35_${Date.now().toString().slice(-4)}`;
    const reqB = new NextRequest("http://localhost:3000/api/v1/restaurant/outlets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerTokenB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Blue Bistro R35", code: outBCode }),
    });
    const resB = await outletsPost(reqB);
    const jsonB = await resB.json();
    expect(resB.status).toBe(201);
    outletIdB = jsonB.data.outletId;

    // Create 3 standard test tables for Tenant A
    const req1 = new NextRequest("http://localhost/api/v1/restaurant/tables", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerTokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        outletId: outletIdA,
        tableNumber: "R35-T1",
        displayLabel: "Window 1",
        capacity: 4,
        section: "Main Dining",
      }),
    });
    const res1 = await tablesPost(req1);
    const body1 = await res1.json();
    expect(res1.status).toBe(201);
    tableA1Id = body1.data.tableId;

    const req2 = new NextRequest("http://localhost/api/v1/restaurant/tables", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerTokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        outletId: outletIdA,
        tableNumber: "R35-T2",
        displayLabel: "Bistro 2",
        capacity: 2,
        section: "Main Dining",
      }),
    });
    const res2 = await tablesPost(req2);
    const body2 = await res2.json();
    expect(res2.status).toBe(201);
    tableA2Id = body2.data.tableId;

    const req3 = new NextRequest("http://localhost/api/v1/restaurant/tables", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerTokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        outletId: outletIdA,
        tableNumber: "R35-T3",
        displayLabel: "Family Booth 3",
        capacity: 6,
        section: "Patio",
      }),
    });
    const res3 = await tablesPost(req3);
    const body3 = await res3.json();
    expect(res3.status).toBe(201);
    tableA3Id = body3.data.tableId;
  });

  describe("1. RESERVATION DOMAIN — Lifecycle, Lookup, Update, and Transitions", () => {
    let createdReservationId: string;
    let reservationNumber: string;

    it("creates a reservation successfully with customer Name + Phone and server-assigned reservationNumber", async () => {
      const req = new NextRequest("http://localhost/api/v1/restaurant/reservations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          customerName: "Alice Walker",
          customerPhone: "+1555019001",
          customerEmail: "alice@example.com",
          partySize: 4,
          reservationDate: "2026-10-15",
          reservationTime: "19:00",
          durationMinutes: 90,
          specialRequests: "Anniversary dinner, window seat preferred",
        }),
      });

      const res = await reservationsPost(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();
      expect(json.data.customerName).toBe("Alice Walker");
      expect(json.data.customerPhone).toBe("+1555019001");
      expect(json.data.status).toBe("CONFIRMED");
      expect(json.data.partySize).toBe(4);
      expect(json.data.reservationId).toBeDefined();
      expect(json.data.assignedTableId).toBeNull();

      createdReservationId = json.data.reservationId;
    });

    it("verifies customer is registered in shared customers table without duplication", async () => {
      const db = getDb();
      const matched = await db
        .select()
        .from(customers)
        .where(and(eq(customers.tenantId, TENANT_A), eq(customers.phone, "+1555019001")));

      expect(matched.length).toBe(1);
      expect(matched[0].fullName).toBe("Alice Walker");
    });

    it("looks up reservation by ID and by list query parameters", async () => {
      // By ID
      const reqId = new NextRequest(`http://localhost/api/v1/restaurant/reservations/${createdReservationId}?outletId=${outletIdA}`, {
        headers: { Authorization: `Bearer ${staffTokenA}` },
      });
      const resId = await reservationDetailGet(reqId, { params: Promise.resolve({ id: createdReservationId }) });
      const jsonId = await resId.json();

      expect(resId.status).toBe(200);
      expect(jsonId.data.reservationId).toBe(createdReservationId);

      // By List with Date & Status Filter
      const reqList = new NextRequest(
        `http://localhost/api/v1/restaurant/reservations?outletId=${outletIdA}&date=2026-10-15&status=CONFIRMED&search=Alice`,
        { headers: { Authorization: `Bearer ${staffTokenA}` } }
      );
      const resList = await reservationsGet(reqList);
      const jsonList = await resList.json();

      expect(resList.status).toBe(200);
      expect(jsonList.data.length).toBeGreaterThanOrEqual(1);
      const found = jsonList.data.find((r: any) => r.reservationId === createdReservationId);
      expect(found).toBeDefined();
    });

    it("updates reservation details (notes, party size, guest details)", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/reservations/${createdReservationId}?outletId=${outletIdA}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${managerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          notes: "Anniversary dinner, bring dessert menu early. VIP guest",
        }),
      });

      const res = await reservationDetailPatch(req, { params: Promise.resolve({ id: createdReservationId }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.notes).toContain("VIP guest");
      expect(json.data.notes).toContain("Anniversary dinner");
    });

    it("enforces valid status transitions and rejects invalid state transitions (e.g. CANCELLED -> SEATED)", async () => {
      // Create a test reservation to cancel
      const createReq = new NextRequest("http://localhost/api/v1/restaurant/reservations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          customerName: "Bob Cancel",
          customerPhone: "+1555019002",
          partySize: 2,
          reservationDate: "2026-10-16",
          reservationTime: "12:00",
        }),
      });
      const createRes = await reservationsPost(createReq);
      const { data } = await createRes.json();
      const cancelId = data.reservationId;

      // Cancel the reservation
      const cancelReq = new NextRequest(`http://localhost/api/v1/restaurant/reservations/${cancelId}/status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          status: "CANCELLED",
          reason: "Guest called to cancel due to weather",
        }),
      });
      const cancelRes = await reservationStatusPost(cancelReq, { params: Promise.resolve({ id: cancelId }) });
      const cancelJson = await cancelRes.json();
      expect(cancelRes.status).toBe(200);
      expect(cancelJson.data.status).toBe("CANCELLED");

      // Attempt invalid transition: CANCELLED -> SEATED should be rejected
      const invalidReq = new NextRequest(`http://localhost/api/v1/restaurant/reservations/${cancelId}/status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          status: "SEATED",
        }),
      });
      const invalidRes = await reservationStatusPost(invalidReq, { params: Promise.resolve({ id: cancelId }) });
      expect(invalidRes.status).toBe(422);
      const invalidJson = await invalidRes.json();
      expect(invalidJson.error.code).toBe("INVALID_STATE_TRANSITION");
    });

    it("supports marking reservations as NO_SHOW", async () => {
      const createReq = new NextRequest("http://localhost/api/v1/restaurant/reservations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          customerName: "Charlie NoShow",
          customerPhone: "+1555019003",
          partySize: 2,
          reservationDate: "2026-10-16",
          reservationTime: "13:00",
        }),
      });
      const createRes = await reservationsPost(createReq);
      const { data } = await createRes.json();
      const noShowId = data.reservationId;

      const req = new NextRequest(`http://localhost/api/v1/restaurant/reservations/${noShowId}/status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          status: "NO_SHOW",
          reason: "Did not arrive within 30 minutes grace period",
        }),
      });
      const res = await reservationStatusPost(req, { params: Promise.resolve({ id: noShowId }) });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.status).toBe("NO_SHOW");
    });
  });

  describe("2. TABLE AVAILABILITY & CONFLICT DETECTION", () => {
    let bookedResId: string;

    it("checks table availability for a specific slot and returns eligible tables", async () => {
      const req = new NextRequest(
        `http://localhost/api/v1/restaurant/reservations/availability?outletId=${outletIdA}&date=2026-10-20&time=18:00&partySize=4&durationMinutes=90`,
        { headers: { Authorization: `Bearer ${managerTokenA}` } }
      );
      const res = await availabilityGet(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.tables).toBeDefined();

      // tableA1 (capacity 4) and tableA3 (capacity 6) should be available
      const availableTables = json.data.tables.filter((t: any) => t.isAvailable);
      const tableIds = availableTables.map((t: any) => t.tableId);
      expect(tableIds).toContain(tableA1Id);
      expect(tableIds).toContain(tableA3Id);
      // tableA2 (capacity 2) should NOT be available for party size 4
      expect(tableIds).not.toContain(tableA2Id);
    });

    it("rejects assigning a table whose capacity is smaller than party size", async () => {
      // Create a reservation for 4 people
      const createReq = new NextRequest("http://localhost/api/v1/restaurant/reservations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          customerName: "David Capacity",
          customerPhone: "+1555019004",
          partySize: 4,
          reservationDate: "2026-10-20",
          reservationTime: "18:00",
          durationMinutes: 90,
        }),
      });
      const createRes = await reservationsPost(createReq);
      const { data } = await createRes.json();
      bookedResId = data.reservationId;

      // Try to assign tableA2 (capacity 2) to party of 4
      const assignReq = new NextRequest(`http://localhost/api/v1/restaurant/reservations/${bookedResId}/assign`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          tableId: tableA2Id,
        }),
      });
      const assignRes = await reservationAssignPost(assignReq, { params: Promise.resolve({ id: bookedResId }) });
      expect(assignRes.status).toBe(422);
      const assignJson = await assignRes.json();
      expect(assignJson.error.message).toMatch(/less than reservation party size|insufficient capacity/i);
    });

    it("successfully assigns tableA1 to the reservation", async () => {
      const assignReq = new NextRequest(`http://localhost/api/v1/restaurant/reservations/${bookedResId}/assign`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          tableId: tableA1Id,
        }),
      });
      const assignRes = await reservationAssignPost(assignReq, { params: Promise.resolve({ id: bookedResId }) });
      const assignJson = await assignRes.json();

      expect(assignRes.status).toBe(200);
      expect(assignJson.data.assignedTableId).toBe(tableA1Id);
      expect(assignJson.data.tableNumber).toBe("R35-T1");
    });

    it("detects conflict and rejects assigning the same table to an overlapping reservation", async () => {
      // Create overlapping reservation for 2026-10-20 18:30 (overlapping with 18:00 - 19:30)
      const overlapCreateReq = new NextRequest("http://localhost/api/v1/restaurant/reservations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          customerName: "Eva Overlap",
          customerPhone: "+1555019005",
          partySize: 3,
          reservationDate: "2026-10-20",
          reservationTime: "18:30",
          durationMinutes: 90,
        }),
      });
      const overlapCreateRes = await reservationsPost(overlapCreateReq);
      const { data } = await overlapCreateRes.json();
      const overlapResId = data.reservationId;

      // Assign tableA1: should fail with conflict
      const assignReq = new NextRequest(`http://localhost/api/v1/restaurant/reservations/${overlapResId}/assign`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          tableId: tableA1Id,
        }),
      });
      const assignRes = await reservationAssignPost(assignReq, { params: Promise.resolve({ id: overlapResId }) });
      expect(assignRes.status).toBe(422);
      const assignJson = await assignRes.json();
      expect(assignJson.error.message).toMatch(/conflict|already has a conflicting/i);
    });

    it("allows reassigning a reservation to another eligible table", async () => {
      // Reassign bookedResId from tableA1 to tableA3 (capacity 6)
      const reassignReq = new NextRequest(`http://localhost/api/v1/restaurant/reservations/${bookedResId}/assign`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          tableId: tableA3Id,
        }),
      });
      const reassignRes = await reservationAssignPost(reassignReq, { params: Promise.resolve({ id: bookedResId }) });
      const reassignJson = await reassignRes.json();

      expect(reassignRes.status).toBe(200);
      expect(reassignJson.data.assignedTableId).toBe(tableA3Id);
      expect(reassignJson.data.tableNumber).toBe("R35-T3");
    });
  });

  describe("3. SEATING TRANSITIONS — Reservation to Active Dining Session", () => {
    let seatingReservationId: string;
    const seatIdempKey = `seat-res-frank-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    beforeAll(async () => {
      const req = new NextRequest("http://localhost/api/v1/restaurant/reservations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          customerName: "Frank Sinatra",
          customerPhone: "+1555019006",
          partySize: 2,
          reservationDate: "2026-10-21",
          reservationTime: "20:00",
          assignedTableId: tableA2Id,
        }),
      });
      const res = await reservationsPost(req);
      const json = await res.json();
      seatingReservationId = json.data.reservationId;
    });

    it("seats reservation atomically: transitions to SEATED, creates restaurant_table_session, marks table OCCUPIED", async () => {
      const seatReq = new NextRequest(`http://localhost/api/v1/restaurant/reservations/${seatingReservationId}/seat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffTokenA}`,
          "Content-Type": "application/json",
          "idempotency-key": seatIdempKey,
        },
        body: JSON.stringify({
          outletId: outletIdA,
        }),
      });

      const seatRes = await reservationSeatPost(seatReq, { params: Promise.resolve({ id: seatingReservationId }) });
      const seatJson = await seatRes.json();

      expect(seatRes.status).toBe(200);
      expect(seatJson.success).toBe(true);
      expect(seatJson.data.reservation.status).toBe("SEATED");
      expect(seatJson.data.session).toBeDefined();
      expect(seatJson.data.session.customerName).toBe("Frank Sinatra");
      expect(seatJson.data.session.customerPhone).toBe("+1555019006");
      expect(seatJson.data.table.status).toBe("OCCUPIED");

      // Verify DB table state directly
      const db = getDb();
      const [tableRow] = await db
        .select()
        .from(restaurantTables)
        .where(eq(restaurantTables.tableId, tableA2Id));
      expect(tableRow.status).toBe("OCCUPIED");

      // Verify active session exists
      const [sessionRow] = await db
        .select()
        .from(restaurantTableSessions)
        .where(eq(restaurantTableSessions.sessionId, seatJson.data.session.sessionId));
      expect(sessionRow.status).toBe("ACTIVE");
      expect(sessionRow.tableId).toBe(tableA2Id);
    });

    it("safely handles duplicate seating replay via idempotency", async () => {
      const replayReq = new NextRequest(`http://localhost/api/v1/restaurant/reservations/${seatingReservationId}/seat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffTokenA}`,
          "Content-Type": "application/json",
          "idempotency-key": seatIdempKey,
        },
        body: JSON.stringify({
          outletId: outletIdA,
        }),
      });

      const replayRes = await reservationSeatPost(replayReq, { params: Promise.resolve({ id: seatingReservationId }) });
      const replayJson = await replayRes.json();

      expect(replayRes.status).toBe(200);
      expect(replayJson.data.reservation.status).toBe("SEATED");
    });

    it("prevents seating another party on the now OCCUPIED table", async () => {
      // Create new reservation on tableA2
      const newResReq = new NextRequest("http://localhost/api/v1/restaurant/reservations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          customerName: "George Conflict",
          customerPhone: "+1555019007",
          partySize: 2,
          reservationDate: "2026-10-21",
          reservationTime: "20:30",
        }),
      });
      const newResRes = await reservationsPost(newResReq);
      const { data } = await newResRes.json();
      const conflictResId = data.reservationId;

      // Attempt to seat on tableA2 (currently occupied)
      const seatConflictReq = new NextRequest(`http://localhost/api/v1/restaurant/reservations/${conflictResId}/seat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          tableId: tableA2Id,
        }),
      });
      const seatConflictRes = await reservationSeatPost(seatConflictReq, { params: Promise.resolve({ id: conflictResId }) });
      expect(seatConflictRes.status).toBe(422);
      const json = await seatConflictRes.json();
      expect(json.error.message).toMatch(/already has an active/i);
    });
  });

  describe("4. WAITLIST DOMAIN — Queue Ordering, Status Changes, and Seating", () => {
    let waitlist1Id: string;
    let waitlist2Id: string;
    let waitlist3Id: string;

    it("adds walk-in parties to waitlist with deterministic server-assigned queue positions", async () => {
      // Entry 1
      const req1 = new NextRequest("http://localhost/api/v1/restaurant/waitlist", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          customerName: "Hannah Walkin",
          customerPhone: "+1555019011",
          partySize: 4,
          estimatedWaitMinutes: 20,
        }),
      });
      const res1 = await waitlistPost(req1);
      const json1 = await res1.json();

      expect(res1.status).toBe(201);
      expect(json1.data.status).toBe("WAITING");
      expect(json1.data.queuePosition).toBe(1);
      waitlist1Id = json1.data.waitlistId;

      // Entry 2
      const req2 = new NextRequest("http://localhost/api/v1/restaurant/waitlist", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          customerName: "Ian Walkin",
          customerPhone: "+1555019012",
          partySize: 2,
          estimatedWaitMinutes: 30,
        }),
      });
      const res2 = await waitlistPost(req2);
      const json2 = await res2.json();

      expect(res2.status).toBe(201);
      expect(json2.data.queuePosition).toBe(2);
      waitlist2Id = json2.data.waitlistId;

      // Entry 3
      const req3 = new NextRequest("http://localhost/api/v1/restaurant/waitlist", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          customerName: "Jack Walkin",
          customerPhone: "+1555019013",
          partySize: 6,
          estimatedWaitMinutes: 45,
        }),
      });
      const res3 = await waitlistPost(req3);
      const json3 = await res3.json();

      expect(res3.status).toBe(201);
      expect(json3.data.queuePosition).toBe(3);
      waitlist3Id = json3.data.waitlistId;
    });

    it("verifies server-authoritative queue ordering in list API", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/waitlist?outletId=${outletIdA}&status=WAITING`, {
        headers: { Authorization: `Bearer ${staffTokenA}` },
      });
      const res = await waitlistGet(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      const activeEntries = json.data;
      expect(activeEntries.length).toBeGreaterThanOrEqual(3);

      const pos1 = activeEntries.find((e: any) => e.waitlistId === waitlist1Id);
      const pos2 = activeEntries.find((e: any) => e.waitlistId === waitlist2Id);
      const pos3 = activeEntries.find((e: any) => e.waitlistId === waitlist3Id);

      expect(pos1.queuePosition).toBe(1);
      expect(pos2.queuePosition).toBe(2);
      expect(pos3.queuePosition).toBe(3);
    });

    it("transitions waitlist status from WAITING to CALLED", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/waitlist/${waitlist1Id}/status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          status: "CALLED",
          notes: "SMS notification sent to guest phone",
        }),
      });
      const res = await waitlistStatusPost(req, { params: Promise.resolve({ id: waitlist1Id }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.status).toBe("CALLED");
      expect(json.data.calledAt).toBeDefined();
    });

    it("seats waitlist party to an available table, marks table OCCUPIED, and reindexes active queue positions", async () => {
      // Seat waitlist1Id (Hannah Walkin, party 4) at tableA1Id (capacity 4, currently available)
      const seatReq = new NextRequest(`http://localhost/api/v1/restaurant/waitlist/${waitlist1Id}/seat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          tableId: tableA1Id,
        }),
      });

      const seatRes = await waitlistSeatPost(seatReq, { params: Promise.resolve({ id: waitlist1Id }) });
      const seatJson = await seatRes.json();

      expect(seatRes.status).toBe(200);
      expect(seatJson.data.waitlist.status).toBe("SEATED");
      expect(seatJson.data.session).toBeDefined();
      expect(seatJson.data.session.customerName).toBe("Hannah Walkin");
      expect(seatJson.data.table.status).toBe("OCCUPIED");

      // Verify that remaining entries were reindexed:
      // waitlist2Id should now be position 1
      // waitlist3Id should now be position 2
      const listReq = new NextRequest(`http://localhost/api/v1/restaurant/waitlist?outletId=${outletIdA}&status=WAITING`, {
        headers: { Authorization: `Bearer ${staffTokenA}` },
      });
      const listRes = await waitlistGet(listReq);
      const listJson = await listRes.json();

      const newPos2 = listJson.data.find((e: any) => e.waitlistId === waitlist2Id);
      const newPos3 = listJson.data.find((e: any) => e.waitlistId === waitlist3Id);

      expect(newPos2.queuePosition).toBe(1);
      expect(newPos3.queuePosition).toBe(2);
    });

    it("cancels a waitlist entry and reindexes remaining entries", async () => {
      const cancelReq = new NextRequest(`http://localhost/api/v1/restaurant/waitlist/${waitlist2Id}/status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          status: "CANCELLED",
          reason: "Guest decided to leave",
        }),
      });

      const cancelRes = await waitlistStatusPost(cancelReq, { params: Promise.resolve({ id: waitlist2Id }) });
      expect(cancelRes.status).toBe(200);

      // Now waitlist3Id should be position 1
      const listReq = new NextRequest(`http://localhost/api/v1/restaurant/waitlist?outletId=${outletIdA}&status=WAITING`, {
        headers: { Authorization: `Bearer ${staffTokenA}` },
      });
      const listRes = await waitlistGet(listReq);
      const listJson = await listRes.json();

      const newPos3 = listJson.data.find((e: any) => e.waitlistId === waitlist3Id);
      expect(newPos3.queuePosition).toBe(1);
    });
  });

  describe("5. MULTI-TENANCY, RLS & SECURITY (RBAC)", () => {
    let tenantBReservationId: string;

    beforeAll(async () => {
      // Create reservation in Tenant B
      const req = new NextRequest("http://localhost/api/v1/restaurant/reservations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managerTokenB}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdB,
          customerName: "Tenant B Guest",
          customerPhone: "+1555019099",
          partySize: 2,
          reservationDate: "2026-10-25",
          reservationTime: "19:00",
        }),
      });
      const res = await reservationsPost(req);
      const json = await res.json();
      expect(res.status).toBe(201);
      tenantBReservationId = json.data.reservationId;
    });

    it("prevents Tenant A staff from reading Tenant B reservation (Tenant Isolation)", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/reservations/${tenantBReservationId}?outletId=${outletIdA}`, {
        headers: { Authorization: `Bearer ${staffTokenA}` },
      });
      const res = await reservationDetailGet(req, { params: Promise.resolve({ id: tenantBReservationId }) });
      expect(res.status).toBe(404);
    });

    it("prevents Tenant A staff from mutating Tenant B reservation", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/reservations/${tenantBReservationId}/status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${staffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          status: "CANCELLED",
        }),
      });
      const res = await reservationStatusPost(req, { params: Promise.resolve({ id: tenantBReservationId }) });
      expect(res.status).toBe(404);
    });

    it("denies unprivileged guest token from accessing staff reservation endpoints (RBAC)", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/reservations?outletId=${outletIdA}`, {
        headers: { Authorization: `Bearer ${guestTokenA}` },
      });
      const res = await reservationsGet(req);
      expect(res.status).toBe(403);
    });

    it("denies Hotel Admin without restaurant permissions from mutating restaurant waitlist", async () => {
      const req = new NextRequest("http://localhost/api/v1/restaurant/waitlist", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          customerName: "Cross Module Walkin",
          customerPhone: "+1555019055",
          partySize: 2,
        }),
      });
      const res = await waitlistPost(req);
      expect(res.status).toBe(403);
    });
  });

  describe("6. QR INTEGRITY & IDEMPOTENCY REGRESSION", () => {
    it("ensures existing high-entropy QR tokens remain completely unaffected", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/tables/${tableA1Id}/qr?outletId=${outletIdA}`, {
        headers: { Authorization: `Bearer ${managerTokenA}` },
      });
      const res = await tableQrGet(req, { params: Promise.resolve({ id: tableA1Id }) });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.tokenId).toBeDefined();
      expect(json.data.opaqueToken).toBeDefined();
      expect(json.data.opaqueToken.length).toBeGreaterThanOrEqual(32);
    });

    it("deduplicates reservation creation when submitted with identical idempotency key", async () => {
      const idempKey = `res-idemp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const reqPayload = {
        outletId: outletIdA,
        customerName: "Idempotent Guest",
        customerPhone: "+1555019088",
        partySize: 2,
        reservationDate: "2026-10-28",
        reservationTime: "19:00",
      };

      const req1 = new NextRequest("http://localhost/api/v1/restaurant/reservations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managerTokenA}`,
          "Content-Type": "application/json",
          "idempotency-key": idempKey,
        },
        body: JSON.stringify(reqPayload),
      });

      const res1 = await reservationsPost(req1);
      const json1 = await res1.json();
      expect(res1.status).toBe(201);
      const firstResId = json1.data.reservationId;

      const req2 = new NextRequest("http://localhost/api/v1/restaurant/reservations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managerTokenA}`,
          "Content-Type": "application/json",
          "idempotency-key": idempKey,
        },
        body: JSON.stringify(reqPayload),
      });

      const res2 = await reservationsPost(req2);
      const json2 = await res2.json();
      expect(res2.status).toBe(201);
      expect(json2.data.reservationId).toBe(firstResId);
    });
  });
});
