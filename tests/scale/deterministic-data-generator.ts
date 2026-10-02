import crypto from "crypto";
import { getDb } from "@/db/client";
import {
  organizations,
  outlets,
  users,
  staffProfiles,
  customers,
} from "@/db/schema/core";
import {
  businessContexts,
  qrTokens,
  customerSessions,
} from "@/db/schema/context";
import {
  restaurantTables,
  restaurantTableSessions,
} from "@/db/schema/restaurant";
import {
  catalogs,
  catalogCategories,
  catalogItems,
  orders,
  orderItems,
  kdsTasks,
} from "@/db/schema/operations";
import {
  hotelRoomTypes,
  hotelRooms,
  hotelGuests,
  hotelReservations,
  hotelStays,
  hotelHousekeepingTasks,
} from "@/db/schema/hotel";
import { signJwt } from "@/lib/auth/jwt";

export interface ScaleTenantFixture {
  tenantId: string;
  name: string;
  restaurantOutletId: string;
  hotelOutletId: string;
  catalogId: string;
  categoryIds: string[];
  itemIds: string[];
  tableIds: string[];
  contextIds: string[];
  customerSessionIds: string[];
  qrTokens: string[];
  sessionTokens: string[];
  customerIds: string[];
  hotelRoomIds: string[];
  hotelStayIds: string[];
  orderIds: string[];
}

export const SCALE_TENANT_IDS = [
  "99990001-0000-0000-0000-000000000001",
  "99990002-0000-0000-0000-000000000002",
];

function makeScaleUuid(tenantNum: number, entityCode: number): string {
  const hex = entityCode.toString(16).padStart(12, "0");
  return `9999000${tenantNum}-0000-0000-0000-${hex}`;
}

/**
 * Deterministically provisions multi-tenant test datasets for S6 performance & load testing.
 * Strictly uses non-PII, synthetic test fixtures.
 */
export async function seedScaleFixtures(): Promise<ScaleTenantFixture[]> {
  const db = getDb();
  const fixtures: ScaleTenantFixture[] = [];

  for (let i = 0; i < SCALE_TENANT_IDS.length; i++) {
    const tenantId = SCALE_TENANT_IDS[i];
    const tenantNum = i + 1;
    const name = `S6 Scale Benchmark Hotel & Dining Group ${tenantNum}`;

    // 1. Organization
    await db
      .insert(organizations)
      .values({
        organizationId: tenantId,
        name,
        primaryBusinessType: "MULTI_OUTLET",
        subscriptionStatus: "ACTIVE",
      })
      .onConflictDoUpdate({
        target: [organizations.organizationId],
        set: { name },
      });

    // 2. Outlets: Restaurant & Hotel
    const restaurantOutletId = makeScaleUuid(tenantNum, 1);
    const hotelOutletId = makeScaleUuid(tenantNum, 2);

    await db
      .insert(outlets)
      .values([
        {
          outletId: restaurantOutletId,
          tenantId,
          name: `Bistro 6 - Tenant ${tenantNum}`,
          code: `BISTRO_S6_${tenantNum}`,
          verticalType: "RESTAURANT",
        },
        {
          outletId: hotelOutletId,
          tenantId,
          name: `Grand Palace Hotel - Tenant ${tenantNum}`,
          code: `HOTEL_S6_${tenantNum}`,
          verticalType: "HOTEL",
        },
      ])
      .onConflictDoNothing();

    // 3. Catalog, Categories, and Items
    const catalogId = makeScaleUuid(tenantNum, 3);
    await db
      .insert(catalogs)
      .values({
        catalogId,
        tenantId,
        outletId: restaurantOutletId,
        name: `A La Carte Dining Menu ${tenantNum}`,
        isActive: true,
      })
      .onConflictDoNothing();

    const categoryIds: string[] = [];
    const itemIds: string[] = [];

    for (let c = 1; c <= 4; c++) {
      const categoryId = makeScaleUuid(tenantNum, 100 + c);
      categoryIds.push(categoryId);

      await db
        .insert(catalogCategories)
        .values({
          categoryId,
          tenantId,
          catalogId,
          name: `Category ${c} - Tenant ${tenantNum}`,
          displayOrder: c,
          isActive: true,
        })
        .onConflictDoNothing();

      for (let m = 1; m <= 8; m++) {
        const itemId = makeScaleUuid(tenantNum, 1000 + c * 50 + m);
        itemIds.push(itemId);

        await db
          .insert(catalogItems)
          .values({
            itemId,
            tenantId,
            categoryId,
            name: `Deluxe Dish ${c}-${m} (Tenant ${tenantNum})`,
            basePrice: (150 + c * 50 + m * 10).toFixed(4),
            taxRate: "0.0500",
            isAvailable: true,
            fulfillmentStation: m % 2 === 0 ? "BAR" : "KITCHEN",
          })
          .onConflictDoNothing();
      }
    }

    // 4. Restaurant Tables, Business Contexts, QR Tokens, Active Sessions
    const tableIds: string[] = [];
    const contextIds: string[] = [];
    const customerSessionIds: string[] = [];
    const qrTokenStrings: string[] = [];
    const sessionTokens: string[] = [];
    const customerIds: string[] = [];

    for (let t = 1; t <= 10; t++) {
      const contextId = makeScaleUuid(tenantNum, 2000 + t);
      const tableId = makeScaleUuid(tenantNum, 3000 + t);
      const tokenId = makeScaleUuid(tenantNum, 4000 + t);
      const sessionId = makeScaleUuid(tenantNum, 5000 + t);
      const customerId = makeScaleUuid(tenantNum, 6000 + t);
      const opaqueToken = `opaque_s6_t${tenantNum}_tab_${t}_${crypto.randomBytes(4).toString("hex")}`;

      tableIds.push(tableId);
      contextIds.push(contextId);
      customerSessionIds.push(sessionId);
      qrTokenStrings.push(opaqueToken);
      customerIds.push(customerId);

      await db
        .insert(businessContexts)
        .values({
          contextId,
          tenantId,
          outletId: restaurantOutletId,
          contextType: "TABLE",
          identifier: `T${t}`,
          displayLabel: `Table ${t}`,
          status: "OCCUPIED",
          isActive: true,
        })
        .onConflictDoNothing();

      await db
        .insert(restaurantTables)
        .values({
          tableId,
          tenantId,
          outletId: restaurantOutletId,
          contextId,
          tableNumber: `T${t}`,
          displayLabel: `Table ${t}`,
          capacity: 4,
          section: t <= 5 ? "Main Dining" : "Patio Terrace",
          status: "OCCUPIED",
          isActive: true,
        })
        .onConflictDoNothing();

      await db
        .insert(qrTokens)
        .values({
          tokenId,
          tenantId,
          outletId: restaurantOutletId,
          contextId,
          opaqueToken,
          tokenStatus: "ACTIVE",
        })
        .onConflictDoNothing();

      await db
        .insert(customers)
        .values({
          customerId,
          tenantId,
          fullName: `Scale Test Customer ${tenantNum}-${t}`,
          phone: `+91980000${tenantNum}${t}0`,
          email: `scale_customer_${tenantNum}_${t}@example.com`,
        })
        .onConflictDoNothing();

      await db
        .insert(customerSessions)
        .values({
          sessionId,
          tenantId,
          outletId: restaurantOutletId,
          contextId,
          tokenId,
          customerId,
          deviceFingerprint: `device_scale_${tenantNum}_${t}`,
          customerPhone: `+91980000${tenantNum}${t}0`,
          customerName: `Scale Test Customer ${tenantNum}-${t}`,
          sessionStatus: "ACTIVE",
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        })
        .onConflictDoNothing();

      await db
        .insert(restaurantTableSessions)
        .values({
          sessionId,
          tenantId,
          outletId: restaurantOutletId,
          tableId,
          sessionNumber: `SESS_${tenantNum}_${t}`,
          status: "ACTIVE",
          guestCount: 2,
          customerName: `Scale Test Customer ${tenantNum}-${t}`,
          customerPhone: `+91980000${tenantNum}${t}0`,
        })
        .onConflictDoNothing();

      const token = signJwt(
        {
          sub: sessionId,
          tenantId,
          outletId: restaurantOutletId,
          contextId,
          sessionType: "CUSTOMER",
          roles: [],
          permissions: [],
          isSuperAdmin: false,
        },
        86400
      );
      sessionTokens.push(token);
    }

    // 5. Hotel Rooms, Stays, and Housekeeping Tasks
    const hotelRoomIds: string[] = [];
    const hotelStayIds: string[] = [];

    const roomTypeId = makeScaleUuid(tenantNum, 7001);
    await db
      .insert(hotelRoomTypes)
      .values({
        roomTypeId,
        tenantId,
        outletId: hotelOutletId,
        code: `DLX_${tenantNum}`,
        name: `Deluxe Suite ${tenantNum}`,
        baseOccupancy: 2,
        maxOccupancy: 4,
        baseRate: "4500.0000",
        isActive: true,
      })
      .onConflictDoNothing();

    for (let r = 1; r <= 8; r++) {
      const roomContextId = makeScaleUuid(tenantNum, 8000 + r);
      const roomId = makeScaleUuid(tenantNum, 9000 + r);
      hotelRoomIds.push(roomId);

      await db
        .insert(businessContexts)
        .values({
          contextId: roomContextId,
          tenantId,
          outletId: hotelOutletId,
          contextType: "ROOM",
          identifier: `R${100 + r}`,
          displayLabel: `Room ${100 + r}`,
          status: r <= 4 ? "OCCUPIED" : "AVAILABLE",
          isActive: true,
        })
        .onConflictDoNothing();

      await db
        .insert(hotelRooms)
        .values({
          roomId,
          tenantId,
          outletId: hotelOutletId,
          contextId: roomContextId,
          roomTypeId,
          roomNumber: `${100 + r}`,
          floorNumber: "1",
          operationalStatus: r <= 4 ? "OCCUPIED" : "AVAILABLE",
          housekeepingStatus: r % 2 === 0 ? "CLEAN" : "DIRTY",
          isOccupied: r <= 4,
          isActive: true,
        })
        .onConflictDoNothing();

      if (r <= 4) {
        const guestId = makeScaleUuid(tenantNum, 10000 + r);
        const stayId = makeScaleUuid(tenantNum, 11000 + r);
        hotelStayIds.push(stayId);

        await db
          .insert(hotelGuests)
          .values({
            guestId,
            tenantId,
            customerId: customerIds[r - 1],
            vipStatus: "STANDARD",
          })
          .onConflictDoNothing();

        await db
          .insert(hotelReservations)
          .values({
            reservationId: stayId,
            tenantId,
            outletId: hotelOutletId,
            guestId,
            reservationNumber: `RES_${tenantNum}_${r}`,
            roomTypeId,
            assignedRoomId: roomId,
            arrivalDate: new Date(),
            departureDate: new Date(Date.now() + 48 * 3600 * 1000),
            status: "CHECKED_IN",
            totalAmount: "9000.0000",
          })
          .onConflictDoNothing();

        await db
          .insert(hotelStays)
          .values({
            stayId,
            tenantId,
            outletId: hotelOutletId,
            reservationId: stayId,
            guestId,
            roomId,
            stayNumber: `STAY_${tenantNum}_${r}`,
            status: "ACTIVE",
            checkInAt: new Date(),
            expectedCheckOutAt: new Date(Date.now() + 48 * 3600 * 1000),
          })
          .onConflictDoNothing();
      }
    }

    fixtures.push({
      tenantId,
      name,
      restaurantOutletId,
      hotelOutletId,
      catalogId,
      categoryIds,
      itemIds,
      tableIds,
      contextIds,
      customerSessionIds,
      qrTokens: qrTokenStrings,
      sessionTokens,
      customerIds,
      hotelRoomIds,
      hotelStayIds,
      orderIds: [],
    });
  }

  return fixtures;
}
