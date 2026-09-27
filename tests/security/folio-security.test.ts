import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { DEMO_TENANT_ID, ensureHotelSeedData } from "@/lib/hotel/seed";
import { signJwt } from "@/lib/auth/jwt";
import { getOrCreateFolioForStay } from "@/lib/hotel/folio-service";
import { createHotelGuest } from "@/lib/hotel/guest-service";
import { createReservation } from "@/lib/hotel/reservation-service";
import { executeCheckIn, executeCheckOut } from "@/lib/hotel/stay-service";
import { getDb } from "@/db/client";
import { hotelRooms, hotelRoomTypes, hotelStays, hotelReservations } from "@/db/schema/hotel";
import { eq, and } from "drizzle-orm";

// Routes
import { GET as getFolioRoute } from "@/app/api/v1/hotel/folios/[stayId]/route";
import { POST as postChargeRoute } from "@/app/api/v1/hotel/folios/[stayId]/charges/route";
import { POST as postAdjustmentRoute } from "@/app/api/v1/hotel/folios/[stayId]/adjustments/route";
import { POST as postPaymentRoute } from "@/app/api/v1/hotel/folios/[stayId]/payments/route";
import { POST as postRefundRoute } from "@/app/api/v1/hotel/folios/[stayId]/refunds/route";
import { POST as closeFolioRoute } from "@/app/api/v1/hotel/folios/[stayId]/close/route";
import { POST as reopenFolioRoute } from "@/app/api/v1/hotel/folios/[stayId]/reopen/route";

describe("Phase 7 Hotel Vertical — Slice 9 (Folio & Billing) Security Suite", () => {
  let demoOutletId: string;
  let testStayId: string;
  let customerJwtToken: string;
  let foreignTenantJwtToken: string;
  const FOREIGN_TENANT_ID = "22222222-2222-2222-2222-222222222222";

  beforeAll(async () => {
    const db = getDb();

    const allRooms = await db
      .select()
      .from(hotelRooms)
      .where(eq(hotelRooms.tenantId, DEMO_TENANT_ID));

    const rm = allRooms.find((r) => r.roomNumber === "102") || allRooms[0];
    demoOutletId = rm.outletId;

    const [rt] = await db
      .select()
      .from(hotelRoomTypes)
      .where(eq(hotelRoomTypes.roomTypeId, rm.roomTypeId))
      .limit(1);

    // Clean up any stale active stay on Room 102 from prior tests
    await db
      .update(hotelStays)
      .set({ status: "CHECKED_OUT", actualCheckOutAt: new Date() })
      .where(and(eq(hotelStays.roomId, rm.roomId), eq(hotelStays.status, "ACTIVE")));

    // Cancel prior reservations on room 102 to avoid date collision
    await db
      .update(hotelReservations)
      .set({ status: "CANCELLED" })
      .where(and(eq(hotelReservations.assignedRoomId, rm.roomId), eq(hotelReservations.status, "CONFIRMED")));

    // Reset room 102 state
    await db.update(hotelRooms).set({ operationalStatus: "AVAILABLE", isOccupied: false, housekeepingStatus: "CLEAN" }).where(eq(hotelRooms.roomId, rm.roomId));

    const guest = await createHotelGuest(DEMO_TENANT_ID, {
      fullName: "Security Test Guest",
      email: `security.${Date.now()}@example.com`,
      phone: `+1-555-${Math.floor(1000000 + Math.random() * 9000000)}`,
      idProofType: "PASSPORT",
      idProofNumberMasked: `P${Math.floor(100000000 + Math.random() * 900000000)}`,
    });

    const randomDays = 300 + Math.floor(Math.random() * 200);
    const arrival = new Date(Date.now() + 1000 * 60 * 60 * 24 * randomDays);
    const departure = new Date(Date.now() + 1000 * 60 * 60 * 24 * (randomDays + 2));

    const reservation = await createReservation(DEMO_TENANT_ID, demoOutletId, {
      guestId: guest.guestId,
      roomTypeId: rt.roomTypeId,
      assignedRoomId: rm.roomId,
      arrivalDate: arrival.toISOString(),
      departureDate: departure.toISOString(),
      status: "CONFIRMED",
    });

    const checkInResult = await executeCheckIn(DEMO_TENANT_ID, demoOutletId, {
      reservationId: reservation.reservationId,
      roomId: rm.roomId,
    });
    testStayId = checkInResult.stayId;

    // Customer Token
    customerJwtToken = signJwt({
      sub: "cust_room_102",
      tenantId: DEMO_TENANT_ID,
      outletId: demoOutletId,
      contextId: rm.contextId,
      sessionType: "CUSTOMER",
      roles: ["CUSTOMER"],
      permissions: ["customer.read", "customer.order"],
      isSuperAdmin: false,
    });

    // Foreign Tenant Token (Tenant B)
    foreignTenantJwtToken = signJwt({
      sub: "staff_tenant_b",
      tenantId: FOREIGN_TENANT_ID,
      outletId: "33333333-3333-3333-3333-333333333333",
      sessionType: "STAFF",
      roles: ["HOTEL_ADMIN"],
      permissions: ["hotel.*"],
      isSuperAdmin: false,
    });
  });

  // ==========================================================================
  // 1. Customer Token Denial on Financial Endpoints
  // ==========================================================================
  describe("1. Customer Session Token Denial (403 Forbidden)", () => {
    it("blocks customer session token from posting charges (403 Forbidden)", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/folios/${testStayId}/charges`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            authorization: `Bearer ${customerJwtToken}`,
          },
          body: JSON.stringify({
            outletId: demoOutletId,
            entryType: "SERVICE_CHARGE",
            amount: 100,
            description: "Illegal customer charge",
          }),
        }
      );

      const res = await postChargeRoute(req, { params: Promise.resolve({ stayId: testStayId }) });
      expect(res.status).toBe(403);
    });

    it("blocks customer session token from recording payments (403 Forbidden)", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/folios/${testStayId}/payments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            authorization: `Bearer ${customerJwtToken}`,
          },
          body: JSON.stringify({
            amount: 500,
            paymentMethod: "CASH",
          }),
        }
      );

      const res = await postPaymentRoute(req, { params: Promise.resolve({ stayId: testStayId }) });
      expect(res.status).toBe(403);
    });

    it("blocks customer session token from closing or reopening folios (403 Forbidden)", async () => {
      const closeReq = new NextRequest(
        `http://localhost:3000/api/v1/hotel/folios/${testStayId}/close`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${customerJwtToken}`,
          },
        }
      );
      const closeRes = await closeFolioRoute(closeReq, { params: Promise.resolve({ stayId: testStayId }) });
      expect(closeRes.status).toBe(403);

      const reopenReq = new NextRequest(
        `http://localhost:3000/api/v1/hotel/folios/${testStayId}/reopen`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${customerJwtToken}`,
          },
          body: JSON.stringify({ reason: "Customer bypass attempt" }),
        }
      );
      const reopenRes = await reopenFolioRoute(reopenReq, { params: Promise.resolve({ stayId: testStayId }) });
      expect(reopenRes.status).toBe(403);
    });
  });

  // ==========================================================================
  // 2. Cross-Tenant Isolation
  // ==========================================================================
  describe("2. Cross-Tenant Isolation & IDOR Protection", () => {
    it("prevents Tenant B from reading Tenant A stay folio (404/Isolated)", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/folios/${testStayId}?outletId=${demoOutletId}`,
        {
          headers: {
            authorization: `Bearer ${foreignTenantJwtToken}`,
          },
        }
      );

      const res = await getFolioRoute(req, { params: Promise.resolve({ stayId: testStayId }) });
      expect([403, 404]).toContain(res.status);
    });

    it("prevents Tenant B from posting charges to Tenant A folio (404/Isolated)", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/folios/${testStayId}/charges`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            authorization: `Bearer ${foreignTenantJwtToken}`,
          },
          body: JSON.stringify({
            amount: 500,
            description: "Cross-tenant attack",
          }),
        }
      );

      const res = await postChargeRoute(req, { params: Promise.resolve({ stayId: testStayId }) });
      expect([403, 404]).toContain(res.status);
    });
  });
});
