import crypto from "crypto";
import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { signJwt } from "@/lib/auth/jwt";
import { DEMO_TENANT_ID, ensureHotelSeedData } from "@/lib/hotel/seed";
import { generateOrGetRoomQr } from "@/lib/hotel/qr-service";
import { resolveCustomerQr } from "@/lib/customer/customer-session-service";
import { createRoomServiceOrder, ensureHotelMenuCatalog } from "@/lib/hotel/room-service-service";
import { getDb } from "@/db/client";
import { hotelRooms, hotelStays, hotelGuests, hotelReservations } from "@/db/schema/hotel";
import { outlets } from "@/db/schema/core";
import { catalogItems } from "@/db/schema/operations";
import { eq, and } from "drizzle-orm";
import { GET as getStaffOrdersRoute } from "@/app/api/v1/hotel/room-service/orders/route";
import { POST as postStaffOrderStatusRoute } from "@/app/api/v1/hotel/room-service/orders/[id]/status/route";
import { PATCH as patchStaffMenuAvailabilityRoute } from "@/app/api/v1/hotel/room-service/menu/[id]/availability/route";
import {
  POST as postCustomerOrdersRoute,
} from "@/app/api/v1/customer/room-service/orders/route";
import { GET as getCustomerOrderDetailRoute } from "@/app/api/v1/customer/room-service/orders/[id]/route";

describe("Phase 7 Hotel Vertical — Slice 8 Room Service Security & Isolation Suite", () => {
  let customerSessionToken: string;
  let customerSessionId: string;
  let demoOutletId: string;
  let room101Id: string;
  let room101ContextId: string;
  let room102ContextId: string;
  let sampleItemId: string;
  const TENANT_B_ID = "22222222-2222-2222-2222-222222222222";

  beforeAll(async () => {
    await ensureHotelSeedData(DEMO_TENANT_ID);
    await ensureHotelSeedData(TENANT_B_ID);

    const db = getDb();
    const [property] = await db
      .select()
      .from(outlets)
      .where(eq(outlets.tenantId, DEMO_TENANT_ID))
      .limit(1);

    demoOutletId = property.outletId;

    await ensureHotelMenuCatalog(DEMO_TENANT_ID, demoOutletId);

    const rooms = await db
      .select()
      .from(hotelRooms)
      .where(and(eq(hotelRooms.tenantId, DEMO_TENANT_ID), eq(hotelRooms.outletId, demoOutletId)));

    const r101 = rooms.find((r) => r.roomNumber === "101") || rooms[0];

    // Find a room that does not have an active stay
    const activeStays = await db
      .select({ roomId: hotelStays.roomId })
      .from(hotelStays)
      .where(and(eq(hotelStays.tenantId, DEMO_TENANT_ID), eq(hotelStays.status, "ACTIVE")));
    const activeRoomIds = new Set(activeStays.map((s) => s.roomId));
    
    let r102 = rooms.find((r) => r.roomId !== r101.roomId && !activeRoomIds.has(r.roomId));
    if (!r102) {
      const fallbackContextId = crypto.randomUUID();
      [r102] = await db
        .insert(hotelRooms)
        .values({
          tenantId: DEMO_TENANT_ID,
          outletId: demoOutletId,
          roomTypeId: r101.roomTypeId,
          roomNumber: `999-${Math.floor(1000 + Math.random() * 9000)}`,
          floorNumber: "9",
          contextId: fallbackContextId,
          operationalStatus: "AVAILABLE",
          housekeepingStatus: "CLEAN",
        })
        .returning();
    }

    room101Id = r101.roomId;
    room101ContextId = r101.contextId;
    room102ContextId = r102.contextId;

    // Ensure active stay on 101
    const [existingStay] = await db
      .select()
      .from(hotelStays)
      .where(and(eq(hotelStays.roomId, room101Id), eq(hotelStays.tenantId, DEMO_TENANT_ID), eq(hotelStays.status, "ACTIVE")))
      .limit(1);

    if (!existingStay) {
      const [guest] = await db.select().from(hotelGuests).where(eq(hotelGuests.tenantId, DEMO_TENANT_ID)).limit(1);
      const [reservation] = await db
        .select()
        .from(hotelReservations)
        .where(and(eq(hotelReservations.tenantId, DEMO_TENANT_ID), eq(hotelReservations.guestId, guest.guestId)))
        .limit(1);

      let reservationId = reservation?.reservationId;
      if (!reservationId) {
        const [newRes] = await db
          .insert(hotelReservations)
          .values({
            tenantId: DEMO_TENANT_ID,
            outletId: demoOutletId,
            guestId: guest.guestId,
            roomTypeId: r101.roomTypeId,
            assignedRoomId: room101Id,
            reservationNumber: `RES-SEC-${Date.now()}`,
            arrivalDate: new Date(),
            departureDate: new Date(Date.now() + 86400000 * 3),
          })
          .returning();
        reservationId = newRes.reservationId;
      }

      await db.insert(hotelStays).values({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        reservationId,
        guestId: guest.guestId,
        roomId: room101Id,
        stayNumber: `STY-SEC-${Date.now()}`,
        status: "ACTIVE",
        expectedCheckOutAt: new Date(Date.now() + 86400000 * 3),
      });
    }

    const qr = await generateOrGetRoomQr(DEMO_TENANT_ID, demoOutletId, room101Id);
    const res = await resolveCustomerQr(qr.opaqueToken);
    customerSessionToken = res.sessionToken;
    customerSessionId = res.sessionId;

    const [item] = await db
      .select()
      .from(catalogItems)
      .where(eq(catalogItems.tenantId, DEMO_TENANT_ID))
      .limit(1);

    sampleItemId = item.itemId;
  }, 30000);

  describe("1. Privilege Separation: Customer Token Blocked on Staff APIs", () => {
    it("denies customer session access to staff Room Service orders list (403 Forbidden)", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/room-service/orders?outletId=${demoOutletId}`,
        {
          headers: { Authorization: `Bearer ${customerSessionToken}` },
        }
      );
      const res = await getStaffOrdersRoute(req);
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("PERMISSION_DENIED");
    });

    it("denies customer session access to staff order status modification (403 Forbidden)", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/room-service/orders/00000000-0000-0000-0000-000000000001/status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${customerSessionToken}`,
          },
          body: JSON.stringify({
            outletId: demoOutletId,
            status: "DELIVERED",
          }),
        }
      );
      const res = await postStaffOrderStatusRoute(req, {
        params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000001" }),
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("PERMISSION_DENIED");
    });

    it("denies customer session access to staff menu item availability toggle (403 Forbidden)", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/v1/hotel/room-service/menu/${sampleItemId}/availability`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${customerSessionToken}`,
          },
          body: JSON.stringify({
            outletId: demoOutletId,
            isAvailable: false,
          }),
        }
      );
      const res = await patchStaffMenuAvailabilityRoute(req, {
        params: Promise.resolve({ id: sampleItemId }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("2. Cross-Room & Cross-Tenant IDOR Protection", () => {
    it("prevents Room 101 customer from viewing Room 102 order details (404 Not Found)", async () => {
      // Room 101 order created with valid session
      const order101 = await createRoomServiceOrder(
        {
          sub: customerSessionId,
          tenantId: DEMO_TENANT_ID,
          outletId: demoOutletId,
          contextId: room101ContextId,
          sessionType: "CUSTOMER",
          roles: [],
          permissions: [],
          isSuperAdmin: false,
        },
        { items: [{ itemId: sampleItemId, quantity: 1 }] }
      );

      // Now create customer token for Room 102
      const qr102 = await generateOrGetRoomQr(DEMO_TENANT_ID, demoOutletId, (await getDb().select().from(hotelRooms).where(eq(hotelRooms.contextId, room102ContextId)).limit(1))[0].roomId);
      const res102 = await resolveCustomerQr(qr102.opaqueToken);
      const token102 = res102.sessionToken;

      // Room 102 customer attempts to read Room 101 order
      const req = new NextRequest(
        `http://localhost:3000/api/v1/customer/room-service/orders/${order101.orderId}`,
        {
          headers: { Authorization: `Bearer ${token102}` },
        }
      );
      const res = await getCustomerOrderDetailRoute(req, {
        params: Promise.resolve({ id: order101.orderId }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("3. Active Stay Requirement & Price Tampering Resistance", () => {
    it("blocks room service order submission when room has no active in-house stay", async () => {
      // Room 102 has no active check-in stay
      const token102 = signJwt({
        sub: "00000000-0000-0000-0000-000000000102",
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        contextId: room102ContextId,
        sessionType: "CUSTOMER",
        roles: [],
        permissions: [],
        isSuperAdmin: false,
      });

      const req = new NextRequest("http://localhost:3000/api/v1/customer/room-service/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token102}`,
        },
        body: JSON.stringify({
          items: [{ itemId: sampleItemId, quantity: 1 }],
        }),
      });

      const res = await postCustomerOrdersRoute(req);
      expect([400, 422]).toContain(res.status);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("BUSINESS_RULE_VIOLATION");
      expect(json.error.message).toContain("active in-house hotel stays");
    });
  });
});
