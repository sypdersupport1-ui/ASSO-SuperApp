import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { POST as ordersPost, GET as ordersGet } from "@/app/api/v1/restaurant/orders/route";
import { POST as cartItemPost } from "@/app/api/v1/restaurant/cart/items/route";
import { GET as cartGet } from "@/app/api/v1/restaurant/cart/route";
import { getDb } from "@/db/client";
import {
  orders,
  orderItems,
  orderStatusHistory,
  catalogs,
  catalogCategories,
  catalogItems,
} from "@/db/schema/operations";
import {
  restaurantTables,
  restaurantTableSessions,
  restaurantCartItems,
} from "@/db/schema/restaurant";
import { businessContexts, customerSessions, qrTokens } from "@/db/schema/context";
import { organizations, outlets, customers } from "@/db/schema/core";
import { domainOutboxEvents } from "@/db/schema/communication";
import { taxConfigurations, platformFeeConfigurations } from "@/db/schema/finance";
import { signJwt } from "@/lib/auth/jwt";
import { setTenantEntitlements } from "@/lib/entitlements/checker";
import { eq, and, isNull } from "drizzle-orm";
import postgres from "postgres";

describe("ASSO Restaurant Vertical — Slice 3.2: Server-Authoritative Order Creation", () => {
  const TENANT_A = "11111111-1111-1111-1111-111111111111";
  const TENANT_B = "22222222-2222-2222-2222-222222222222";

  const rawSql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 3 });

  let outletIdA: string;
  let outletIdB: string;

  let table1Id: string;
  let context1Id: string;
  let tableSession1Id: string;

  let table2Id: string;
  let context2Id: string;
  let tableSession2ClosedId: string;

  let tableBId: string;
  let contextBId: string;
  let tableSessionBId: string;

  let customerAId: string;
  let customerSession1Id: string;
  let customerToken1: string;

  let customerSessionAnonId: string;
  let customerTokenAnon: string;

  let customerSessionTable2Id: string;
  let customerTokenTable2: string;

  let customerSessionBId: string;
  let customerTokenB: string;

  let itemBiryaniId: string;
  let itemNaanId: string;
  let itemUnavailableId: string;
  let itemInactiveCatId: string;
  let itemOutletBId: string;

  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    // Entitlements
    setTenantEntitlements(TENANT_A, ["CORE", "RESTAURANT", "ORDERING", "POS"]);
    setTenantEntitlements(TENANT_B, ["CORE", "RESTAURANT", "ORDERING"]);

    const db = getDb();

    // 1. Setup Outlets
    const outARows = await db
      .select()
      .from(outlets)
      .where(and(eq(outlets.tenantId, TENANT_A), eq(outlets.verticalType, "RESTAURANT")))
      .limit(1);

    if (outARows.length > 0) {
      outletIdA = outARows[0].outletId;
    } else {
      const [newOutA] = await db
        .insert(outlets)
        .values({
          tenantId: TENANT_A,
          name: "Saffron Royal Court",
          code: `SRC_${Date.now().toString().slice(-4)}`,
          verticalType: "RESTAURANT",
        })
        .returning();
      outletIdA = newOutA.outletId;
    }

    const outBRows = await db
      .select()
      .from(outlets)
      .where(and(eq(outlets.tenantId, TENANT_B), eq(outlets.verticalType, "RESTAURANT")))
      .limit(1);

    if (outBRows.length > 0) {
      outletIdB = outBRows[0].outletId;
    } else {
      const [newOutB] = await db
        .insert(outlets)
        .values({
          tenantId: TENANT_B,
          name: "Azure Bistro",
          code: `AB_${Date.now().toString().slice(-4)}`,
          verticalType: "RESTAURANT",
        })
        .returning();
      outletIdB = newOutB.outletId;
    }

    // 2. Setup Physical Tables & Contexts
    // Table 1 (Active Table with Active Table Session)
    const [ctx1] = await db
      .insert(businessContexts)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextType: "RESTAURANT_TABLE",
        identifier: `T1-R32-${Date.now().toString().slice(-4)}`,
        displayLabel: "Table 1 - Main Floor",
        status: "OCCUPIED",
      })
      .returning();
    context1Id = ctx1.contextId;

    const [t1] = await db
      .insert(restaurantTables)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: context1Id,
        tableNumber: `T1-${Date.now().toString().slice(-4)}`,
        displayLabel: "Table 1 - Main Floor",
        capacity: 4,
        section: "Main Dining",
        status: "OCCUPIED",
        isActive: true,
      })
      .returning();
    table1Id = t1.tableId;

    const [sess1] = await db
      .insert(restaurantTableSessions)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        tableId: table1Id,
        sessionNumber: `TS-1-${Date.now()}`,
        status: "ACTIVE",
        guestCount: 2,
        customerName: "Vikramaditya Roy",
        customerPhone: "+919876543999",
      })
      .returning();
    tableSession1Id = sess1.sessionId;

    // Table 2 (Table with CLOSED Table Session)
    const [ctx2] = await db
      .insert(businessContexts)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextType: "RESTAURANT_TABLE",
        identifier: `T2-R32-${Date.now().toString().slice(-4)}`,
        displayLabel: "Table 2 - Patio",
        status: "AVAILABLE",
      })
      .returning();
    context2Id = ctx2.contextId;

    const [t2] = await db
      .insert(restaurantTables)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: context2Id,
        tableNumber: `T2-${Date.now().toString().slice(-4)}`,
        displayLabel: "Table 2 - Patio",
        capacity: 2,
        section: "Patio",
        status: "AVAILABLE",
        isActive: true,
      })
      .returning();
    table2Id = t2.tableId;

    const [sess2Closed] = await db
      .insert(restaurantTableSessions)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        tableId: table2Id,
        sessionNumber: `TS-2-${Date.now()}`,
        status: "COMPLETED",
        closedAt: new Date(),
        guestCount: 2,
      })
      .returning();
    tableSession2ClosedId = sess2Closed.sessionId;

    // Table B (Tenant B)
    const [ctxB] = await db
      .insert(businessContexts)
      .values({
        tenantId: TENANT_B,
        outletId: outletIdB,
        contextType: "RESTAURANT_TABLE",
        identifier: `TB-R32-${Date.now().toString().slice(-4)}`,
        displayLabel: "Table B - Terrace",
        status: "OCCUPIED",
      })
      .returning();
    contextBId = ctxB.contextId;

    const [tB] = await db
      .insert(restaurantTables)
      .values({
        tenantId: TENANT_B,
        outletId: outletIdB,
        contextId: contextBId,
        tableNumber: `TB-${Date.now().toString().slice(-4)}`,
        displayLabel: "Table B - Terrace",
        capacity: 4,
        section: "Terrace",
        status: "OCCUPIED",
        isActive: true,
      })
      .returning();
    tableBId = tB.tableId;

    const [sessB] = await db
      .insert(restaurantTableSessions)
      .values({
        tenantId: TENANT_B,
        outletId: outletIdB,
        tableId: tableBId,
        sessionNumber: `TS-B-${Date.now()}`,
        status: "ACTIVE",
        guestCount: 3,
      })
      .returning();
    tableSessionBId = sessB.sessionId;

    // 3. Setup Shared Customer Engine Record
    const [custA] = await db
      .insert(customers)
      .values({
        tenantId: TENANT_A,
        fullName: "Vikramaditya Roy",
        phone: "+919876543999",
        email: "vikram@example.com",
      })
      .returning();
    customerAId = custA.customerId;

    // 4. Setup QR Tokens & Customer Sessions
    const oneDayFromNow = new Date(Date.now() + 24 * 3600 * 1000);

    const [qr1] = await db
      .insert(qrTokens)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: context1Id,
        opaqueToken: `qr_tok_1_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        tokenStatus: "ACTIVE",
      })
      .returning();

    const [qr2] = await db
      .insert(qrTokens)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: context2Id,
        opaqueToken: `qr_tok_2_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        tokenStatus: "ACTIVE",
      })
      .returning();

    const [qrB] = await db
      .insert(qrTokens)
      .values({
        tenantId: TENANT_B,
        outletId: outletIdB,
        contextId: contextBId,
        opaqueToken: `qr_tok_b_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        tokenStatus: "ACTIVE",
      })
      .returning();

    // Customer Session 1: Identified on Table 1
    const [cs1] = await db
      .insert(customerSessions)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: context1Id,
        tokenId: qr1.tokenId,
        deviceFingerprint: "fp_test_1",
        customerId: customerAId,
        customerName: "Vikramaditya Roy",
        customerPhone: "+919876543999",
        sessionStatus: "ACTIVE",
        expiresAt: oneDayFromNow,
      })
      .returning();
    customerSession1Id = cs1.sessionId;
    customerToken1 = signJwt({
      sub: customerSession1Id,
      tenantId: TENANT_A,
      outletId: outletIdA,
      contextId: context1Id,
      sessionType: "CUSTOMER",
      isSuperAdmin: false,
    });

    // Customer Session Anon: Anonymous guest on Table 1
    const [csAnon] = await db
      .insert(customerSessions)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: context1Id,
        tokenId: qr1.tokenId,
        deviceFingerprint: "fp_test_anon",
        customerId: null,
        sessionStatus: "ACTIVE",
        expiresAt: oneDayFromNow,
      })
      .returning();
    customerSessionAnonId = csAnon.sessionId;
    customerTokenAnon = signJwt({
      sub: customerSessionAnonId,
      tenantId: TENANT_A,
      outletId: outletIdA,
      contextId: context1Id,
      sessionType: "CUSTOMER",
      isSuperAdmin: false,
    });

    // Customer Session on Table 2 (where table session is closed)
    const [cs2] = await db
      .insert(customerSessions)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: context2Id,
        tokenId: qr2.tokenId,
        deviceFingerprint: "fp_test_2",
        sessionStatus: "ACTIVE",
        expiresAt: oneDayFromNow,
      })
      .returning();
    customerSessionTable2Id = cs2.sessionId;
    customerTokenTable2 = signJwt({
      sub: customerSessionTable2Id,
      tenantId: TENANT_A,
      outletId: outletIdA,
      contextId: context2Id,
      sessionType: "CUSTOMER",
      isSuperAdmin: false,
    });

    // Customer Session on Tenant B
    const [csB] = await db
      .insert(customerSessions)
      .values({
        tenantId: TENANT_B,
        outletId: outletIdB,
        contextId: contextBId,
        tokenId: qrB.tokenId,
        deviceFingerprint: "fp_test_b",
        sessionStatus: "ACTIVE",
        expiresAt: oneDayFromNow,
      })
      .returning();
    customerSessionBId = csB.sessionId;
    customerTokenB = signJwt({
      sub: customerSessionBId,
      tenantId: TENANT_B,
      outletId: outletIdB,
      contextId: contextBId,
      sessionType: "CUSTOMER",
      isSuperAdmin: false,
    });

    // 5. Setup Menu Catalogs, Categories & Items
    // Outlet A Active Catalog & Category
    const [catA] = await db
      .insert(catalogs)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        name: "Saffron Royal Menu",
        isActive: true,
      })
      .returning();

    const [catCatA] = await db
      .insert(catalogCategories)
      .values({
        tenantId: TENANT_A,
        catalogId: catA.catalogId,
        name: "Main Course",
        displayOrder: 1,
        isActive: true,
      })
      .returning();

    // Outlet A Inactive Category
    const [inactiveCatA] = await db
      .insert(catalogCategories)
      .values({
        tenantId: TENANT_A,
        catalogId: catA.catalogId,
        name: "Seasonal Specials (Inactive)",
        displayOrder: 2,
        isActive: false,
      })
      .returning();

    // Items
    const [biryani] = await db
      .insert(catalogItems)
      .values({
        tenantId: TENANT_A,
        categoryId: catCatA.categoryId,
        name: "Dum Handi Mutton Biryani",
        basePrice: "650.0000",
        taxRate: "0.0500",
        isAvailable: true,
        fulfillmentStation: "KITCHEN",
      })
      .returning();
    itemBiryaniId = biryani.itemId;

    const [naan] = await db
      .insert(catalogItems)
      .values({
        tenantId: TENANT_A,
        categoryId: catCatA.categoryId,
        name: "Garlic Butter Naan",
        basePrice: "120.0000",
        taxRate: "0.0500",
        isAvailable: true,
        fulfillmentStation: "TANDOOR",
      })
      .returning();
    itemNaanId = naan.itemId;

    const [unavail] = await db
      .insert(catalogItems)
      .values({
        tenantId: TENANT_A,
        categoryId: catCatA.categoryId,
        name: "Truffle Lobster Tails (Sold Out)",
        basePrice: "1400.0000",
        taxRate: "0.0500",
        isAvailable: false,
        fulfillmentStation: "KITCHEN",
      })
      .returning();
    itemUnavailableId = unavail.itemId;

    const [inactItem] = await db
      .insert(catalogItems)
      .values({
        tenantId: TENANT_A,
        categoryId: inactiveCatA.categoryId,
        name: "Winter Hot Toddy",
        basePrice: "450.0000",
        taxRate: "0.0500",
        isAvailable: true,
        fulfillmentStation: "BAR",
      })
      .returning();
    itemInactiveCatId = inactItem.itemId;

    // Outlet B Catalog & Item
    const [catB] = await db
      .insert(catalogs)
      .values({
        tenantId: TENANT_B,
        outletId: outletIdB,
        name: "Azure Bistro Menu",
        isActive: true,
      })
      .returning();

    const [catCatB] = await db
      .insert(catalogCategories)
      .values({
        tenantId: TENANT_B,
        catalogId: catB.catalogId,
        name: "Bistro Specials",
        displayOrder: 1,
        isActive: true,
      })
      .returning();

    const [itemB] = await db
      .insert(catalogItems)
      .values({
        tenantId: TENANT_B,
        categoryId: catCatB.categoryId,
        name: "French Onion Soup",
        basePrice: "350.0000",
        taxRate: "0.0500",
        isAvailable: true,
        fulfillmentStation: "KITCHEN",
      })
      .returning();
    itemOutletBId = itemB.itemId;

    // Clean and seed 5% GST tax configuration for outletIdA so standard order tests run under configured 5% GST
    await db.delete(taxConfigurations).where(eq(taxConfigurations.tenantId, TENANT_A));
    await db.delete(platformFeeConfigurations).where(eq(platformFeeConfigurations.tenantId, TENANT_A));
    await db.delete(platformFeeConfigurations).where(isNull(platformFeeConfigurations.tenantId));

    await db.insert(taxConfigurations).values({
      tenantId: TENANT_A,
      outletId: outletIdA,
      taxName: "GST",
      taxRate: "0.0500",
      isEnabled: true,
    });
  });

  afterAll(async () => {
    const db = getDb();
    for (const ordId of createdOrderIds) {
      await db.delete(orderItems).where(eq(orderItems.orderId, ordId));
      await db.delete(orderStatusHistory).where(eq(orderStatusHistory.orderId, ordId));
      await db.delete(orders).where(eq(orders.orderId, ordId));
    }
    // Clean up tax & fee configurations
    await db.delete(taxConfigurations).where(eq(taxConfigurations.tenantId, TENANT_A));
    await db.delete(platformFeeConfigurations).where(eq(platformFeeConfigurations.tenantId, TENANT_A));
    await db.delete(platformFeeConfigurations).where(isNull(platformFeeConfigurations.tenantId));
    // Clean up any cart items for test sessions
    await db
      .delete(restaurantCartItems)
      .where(eq(restaurantCartItems.tenantId, TENANT_A));
    await db
      .delete(restaurantCartItems)
      .where(eq(restaurantCartItems.tenantId, TENANT_B));
    await rawSql.end();
  });

  // Helper to add items to customer cart via Cart API
  async function addItemsToCart(token: string, itemId: string, quantity: number, instructions?: string) {
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/cart/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ itemId, quantity, specialInstructions: instructions }),
    });
    const res = await cartItemPost(req);
    expect(res.status).toBe(200);
  }

  // ==========================================================================
  // 1. ORDER SUCCESS & DOMAIN INTEGRITY
  // ==========================================================================

  let placedOrderId1: string;

  it("1. Valid customer cart creates one Restaurant order", async () => {
    // Add 1 Biryani and 2 Naans to cart
    await addItemsToCart(customerToken1, itemBiryaniId, 1, "Medium spicy");
    await addItemsToCart(customerToken1, itemNaanId, 2, "Extra crispy");

    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken1}`,
      },
      body: JSON.stringify({ guestNotes: "Serve together" }),
    });

    const res = await ordersPost(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);

    const data = json.data;
    expect(data.orderId).toBeDefined();
    placedOrderId1 = data.orderId;
    createdOrderIds.push(placedOrderId1);

    expect(data.status).toBe("PLACED");
    expect(data.displayStatus).toBe("Received");
    expect(data.itemCount).toBe(2);
  });

  it("2. Correct customer is attached to created order", async () => {
    const db = getDb();
    const [ord] = await db.select().from(orders).where(eq(orders.orderId, placedOrderId1));
    expect(ord.customerId).toBe(customerAId);
    expect(ord.sessionId).toBe(customerSession1Id);
  });

  it("3. Correct physical table is attached to created order", async () => {
    const db = getDb();
    const [ord] = await db.select().from(orders).where(eq(orders.orderId, placedOrderId1));
    expect(ord.tableId).toBe(table1Id);
    expect(ord.contextId).toBe(context1Id);
  });

  it("4. Correct active table session is attached to created order", async () => {
    const db = getDb();
    const [ord] = await db.select().from(orders).where(eq(orders.orderId, placedOrderId1));
    expect(ord.tableSessionId).toBe(tableSession1Id);
  });

  it("5. Order source is strictly assigned as CUSTOMER_WEB", async () => {
    const db = getDb();
    const [ord] = await db.select().from(orders).where(eq(orders.orderId, placedOrderId1));
    expect(ord.orderSource).toBe("CUSTOMER_WEB");
    expect(ord.diningContext).toBe("DINE_IN");
  });

  it("6. Order receives correct initial status PLACED", async () => {
    const db = getDb();
    const [ord] = await db.select().from(orders).where(eq(orders.orderId, placedOrderId1));
    expect(ord.status).toBe("PLACED");

    // Order status history record created
    const history = await db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, placedOrderId1));
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].toStatus).toBe("PLACED");
  });

  it("7. Correct human-readable order number is generated server-side", async () => {
    const db = getDb();
    const [ord] = await db.select().from(orders).where(eq(orders.orderId, placedOrderId1));
    expect(ord.orderNumber).toMatch(/^RO-\d{8}-\d{4}$/);
  });

  it("8. All valid cart items become independently addressable order items", async () => {
    const db = getDb();
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, placedOrderId1));
    expect(items.length).toBe(2);

    const biryaniItem = items.find((i) => i.itemId === itemBiryaniId);
    expect(biryaniItem).toBeDefined();
    expect(biryaniItem!.itemName).toBe("Dum Handi Mutton Biryani");
    expect(biryaniItem!.quantity).toBe(1);
    expect(biryaniItem!.fulfillmentStation).toBe("KITCHEN");
    expect(biryaniItem!.specialNotes).toBe("Medium spicy");

    const naanItem = items.find((i) => i.itemId === itemNaanId);
    expect(naanItem).toBeDefined();
    expect(naanItem!.itemName).toBe("Garlic Butter Naan");
    expect(naanItem!.quantity).toBe(2);
    expect(naanItem!.fulfillmentStation).toBe("TANDOOR");
    expect(naanItem!.specialNotes).toBe("Extra crispy");
  });

  // ==========================================================================
  // 2. PRICE AUTHORITY & CALCULATIONS
  // ==========================================================================

  it("9. Client-supplied price in request body is completely ignored", async () => {
    // Re-populate cart
    await addItemsToCart(customerToken1, itemNaanId, 1);

    // Client maliciously attempts to send price = 1.00
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken1}`,
      },
      body: JSON.stringify({
        price: "1.00",
        unitPrice: "1.00",
        totalAmount: "1.00",
      }),
    });

    const res = await ordersPost(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    createdOrderIds.push(json.data.orderId);

    // Naan catalog price is 120.00, NOT 1.00
    expect(json.data.items[0].unitPrice).toBe("120.00");
  });

  it("10. Current authoritative catalog price is used for order lines", async () => {
    const db = getDb();
    const lastOrderId = createdOrderIds[createdOrderIds.length - 1];
    const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, lastOrderId));
    expect(parseFloat(line.unitPrice)).toBe(120);
  });

  it("11. Historical price snapshot is stored and remains immutable", async () => {
    const db = getDb();
    const lastOrderId = createdOrderIds[createdOrderIds.length - 1];

    // Alter catalog price
    await db
      .update(catalogItems)
      .set({ basePrice: "200.0000" })
      .where(eq(catalogItems.itemId, itemNaanId));

    // Order item line price in DB remains 120.0000
    const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, lastOrderId));
    expect(parseFloat(line.unitPrice)).toBe(120);

    // Restore catalog price
    await db
      .update(catalogItems)
      .set({ basePrice: "120.0000" })
      .where(eq(catalogItems.itemId, itemNaanId));
  });

  it("12. Client-supplied subtotal and total are ignored", async () => {
    await addItemsToCart(customerToken1, itemNaanId, 2);

    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken1}`,
      },
      body: JSON.stringify({
        subtotalAmount: "10.00",
        totalAmount: "10.50",
      }),
    });

    const res = await ordersPost(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    createdOrderIds.push(json.data.orderId);

    // Subtotal: 2 * 120 = 240.00, Tax: 12.00, Total: 252.00
    expect(json.data.subtotalAmount).toBe("240.00");
    expect(json.data.taxAmount).toBe("12.00");
    expect(json.data.totalAmount).toBe("252.00");
  });

  it("13. Server-authoritative total calculation is mathematically exact", async () => {
    const db = getDb();
    const lastOrderId = createdOrderIds[createdOrderIds.length - 1];
    const [ord] = await db.select().from(orders).where(eq(orders.orderId, lastOrderId));

    const subtotal = parseFloat(ord.subtotalAmount);
    const tax = parseFloat(ord.taxAmount);
    const total = parseFloat(ord.totalAmount);

    expect(subtotal).toBe(240);
    expect(tax).toBe(12);
    expect(total).toBe(252);
  });

  // ==========================================================================
  // 3. AVAILABILITY & CATALOG BOUNDARIES
  // ==========================================================================

  it("14. Available item can be ordered successfully", async () => {
    await addItemsToCart(customerToken1, itemBiryaniId, 1);
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken1}`,
      },
    });
    const res = await ordersPost(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    createdOrderIds.push(json.data.orderId);
  });

  it("15. Unavailable/sold-out item in cart causes entire order rejection", async () => {
    const db = getDb();

    // Directly insert an unavailable item into cart to simulate race condition
    await db.insert(restaurantCartItems).values({
      tenantId: TENANT_A,
      sessionId: customerSession1Id,
      itemId: itemUnavailableId,
      quantity: 1,
    });

    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken1}`,
      },
    });
    const res = await ordersPost(req);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.message).toContain("currently unavailable or sold out");

    // Clean up unavailable item from cart
    await db
      .delete(restaurantCartItems)
      .where(
        and(
          eq(restaurantCartItems.sessionId, customerSession1Id),
          eq(restaurantCartItems.itemId, itemUnavailableId)
        )
      );
  });

  it("16. Item belonging to another outlet catalog is rejected", async () => {
    const db = getDb();

    // Directly insert item belonging to Outlet B into customer 1 cart (Outlet A)
    await db.insert(restaurantCartItems).values({
      tenantId: TENANT_A,
      sessionId: customerSession1Id,
      itemId: itemOutletBId,
      quantity: 1,
    });

    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken1}`,
      },
    });
    const res = await ordersPost(req);
    expect([400, 422]).toContain(res.status);

    await db
      .delete(restaurantCartItems)
      .where(
        and(
          eq(restaurantCartItems.sessionId, customerSession1Id),
          eq(restaurantCartItems.itemId, itemOutletBId)
        )
      );
  });

  it("17. Item in inactive category is rejected", async () => {
    const db = getDb();

    // Directly insert item in inactive category into cart
    await db.insert(restaurantCartItems).values({
      tenantId: TENANT_A,
      sessionId: customerSession1Id,
      itemId: itemInactiveCatId,
      quantity: 1,
    });

    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken1}`,
      },
    });
    const res = await ordersPost(req);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.message).toContain("inactive menu category");

    await db
      .delete(restaurantCartItems)
      .where(
        and(
          eq(restaurantCartItems.sessionId, customerSession1Id),
          eq(restaurantCartItems.itemId, itemInactiveCatId)
        )
      );
  });

  // ==========================================================================
  // 4. TABLE & TABLE-SESSION RELATIONSHIPS
  // ==========================================================================

  it("18. Closed table session cannot create an order (422/BusinessRuleError)", async () => {
    // Add item to cart for Table 2 (where table session is closed)
    await addItemsToCart(customerTokenTable2, itemBiryaniId, 1);

    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerTokenTable2}`,
      },
    });

    const res = await ordersPost(req);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.message).toContain("No active dining session");
  });

  it("19. Customer on Table 1 cannot place order for Table 2", async () => {
    // Customer 1 token has contextId of Table 1.
    // Client maliciously attempts to send tableId: table2Id in body
    await addItemsToCart(customerToken1, itemNaanId, 1);

    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken1}`,
      },
      body: JSON.stringify({ tableId: table2Id }),
    });

    const res = await ordersPost(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    createdOrderIds.push(json.data.orderId);

    // Server attached Table 1, NOT Table 2
    const db = getDb();
    const [ord] = await db.select().from(orders).where(eq(orders.orderId, json.data.orderId));
    expect(ord.tableId).toBe(table1Id);
    expect(ord.tableId).not.toBe(table2Id);
  });

  it("20. Tenant B customer token cannot place orders for Tenant A table", async () => {
    await addItemsToCart(customerTokenB, itemOutletBId, 1);

    // Tenant B attempts to order against Tenant A outlet
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerTokenB}`,
        "x-tenant-id": TENANT_A, // Attempt tenant spoofing
      },
    });

    const res = await ordersPost(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    createdOrderIds.push(json.data.orderId);

    // Server strictly isolated to Tenant B
    const db = getDb();
    const [ord] = await db.select().from(orders).where(eq(orders.orderId, json.data.orderId));
    expect(ord.tenantId).toBe(TENANT_B);
    expect(ord.tenantId).not.toBe(TENANT_A);
  });

  it("21. Multiple valid orders can be created against the same active table session sequentially", async () => {
    // Round 1: Biryani
    await addItemsToCart(customerToken1, itemBiryaniId, 1);
    const req1 = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken1}`,
      },
    });
    const res1 = await ordersPost(req1);
    expect(res1.status).toBe(201);
    const json1 = await res1.json();
    createdOrderIds.push(json1.data.orderId);

    // Round 2: Naan under SAME session
    await addItemsToCart(customerToken1, itemNaanId, 3);
    const req2 = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken1}`,
      },
    });
    const res2 = await ordersPost(req2);
    expect(res2.status).toBe(201);
    const json2 = await res2.json();
    createdOrderIds.push(json2.data.orderId);

    expect(json1.data.orderId).not.toBe(json2.data.orderId);
    expect(json1.data.tableSessionId).toBe(tableSession1Id);
    expect(json2.data.tableSessionId).toBe(tableSession1Id);
  });

  // ==========================================================================
  // 5. IDEMPOTENCY & REPLAY SAFETY
  // ==========================================================================

  it("22. Same idempotency key does not create duplicate order on retry", async () => {
    const idempKey = `idemp-r32-key-${Date.now()}`;
    await addItemsToCart(customerToken1, itemBiryaniId, 1);

    // Request 1
    const req1 = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken1}`,
        "Idempotency-Key": idempKey,
      },
    });
    const res1 = await ordersPost(req1);
    expect(res1.status).toBe(201);
    const json1 = await res1.json();
    createdOrderIds.push(json1.data.orderId);

    // Request 2 (Replay with same idempotency key)
    const req2 = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken1}`,
        "Idempotency-Key": idempKey,
      },
    });
    const res2 = await ordersPost(req2);
    expect([200, 201]).toContain(res2.status);
    const json2 = await res2.json();

    // Exactly the same order ID returned
    expect(json2.data.orderId).toBe(json1.data.orderId);
    expect(json2.data.orderNumber).toBe(json1.data.orderNumber);
  });

  it("23. Different idempotency keys create distinct valid orders", async () => {
    const idempKeyA = `idemp-diff-A-${Date.now()}`;
    const idempKeyB = `idemp-diff-B-${Date.now()}`;

    await addItemsToCart(customerToken1, itemNaanId, 1);
    const reqA = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken1}`,
        "Idempotency-Key": idempKeyA,
      },
    });
    const resA = await ordersPost(reqA);
    const jsonA = await resA.json();
    createdOrderIds.push(jsonA.data.orderId);

    await addItemsToCart(customerToken1, itemNaanId, 1);
    const reqB = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken1}`,
        "Idempotency-Key": idempKeyB,
      },
    });
    const resB = await ordersPost(reqB);
    const jsonB = await resB.json();
    createdOrderIds.push(jsonB.data.orderId);

    expect(jsonA.data.orderId).not.toBe(jsonB.data.orderId);
  });

  // ==========================================================================
  // 6. ATOMICITY & CART CLEARING
  // ==========================================================================

  it("24. Pre-order cart is cleared after successful order placement", async () => {
    await addItemsToCart(customerToken1, itemBiryaniId, 2);

    const reqOrder = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken1}`,
      },
    });
    const resOrder = await ordersPost(reqOrder);
    expect(resOrder.status).toBe(201);
    const jsonOrder = await resOrder.json();
    createdOrderIds.push(jsonOrder.data.orderId);

    // Fetch cart via GET /api/v1/restaurant/cart
    const reqCart = new NextRequest("http://localhost:3000/api/v1/restaurant/cart", {
      method: "GET",
      headers: { Authorization: `Bearer ${customerToken1}` },
    });
    const resCart = await cartGet(reqCart);
    const jsonCart = await resCart.json();

    expect(jsonCart.data.items.length).toBe(0);
    expect(jsonCart.data.totalItems).toBe(0);
  });

  it("25. Cart remains intact when order placement fails validation", async () => {
    const db = getDb();

    // Add valid Biryani and unavailable item
    await addItemsToCart(customerToken1, itemBiryaniId, 1);
    await db.insert(restaurantCartItems).values({
      tenantId: TENANT_A,
      sessionId: customerSession1Id,
      itemId: itemUnavailableId,
      quantity: 1,
    });

    const reqOrder = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken1}`,
      },
    });
    const resOrder = await ordersPost(reqOrder);
    expect(resOrder.status).toBe(422);

    // Verify cart still has items
    const cart = await db
      .select()
      .from(restaurantCartItems)
      .where(eq(restaurantCartItems.sessionId, customerSession1Id));
    expect(cart.length).toBe(2);

    // Clean up
    await db
      .delete(restaurantCartItems)
      .where(eq(restaurantCartItems.sessionId, customerSession1Id));
  });

  // ==========================================================================
  // 7. SECURITY & ACCESS CONTROL
  // ==========================================================================

  it("26. Anonymous guest can place order; customerId is null but table session preserved", async () => {
    await addItemsToCart(customerTokenAnon, itemBiryaniId, 1);

    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerTokenAnon}`,
      },
    });

    const res = await ordersPost(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    createdOrderIds.push(json.data.orderId);

    expect(json.data.customerId).toBeNull();
    expect(json.data.tableSessionId).toBe(tableSession1Id);
  });

  it("27. Missing or invalid Bearer token is rejected (401)", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const res = await ordersPost(req);
    expect(res.status).toBe(401);
  });

  it("28. Tenant not entitled to RESTAURANT module is rejected (403)", async () => {
    const unentitledToken = signJwt({
      sub: "usr_unentitled",
      tenantId: "33333333-3333-3333-3333-333333333333",
      outletId: outletIdA,
      sessionType: "CUSTOMER",
      isSuperAdmin: false,
    });

    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${unentitledToken}`,
      },
    });
    const res = await ordersPost(req);
    expect(res.status).toBe(403);
  });

  it("29. Client cannot override order status to COMPLETED or READY", async () => {
    await addItemsToCart(customerToken1, itemNaanId, 1);

    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerToken1}`,
      },
      body: JSON.stringify({ status: "COMPLETED" }),
    });

    const res = await ordersPost(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    createdOrderIds.push(json.data.orderId);

    // Status is PLACED, ignoring client COMPLETED
    expect(json.data.status).toBe("PLACED");
  });

  // ==========================================================================
  // 8. COMMUNICATION & OUTBOX EVENT VERIFICATION
  // ==========================================================================

  it("30. Successful order atomically records ORDER_CONFIRMED into domain outbox", async () => {
    const db = getDb();
    const lastOrderId = createdOrderIds[createdOrderIds.length - 1];

    const outboxRows = await db
      .select()
      .from(domainOutboxEvents)
      .where(
        and(
          eq(domainOutboxEvents.tenantId, TENANT_A),
          eq(domainOutboxEvents.eventType, "ORDER_CONFIRMED"),
          eq(domainOutboxEvents.aggregateId, lastOrderId)
        )
      );

    expect(outboxRows.length).toBe(1);
    expect(outboxRows[0].status).toBe("PENDING");
    expect(outboxRows[0].vertical).toBe("RESTAURANT");
  });

  it("31. Customer can view their session order history via GET /api/v1/restaurant/orders", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "GET",
      headers: { Authorization: `Bearer ${customerToken1}` },
    });

    const res = await ordersGet(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(1);
    expect(json.data[0].tableNumber).toBeDefined();
  });
});
