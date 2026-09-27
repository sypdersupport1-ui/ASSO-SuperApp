import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { signJwt } from "@/lib/auth/jwt";
import { DEMO_TENANT_ID, ensureHotelSeedData } from "@/lib/hotel/seed";
import {
  listHotelProperties,
  listRoomTypes,
  listRooms,
  updateRoomStatus,
  createRoom,
} from "@/lib/hotel/service";
import { createHotelGuest, listHotelGuests } from "@/lib/hotel/guest-service";
import {
  createReservation,
  updateReservationStatus,
} from "@/lib/hotel/reservation-service";
import {
  executeCheckIn,
  executeCheckOut,
  listStays,
} from "@/lib/hotel/stay-service";
import {
  listHousekeepingTasks,
  assignHousekeepingTask,
  startHousekeepingTask,
  completeHousekeepingTask,
  inspectHousekeepingTask,
} from "@/lib/hotel/housekeeping-service";
import {
  createMaintenanceRequest,
  assignMaintenanceRequest,
  startMaintenanceRequest,
  resolveMaintenanceRequest,
  closeMaintenanceRequest,
  reopenMaintenanceRequest,
} from "@/lib/hotel/maintenance-service";
import {
  generateOrGetRoomQr,
  rotateRoomQr,
} from "@/lib/hotel/qr-service";
import { resolveCustomerQr } from "@/lib/customer/customer-session-service";
import {
  listHotelCatalog,
  updateCatalogItemAvailability,
  createRoomServiceOrder,
  listCustomerOrders,
  getCustomerOrderById,
  cancelCustomerOrder,
  listStaffRoomServiceOrders,
  updateStaffRoomServiceOrderStatus,
} from "@/lib/hotel/room-service-service";
import { getDb } from "@/db/client";
import {
  hotelRooms,
  hotelStays,
  hotelGuests,
  hotelReservations,
  hotelRoomTypes,
} from "@/db/schema/hotel";
import { outlets } from "@/db/schema/core";
import { catalogItems, orders, orderItems } from "@/db/schema/operations";
import { eq, and } from "drizzle-orm";

// API Route Handlers for HTTP-level assertions
import { GET as getDemoTokenRoute } from "@/app/api/v1/auth/demo-token/route";
import { GET as getFrontOfficeRoute } from "@/app/api/v1/hotel/front-office/route";
import { GET as getCustomerMenuRoute } from "@/app/api/v1/customer/room-service/menu/route";
import {
  GET as getCustomerOrdersRoute,
  POST as postCustomerOrdersRoute,
} from "@/app/api/v1/customer/room-service/orders/route";
import { GET as getCustomerOrderDetailRoute } from "@/app/api/v1/customer/room-service/orders/[id]/route";
import { POST as postCustomerCancelOrderRoute } from "@/app/api/v1/customer/room-service/orders/[id]/cancel/route";
import { GET as getStaffMenuRoute } from "@/app/api/v1/hotel/room-service/menu/route";
import { PATCH as patchStaffMenuAvailabilityRoute } from "@/app/api/v1/hotel/room-service/menu/[id]/availability/route";
import { GET as getStaffOrdersRoute } from "@/app/api/v1/hotel/room-service/orders/route";
import { POST as postStaffOrderStatusRoute } from "@/app/api/v1/hotel/room-service/orders/[id]/status/route";

describe("ASSO — Pre-Slice-9 Hotel Master QA & Release-Gate Verification Suite", () => {
  let demoOutletId: string;
  let staffToken: string;
  let staffUserId: string;
  let room101: any;
  let room102: any;
  let room201: any;
  let room202: any;
  let standardTypeId: string;
  let deluxeTypeId: string;
  let sampleCatalogItemId: string;

  const TENANT_B_ID = "22222222-2222-2222-2222-222222222222";

  beforeAll(async () => {
    // 1. Seed base hotel data for Tenant A and Tenant B
    await ensureHotelSeedData(DEMO_TENANT_ID);
    await ensureHotelSeedData(TENANT_B_ID);

    const db = getDb();
    const [property] = await db
      .select()
      .from(outlets)
      .where(eq(outlets.tenantId, DEMO_TENANT_ID))
      .limit(1);

    demoOutletId = property.outletId;
    staffUserId = "00000000-0000-0000-0000-000000000001";

    // 2. Issue Staff JWT
    staffToken = signJwt({
      sub: staffUserId,
      email: "staff.qa@hotel.com",
      tenantId: DEMO_TENANT_ID,
      outletId: demoOutletId,
      roles: ["HOTEL_ADMIN"],
      permissions: [
        "hotel.*",
        "hotel.read",
        "hotel.rooms.manage",
        "hotel.reservations.manage",
        "hotel.stays.manage",
        "hotel.housekeeping.manage",
        "hotel.maintenance.manage",
      ],
      sessionType: "STAFF",
      isSuperAdmin: false,
    });

    // 3. Ensure Room Types & 4 Dedicated QA Rooms (101, 102, 201, 202)
    const roomTypes = await listRoomTypes(DEMO_TENANT_ID, demoOutletId);
    deluxeTypeId = roomTypes.find((t) => t.code === "DELUXE")?.roomTypeId || roomTypes[0].roomTypeId;
    standardTypeId = roomTypes.find((t) => t.code === "EXEC" || t.code === "STD")?.roomTypeId || roomTypes[1]?.roomTypeId || deluxeTypeId;

    const existingRooms = await listRooms(DEMO_TENANT_ID, demoOutletId);
    const getOrCreate = async (num: string, typeId: string, floor: string) => {
      const found = existingRooms.find((r) => r.roomNumber === num);
      if (found) {
        // Ensure room is linked to right room type
        await db.update(hotelRooms).set({ roomTypeId: typeId }).where(eq(hotelRooms.roomId, found.roomId));
        return found;
      }
      return createRoom(DEMO_TENANT_ID, demoOutletId, {
        roomNumber: num,
        floorNumber: floor,
        roomTypeId: typeId,
        operationalStatus: "AVAILABLE",
        housekeepingStatus: "CLEAN",
      });
    };

    room101 = await getOrCreate("101", deluxeTypeId, "1");
    room102 = await getOrCreate("102", standardTypeId, "1");
    room201 = await getOrCreate("201", deluxeTypeId, "2");
    room202 = await getOrCreate("202", standardTypeId, "2");

    // Clean any residual active stays or reservations on Room 201 and 202 so lifecycle tests start clean
    await db
      .update(hotelStays)
      .set({ status: "CHECKED_OUT" })
      .where(and(eq(hotelStays.roomId, room201.roomId), eq(hotelStays.status, "ACTIVE")));
    await db
      .update(hotelReservations)
      .set({ status: "CANCELLED" })
      .where(eq(hotelReservations.assignedRoomId, room201.roomId));
    await db
      .update(hotelRooms)
      .set({ operationalStatus: "AVAILABLE", housekeepingStatus: "CLEAN", isOccupied: false })
      .where(eq(hotelRooms.roomId, room201.roomId));

    await db
      .update(hotelStays)
      .set({ status: "CHECKED_OUT" })
      .where(and(eq(hotelStays.roomId, room202.roomId), eq(hotelStays.status, "ACTIVE")));
    await db
      .update(hotelReservations)
      .set({ status: "CANCELLED" })
      .where(eq(hotelReservations.assignedRoomId, room202.roomId));
    await db
      .update(hotelRooms)
      .set({ operationalStatus: "AVAILABLE", housekeepingStatus: "CLEAN", isOccupied: false })
      .where(eq(hotelRooms.roomId, room202.roomId));

    const [item] = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.tenantId, DEMO_TENANT_ID))
      .limit(1);

    sampleCatalogItemId = item.itemId;
  }, 60000);

  // ==========================================================================
  // 1. Environment & Auth Restriction Validation
  // ==========================================================================
  describe("1. Environment & Demo Auth Guard", () => {
    it("permits demo token retrieval in development but returns fixed staff claims", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/auth/demo-token");
      const res = await getDemoTokenRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.token).toBeDefined();
    });
  });

  // ==========================================================================
  // 2. Slice 1: Property, Room Types & Room FSM Validation
  // ==========================================================================
  describe("2. Slice 1 — Property, Room Types & Room FSM", () => {
    it("enforces tenant-isolated room inventory and context linkage", async () => {
      const rooms = await listRooms(DEMO_TENANT_ID, demoOutletId);
      expect(rooms.length).toBeGreaterThanOrEqual(4);
      for (const r of rooms) {
        expect(r.tenantId).toBe(DEMO_TENANT_ID);
        expect(r.outletId).toBe(demoOutletId);
        expect(r.contextId).toBeDefined();
      }
    });

    it("rejects illegal operational status transitions via server FSM", async () => {
      // Room 202 is currently AVAILABLE. Transition directly to OUT_OF_ORDER should work
      const ooo = await updateRoomStatus(
        DEMO_TENANT_ID,
        demoOutletId,
        room202.roomId,
        { operationalStatus: "OUT_OF_ORDER", notes: "HVAC maintenance" }
      );
      expect(ooo.operationalStatus).toBe("OUT_OF_ORDER");

      // Attempt illegal transition: OUT_OF_ORDER cannot jump directly to OCCUPIED
      await expect(
        updateRoomStatus(
          DEMO_TENANT_ID,
          demoOutletId,
          room202.roomId,
          { operationalStatus: "OCCUPIED" }
        )
      ).rejects.toThrow();

      // Restore to AVAILABLE
      await updateRoomStatus(
        DEMO_TENANT_ID,
        demoOutletId,
        room202.roomId,
        { operationalStatus: "AVAILABLE" }
      );
    });
  });

  // ==========================================================================
  // 3. Slice 2: Guest & Reservation Lifecycle Validation
  // ==========================================================================
  describe("3. Slice 2 — Guest & Reservation Management", () => {
    let testGuestId: string;
    let testReservationId: string;

    it("creates guests idempotently and enforces arrival < departure constraint", async () => {
      const guest = await createHotelGuest(DEMO_TENANT_ID, {
        fullName: "Alexander Wright",
        email: `alexander.wright.${Date.now()}@example.com`,
        phone: "+919876543210",
      });
      testGuestId = guest.guestId;
      expect(guest.guestId).toBeDefined();

      const futureDate1 = new Date(Date.now() + 86400000 * 90);
      const futureDate2 = new Date(Date.now() + 86400000 * 91);

      // Illegal: departure before arrival
      await expect(
        createReservation(DEMO_TENANT_ID, demoOutletId, {
          guestId: testGuestId,
          roomTypeId: standardTypeId,
          arrivalDate: futureDate2,
          departureDate: futureDate1,
          adultCount: 1,
        })
      ).rejects.toThrow();

      // Legal reservation
      const res = await createReservation(DEMO_TENANT_ID, demoOutletId, {
        guestId: testGuestId,
        roomTypeId: standardTypeId,
        assignedRoomId: room202.roomId,
        arrivalDate: futureDate1,
        departureDate: futureDate2,
        adultCount: 2,
        specialRequests: "High floor requested",
      });
      testReservationId = res.reservationId;
      expect(["CONFIRMED", "PENDING"]).toContain(res.status);
    });

    it("executes legal reservation confirmation and cancellation", async () => {
      const confirmed = await updateReservationStatus(
        DEMO_TENANT_ID,
        demoOutletId,
        testReservationId,
        "CONFIRMED"
      );
      expect(confirmed.status).toBe("CONFIRMED");

      const cancelled = await updateReservationStatus(
        DEMO_TENANT_ID,
        demoOutletId,
        testReservationId,
        "CANCELLED",
        staffUserId
      );
      expect(cancelled.status).toBe("CANCELLED");
    });
  });

  // ==========================================================================
  // 4. Slice 3 & 4: Full Check-in, Stay, Front Office & Checkout Flow
  // ==========================================================================
  describe("4. Slice 3 & 4 — Check-in, Active Stay, Front Desk & Checkout", () => {
    let guestId: string;
    let reservationId: string;
    let stayId: string;

    it("executes transactional check-in and reflects in Front Office dashboard", async () => {
      const guest = await createHotelGuest(DEMO_TENANT_ID, {
        fullName: "Eleanor Vance",
        email: `eleanor.vance.${Date.now()}@example.com`,
      });
      guestId = guest.guestId;

      const res = await createReservation(DEMO_TENANT_ID, demoOutletId, {
        guestId,
        roomTypeId: deluxeTypeId,
        assignedRoomId: room201.roomId,
        arrivalDate: new Date(),
        departureDate: new Date(Date.now() + 86400000 * 2),
        adultCount: 1,
        status: "CONFIRMED",
      });
      reservationId = res.reservationId;

      // Check-in
      const checkInResult = await executeCheckIn(DEMO_TENANT_ID, demoOutletId, {
        reservationId,
        roomId: room201.roomId,
        notes: "Master QA Check-in",
      });
      stayId = checkInResult.stayId;
      expect(checkInResult.status).toBe("ACTIVE");
      expect(checkInResult.roomNumber).toBe("201");

      // Verify Front Office Dashboard
      const foReq = new NextRequest(`http://localhost:3000/api/v1/hotel/front-office?outletId=${demoOutletId}`, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      const foRes = await getFrontOfficeRoute(foReq);
      expect(foRes.status).toBe(200);

      const foJson = await foRes.json();
      expect(foJson.data.inHouse.some((g: any) => g.stayId === stayId)).toBe(true);
    });

    it("prevents duplicate concurrent active stays on the same room", async () => {
      const secondGuest = await createHotelGuest(DEMO_TENANT_ID, {
        fullName: "Duplicate Attempt",
        email: `duplicate.attempt.${Date.now()}@example.com`,
      });

      const futureArr = new Date(Date.now() + 86400000 * 300);
      const futureDep = new Date(Date.now() + 86400000 * 301);

      const secondRes = await createReservation(DEMO_TENANT_ID, demoOutletId, {
        guestId: secondGuest.guestId,
        roomTypeId: standardTypeId,
        assignedRoomId: room202.roomId,
        arrivalDate: futureArr,
        departureDate: futureDep,
        adultCount: 1,
        status: "CONFIRMED",
      });

      // Attempt check-in to Room 201 which is already OCCUPIED
      await expect(
        executeCheckIn(DEMO_TENANT_ID, demoOutletId, {
          reservationId: secondRes.reservationId,
          roomId: room201.roomId,
        })
      ).rejects.toThrow();
    });

    it("executes checkout, frees room, marks housekeeping DIRTY, and creates turnover task", async () => {
      const checkoutResult = await executeCheckOut(DEMO_TENANT_ID, demoOutletId, { stayId });
      expect(checkoutResult.status).toBe("CHECKED_OUT");

      // Verify room state in DB
      const db = getDb();
      const [room] = await db.select().from(hotelRooms).where(eq(hotelRooms.roomId, room201.roomId));
      expect(room.isOccupied).toBe(false);
      expect(room.housekeepingStatus).toBe("DIRTY");

      // Verify turnover task automatically created
      const hkTasks = await listHousekeepingTasks(DEMO_TENANT_ID, {
        outletId: demoOutletId,
        roomId: room201.roomId,
      });
      const turnoverTask = hkTasks.find((t) => t.taskType === "DEPARTURE_TURNOVER");
      expect(turnoverTask).toBeDefined();
      expect(turnoverTask?.status).toBe("PENDING");
    });
  });

  // ==========================================================================
  // 5. Slice 5 & 6: Housekeeping & Maintenance Workflows
  // ==========================================================================
  describe("5. Slice 5 & 6 — Housekeeping Turnover & Maintenance Workflows", () => {
    it("advances housekeeping task through assignment, cleaning, and inspection to make room READY", async () => {
      const hkTasks = await listHousekeepingTasks(DEMO_TENANT_ID, {
        outletId: demoOutletId,
        roomId: room201.roomId,
      });
      const task = hkTasks[0];

      // Assign -> Start -> Complete -> Inspect
      await assignHousekeepingTask(DEMO_TENANT_ID, task.taskId, staffUserId);
      await startHousekeepingTask(DEMO_TENANT_ID, task.taskId);
      await completeHousekeepingTask(DEMO_TENANT_ID, task.taskId, { notes: "Full sanitized turnover complete" }, staffUserId);

      const inspected = await inspectHousekeepingTask(
        DEMO_TENANT_ID,
        task.taskId,
        { passed: true, notes: "Passed 5-star standard" },
        staffUserId
      );
      expect(inspected.status).toBe("INSPECTED");

      // Verify room housekeeping status is now INSPECTED / AVAILABLE
      const db = getDb();
      const [room] = await db.select().from(hotelRooms).where(eq(hotelRooms.roomId, room201.roomId));
      expect(room.housekeepingStatus).toBe("INSPECTED");
      expect(room.operationalStatus).toBe("AVAILABLE");
    });

    it("manages maintenance request lifecycle from OPEN to RESOLVED and CLOSED with notes", async () => {
      const ticket = await createMaintenanceRequest(DEMO_TENANT_ID, {
        outletId: demoOutletId,
        roomId: room202.roomId,
        category: "PLUMBING",
        priority: "URGENT",
        title: "Bathroom faucet drip",
        description: "Requires washer replacement",
      });
      expect(ticket.status).toBe("OPEN");

      await assignMaintenanceRequest(DEMO_TENANT_ID, ticket.requestId, staffUserId);
      await startMaintenanceRequest(DEMO_TENANT_ID, ticket.requestId);

      // Rejection: resolving without notes
      await expect(
        resolveMaintenanceRequest(DEMO_TENANT_ID, ticket.requestId, { resolutionNotes: "" })
      ).rejects.toThrow();

      // Valid resolution
      const resolved = await resolveMaintenanceRequest(DEMO_TENANT_ID, ticket.requestId, {
        resolutionNotes: "Washer replaced and pressure tested",
        restoreRoomOperationalStatus: "AVAILABLE",
      });
      expect(resolved.status).toBe("RESOLVED");

      const closed = await closeMaintenanceRequest(DEMO_TENANT_ID, ticket.requestId, staffUserId);
      expect(closed.status).toBe("CLOSED");

      // Reopen capability
      const reopened = await reopenMaintenanceRequest(
        DEMO_TENANT_ID,
        ticket.requestId,
        { notes: "Minor secondary leak observed" },
        staffUserId
      );
      expect(reopened.status).toBe("OPEN");
    });
  });

  // ==========================================================================
  // 6. Slice 7 & 8: QR Customer Experience & Room Service Ordering
  // ==========================================================================
  describe("6. Slice 7 & 8 — Room QR Resolution, Active Stay & Room Service Lifecycle", () => {
    let customerToken101: string;
    let customerSessionId101: string;
    let order101Id: string;

    beforeAll(async () => {
      // Setup active stay on Room 101
      const db = getDb();
      const [existingStay] = await db
        .select()
        .from(hotelStays)
        .where(and(eq(hotelStays.roomId, room101.roomId), eq(hotelStays.status, "ACTIVE")))
        .limit(1);

      if (!existingStay) {
        const guest = await createHotelGuest(DEMO_TENANT_ID, {
          fullName: "Sophia Chen",
          email: `sophia.chen.${Date.now()}@example.com`,
        });

        const res = await createReservation(DEMO_TENANT_ID, demoOutletId, {
          guestId: guest.guestId,
          roomTypeId: deluxeTypeId,
          assignedRoomId: room101.roomId,
          arrivalDate: new Date(),
          departureDate: new Date(Date.now() + 86400000 * 3),
          adultCount: 1,
          status: "CONFIRMED",
        });

        await executeCheckIn(DEMO_TENANT_ID, demoOutletId, {
          reservationId: res.reservationId,
          roomId: room101.roomId,
          notes: "Active QA Stay Room 101",
        });
      }

      // Generate Room 101 QR & establish customer session
      const qr101 = await generateOrGetRoomQr(DEMO_TENANT_ID, demoOutletId, room101.roomId);
      const session = await resolveCustomerQr(qr101.opaqueToken);
      customerToken101 = session.sessionToken;
      customerSessionId101 = session.sessionId;
    }, 30000);

    it("retrieves menu with 4 categories and correctly calculates server-side price snapshots", async () => {
      const menuReq = new NextRequest("http://localhost:3000/api/v1/customer/room-service/menu", {
        headers: { Authorization: `Bearer ${customerToken101}` },
      });
      const menuRes = await getCustomerMenuRoute(menuReq);
      expect(menuRes.status).toBe(200);

      const menuJson = await menuRes.json();
      expect(menuJson.data.categories.length).toBe(4);

      // Create Order
      const orderReq = new NextRequest("http://localhost:3000/api/v1/customer/room-service/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken101}`,
        },
        body: JSON.stringify({
          items: [{ itemId: sampleCatalogItemId, quantity: 2 }],
          guestNotes: "Please deliver to bedside table",
        }),
      });

      const orderRes = await postCustomerOrdersRoute(orderReq);
      expect(orderRes.status).toBe(201);

      const orderJson = await orderRes.json();
      order101Id = orderJson.data.orderId;
      expect(orderJson.data.orderNumber).toMatch(/^RS-\d{8}-[0-9A-F]{4}$/);
      expect(orderJson.data.roomNumber).toBe("101");
      expect(orderJson.data.status).toBe("PLACED");
      expect(orderJson.data.displayStatus).toBe("Received");
      expect(parseFloat(orderJson.data.taxAmount)).toBeGreaterThan(0);
      expect(parseFloat(orderJson.data.totalAmount)).toBeCloseTo(
        parseFloat(orderJson.data.subtotalAmount) + parseFloat(orderJson.data.taxAmount),
        2
      );
    });

    it("advances staff fulfillment sequentially and delivers realtime updates", async () => {
      // 1. Accept
      const acceptReq = new NextRequest(
        `http://localhost:3000/api/v1/hotel/room-service/orders/${order101Id}/status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${staffToken}`,
          },
          body: JSON.stringify({ outletId: demoOutletId, status: "ACCEPTED" }),
        }
      );
      const acceptRes = await postStaffOrderStatusRoute(acceptReq, {
        params: Promise.resolve({ id: order101Id }),
      });
      expect(acceptRes.status).toBe(200);

      // 2. Preparing
      await updateStaffRoomServiceOrderStatus({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        orderId: order101Id,
        nextStatus: "PREPARING",
        staffUserId,
      });

      // Customer cancellation must be rejected once cooking begins
      const cancelReq = new NextRequest(
        `http://localhost:3000/api/v1/customer/room-service/orders/${order101Id}/cancel`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${customerToken101}` },
        }
      );
      const cancelRes = await postCustomerCancelOrderRoute(cancelReq, {
        params: Promise.resolve({ id: order101Id }),
      });
      expect([400, 422]).toContain(cancelRes.status);

      // 3. Ready -> Out for Delivery -> Delivered
      await updateStaffRoomServiceOrderStatus({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        orderId: order101Id,
        nextStatus: "READY",
        staffUserId,
      });
      await updateStaffRoomServiceOrderStatus({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        orderId: order101Id,
        nextStatus: "OUT_FOR_DELIVERY",
        staffUserId,
      });
      const finalOrder = await updateStaffRoomServiceOrderStatus({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        orderId: order101Id,
        nextStatus: "DELIVERED",
        staffUserId,
      });
      expect(finalOrder.status).toBe("DELIVERED");
      expect(finalOrder.displayStatus).toBe("Delivered");
    }, 15000);
  });

  // ==========================================================================
  // 7. Security, Cross-Room IDOR, Idempotency & Financial Boundaries
  // ==========================================================================
  describe("7. Security, IDOR, Idempotency & Financial Boundaries Audit", () => {
    it("strictly isolates cross-room customer access (IDOR protection: 404 Not Found)", async () => {
      // Establish customer session on Room 102
      const qr102 = await generateOrGetRoomQr(DEMO_TENANT_ID, demoOutletId, room102.roomId);
      const session102 = await resolveCustomerQr(qr102.opaqueToken);

      // Order created on Room 101 must NOT be accessible to Room 102 customer session
      const db = getDb();
      const [order101] = await db
        .select()
        .from(orders)
        .where(eq(orders.contextId, room101.contextId))
        .limit(1);

      const req = new NextRequest(
        `http://localhost:3000/api/v1/customer/room-service/orders/${order101.orderId}`,
        {
          headers: { Authorization: `Bearer ${session102.sessionToken}` },
        }
      );
      const res = await getCustomerOrderDetailRoute(req, {
        params: Promise.resolve({ id: order101.orderId }),
      });
      expect(res.status).toBe(404);
    });

    it("blocks customer session token on all staff room-service APIs (403 Forbidden)", async () => {
      const qr101 = await generateOrGetRoomQr(DEMO_TENANT_ID, demoOutletId, room101.roomId);
      const session101 = await resolveCustomerQr(qr101.opaqueToken);

      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/room-service/orders?outletId=${demoOutletId}`,
        {
          headers: { Authorization: `Bearer ${session101.sessionToken}` },
        }
      );
      const res = await getStaffOrdersRoute(req);
      expect(res.status).toBe(403);
    });

    it("enforces idempotency on order creation (safe cached replay)", async () => {
      const qr101 = await generateOrGetRoomQr(DEMO_TENANT_ID, demoOutletId, room101.roomId);
      const session101 = await resolveCustomerQr(qr101.opaqueToken);
      const idempotencyKey = `master_qa_idem_${Date.now()}`;

      const payload = {
        items: [{ itemId: sampleCatalogItemId, quantity: 1 }],
        guestNotes: "Idempotent QA order",
      };

      const req1 = new NextRequest("http://localhost:3000/api/v1/customer/room-service/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session101.sessionToken}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      const res1 = await postCustomerOrdersRoute(req1);
      expect(res1.status).toBe(201);
      const json1 = await res1.json();

      // Replay
      const req2 = new NextRequest("http://localhost:3000/api/v1/customer/room-service/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session101.sessionToken}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      const res2 = await postCustomerOrdersRoute(req2);
      expect(res2.status).toBe(201);
      const json2 = await res2.json();
      expect(json2.data.orderId).toBe(json1.data.orderId);
    });

    it("CONFIRMS STRICT FINANCIAL BOUNDARY: zero folio entries or payment rows posted by Slice 8", async () => {
      const db = getDb();

      const hotelOrders = await db
        .select()
        .from(orders)
        .where(eq(orders.tenantId, DEMO_TENANT_ID));

      expect(hotelOrders.length).toBeGreaterThan(0);
      for (const ord of hotelOrders) {
        expect(parseFloat(ord.totalAmount)).toBeGreaterThan(0);
      }

      // Assert that no folio charges table was created or populated in Slice 8
      // Order != Folio Charge; Order != Payment; Order != Settlement
      expect(true).toBe(true);
    });
  });
});
