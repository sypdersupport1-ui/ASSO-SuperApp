import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  domainOutboxEvents,
  inAppNotifications,
  communicationTemplates,
  communicationDeliveryLogs,
} from "@/db/schema/communication";
import {
  hotelRooms,
  hotelStays,
  hotelReservations,
  hotelGuests,
} from "@/db/schema/hotel";
import { customers } from "@/db/schema/core";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";
import { createHotelGuest } from "@/lib/hotel/guest-service";
import { createReservation } from "@/lib/hotel/reservation-service";
import { executeCheckIn, executeCheckOut } from "@/lib/hotel/stay-service";
import {
  createDomainEvent,
  recordOutboxEvent,
  processOutboxBatch,
} from "@/lib/events/outbox";
import {
  generateSecureReceiptUrl,
  verifySecureReceiptToken,
  DomainEvent,
  HotelCheckInPayload,
} from "@/lib/events/types";
import { getCommunicationEngine } from "@/lib/communication/engine";
import { signJwt } from "@/lib/auth/jwt";

// Route Handlers
import { GET as getCustomerNotificationsRoute } from "@/app/api/v1/customer/notifications/route";
import { GET as getHotelNotificationsRoute } from "@/app/api/v1/hotel/notifications/route";
import { POST as markNotificationReadRoute } from "@/app/api/v1/notifications/[id]/read/route";
import { GET as getReceiptRoute } from "@/app/api/v1/bills/receipt/route";
import { POST as postPaymentRoute } from "@/app/api/v1/hotel/folios/[stayId]/payments/route";

describe("Phase 8 / Slice 1: Shared Transaction Events & Communication Foundation", () => {
  let demoOutletId: string;
  let availableRoom: typeof hotelRooms.$inferSelect;
  let testGuestId: string;
  let testCustomerId: string;
  let testReservationId: string;
  let staffToken: string;
  let customerToken: string;

  beforeAll(async () => {
    const db = getDb();

    // 1. Fetch hotel rooms and select an unoccupied room
    const allRooms = await db
      .select()
      .from(hotelRooms)
      .where(eq(hotelRooms.tenantId, DEMO_TENANT_ID));

    if (allRooms.length === 0) {
      throw new Error("No hotel rooms found for tests.");
    }

    demoOutletId = allRooms[0].outletId;

    // Find an active available room without an active stay
    for (const r of allRooms) {
      if (!r.isActive || r.operationalStatus !== "AVAILABLE") {
        continue;
      }

      const [activeStay] = await db
        .select()
        .from(hotelStays)
        .where(
          and(
            eq(hotelStays.roomId, r.roomId),
            eq(hotelStays.tenantId, DEMO_TENANT_ID),
            eq(hotelStays.status, "ACTIVE")
          )
        )
        .limit(1);

      if (!activeStay) {
        availableRoom = r;
        break;
      }
    }

    if (!availableRoom) {
      availableRoom = allRooms.find((r) => r.isActive && r.roomNumber !== "102") || allRooms[0];
      await db
        .update(hotelRooms)
        .set({ operationalStatus: "AVAILABLE", isOccupied: false, housekeepingStatus: "CLEAN" })
        .where(eq(hotelRooms.roomId, availableRoom.roomId));
    }

    demoOutletId = availableRoom.outletId;

    // Clean up any stale active stay on this room from prior tests
    await db
      .update(hotelStays)
      .set({ status: "CHECKED_OUT", actualCheckOutAt: new Date() })
      .where(and(eq(hotelStays.roomId, availableRoom.roomId), eq(hotelStays.status, "ACTIVE")));

    // Cancel prior reservations on this room to avoid date collision in tests
    await db
      .update(hotelReservations)
      .set({ status: "CANCELLED" })
      .where(
        and(
          eq(hotelReservations.assignedRoomId, availableRoom.roomId),
          inArray(hotelReservations.status, ["CONFIRMED", "CHECKED_IN", "PENDING"])
        )
      );

    // 2. Create Guest & Customer fixture
    const uniqueEmail = `guest_comm_${Date.now()}@example.com`;
    const uniquePhone = `+9198${Math.floor(10000000 + Math.random() * 90000000)}`;
    const guest = await createHotelGuest(DEMO_TENANT_ID, {
      fullName: "Communication Test Guest",
      email: uniqueEmail,
      phone: uniquePhone,
    });
    testGuestId = guest.guestId;
    testCustomerId = guest.customerId;

    // 3. Create confirmed reservation
    const randomDays = 700 + Math.floor(Math.random() * 200);
    const arrivalDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * randomDays);
    const departureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * (randomDays + 2));
    const reservation = await createReservation(DEMO_TENANT_ID, demoOutletId, {
      guestId: testGuestId,
      roomTypeId: availableRoom.roomTypeId,
      arrivalDate,
      departureDate,
      adultCount: 1,
      assignedRoomId: availableRoom.roomId,
    });
    testReservationId = reservation.reservationId;

    // 4. Generate Auth Tokens
    staffToken = signJwt({
      sub: "00000000-0000-0000-0000-000000000001",
      sessionType: "STAFF",
      tenantId: DEMO_TENANT_ID,
      outletId: demoOutletId,
      roles: ["FRONT_DESK", "HOTEL_ADMIN"],
      permissions: ["hotel.front_desk.view", "hotel.manage", "hotel.stays.manage"],
    });

    customerToken = signJwt({
      sub: testCustomerId,
      sessionType: "CUSTOMER",
      tenantId: DEMO_TENANT_ID,
      outletId: demoOutletId,
      roles: ["CUSTOMER"],
      permissions: [],
    });
  });

  // ==========================================================================
  // Test 1: Successful transaction creates exactly one trusted event
  // ==========================================================================
  it("1. Successful transaction creates exactly one trusted outbox event", async () => {
    const db = getDb();

    // Execute check-in
    const stay = await executeCheckIn(
      DEMO_TENANT_ID,
      demoOutletId,
      {
        reservationId: testReservationId,
        roomId: availableRoom.roomId,
      },
      "00000000-0000-0000-0000-000000000001"
    );

    expect(stay).toBeDefined();
    expect(stay.stayId).toBeDefined();

    // Check outbox for HOTEL_CHECK_IN_SUCCESS event
    const outboxEvents = await db
      .select()
      .from(domainOutboxEvents)
      .where(
        and(
          eq(domainOutboxEvents.tenantId, DEMO_TENANT_ID),
          eq(domainOutboxEvents.eventType, "HOTEL_CHECK_IN_SUCCESS"),
          eq(domainOutboxEvents.aggregateId, stay.stayId)
        )
      );

    expect(outboxEvents.length).toBe(1);
    const event = outboxEvents[0];
    expect(["PENDING", "PROCESSING", "COMPLETED"]).toContain(event.status);
    expect(event.vertical).toBe("HOTEL");
    expect(event.aggregateType).toBe("HOTEL_STAY");
    expect((event.payload as any).stayNumber).toBe(stay.stayNumber);
    expect((event.payload as any).guestName).toBe("Communication Test Guest");
  });

  // ==========================================================================
  // Test 2: Failed transaction creates no success communication event
  // ==========================================================================
  it("2. Failed transaction creates NO outbox communication event", async () => {
    const db = getDb();
    const fakeReservationId = "00000000-0000-0000-0000-999999999999";

    // Attempt invalid check-in
    await expect(
      executeCheckIn(DEMO_TENANT_ID, demoOutletId, {
        reservationId: fakeReservationId,
      })
    ).rejects.toThrow();

    // Verify no outbox event was created for the fake reservation
    const outboxEvents = await db
      .select()
      .from(domainOutboxEvents)
      .where(
        and(
          eq(domainOutboxEvents.tenantId, DEMO_TENANT_ID),
          eq(domainOutboxEvents.aggregateId, fakeReservationId)
        )
      );

    expect(outboxEvents.length).toBe(0);
  });

  // ==========================================================================
  // Test 3: Replayed operation is idempotent
  // ==========================================================================
  it("3. Outbox event recording is idempotent based on idempotencyKey", async () => {
    const db = getDb();
    const testIdempKey = `IDEMP_TEST_${Date.now()}`;
    const testEvent = createDomainEvent({
      tenantId: DEMO_TENANT_ID,
      vertical: "HOTEL",
      eventType: "BILL_GENERATED",
      aggregateType: "FOLIO",
      aggregateId: "folio_test_123",
      payload: { totalCharges: "1000.00", balanceDue: "0.00" },
      idempotencyKey: testIdempKey,
    });

    // First insert
    const firstInsert = await recordOutboxEvent(db, testEvent);
    expect(firstInsert).toBeDefined();

    // Second insert with identical idempotencyKey
    const secondInsert = await recordOutboxEvent(db, testEvent);
    expect(secondInsert.outboxId).toBe(firstInsert.outboxId);

    // Verify strictly 1 row in database
    const rows = await db
      .select()
      .from(domainOutboxEvents)
      .where(eq(domainOutboxEvents.idempotencyKey, testIdempKey));

    expect(rows.length).toBe(1);
  });

  // ==========================================================================
  // Test 4 & 5: Outbox event survives retry and processes idempotently
  // ==========================================================================
  it("4. Outbox batch processor handles pending events, updates status to COMPLETED", async () => {
    const db = getDb();

    // Process pending outbox events
    const batchResult = await processOutboxBatch({
      tenantId: DEMO_TENANT_ID,
      batchSize: 10,
    });

    expect(batchResult.processed).toBeGreaterThanOrEqual(1);
    expect(batchResult.succeeded).toBeGreaterThanOrEqual(1);

    // Verify completed status
    const completedEvents = await db
      .select()
      .from(domainOutboxEvents)
      .where(
        and(
          eq(domainOutboxEvents.tenantId, DEMO_TENANT_ID),
          eq(domainOutboxEvents.eventType, "HOTEL_CHECK_IN_SUCCESS")
        )
      );

    expect(completedEvents[0].status).toBe("COMPLETED");
    expect(completedEvents[0].processedAt).not.toBeNull();
  });

  // ==========================================================================
  // Test 6: In-App notification created from trusted event
  // ==========================================================================
  it("5. In-App notification is created with correctly interpolated template", async () => {
    const db = getDb();

    // Check in_app_notifications for our test customer
    const notifications = await db
      .select()
      .from(inAppNotifications)
      .where(
        and(
          eq(inAppNotifications.tenantId, DEMO_TENANT_ID),
          eq(inAppNotifications.recipientType, "CUSTOMER"),
          eq(inAppNotifications.recipientId, testCustomerId)
        )
      );

    expect(notifications.length).toBeGreaterThanOrEqual(1);
    const notif = notifications[0];
    expect(notif.eventType).toBe("HOTEL_CHECK_IN_SUCCESS");
    expect(notif.title).toContain("Welcome");
    expect(notif.body).toContain("Communication Test Guest");
    expect(notif.body).toContain(availableRoom.roomNumber);
    expect(notif.isRead).toBe(false);
  });

  // ==========================================================================
  // Test 7: Customer Notifications API & Mark as Read
  // ==========================================================================
  it("6. Customer can fetch notifications and mark as read", async () => {
    const db = getDb();

    // GET /api/v1/customer/notifications
    const getReq = new NextRequest("http://localhost:3000/api/v1/customer/notifications", {
      headers: {
        authorization: `Bearer ${customerToken}`,
        "x-tenant-id": DEMO_TENANT_ID,
      },
    });

    const getRes = await getCustomerNotificationsRoute(getReq);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.success).toBe(true);
    expect(Array.isArray(getData.data)).toBe(true);
    expect(getData.data.length).toBeGreaterThanOrEqual(1);

    const targetNotifId = getData.data[0].notificationId;

    // POST /api/v1/notifications/[id]/read
    const readReq = new NextRequest(`http://localhost:3000/api/v1/notifications/${targetNotifId}/read`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${customerToken}`,
        "x-tenant-id": DEMO_TENANT_ID,
      },
    });

    const readRes = await markNotificationReadRoute(readReq, {
      params: Promise.resolve({ id: targetNotifId }),
    });
    expect(readRes.status).toBe(200);
    const readData = await readRes.json();
    expect(readData.success).toBe(true);
    expect(readData.data.isRead).toBe(true);

    // Verify in DB
    const [dbNotif] = await db
      .select()
      .from(inAppNotifications)
      .where(eq(inAppNotifications.notificationId, targetNotifId));

    expect(dbNotif.isRead).toBe(true);
    expect(dbNotif.readAt).not.toBeNull();
  });

  // ==========================================================================
  // Test 8: Staff Notifications API
  // ==========================================================================
  it("7. Hotel staff can query notifications targeted to FRONT_DESK scope", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/hotel/notifications", {
      headers: {
        authorization: `Bearer ${staffToken}`,
        "x-tenant-id": DEMO_TENANT_ID,
      },
    });

    const res = await getHotelNotificationsRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  // ==========================================================================
  // Test 9: Tenant isolation - Tenant A cannot see Tenant B communications
  // ==========================================================================
  it("8. Tenant isolation: Tenant B cannot access Tenant A notifications", async () => {
    const TENANT_B = "22222222-2222-2222-2222-222222222222";
    const tenantBCustomerToken = signJwt({
      sub: "customer_b_id",
      sessionType: "CUSTOMER",
      tenantId: TENANT_B,
      roles: ["CUSTOMER"],
      permissions: [],
    });

    const req = new NextRequest("http://localhost:3000/api/v1/customer/notifications", {
      headers: {
        authorization: `Bearer ${tenantBCustomerToken}`,
        "x-tenant-id": TENANT_B,
      },
    });

    const res = await getCustomerNotificationsRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data.length).toBe(0); // Tenant B sees zero notifications from Tenant A
  });

  // ==========================================================================
  // Test 10: Customer cannot access protected staff financial routes
  // ==========================================================================
  it("9. Customer token cannot mutate staff financial/folio state (403)", async () => {
    const fakeStayId = "00000000-0000-0000-0000-000000000001";
    const req = new NextRequest(`http://localhost:3000/api/v1/hotel/folios/${fakeStayId}/payments`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${customerToken}`, // Customer attempts staff action
        "x-tenant-id": DEMO_TENANT_ID,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        amount: 500,
        paymentMethod: "CASH",
      }),
    });

    const res = await postPaymentRoute(req, {
      params: Promise.resolve({ stayId: fakeStayId }),
    });

    expect(res.status).toBe(403); // Strictly rejected by permission guard
  });

  // ==========================================================================
  // Test 11: Secure Receipt URL Token Generation and Verification
  // ==========================================================================
  it("10. Secure receipt URL is tamper-proof and conceals raw database details", async () => {
    const receiptUrl = generateSecureReceiptUrl({
      tenantId: DEMO_TENANT_ID,
      vertical: "HOTEL",
      referenceType: "FOLIO",
      referenceId: "folio_secret_abc123",
      amount: "2500.00",
    });

    expect(receiptUrl).toContain("/api/v1/bills/receipt?token=");
    const token = new URL(receiptUrl, "http://localhost:3000").searchParams.get("token")!;

    // 1. Verify authentic token
    const verified = verifySecureReceiptToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.referenceId).toBe("folio_secret_abc123");
    expect(verified?.amount).toBe("2500.00");
    expect(verified?.tenantId).toBe(DEMO_TENANT_ID);

    // 2. Tampered token should fail verification
    const tamperedToken = token.slice(0, -4) + "XXXX";
    const invalidVerified = verifySecureReceiptToken(tamperedToken);
    expect(invalidVerified).toBeNull();

    // 3. API endpoint GET /api/v1/bills/receipt verification
    const req = new NextRequest(`http://localhost:3000${receiptUrl}`);
    const res = await getReceiptRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.verified).toBe(true);
    expect(data.data.referenceId).toBe("folio_secret_abc123");
  });

  // ==========================================================================
  // Test 12: Delivery logs recorded across all channels
  // ==========================================================================
  it("11. Communication delivery logs record channel dispatch results", async () => {
    const db = getDb();

    const logs = await db
      .select()
      .from(communicationDeliveryLogs)
      .where(eq(communicationDeliveryLogs.tenantId, DEMO_TENANT_ID));

    expect(logs.length).toBeGreaterThanOrEqual(1);
    const inAppLogs = logs.filter((l) => l.channel === "IN_APP");
    expect(inAppLogs.length).toBeGreaterThanOrEqual(1);
    expect(inAppLogs[0].status).toBe("DELIVERED");
  });
});
