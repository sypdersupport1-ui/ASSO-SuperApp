import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { signJwt } from "@/lib/auth/jwt";
import { DEMO_TENANT_ID, ensureHotelSeedData } from "@/lib/hotel/seed";
import { generateOrGetRoomQr } from "@/lib/hotel/qr-service";
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
import { hotelRooms, hotelStays, hotelGuests, hotelReservations } from "@/db/schema/hotel";
import { outlets } from "@/db/schema/core";
import { catalogItems, orders } from "@/db/schema/operations";
import { eq, and } from "drizzle-orm";
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

describe("Phase 7 Hotel Vertical — Slice 8 (Room Service & F&B Ordering) Integration Suite", () => {
  let customerSessionToken: string;
  let customerSessionPayload: any;
  let staffToken: string;
  let demoOutletId: string;
  let room101Id: string;
  let room101ContextId: string;
  let sampleItemId1: string;
  let sampleItemId2: string;
  let sampleItem1Price: string;

  beforeAll(async () => {
    // 1. Seed base hotel data and menu
    await ensureHotelSeedData(DEMO_TENANT_ID);
    const db = getDb();

    // 2. Query property and test room
    const [property] = await db
      .select()
      .from(outlets)
      .where(eq(outlets.tenantId, DEMO_TENANT_ID))
      .limit(1);

    demoOutletId = property.outletId;

    const [room] = await db
      .select()
      .from(hotelRooms)
      .where(
        and(
          eq(hotelRooms.tenantId, DEMO_TENANT_ID),
          eq(hotelRooms.outletId, demoOutletId),
          eq(hotelRooms.roomNumber, "101")
        )
      )
      .limit(1);

    room101Id = room.roomId;
    room101ContextId = room.contextId;

    // 3. Ensure active in-house stay exists on Room 101
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
            roomTypeId: room.roomTypeId,
            assignedRoomId: room101Id,
            reservationNumber: `RES-S8-${Date.now()}`,
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
        stayNumber: `STY-S8-${Date.now()}`,
        status: "ACTIVE",
        expectedCheckOutAt: new Date(Date.now() + 86400000 * 3),
      });

      await db
        .update(hotelRooms)
        .set({ isOccupied: true, operationalStatus: "OCCUPIED" })
        .where(eq(hotelRooms.roomId, room101Id));
    }

    // 4. Issue staff JWT
    staffToken = signJwt({
      sub: "00000000-0000-0000-0000-000000000001",
      email: "staff.fnb@hotel.com",
      tenantId: DEMO_TENANT_ID,
      outletId: demoOutletId,
      roles: ["HOTEL_ADMIN"],
      permissions: ["hotel.*", "hotel.rooms.manage", "hotel.read"],
      sessionType: "STAFF",
      isSuperAdmin: false,
    });

    // 5. Generate Room QR & establish Customer Session
    const qr = await generateOrGetRoomQr(DEMO_TENANT_ID, demoOutletId, room101Id);
    const res = await resolveCustomerQr(qr.opaqueToken);
    customerSessionToken = res.sessionToken;

    customerSessionPayload = {
      sub: res.sessionId,
      tenantId: DEMO_TENANT_ID,
      outletId: demoOutletId,
      contextId: room101ContextId,
      sessionType: "CUSTOMER",
      roles: [],
      permissions: [],
      isSuperAdmin: false,
    };

    // 6. Query sample menu items
    const menu = await listHotelCatalog(DEMO_TENANT_ID, demoOutletId, true);
    sampleItemId1 = menu.categories[0].items[0].itemId;
    sampleItemId2 = menu.categories[0].items[1].itemId;
    sampleItem1Price = menu.categories[0].items[0].basePrice;
  }, 30000);

  describe("1. F&B Catalog & Menu Availability Management", () => {
    it("retrieves the hotel in-room dining catalog with categorized items", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/customer/room-service/menu", {
        headers: { Authorization: `Bearer ${customerSessionToken}` },
      });
      const res = await getCustomerMenuRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.categories.length).toBeGreaterThan(0);
      expect(json.data.categories[0].items.length).toBeGreaterThan(0);
      expect(parseFloat(json.data.categories[0].items[0].basePrice)).toBeGreaterThan(0);
    });

    it("allows staff to toggle menu item availability (86-ing items)", async () => {
      // Toggle item 2 to unavailable
      const patchReq = new NextRequest(
        `http://localhost:3000/api/v1/hotel/room-service/menu/${sampleItemId2}/availability`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${staffToken}`,
          },
          body: JSON.stringify({
            outletId: demoOutletId,
            isAvailable: false,
          }),
        }
      );
      const patchRes = await patchStaffMenuAvailabilityRoute(patchReq, {
        params: Promise.resolve({ id: sampleItemId2 }),
      });
      expect(patchRes.status).toBe(200);

      // Verify customer menu now filters out unavailable item
      const custReq = new NextRequest("http://localhost:3000/api/v1/customer/room-service/menu", {
        headers: { Authorization: `Bearer ${customerSessionToken}` },
      });
      const custRes = await getCustomerMenuRoute(custReq);
      const custJson = await custRes.json();
      const allCustomerItems = custJson.data.categories.flatMap((c: any) => c.items);
      expect(allCustomerItems.some((i: any) => i.itemId === sampleItemId2)).toBe(false);

      // Restore item 2 availability
      await updateCatalogItemAvailability({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        itemId: sampleItemId2,
        isAvailable: true,
        staffUserId: "00000000-0000-0000-0000-000000000001",
      });
    });
  });

  describe("2. Room Service Order Placement & Financial Price Snapshotting", () => {
    let createdOrderId: string;
    let createdOrderNumber: string;

    it("creates a room service order with price snapshots and automatic tax calculation", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/customer/room-service/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerSessionToken}`,
        },
        body: JSON.stringify({
          items: [
            { itemId: sampleItemId1, quantity: 2, specialNotes: "Extra crispy fries please" },
            { itemId: sampleItemId2, quantity: 1, specialNotes: "Medium spicy" },
          ],
          guestNotes: "Please ring doorbell twice upon arrival",
        }),
      });

      const res = await postCustomerOrdersRoute(req);
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.orderNumber).toMatch(/^RS-\d{8}-[A-Z0-9]{4}$/);
      expect(json.data.status).toBe("PLACED");
      expect(json.data.displayStatus).toBe("Received");
      expect(json.data.roomNumber).toBe("101");
      expect(json.data.items.length).toBe(2);

      // Verify price snapshotting
      const line1 = json.data.items.find((i: any) => i.itemId === sampleItemId1);
      expect(line1.unitPrice).toBe(parseFloat(sampleItem1Price).toFixed(2));
      expect(line1.quantity).toBe(2);
      expect(parseFloat(line1.subtotal)).toBeCloseTo(parseFloat(sampleItem1Price) * 2, 2);

      createdOrderId = json.data.orderId;
      createdOrderNumber = json.data.orderNumber;
    });

    it("retains historical order prices even if catalog base price is changed later", async () => {
      const db = getDb();

      // Temporarily change catalog price of item 1
      await db
        .update(catalogItems)
        .set({ basePrice: "9999.0000" })
        .where(eq(catalogItems.itemId, sampleItemId1));

      // Fetch the historical order - snapshot must remain unchanged
      const detailReq = new NextRequest(
        `http://localhost:3000/api/v1/customer/room-service/orders/${createdOrderId}`,
        {
          headers: { Authorization: `Bearer ${customerSessionToken}` },
        }
      );
      const detailRes = await getCustomerOrderDetailRoute(detailReq, {
        params: Promise.resolve({ id: createdOrderId }),
      });
      expect(detailRes.status).toBe(200);

      const json = await detailRes.json();
      const line1 = json.data.items.find((i: any) => i.itemId === sampleItemId1);
      expect(line1.unitPrice).toBe(parseFloat(sampleItem1Price).toFixed(2)); // Snapshot preserved!

      // Restore original price in catalog
      await db
        .update(catalogItems)
        .set({ basePrice: sampleItem1Price })
        .where(eq(catalogItems.itemId, sampleItemId1));
    });

    it("rejects order submission if any cart item is sold out/unavailable", async () => {
      // 86 item 1
      await updateCatalogItemAvailability({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        itemId: sampleItemId1,
        isAvailable: false,
        staffUserId: "00000000-0000-0000-0000-000000000001",
      });

      const req = new NextRequest("http://localhost:3000/api/v1/customer/room-service/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerSessionToken}`,
        },
        body: JSON.stringify({
          items: [{ itemId: sampleItemId1, quantity: 1 }],
        }),
      });

      const res = await postCustomerOrdersRoute(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("VALIDATION_FAILED");
      expect(json.error.message).toContain("unavailable or sold out");

      // Re-enable item 1
      await updateCatalogItemAvailability({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        itemId: sampleItemId1,
        isAvailable: true,
        staffUserId: "00000000-0000-0000-0000-000000000001",
      });
    });

    it("supports idempotency on order creation", async () => {
      const idempotencyKey = `idem_order_${Date.now()}`;
      const payload = {
        items: [{ itemId: sampleItemId2, quantity: 1 }],
        guestNotes: "Idempotent test order",
      };

      const req1 = new NextRequest("http://localhost:3000/api/v1/customer/room-service/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerSessionToken}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const res1 = await postCustomerOrdersRoute(req1);
      expect(res1.status).toBe(201);
      const json1 = await res1.json();

      // Replay identical request
      const req2 = new NextRequest("http://localhost:3000/api/v1/customer/room-service/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerSessionToken}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const res2 = await postCustomerOrdersRoute(req2);
      expect(res2.status).toBe(201);
      const json2 = await res2.json();
      expect(json2.data.orderId).toBe(json1.data.orderId);
      expect(json2.data.orderNumber).toBe(json1.data.orderNumber);
    });
  });

  describe("3. Staff Order Fulfillment Lifecycle", () => {
    let orderId: string;

    beforeAll(async () => {
      const order = await createRoomServiceOrder(customerSessionPayload, {
        items: [{ itemId: sampleItemId1, quantity: 1 }],
      });
      orderId = order.orderId;
    });

    it("allows staff to transition order through the full preparation and delivery lifecycle", async () => {
      // 1. ACCEPT
      const acceptReq = new NextRequest(
        `http://localhost:3000/api/v1/hotel/room-service/orders/${orderId}/status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${staffToken}`,
          },
          body: JSON.stringify({
            outletId: demoOutletId,
            status: "ACCEPTED",
          }),
        }
      );
      const acceptRes = await postStaffOrderStatusRoute(acceptReq, {
        params: Promise.resolve({ id: orderId }),
      });
      expect(acceptRes.status).toBe(200);
      expect((await acceptRes.json()).data.status).toBe("ACCEPTED");

      // 2. PREPARING
      const prepRes = await updateStaffRoomServiceOrderStatus({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        orderId,
        nextStatus: "PREPARING",
        staffUserId: "00000000-0000-0000-0000-000000000001",
      });
      expect(prepRes.status).toBe("PREPARING");

      // 3. READY
      const readyRes = await updateStaffRoomServiceOrderStatus({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        orderId,
        nextStatus: "READY",
        staffUserId: "00000000-0000-0000-0000-000000000001",
      });
      expect(readyRes.status).toBe("READY");

      // 4. OUT_FOR_DELIVERY
      const dispatchRes = await updateStaffRoomServiceOrderStatus({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        orderId,
        nextStatus: "OUT_FOR_DELIVERY",
        staffUserId: "00000000-0000-0000-0000-000000000001",
      });
      expect(dispatchRes.status).toBe("OUT_FOR_DELIVERY");

      // 5. DELIVERED
      const deliverRes = await updateStaffRoomServiceOrderStatus({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        orderId,
        nextStatus: "DELIVERED",
        staffUserId: "00000000-0000-0000-0000-000000000001",
      });
      expect(deliverRes.status).toBe("DELIVERED");
      expect(deliverRes.displayStatus).toBe("Delivered");
    }, 15000);
  });

  describe("4. Customer Order Cancellation Rules", () => {
    it("allows customer to cancel an order in PLACED state", async () => {
      const order = await createRoomServiceOrder(customerSessionPayload, {
        items: [{ itemId: sampleItemId1, quantity: 1 }],
      });

      const cancelReq = new NextRequest(
        `http://localhost:3000/api/v1/customer/room-service/orders/${order.orderId}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${customerSessionToken}`,
          },
          body: JSON.stringify({ reason: "Ordered by mistake" }),
        }
      );
      const cancelRes = await postCustomerCancelOrderRoute(cancelReq, {
        params: Promise.resolve({ id: order.orderId }),
      });
      expect(cancelRes.status).toBe(200);

      const json = await cancelRes.json();
      expect(json.data.status).toBe("CANCELLED");
      expect(json.data.displayStatus).toBe("Cancelled");
    });

    it("blocks customer from cancelling an order once cooking has commenced (PREPARING)", async () => {
      const order = await createRoomServiceOrder(customerSessionPayload, {
        items: [{ itemId: sampleItemId1, quantity: 1 }],
      });

      // Staff starts preparing
      await updateStaffRoomServiceOrderStatus({
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        orderId: order.orderId,
        nextStatus: "PREPARING",
        staffUserId: "00000000-0000-0000-0000-000000000001",
      });

      // Customer attempt to cancel must be rejected
      const cancelReq = new NextRequest(
        `http://localhost:3000/api/v1/customer/room-service/orders/${order.orderId}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${customerSessionToken}`,
          },
        }
      );
      const cancelRes = await postCustomerCancelOrderRoute(cancelReq, {
        params: Promise.resolve({ id: order.orderId }),
      });
      expect([400, 422]).toContain(cancelRes.status);

      const json = await cancelRes.json();
      expect(json.error.code).toBe("BUSINESS_RULE_VIOLATION");
    });
  });
});
