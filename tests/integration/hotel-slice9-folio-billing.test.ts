import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  hotelFolios,
  hotelFolioEntries,
} from "@/db/schema/hotel_ledger";
import {
  hotelRooms,
  hotelRoomTypes,
  hotelStays,
  hotelReservations,
  hotelGuests,
} from "@/db/schema/hotel";
import { orders, orderItems } from "@/db/schema/operations";
import { businessContexts } from "@/db/schema/context";
import { DEMO_TENANT_ID, ensureHotelSeedData } from "@/lib/hotel/seed";
import {
  getOrCreateFolioForStay,
  getFolioDetailByStayId,
  postRoomCharge,
  postRoomServiceOrderCharge,
  postManualCharge,
  postAdjustment,
  recordPayment,
  recordRefund,
  closeFolio,
  reopenFolio,
} from "@/lib/hotel/folio-service";
import { createHotelGuest } from "@/lib/hotel/guest-service";
import { createReservation } from "@/lib/hotel/reservation-service";
import { executeCheckIn, executeCheckOut } from "@/lib/hotel/stay-service";
import {
  createRoomServiceOrder,
  updateStaffRoomServiceOrderStatus,
} from "@/lib/hotel/room-service-service";
import { signJwt } from "@/lib/auth/jwt";

// API Route Handlers
import { GET as getFolioRoute } from "@/app/api/v1/hotel/folios/[stayId]/route";
import { POST as postChargeRoute } from "@/app/api/v1/hotel/folios/[stayId]/charges/route";
import { POST as postAdjustmentRoute } from "@/app/api/v1/hotel/folios/[stayId]/adjustments/route";
import { POST as postPaymentRoute } from "@/app/api/v1/hotel/folios/[stayId]/payments/route";
import { POST as postRefundRoute } from "@/app/api/v1/hotel/folios/[stayId]/refunds/route";
import { POST as closeFolioRoute } from "@/app/api/v1/hotel/folios/[stayId]/close/route";
import { POST as reopenFolioRoute } from "@/app/api/v1/hotel/folios/[stayId]/reopen/route";

describe("Phase 7 Hotel Vertical — Slice 9 (Folio & Billing) Integration Suite", () => {
  let demoOutletId: string;
  let staffUserId: string;
  let testRoom: typeof hotelRooms.$inferSelect;
  let testRoomType: typeof hotelRoomTypes.$inferSelect;
  let testGuestId: string;
  let testReservationId: string;
  let testStayId: string;
  let customerJwtToken: string;

  beforeAll(async () => {
    // 1. Seed & ensure base hotel configuration
    const db = getDb();

    // 2. Establish isolated test room and matching room type for Slice 9 folio billing
    const dedicatedRoomNumber = "SL9-101";
    let [dedicatedRoom] = await db
      .select()
      .from(hotelRooms)
      .where(and(eq(hotelRooms.tenantId, DEMO_TENANT_ID), eq(hotelRooms.roomNumber, dedicatedRoomNumber)))
      .limit(1);

    if (!dedicatedRoom) {
      const allRooms = await db
        .select()
        .from(hotelRooms)
        .where(eq(hotelRooms.tenantId, DEMO_TENANT_ID));

      const baseRoom = allRooms[0];
      demoOutletId = baseRoom.outletId;

      const [rt] = await db
        .select()
        .from(hotelRoomTypes)
        .where(eq(hotelRoomTypes.roomTypeId, baseRoom.roomTypeId))
        .limit(1);
      testRoomType = rt;

      const [newCtx] = await db
        .insert(businessContexts)
        .values({
          tenantId: DEMO_TENANT_ID,
          outletId: demoOutletId,
          contextType: "ROOM",
          identifier: dedicatedRoomNumber,
          displayLabel: `Room ${dedicatedRoomNumber}`,
          status: "AVAILABLE",
          isActive: true,
        })
        .returning();

      [dedicatedRoom] = await db
        .insert(hotelRooms)
        .values({
          tenantId: DEMO_TENANT_ID,
          outletId: demoOutletId,
          roomTypeId: testRoomType.roomTypeId,
          roomNumber: dedicatedRoomNumber,
          floorNumber: "9",
          contextId: newCtx.contextId,
          operationalStatus: "AVAILABLE",
          housekeepingStatus: "CLEAN",
        })
        .returning();
    } else {
      demoOutletId = dedicatedRoom.outletId;
      const [rt] = await db
        .select()
        .from(hotelRoomTypes)
        .where(eq(hotelRoomTypes.roomTypeId, dedicatedRoom.roomTypeId))
        .limit(1);
      testRoomType = rt;
    }
    testRoom = dedicatedRoom;
    staffUserId = "00000000-0000-0000-0000-000000000001";

    // Clean up any stale active stay on test room from prior tests
    await db
      .update(hotelStays)
      .set({ status: "CHECKED_OUT", actualCheckOutAt: new Date() })
      .where(and(eq(hotelStays.roomId, testRoom.roomId), eq(hotelStays.status, "ACTIVE")));

    // Cancel prior reservations on test room to avoid date collision
    await db
      .update(hotelReservations)
      .set({ status: "CANCELLED" })
      .where(and(eq(hotelReservations.assignedRoomId, testRoom.roomId), inArray(hotelReservations.status, ["CONFIRMED", "CHECKED_IN", "PENDING"])));

    // Reset room state
    await db
      .update(hotelRooms)
      .set({
        operationalStatus: "AVAILABLE",
        isOccupied: false,
        housekeepingStatus: "CLEAN",
      })
      .where(eq(hotelRooms.roomId, testRoom.roomId));

    // 3. Create Guest & Confirmed Reservation
    const guest = await createHotelGuest(DEMO_TENANT_ID, {
      fullName: "Sir Richard Branson",
      email: `richard.${Date.now()}@example.com`,
      phone: `+1-555-${Math.floor(1000000 + Math.random() * 9000000)}`,
      idProofType: "PASSPORT",
      idProofNumberMasked: `P${Math.floor(100000000 + Math.random() * 900000000)}`,
    });
    testGuestId = guest.guestId;

    const randomDays = 400 + Math.floor(Math.random() * 200);
    const arrival = new Date(Date.now() + 1000 * 60 * 60 * 24 * randomDays);
    const departure = new Date(Date.now() + 1000 * 60 * 60 * 24 * (randomDays + 3));

    const reservation = await createReservation(DEMO_TENANT_ID, demoOutletId, {
      guestId: testGuestId,
      roomTypeId: testRoomType.roomTypeId,
      assignedRoomId: testRoom.roomId,
      arrivalDate: arrival.toISOString(),
      departureDate: departure.toISOString(),
      adultCount: 1,
      status: "CONFIRMED",
    });
    testReservationId = reservation.reservationId;

    // 4. Perform Check-In to establish Active Stay
    const checkInResult = await executeCheckIn(DEMO_TENANT_ID, demoOutletId, {
      reservationId: testReservationId,
      roomId: testRoom.roomId,
    });
    testStayId = checkInResult.stayId;

    // 5. Mint Customer Session Token for Room 101
    customerJwtToken = signJwt({
      sub: `cust_${testRoom.roomId}`,
      tenantId: DEMO_TENANT_ID,
      outletId: demoOutletId,
      contextId: testRoom.contextId,
      sessionType: "CUSTOMER",
      roles: ["CUSTOMER"],
      permissions: ["customer.read", "customer.order", "customer.service"],
      isSuperAdmin: false,
    });
  });

  // ==========================================================================
  // 1. Folio Creation & Header Initialization
  // ==========================================================================
  describe("1. Folio Creation & Header Initialization", () => {
    it("creates an open folio header for a newly checked-in stay", async () => {
      const folio = await getOrCreateFolioForStay(
        DEMO_TENANT_ID,
        demoOutletId,
        testStayId,
        staffUserId
      );

      expect(folio).toBeDefined();
      expect(folio.stayId).toBe(testStayId);
      expect(folio.status).toBe("OPEN");
      expect(folio.folioNumber).toMatch(/^FOL-\d{8}-[A-F0-9]{6}$/);
      expect(folio.balanceDue).toBe("0.0000");
    });

    it("retrieves hydrated folio detail via GET endpoint", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/folios/${testStayId}?outletId=${demoOutletId}`,
        {
          headers: {
            "x-tenant-id": DEMO_TENANT_ID,
            "x-user-id": staffUserId,
            "x-user-role": "STAFF",
          },
        }
      );
      const res = await getFolioRoute(req, { params: Promise.resolve({ stayId: testStayId }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.stay.stayId).toBe(testStayId);
      expect(json.data.stay.roomNumber).toBe(testRoom.roomNumber);
      expect(json.data.status).toBe("OPEN");
      expect(json.data.entries).toEqual([]);
    });
  });

  // ==========================================================================
  // 2. Room Charge Posting
  // ==========================================================================
  describe("2. Room Charge Posting", () => {
    it("posts authoritative room charge and updates folio balance", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/folios/${testStayId}/charges`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tenant-id": DEMO_TENANT_ID,
            "x-user-id": staffUserId,
            "x-user-role": "STAFF",
          },
          body: JSON.stringify({
            outletId: demoOutletId,
            entryType: "ROOM_CHARGE",
            amount: 7500.0,
            description: "Room Charge - Deluxe King Suite (3 Nights)",
          }),
        }
      );

      const res = await postChargeRoute(req, { params: Promise.resolve({ stayId: testStayId }) });
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(parseFloat(json.data.totalCharges)).toBe(7500.0);
      expect(parseFloat(json.data.balanceDue)).toBe(7500.0);
      expect(json.data.entries.length).toBe(1);
      expect(json.data.entries[0].entryType).toBe("ROOM_CHARGE");
      expect(json.data.entries[0].direction).toBe("DEBIT");
    });
  });

  // ==========================================================================
  // 3. Room Service F&B Order Posting on DELIVERED Status
  // ==========================================================================
  describe("3. Room Service Order Posting on Delivery", () => {
    let orderId: string;
    let orderTotal: string;

    it("creates a customer F&B order, prepares it, and delivers it to post to folio", async () => {
      const db = getDb();
      // Find two catalog items
      const items = await db.select().from(orders); // query existing or catalog items

      // Customer creates order
      const { listHotelCatalog } = await import("@/lib/hotel/room-service-service");
      const catalog = await listHotelCatalog(DEMO_TENANT_ID, demoOutletId);
      const firstItem = catalog.categories[0].items[0];

      const { verifyJwt } = await import("@/lib/auth/jwt");
      const custUser = verifyJwt(customerJwtToken);

      const orderDto = await createRoomServiceOrder(custUser, {
        items: [{ itemId: firstItem.itemId, quantity: 2 }],
        guestNotes: "Deliver with extra cutlery",
      });

      orderId = orderDto.orderId;
      orderTotal = orderDto.totalAmount;
      expect(orderDto.status).toBe("PLACED");

      // Advance fulfillment to DELIVERED
      await updateStaffRoomServiceOrderStatus({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        orderId,
        nextStatus: "ACCEPTED",
        staffUserId,
      });

      await updateStaffRoomServiceOrderStatus({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        orderId,
        nextStatus: "PREPARING",
        staffUserId,
      });

      await updateStaffRoomServiceOrderStatus({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        orderId,
        nextStatus: "READY",
        staffUserId,
      });

      await updateStaffRoomServiceOrderStatus({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        orderId,
        nextStatus: "OUT_FOR_DELIVERY",
        staffUserId,
      });

      // Transition to DELIVERED triggers automatic folio charge posting
      await updateStaffRoomServiceOrderStatus({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        orderId,
        nextStatus: "DELIVERED",
        staffUserId,
      });

      // Verify Folio reflects FOOD_CHARGE
      const folioDetail = await getFolioDetailByStayId(DEMO_TENANT_ID, demoOutletId, testStayId);
      const foodEntry = folioDetail.entries.find((e) => e.entryType === "FOOD_CHARGE");

      expect(foodEntry).toBeDefined();
      expect(foodEntry?.referenceId).toBe(orderId);
      expect(parseFloat(foodEntry?.amount || "0")).toBe(parseFloat(orderTotal));
      expect(parseFloat(folioDetail.totalCharges)).toBe(7500.0 + parseFloat(orderTotal));
    }, 60000);

    it("prevents double-posting if the same order post is triggered again (idempotency)", async () => {
      const secondPost = await postRoomServiceOrderCharge({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        orderId,
        postedByStaffId: staffUserId,
      });

      expect(secondPost).toBeDefined();
      expect(secondPost?.referenceId).toBe(orderId);

      // Verify total food entries count is still exactly 1
      const folioDetail = await getFolioDetailByStayId(DEMO_TENANT_ID, demoOutletId, testStayId);
      const foodEntries = folioDetail.entries.filter((e) => e.entryType === "FOOD_CHARGE");
      expect(foodEntries.length).toBe(1);
    });
  });

  // ==========================================================================
  // 4. Manual Service & Facility Charges
  // ==========================================================================
  describe("4. Manual Service & Facility Charges", () => {
    it("posts a manual laundry service charge with mandatory description", async () => {
      const updated = await postManualCharge({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        stayId: testStayId,
        input: {
          entryType: "SERVICE_CHARGE",
          amount: 450.0,
          description: "Express Dry Cleaning (3 garments)",
        },
        postedByStaffId: staffUserId,
      });

      expect(updated.entries.some((e) => e.description.includes("Express Dry Cleaning"))).toBe(true);
      expect(parseFloat(updated.totalCharges)).toBeGreaterThan(7950.0);
    });

    it("rejects manual charge without description or invalid amount", async () => {
      await expect(
        postManualCharge({
          tenantId: DEMO_TENANT_ID,
          outletId: demoOutletId,
          stayId: testStayId,
          input: {
            entryType: "SERVICE_CHARGE",
            amount: -100,
            description: "Invalid negative",
          },
          postedByStaffId: staffUserId,
        })
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // 5. Compensating Adjustments (Non-Destructive Ledger)
  // ==========================================================================
  describe("5. Compensating Adjustments", () => {
    it("posts a courtesy discount adjustment reducing the outstanding balance", async () => {
      const prevFolio = await getFolioDetailByStayId(DEMO_TENANT_ID, demoOutletId, testStayId);
      const prevBalance = parseFloat(prevFolio.balanceDue);

      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/folios/${testStayId}/adjustments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tenant-id": DEMO_TENANT_ID,
            "x-user-id": staffUserId,
            "x-user-role": "STAFF",
          },
          body: JSON.stringify({
            outletId: demoOutletId,
            amount: -250.0,
            reason: "VIP Guest Loyalty Courtesy Discount",
          }),
        }
      );

      const res = await postAdjustmentRoute(req, { params: Promise.resolve({ stayId: testStayId }) });
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(parseFloat(json.data.balanceDue)).toBe(prevBalance - 250.0);

      const adjEntry = json.data.entries.find((e: any) => e.description.includes("VIP Guest Loyalty"));
      expect(adjEntry).toBeDefined();
      expect(adjEntry.entryType).toBe("ADJUSTMENT");
      expect(adjEntry.direction).toBe("CREDIT");
    });

    it("rejects adjustment without mandatory reason", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/folios/${testStayId}/adjustments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tenant-id": DEMO_TENANT_ID,
            "x-user-id": staffUserId,
            "x-user-role": "STAFF",
          },
          body: JSON.stringify({
            outletId: demoOutletId,
            amount: -500.0,
            reason: "", // Empty reason should fail validation
          }),
        }
      );

      const res = await postAdjustmentRoute(req, { params: Promise.resolve({ stayId: testStayId }) });
      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // 6. Payment Recording & Settlement
  // ==========================================================================
  describe("6. Payment Recording & Settlement", () => {
    let paymentEntryId: string;

    it("records partial credit card payment reducing balance due", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/folios/${testStayId}/payments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tenant-id": DEMO_TENANT_ID,
            "x-user-id": staffUserId,
            "x-user-role": "STAFF",
          },
          body: JSON.stringify({
            outletId: demoOutletId,
            amount: 5000.0,
            paymentMethod: "CREDIT_CARD",
            referenceNumber: "VISA-9948201",
          }),
        }
      );

      const res = await postPaymentRoute(req, { params: Promise.resolve({ stayId: testStayId }) });
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(parseFloat(json.data.totalPayments)).toBeGreaterThanOrEqual(5000.0);

      const pEntry = json.data.entries.find((e: any) => e.description.includes("VISA-9948201"));
      expect(pEntry).toBeDefined();
      expect(pEntry.entryType).toBe("PAYMENT");
      expect(pEntry.direction).toBe("CREDIT");
      paymentEntryId = pEntry.entryId;
    });

    it("records full settlement payment and marks settledAt timestamp", async () => {
      const folio = await getFolioDetailByStayId(DEMO_TENANT_ID, demoOutletId, testStayId);
      const remainingBalance = parseFloat(folio.balanceDue);

      const paid = await recordPayment({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        stayId: testStayId,
        input: {
          amount: remainingBalance,
          paymentMethod: "UPI",
          referenceNumber: "UPI-482018591",
        },
        postedByStaffId: staffUserId,
      });

      expect(parseFloat(paid.balanceDue)).toBe(0.0);
      expect(paid.settledAt).toBeDefined();
    });
  });

  // ==========================================================================
  // 7. Refund Processing
  // ==========================================================================
  describe("7. Refund Processing", () => {
    it("processes an audited refund referencing original payment", async () => {
      const folio = await getFolioDetailByStayId(DEMO_TENANT_ID, demoOutletId, testStayId);
      const paymentEntry = folio.entries.find((e) => e.entryType === "PAYMENT")!;

      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/folios/${testStayId}/refunds`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tenant-id": DEMO_TENANT_ID,
            "x-user-id": staffUserId,
            "x-user-role": "STAFF",
          },
          body: JSON.stringify({
            outletId: demoOutletId,
            amount: 500.0,
            originalPaymentEntryId: paymentEntry.entryId,
            reason: "Overpayment refund adjustment",
          }),
        }
      );

      const res = await postRefundRoute(req, { params: Promise.resolve({ stayId: testStayId }) });
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(parseFloat(json.data.balanceDue)).toBe(500.0);

      const refundEntry = json.data.entries.find((e: any) => e.entryType === "REFUND");
      expect(refundEntry).toBeDefined();
      expect(refundEntry.reversesEntryId).toBe(paymentEntry.entryId);
      expect(refundEntry.direction).toBe("DEBIT");
    });
  });

  // ==========================================================================
  // 8. Folio Closure & Policy Reopening
  // ==========================================================================
  describe("8. Folio Closure & Policy Reopening", () => {
    it("closes the folio and blocks ordinary subsequent charges", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/folios/${testStayId}/close`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tenant-id": DEMO_TENANT_ID,
            "x-user-id": staffUserId,
            "x-user-role": "STAFF",
          },
          body: JSON.stringify({
            outletId: demoOutletId,
            notes: "Front desk departure settlement complete",
          }),
        }
      );

      const res = await closeFolioRoute(req, { params: Promise.resolve({ stayId: testStayId }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.status).toBe("CLOSED");

      // Attempt posting a new charge on closed folio should be rejected
      await expect(
        postManualCharge({
          tenantId: DEMO_TENANT_ID,
          outletId: demoOutletId,
          stayId: testStayId,
          input: {
            entryType: "SERVICE_CHARGE",
            amount: 100,
            description: "Illegal post on closed folio",
          },
          postedByStaffId: staffUserId,
        })
      ).rejects.toThrow();
    });

    it("reopens the closed folio under authorized policy with documented reason", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/folios/${testStayId}/reopen`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tenant-id": DEMO_TENANT_ID,
            "x-user-id": staffUserId,
            "x-user-role": "STAFF",
          },
          body: JSON.stringify({
            outletId: demoOutletId,
            reason: "Audit correction: unposted minibar consumption discovered",
          }),
        }
      );

      const res = await reopenFolioRoute(req, { params: Promise.resolve({ stayId: testStayId }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.status).toBe("OPEN");

      // Charges can now be posted again
      const recharged = await postManualCharge({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        stayId: testStayId,
        input: {
          entryType: "SERVICE_CHARGE",
          amount: 180.0,
          description: "Minibar Sparkling Water (2 bottles)",
        },
        postedByStaffId: staffUserId,
      });

      expect(recharged.entries.some((e) => e.description.includes("Minibar Sparkling Water"))).toBe(true);
    });
  });
});
