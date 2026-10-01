import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { POST as ordersPost } from "@/app/api/v1/restaurant/orders/route";
import { POST as cartItemPost } from "@/app/api/v1/restaurant/cart/items/route";
import { GET as taxConfigGet, PUT as taxConfigPut } from "@/app/api/v1/restaurant/admin/tax-config/route";
import { GET as feeConfigGet, PUT as feeConfigPut } from "@/app/api/v1/restaurant/admin/platform-fee-config/route";
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
import { organizations, outlets } from "@/db/schema/core";
import { taxConfigurations, platformFeeConfigurations } from "@/db/schema/finance";
import { auditEvents } from "@/db/schema/system";
import { signJwt } from "@/lib/auth/jwt";
import { setTenantEntitlements } from "@/lib/entitlements/checker";
import {
  getEffectiveTaxConfig,
  upsertTaxConfig,
  getEffectivePlatformFeeConfig,
  upsertPlatformFeeConfig,
} from "@/lib/restaurant/financial-config-service";
import {
  calculateAuthoritativeTotals,
  getRestaurantOrderById,
} from "@/lib/restaurant/order-domain";
import { eq, and, isNull } from "drizzle-orm";
import postgres from "postgres";

describe("ASSO Restaurant Vertical — Slice 3.2 Correction: Configurable GST + Platform Fees", () => {
  const TENANT_A = "11111111-1111-1111-1111-111111111111";
  const TENANT_B = "22222222-2222-2222-2222-222222222222";

  const rawSql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 3 });

  let outletIdA: string;
  let outletIdB: string;
  let contextIdA: string;
  let tableIdA: string;
  let tableSessionIdA: string;
  let customerSessionIdA: string;
  let customerTokenA: string;
  let staffToken: string;
  let adminToken: string;
  let superAdminToken: string;

  let itemId1: string; // Price: 200.00
  let itemId2: string; // Price: 100.00

  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    const db = getDb();

    // 1. Entitlements
    setTenantEntitlements(TENANT_A, ["RESTAURANT"]);
    setTenantEntitlements(TENANT_B, ["RESTAURANT"]);

    // 2. Outlets
    const [existingOutA] = await db
      .select()
      .from(outlets)
      .where(and(eq(outlets.tenantId, TENANT_A), eq(outlets.verticalType, "RESTAURANT")))
      .limit(1);

    if (existingOutA) {
      outletIdA = existingOutA.outletId;
    } else {
      const [newOutA] = await db
        .insert(outlets)
        .values({
          tenantId: TENANT_A,
          name: "Saffron Royal Grill",
          code: `SRG_${Date.now().toString().slice(-4)}`,
          verticalType: "RESTAURANT",
        })
        .returning();
      outletIdA = newOutA.outletId;
    }

    const [existingOutB] = await db
      .select()
      .from(outlets)
      .where(and(eq(outlets.tenantId, TENANT_B), eq(outlets.verticalType, "RESTAURANT")))
      .limit(1);

    if (existingOutB) {
      outletIdB = existingOutB.outletId;
    } else {
      const [newOutB] = await db
        .insert(outlets)
        .values({
          tenantId: TENANT_B,
          name: "Bistro Emerald",
          code: `BE_${Date.now().toString().slice(-4)}`,
          verticalType: "RESTAURANT",
        })
        .returning();
      outletIdB = newOutB.outletId;
    }

    // 3. Table and Table Session
    const [ctxA] = await db
      .insert(businessContexts)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextType: "RESTAURANT_TABLE",
        identifier: `T-FIN-${Date.now().toString().slice(-4)}`,
        displayLabel: "Finance Test Table",
        status: "OCCUPIED",
      })
      .returning();
    contextIdA = ctxA.contextId;

    const [tblA] = await db
      .insert(restaurantTables)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: contextIdA,
        tableNumber: `TF-${Date.now().toString().slice(-4)}`,
        displayLabel: "Finance Test Table",
        capacity: 4,
        section: "Main Dining",
        status: "OCCUPIED",
        isActive: true,
      })
      .returning();
    tableIdA = tblA.tableId;

    const [sessA] = await db
      .insert(restaurantTableSessions)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        tableId: tableIdA,
        sessionNumber: `TSF-${Date.now().toString().slice(-4)}`,
        status: "ACTIVE",
        guestCount: 2,
        customerName: "Finance Test Guest",
      })
      .returning();
    tableSessionIdA = sessA.sessionId;

    // 4. QR and Customer Session
    const [qr] = await db
      .insert(qrTokens)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: contextIdA,
        opaqueToken: `qr_fin_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        tokenStatus: "ACTIVE",
      })
      .returning();

    const [cs] = await db
      .insert(customerSessions)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: contextIdA,
        tokenId: qr.tokenId,
        deviceFingerprint: "fp_finance_test",
        sessionStatus: "ACTIVE",
        expiresAt: new Date(Date.now() + 86400000),
      })
      .returning();
    customerSessionIdA = cs.sessionId;

    // 5. Auth Tokens
    customerTokenA = signJwt({
      sub: customerSessionIdA,
      tenantId: TENANT_A,
      outletId: outletIdA,
      contextId: contextIdA,
      sessionType: "CUSTOMER",
      isSuperAdmin: false,
    });

    staffToken = signJwt({
      sub: "staff_fin_user",
      tenantId: TENANT_A,
      outletId: outletIdA,
      sessionType: "STAFF",
      isSuperAdmin: false,
      permissions: ["restaurant.orders.view", "restaurant.menu.view"],
    });

    adminToken = signJwt({
      sub: "admin_fin_user",
      tenantId: TENANT_A,
      outletId: outletIdA,
      sessionType: "STAFF",
      isSuperAdmin: false,
      permissions: [
        "restaurant.settings.view",
        "restaurant.settings.manage",
        "restaurant.manage",
        "finance.manage",
      ],
    });

    superAdminToken = signJwt({
      sub: "superadmin_user",
      tenantId: TENANT_A,
      sessionType: "STAFF",
      isSuperAdmin: true,
      permissions: ["*"],
    });

    // 6. Catalog Items
    const [catalog] = await db
      .insert(catalogs)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        name: "Financial Test Menu",
        isActive: true,
      })
      .returning();

    const [category] = await db
      .insert(catalogCategories)
      .values({
        tenantId: TENANT_A,
        catalogId: catalog.catalogId,
        name: "Test Mains",
        isActive: true,
      })
      .returning();

    const [item1] = await db
      .insert(catalogItems)
      .values({
        tenantId: TENANT_A,
        categoryId: category.categoryId,
        name: "Butter Chicken",
        basePrice: "200.0000",
        taxRate: "0.0000",
        isAvailable: true,
        fulfillmentStation: "KITCHEN",
      })
      .returning();
    itemId1 = item1.itemId;

    const [item2] = await db
      .insert(catalogItems)
      .values({
        tenantId: TENANT_A,
        categoryId: category.categoryId,
        name: "Garlic Naan",
        basePrice: "100.0000",
        taxRate: "0.0000",
        isAvailable: true,
        fulfillmentStation: "KITCHEN",
      })
      .returning();
    itemId2 = item2.itemId;

    // Clean existing tax/fee configs for clean baseline
    await db.delete(taxConfigurations).where(eq(taxConfigurations.tenantId, TENANT_A));
    await db.delete(platformFeeConfigurations).where(eq(platformFeeConfigurations.tenantId, TENANT_A));
    await db.delete(platformFeeConfigurations).where(isNull(platformFeeConfigurations.tenantId));
  });

  afterAll(async () => {
    const db = getDb();
    for (const ordId of createdOrderIds) {
      await db.delete(orderItems).where(eq(orderItems.orderId, ordId));
      await db.delete(orderStatusHistory).where(eq(orderStatusHistory.orderId, ordId));
      await db.delete(orders).where(eq(orders.orderId, ordId));
    }
    await db.delete(taxConfigurations).where(eq(taxConfigurations.tenantId, TENANT_A));
    await db.delete(platformFeeConfigurations).where(eq(platformFeeConfigurations.tenantId, TENANT_A));
    await db.delete(platformFeeConfigurations).where(isNull(platformFeeConfigurations.tenantId));
    await db.delete(restaurantCartItems).where(eq(restaurantCartItems.tenantId, TENANT_A));
    await rawSql.end();
  });

  // Helper to add items to cart
  async function addCart(itemId: string, qty: number) {
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/cart/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerTokenA}`,
      },
      body: JSON.stringify({ itemId, quantity: qty }),
    });
    const res = await cartItemPost(req);
    expect(res.status).toBe(200);
  }

  // ==========================================================================
  // 1. GST CONFIGURATION & PRICE AUTHORITY
  // ==========================================================================

  it("1. Configured GST rate is authoritatively applied to new order", async () => {
    // Configure 12% GST for outletIdA
    await upsertTaxConfig({
      tenantId: TENANT_A,
      outletId: outletIdA,
      taxRate: 0.12,
      taxName: "GST-12",
      isEnabled: true,
      userId: "admin_user",
    });

    // Add 2x Butter Chicken (2 * 200 = 400) + 1x Garlic Naan (100) = Subtotal: 500.00
    await addCart(itemId1, 2);
    await addCart(itemId2, 1);

    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerTokenA}`,
      },
      body: JSON.stringify({ idempotencyKey: `fin_gst_12_${Date.now()}` }),
    });

    const res = await ordersPost(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    createdOrderIds.push(json.data.orderId);

    // Subtotal: 500.00, Tax at 12%: 60.00, Total: 560.00
    expect(json.data.subtotalAmount).toBe("500.00");
    expect(json.data.taxRate).toBe("0.1200");
    expect(json.data.taxAmount).toBe("60.00");
    expect(json.data.totalAmount).toBe("560.00");
  });

  it("2. Changing GST configuration affects ONLY new orders; historical orders remain unchanged", async () => {
    const originalOrderId = createdOrderIds[createdOrderIds.length - 1];

    // Admin updates GST from 12% to 18%
    await upsertTaxConfig({
      tenantId: TENANT_A,
      outletId: outletIdA,
      taxRate: 0.18,
      taxName: "GST-18",
      isEnabled: true,
      userId: "admin_user",
    });

    // Place a NEW order with 1x Butter Chicken (200.00)
    await addCart(itemId1, 1);
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerTokenA}`,
      },
      body: JSON.stringify({ idempotencyKey: `fin_gst_18_${Date.now()}` }),
    });

    const res = await ordersPost(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    createdOrderIds.push(json.data.orderId);

    // New order: Subtotal 200.00, Tax at 18%: 36.00, Total: 236.00
    expect(json.data.subtotalAmount).toBe("200.00");
    expect(json.data.taxRate).toBe("0.1800");
    expect(json.data.taxAmount).toBe("36.00");
    expect(json.data.totalAmount).toBe("236.00");

    // Historical order must retain original 12% (60.00 tax)
    const historicalOrder = await getRestaurantOrderById(TENANT_A, originalOrderId);
    expect(historicalOrder.taxRate).toBe("0.1200");
    expect(parseFloat(historicalOrder.taxAmount)).toBe(60);
    expect(parseFloat(historicalOrder.totalAmount)).toBe(560);
  });

  it("3. Zero / no GST configuration works cleanly without inventing tax policies", async () => {
    // Disable tax for outletIdA
    await upsertTaxConfig({
      tenantId: TENANT_A,
      outletId: outletIdA,
      taxRate: 0,
      isEnabled: false,
      userId: "admin_user",
    });

    await addCart(itemId2, 2); // 2 * 100 = 200.00

    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerTokenA}`,
      },
      body: JSON.stringify({ idempotencyKey: `fin_gst_zero_${Date.now()}` }),
    });

    const res = await ordersPost(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    createdOrderIds.push(json.data.orderId);

    // Subtotal: 200.00, Tax: 0.00, Total: 200.00
    expect(json.data.subtotalAmount).toBe("200.00");
    expect(json.data.taxRate).toBe("0.0000");
    expect(json.data.taxAmount).toBe("0.00");
    expect(json.data.totalAmount).toBe("200.00");
  });

  it("4. Client-supplied GST rate or amount in request body is completely ignored", async () => {
    // Set authoritative rate to 5%
    await upsertTaxConfig({
      tenantId: TENANT_A,
      outletId: outletIdA,
      taxRate: 0.05,
      isEnabled: true,
      userId: "admin_user",
    });

    await addCart(itemId1, 1); // 200.00

    // Malicious client claims 0 tax or 1 rupee tax
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerTokenA}`,
      },
      body: JSON.stringify({
        idempotencyKey: `fin_malicious_tax_${Date.now()}`,
        taxRate: 0.001,
        taxAmount: "1.00",
        totalAmount: "201.00",
      }),
    });

    const res = await ordersPost(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    createdOrderIds.push(json.data.orderId);

    // Server-authoritative: Subtotal 200.00, 5% Tax: 10.00, Total: 210.00
    expect(json.data.subtotalAmount).toBe("200.00");
    expect(json.data.taxRate).toBe("0.0500");
    expect(json.data.taxAmount).toBe("10.00");
    expect(json.data.totalAmount).toBe("210.00");
  });

  it("5. Invalid GST configuration (negative or > 100%) is rejected with 422", async () => {
    await expect(
      upsertTaxConfig({
        tenantId: TENANT_A,
        outletId: outletIdA,
        taxRate: -0.05,
      })
    ).rejects.toThrow();

    await expect(
      upsertTaxConfig({
        tenantId: TENANT_A,
        outletId: outletIdA,
        taxRate: 1.5,
      })
    ).rejects.toThrow();
  });

  // ==========================================================================
  // 2. ASSO PLATFORM FEE CONFIGURATION
  // ==========================================================================

  it("6. Configured percentage platform fee is authoritatively applied to orders", async () => {
    // 0% tax, 2.5% platform fee
    await upsertTaxConfig({
      tenantId: TENANT_A,
      outletId: outletIdA,
      taxRate: 0,
      isEnabled: false,
    });

    await upsertPlatformFeeConfig({
      tenantId: TENANT_A,
      outletId: outletIdA,
      feeType: "PERCENTAGE",
      feeRate: 0.025, // 2.5%
      isEnabled: true,
      userId: "superadmin_user",
    });

    await addCart(itemId1, 2); // 400.00 subtotal

    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerTokenA}`,
      },
      body: JSON.stringify({ idempotencyKey: `fin_fee_pct_${Date.now()}` }),
    });

    const res = await ordersPost(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    createdOrderIds.push(json.data.orderId);

    // Subtotal: 400.00, Fee (2.5%): 10.00, Tax: 0.00, Total: 410.00
    expect(json.data.subtotalAmount).toBe("400.00");
    expect(json.data.platformFeeRate).toBe("0.0250");
    expect(json.data.platformFeeAmount).toBe("10.00");
    expect(json.data.totalAmount).toBe("410.00");
  });

  it("7. Configured fixed platform fee is authoritatively applied to orders", async () => {
    await upsertPlatformFeeConfig({
      tenantId: TENANT_A,
      outletId: outletIdA,
      feeType: "FIXED",
      fixedAmount: 15.0, // Fixed ₹15
      isEnabled: true,
      userId: "superadmin_user",
    });

    await addCart(itemId2, 1); // 100.00 subtotal

    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerTokenA}`,
      },
      body: JSON.stringify({ idempotencyKey: `fin_fee_fix_${Date.now()}` }),
    });

    const res = await ordersPost(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    createdOrderIds.push(json.data.orderId);

    // Subtotal: 100.00, Fixed Fee: 15.00, Total: 115.00
    expect(json.data.subtotalAmount).toBe("100.00");
    expect(json.data.platformFeeAmount).toBe("15.00");
    expect(json.data.totalAmount).toBe("115.00");
  });

  it("8. Changing platform fee affects only new orders; historical orders retain original snapshots", async () => {
    const fixedOrderId = createdOrderIds[createdOrderIds.length - 1];

    // Change fee to fixed ₹30
    await upsertPlatformFeeConfig({
      tenantId: TENANT_A,
      outletId: outletIdA,
      feeType: "FIXED",
      fixedAmount: 30.0,
      isEnabled: true,
      userId: "superadmin_user",
    });

    await addCart(itemId2, 1); // 100.00

    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerTokenA}`,
      },
      body: JSON.stringify({ idempotencyKey: `fin_fee_fix_30_${Date.now()}` }),
    });

    const res = await ordersPost(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    createdOrderIds.push(json.data.orderId);

    // New order gets 30.00 fee
    expect(json.data.platformFeeAmount).toBe("30.00");
    expect(json.data.totalAmount).toBe("130.00");

    // Historical order retains 15.00 fee
    const historicalOrder = await getRestaurantOrderById(TENANT_A, fixedOrderId);
    expect(parseFloat(historicalOrder.platformFeeAmount)).toBe(15);
    expect(parseFloat(historicalOrder.totalAmount)).toBe(115);
  });

  it("9. Client cannot override or forge platform fee", async () => {
    // 30 fee is active
    await addCart(itemId1, 1); // 200.00

    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerTokenA}`,
      },
      body: JSON.stringify({
        idempotencyKey: `fin_forged_fee_${Date.now()}`,
        platformFeeAmount: "0.00",
        totalAmount: "200.00",
      }),
    });

    const res = await ordersPost(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    createdOrderIds.push(json.data.orderId);

    // Server-authoritative: Subtotal 200.00 + Fee 30.00 = Total 230.00
    expect(json.data.platformFeeAmount).toBe("30.00");
    expect(json.data.totalAmount).toBe("230.00");
  });

  // ==========================================================================
  // 3. COMBINED FINANCIAL CALCULATIONS & NO DOUBLE-APPLICATION
  // ==========================================================================

  it("10. Subtotal + configured GST + configured platform fee produces exact total with no double taxation", async () => {
    // 5% GST and 2% platform fee
    await upsertTaxConfig({
      tenantId: TENANT_A,
      outletId: outletIdA,
      taxRate: 0.05,
      isEnabled: true,
      userId: "admin_user",
    });

    await upsertPlatformFeeConfig({
      tenantId: TENANT_A,
      outletId: outletIdA,
      feeType: "PERCENTAGE",
      feeRate: 0.02,
      isEnabled: true,
      userId: "superadmin_user",
    });

    // 5x Butter Chicken (1000.00)
    await addCart(itemId1, 5);

    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerTokenA}`,
      },
      body: JSON.stringify({ idempotencyKey: `fin_combined_${Date.now()}` }),
    });

    const res = await ordersPost(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    createdOrderIds.push(json.data.orderId);

    // Exact Mathematical Invariant:
    // Subtotal: 1000.00
    // GST (5% of 1000): 50.00 (NOT on 1020)
    // Platform Fee (2% of 1000): 20.00 (NOT on 1050)
    // Total: 1000 + 50 + 20 = 1070.00
    expect(json.data.subtotalAmount).toBe("1000.00");
    expect(json.data.taxRate).toBe("0.0500");
    expect(json.data.taxAmount).toBe("50.00");
    expect(json.data.platformFeeRate).toBe("0.0200");
    expect(json.data.platformFeeAmount).toBe("20.00");
    expect(json.data.totalAmount).toBe("1070.00");
  });

  it("11. Idempotent retry returns identical committed financial values including tax and fee snapshots", async () => {
    const replayKey = `fin_idempotent_replay_${Date.now()}`;
    await addCart(itemId2, 1); // 100.00

    const req1 = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": replayKey,
        Authorization: `Bearer ${customerTokenA}`,
      },
      body: JSON.stringify({ idempotencyKey: replayKey }),
    });

    const res1 = await ordersPost(req1);
    expect(res1.status).toBe(201);
    const json1 = await res1.json();
    createdOrderIds.push(json1.data.orderId);

    // Change the tax and fee configuration in the database immediately after
    await upsertTaxConfig({
      tenantId: TENANT_A,
      outletId: outletIdA,
      taxRate: 0.28,
      isEnabled: true,
    });
    await upsertPlatformFeeConfig({
      tenantId: TENANT_A,
      outletId: outletIdA,
      feeType: "PERCENTAGE",
      feeRate: 0.10,
      isEnabled: true,
    });

    // Replay with original idempotency key
    const req2 = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": replayKey,
        Authorization: `Bearer ${customerTokenA}`,
      },
      body: JSON.stringify({ idempotencyKey: replayKey }),
    });

    const res2 = await ordersPost(req2);
    const json2 = await res2.json();

    // Must return original order with original 5% tax and 2% fee, NOT 28% and 10%!
    expect(json2.data.orderId).toBe(json1.data.orderId);
    expect(json2.data.taxRate).toBe(json1.data.taxRate);
    expect(json2.data.taxAmount).toBe(json1.data.taxAmount);
    expect(json2.data.platformFeeRate).toBe(json1.data.platformFeeRate);
    expect(json2.data.platformFeeAmount).toBe(json1.data.platformFeeAmount);
    expect(json2.data.totalAmount).toBe(json1.data.totalAmount);
  });

  // ==========================================================================
  // 4. RBAC, AUTHORIZATION & AUDITABILITY
  // ==========================================================================

  it("12. RBAC: Ordinary staff cannot adjust GST tax config (403 Forbidden)", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/admin/tax-config", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({ taxRate: 0.05 }),
    });

    const res = await taxConfigPut(req);
    expect(res.status).toBe(403);
  });

  it("13. RBAC: Restaurant Admin CAN adjust GST tax config (200 OK)", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/admin/tax-config", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ taxRate: 0.05, taxName: "GST-5", isEnabled: true }),
    });

    const res = await taxConfigPut(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.taxRate).toBe(0.05);
  });

  it("14. RBAC: Restaurant Admin CANNOT adjust ASSO platform fee (403 Forbidden)", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/admin/platform-fee-config", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`, // Not Super Admin!
      },
      body: JSON.stringify({ feeType: "PERCENTAGE", feeRate: 0.01 }),
    });

    const res = await feeConfigPut(req);
    expect(res.status).toBe(403);
  });

  it("15. RBAC: Super Admin CAN adjust ASSO platform fee (200 OK)", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/admin/platform-fee-config", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`, // Super Admin!
      },
      body: JSON.stringify({
        feeType: "PERCENTAGE",
        feeRate: 0.02,
        isEnabled: true,
        description: "Standard ASSO convenience fee",
      }),
    });

    const res = await feeConfigPut(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.feeRate).toBe(0.02);
  });

  it("16. Audit events are recorded for tax and platform fee adjustments", async () => {
    const db = getDb();

    // Check tax audit event
    const [taxAudit] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.tenantId, TENANT_A),
          eq(auditEvents.action, "TAX_CONFIGURATION_UPDATED")
        )
      )
      .limit(1);

    expect(taxAudit).toBeDefined();
    expect(taxAudit.resourceType).toBe("TAX_CONFIGURATION");

    // Check platform fee audit event
    const [feeAudit] = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "PLATFORM_FEE_CONFIGURATION_UPDATED"))
      .limit(1);

    expect(feeAudit).toBeDefined();
    expect(feeAudit.resourceType).toBe("PLATFORM_FEE_CONFIGURATION");
  });

  it("17. Native calculateAuthoritativeTotals helper accurately models zero, percentage, and fixed fees", () => {
    const lines = [
      { unitPrice: "250.0000", quantity: 2 }, // 500.00
      { unitPrice: "125.5000", quantity: 2 }, // 251.00
    ]; // Subtotal: 751.00

    // Zero config
    const zeroTotals = calculateAuthoritativeTotals(lines);
    expect(zeroTotals.subtotalAmount).toBe("751.0000");
    expect(zeroTotals.taxAmount).toBe("0.0000");
    expect(zeroTotals.platformFeeAmount).toBe("0.0000");
    expect(zeroTotals.totalAmount).toBe("751.0000");

    // 5% GST and 2% fee
    const combinedTotals = calculateAuthoritativeTotals(lines, {
      taxRate: 0.05,
      platformFeeRate: 0.02,
      platformFeeType: "PERCENTAGE",
    });
    // 751 * 0.05 = 37.55
    // 751 * 0.02 = 15.02
    // 751 + 37.55 + 15.02 = 803.57
    expect(combinedTotals.taxAmount).toBe("37.5500");
    expect(combinedTotals.platformFeeAmount).toBe("15.0200");
    expect(combinedTotals.totalAmount).toBe("803.5700");

    // Flat fee of 20
    const fixedTotals = calculateAuthoritativeTotals(lines, {
      taxRate: 0.12,
      platformFeeFixed: 20,
      platformFeeType: "FIXED",
    });
    // 751 * 0.12 = 90.12
    // Fee: 20.00
    // Total: 751 + 90.12 + 20 = 861.12
    expect(fixedTotals.taxAmount).toBe("90.1200");
    expect(fixedTotals.platformFeeAmount).toBe("20.0000");
    expect(fixedTotals.totalAmount).toBe("861.1200");
  });
});
