import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET as billsGet, POST as billsPost } from "@/app/api/v1/restaurant/bills/route";
import { GET as billDetailGet } from "@/app/api/v1/restaurant/bills/[id]/route";
import { GET as splitsGet, POST as splitsPost } from "@/app/api/v1/restaurant/bills/[id]/splits/route";
import { GET as paymentsGet, POST as paymentsPost } from "@/app/api/v1/restaurant/bills/[id]/payments/route";
import { GET as tipsGet, POST as tipsPost } from "@/app/api/v1/restaurant/bills/[id]/tips/route";
import { signJwt } from "@/lib/auth/jwt";
import { setTenantEntitlements } from "@/lib/entitlements/checker";
import { getDb } from "@/db/client";
import {
  bills,
  paymentTransactions,
  orders,
  orderItems,
  catalogs,
  catalogCategories,
  catalogItems,
} from "@/db/schema/operations";
import {
  restaurantTables,
  restaurantTableSessions,
  restaurantBillSplits,
  restaurantBillSplitPortions,
  restaurantBillSplitItems,
  restaurantTipDistributions,
} from "@/db/schema/restaurant";
import { businessContexts } from "@/db/schema/context";
import { organizations, outlets, users, staffProfiles } from "@/db/schema/core";
import { domainOutboxEvents } from "@/db/schema/communication";
import { eq, and } from "drizzle-orm";
import { Decimal } from "@/lib/decimal";

describe("ASSO Restaurant Vertical — Slice 3.6 Bill Splitting, Tip & Multi-Payment Settlement", () => {
  const TENANT_A = "11111111-1111-1111-1111-111111111111";
  const TENANT_B = "22222222-2222-2222-2222-222222222236";
  const TENANT_HOTEL_REST = "33333333-3333-3333-3333-333333333333";

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
      "restaurant.bills.view",
      "restaurant.bills.manage",
      "restaurant.splits.manage",
      "restaurant.payments.manage",
      "restaurant.tips.manage",
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

  const hotelAdminTokenHotel = signJwt({
    sub: "usr_hotel_admin_hotel",
    tenantId: TENANT_HOTEL_REST,
    roles: ["HOTEL_ADMIN"],
    permissions: ["hotel.*"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  let outletIdA: string;
  let tableIdA: string;
  let sessionIdA: string;
  let orderIdA: string;
  let orderItemId1: string;
  let orderItemId2: string;
  let orderItemId3: string;

  let outletIdB: string;
  let tableIdB: string;
  let sessionIdB: string;
  let orderIdB: string;

  let billIdA: string;
  let customGuestPortionId: string;
  let staffProfileIdA: string;

  beforeAll(async () => {
    // 1. Configure entitlements
    setTenantEntitlements(TENANT_A, ["RESTAURANT"]);
    setTenantEntitlements(TENANT_B, ["RESTAURANT"]);
    setTenantEntitlements(TENANT_HOTEL_REST, ["HOTEL", "RESTAURANT"]);

    const db = getDb();

    // 2. Setup Organization A & Outlet A
    await db.insert(organizations).values({
      organizationId: TENANT_A,
      name: "Tenant A Dining",
      primaryBusinessType: "RESTAURANT",
    }).onConflictDoNothing();

    const [outletA] = await db.insert(outlets).values({
      tenantId: TENANT_A,
      name: "Main Dining Room A",
      code: `OUT_R36_A_${Date.now().toString().slice(-4)}`,
      verticalType: "RESTAURANT",
    }).onConflictDoNothing().returning();

    if (outletA) {
      outletIdA = outletA.outletId;
    } else {
      const [existing] = await db.select().from(outlets).where(eq(outlets.tenantId, TENANT_A)).limit(1);
      outletIdA = existing.outletId;
    }

    // Setup Staff Profile A for Direct Server Tip Allocation
    const testUserId = "55555555-5555-5555-5555-555555555536";
    await db.insert(users).values({
      userId: testUserId,
      fullName: "Head Server Arjun",
      email: `arjun.server.${Date.now()}@restaurant-a.com`,
      isActive: true,
    }).onConflictDoNothing();

    const [staffA] = await db.insert(staffProfiles).values({
      tenantId: TENANT_A,
      userId: testUserId,
      outletId: outletIdA,
      employeeCode: "EMP-R36-01",
      department: "Service",
      jobTitle: "Head Server",
      isActive: true,
    }).returning();
    staffProfileIdA = staffA.staffId;

    // Business Context & Table A
    const [ctxA] = await db.insert(businessContexts).values({
      tenantId: TENANT_A,
      outletId: outletIdA,
      contextType: "TABLE",
      identifier: `T-R36-A-${Date.now().toString().slice(-4)}`,
      displayLabel: "Table R3.6 A",
      status: "OCCUPIED",
    }).returning();

    const [tblA] = await db.insert(restaurantTables).values({
      tenantId: TENANT_A,
      outletId: outletIdA,
      contextId: ctxA.contextId,
      tableNumber: `36A-${Date.now().toString().slice(-4)}`,
      displayLabel: "Table 36A",
      capacity: 4,
      status: "OCCUPIED",
    }).returning();
    tableIdA = tblA.tableId;

    // Table Session A
    const [sessA] = await db.insert(restaurantTableSessions).values({
      tenantId: TENANT_A,
      outletId: outletIdA,
      tableId: tableIdA,
      sessionNumber: `TS-36A-${Date.now().toString().slice(-4)}`,
      status: "ACTIVE",
      guestCount: 3,
    }).returning();
    sessionIdA = sessA.sessionId;

    // Catalog & Items for Tenant A
    const [catA] = await db.insert(catalogs).values({
      tenantId: TENANT_A,
      outletId: outletIdA,
      name: "Dinner Menu",
    }).returning();

    const [catCatA] = await db.insert(catalogCategories).values({
      tenantId: TENANT_A,
      catalogId: catA.catalogId,
      name: "Mains & Sides",
    }).returning();

    const [item1] = await db.insert(catalogItems).values({
      tenantId: TENANT_A,
      categoryId: catCatA.categoryId,
      name: "Butter Chicken",
      basePrice: "450.0000",
    }).returning();

    const [item2] = await db.insert(catalogItems).values({
      tenantId: TENANT_A,
      categoryId: catCatA.categoryId,
      name: "Garlic Naan",
      basePrice: "80.0000",
    }).returning();

    const [item3] = await db.insert(catalogItems).values({
      tenantId: TENANT_A,
      categoryId: catCatA.categoryId,
      name: "Mango Lassi",
      basePrice: "120.0000",
    }).returning();

    // Order A with calculated totals:
    // Butter Chicken (qty 2 * 450 = 900)
    // Garlic Naan (qty 3 * 80 = 240)
    // Mango Lassi (qty 1 * 120 = 120)
    // Subtotal: 1260.0000
    // Tax (5%): 63.0000
    // Platform Fee (2%): 25.2000
    // Discount: 50.0000
    // Total: 1260 + 63 + 25.20 - 50 = 1298.2000
    const [ordA] = await db.insert(orders).values({
      tenantId: TENANT_A,
      outletId: outletIdA,
      contextId: ctxA.contextId,
      tableId: tableIdA,
      tableSessionId: sessionIdA,
      orderNumber: `ORD-36A-${Date.now().toString().slice(-4)}`,
      orderSource: "STAFF_POS",
      diningContext: "DINE_IN",
      status: "SERVED",
      subtotalAmount: "1260.0000",
      taxRate: "0.0500",
      taxAmount: "63.0000",
      platformFeeType: "PERCENTAGE",
      platformFeeRate: "0.0200",
      platformFeeAmount: "25.2000",
      discountAmount: "50.0000",
      totalAmount: "1298.2000",
    }).returning();
    orderIdA = ordA.orderId;

    const [oi1] = await db.insert(orderItems).values({
      tenantId: TENANT_A,
      orderId: orderIdA,
      itemId: item1.itemId,
      itemName: "Butter Chicken",
      unitPrice: "450.0000",
      quantity: 2,
      subtotal: "900.0000",
      itemStatus: "SERVED",
    }).returning();
    orderItemId1 = oi1.orderItemId;

    const [oi2] = await db.insert(orderItems).values({
      tenantId: TENANT_A,
      orderId: orderIdA,
      itemId: item2.itemId,
      itemName: "Garlic Naan",
      unitPrice: "80.0000",
      quantity: 3,
      subtotal: "240.0000",
      itemStatus: "SERVED",
    }).returning();
    orderItemId2 = oi2.orderItemId;

    const [oi3] = await db.insert(orderItems).values({
      tenantId: TENANT_A,
      orderId: orderIdA,
      itemId: item3.itemId,
      itemName: "Mango Lassi",
      unitPrice: "120.0000",
      quantity: 1,
      subtotal: "120.0000",
      itemStatus: "SERVED",
    }).returning();
    orderItemId3 = oi3.orderItemId;

    // 3. Setup Tenant B (for multi-tenant isolation tests)
    await db.insert(organizations).values({
      organizationId: TENANT_B,
      name: "Tenant B Restaurant",
      primaryBusinessType: "RESTAURANT",
    }).onConflictDoNothing();

    const [outletB] = await db.insert(outlets).values({
      tenantId: TENANT_B,
      name: "Bistro B",
      code: `OUT_R36_B_${Date.now().toString().slice(-4)}`,
      verticalType: "RESTAURANT",
    }).onConflictDoNothing().returning();

    outletIdB = outletB ? outletB.outletId : (await db.select().from(outlets).where(eq(outlets.tenantId, TENANT_B)).limit(1))[0].outletId;

    const [ctxB] = await db.insert(businessContexts).values({
      tenantId: TENANT_B,
      outletId: outletIdB,
      contextType: "TABLE",
      identifier: `T-R36-B-${Date.now().toString().slice(-4)}`,
      displayLabel: "Table R3.6 B",
      status: "OCCUPIED",
    }).returning();

    const [tblB] = await db.insert(restaurantTables).values({
      tenantId: TENANT_B,
      outletId: outletIdB,
      contextId: ctxB.contextId,
      tableNumber: `36B-${Date.now().toString().slice(-4)}`,
      displayLabel: "Table 36B",
      capacity: 2,
      status: "OCCUPIED",
    }).returning();
    tableIdB = tblB.tableId;

    const [sessB] = await db.insert(restaurantTableSessions).values({
      tenantId: TENANT_B,
      outletId: outletIdB,
      tableId: tableIdB,
      sessionNumber: `TS-36B-${Date.now().toString().slice(-4)}`,
      status: "ACTIVE",
      guestCount: 2,
    }).returning();
    sessionIdB = sessB.sessionId;

    const [ordB] = await db.insert(orders).values({
      tenantId: TENANT_B,
      outletId: outletIdB,
      contextId: ctxB.contextId,
      tableId: tableIdB,
      tableSessionId: sessionIdB,
      orderNumber: `ORD-36B-${Date.now().toString().slice(-4)}`,
      orderSource: "STAFF_POS",
      diningContext: "DINE_IN",
      status: "SERVED",
      subtotalAmount: "500.0000",
      taxRate: "0.0500",
      taxAmount: "25.0000",
      platformFeeAmount: "0.0000",
      discountAmount: "0.0000",
      totalAmount: "525.0000",
    }).returning();
    orderIdB = ordB.orderId;
  });

  // ==========================================================================
  // SECTION 1: BILL GENERATION & AUTHORITATIVE SNAPSHOTS
  // ==========================================================================

  describe("1. Bill Generation & Financial Totals", () => {
    it("generates an authoritative Restaurant Bill aggregating all active session orders", async () => {
      const req = new NextRequest("http://localhost/api/v1/restaurant/bills", {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          outletId: outletIdA,
          tableSessionId: sessionIdA,
        }),
      });

      const res = await billsPost(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);

      const bill = json.data;
      billIdA = bill.billId;
      expect(bill.billNumber).toMatch(/^BILL-\d{8}-\d{4}$/);
      expect(bill.status).toBe("OPEN");
      expect(bill.subtotalAmount).toBe("1260.00");
      expect(bill.taxAmount).toBe("63.00");
      expect(bill.platformFeeAmount).toBe("25.20");
      expect(bill.discountAmount).toBe("50.00");
      expect(bill.totalAmount).toBe("1298.20");
      expect(bill.settledAmount).toBe("0.00");
      expect(bill.remainingAmount).toBe("1298.20");
      expect(bill.isFullySettled).toBe(false);
    });

    it("replays bill generation idempotently with cached response", async () => {
      const idempKey = `idemp-bill-${Date.now()}`;
      const payload = {
        outletId: outletIdA,
        tableSessionId: sessionIdA,
      };

      const req1 = new NextRequest("http://localhost/api/v1/restaurant/bills", {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "idempotency-key": idempKey,
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify(payload),
      });
      const res1 = await billsPost(req1);
      expect(res1.status).toBe(201);
      const json1 = await res1.json();

      // Duplicate request with matching key
      const req2 = new NextRequest("http://localhost/api/v1/restaurant/bills", {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "idempotency-key": idempKey,
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify(payload),
      });
      const res2 = await billsPost(req2);
      expect(res2.status).toBe(201);
      expect(res2.headers.get("X-Idempotent-Replay")).toBe("true");
      const json2 = await res2.json();
      expect(json2.data.billId).toBe(json1.data.billId);
    });

    it("retrieves bill details by ID with accurate balance calculations", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${billIdA}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${staffTokenA}`,
          "x-tenant-id": TENANT_A,
        },
      });

      const res = await billDetailGet(req, { params: Promise.resolve({ id: billIdA }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.billId).toBe(billIdA);
      expect(json.data.totalAmount).toBe("1298.20");
      expect(json.data.remainingAmount).toBe("1298.20");
    });
  });

  // ==========================================================================
  // SECTION 2: EQUAL BILL SPLITTING & EXACT REMAINDER RECONCILIATION
  // ==========================================================================

  describe("2. Equal Bill Splitting (Exact Decimal & Remainder Absorption)", () => {
    it("splits bill into 2 equal portions with exact balance reconciliation", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${billIdA}/splits`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          splitType: "EQUAL",
          portionsCount: 2,
          names: ["Alice", "Bob"],
        }),
      });

      const res = await splitsPost(req, { params: Promise.resolve({ id: billIdA }) });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);

      const split = json.data.activeSplit;
      expect(split.splitType).toBe("EQUAL");
      expect(split.totalPortions).toBe(2);
      expect(split.portions.length).toBe(2);

      // Total bill = 1298.20. 2 portions = 649.10 each.
      expect(split.portions[0].name).toBe("Alice");
      expect(split.portions[0].totalAmount).toBe("649.10");
      expect(split.portions[0].paidAmount).toBe("0.00");
      expect(split.portions[0].remainingAmount).toBe("649.10");

      expect(split.portions[1].name).toBe("Bob");
      expect(split.portions[1].totalAmount).toBe("649.10");

      // Verify exact sum equals bill total
      const p1 = Decimal.from(split.portions[0].totalAmount);
      const p2 = Decimal.from(split.portions[1].totalAmount);
      expect(p1.plus(p2).toFixed(2)).toBe("1298.20");
    });

    it("splits bill into 3 portions with uneven division and absorbs 1-cent remainder deterministically", async () => {
      // Re-split into 3: 1298.20 / 3 = 432.7333...
      // Portion 1 = 432.73
      // Portion 2 = 432.73
      // Portion 3 = 1298.20 - (432.73 + 432.73) = 432.74 (absorbs remainder!)
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${billIdA}/splits`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          splitType: "EQUAL",
          portionsCount: 3,
        }),
      });

      const res = await splitsPost(req, { params: Promise.resolve({ id: billIdA }) });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);

      const portions = json.data.activeSplit.portions;
      expect(portions.length).toBe(3);

      const sumPortions = Decimal.sum(...portions.map((p: any) => p.totalAmount));
      expect(sumPortions.toFixed(2)).toBe("1298.20");
      // Verify zero penny drift
      expect(sumPortions.minus(Decimal.from("1298.20")).isZero()).toBe(true);
    });

    it("rejects equal split with invalid portionsCount (< 2)", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${billIdA}/splits`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          splitType: "EQUAL",
          portionsCount: 1, // Invalid
        }),
      });

      const res = await splitsPost(req, { params: Promise.resolve({ id: billIdA }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_FAILED");
    });

    it("preserves and deterministically apportions subtotal, tax, platform fees, and discounts with zero penny drift across 3 portions", async () => {
      const db = getDb();
      // Bill: subtotal=100.00, tax=10.00, platformFee=5.00, discount=7.00 -> total=108.00
      const [feeBill] = await db.insert(bills).values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        billNumber: `BILL-FEE-${Date.now().toString().slice(-4)}`,
        status: "OPEN",
        subtotalAmount: "100.0000",
        taxAmount: "10.0000",
        platformFeeAmount: "5.0000",
        discountAmount: "7.0000",
        tipAmount: "0.0000",
        totalAmount: "108.0000",
        settledAmount: "0.0000",
      }).returning();

      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${feeBill.billId}/splits`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          splitType: "EQUAL",
          portionsCount: 3,
        }),
      });

      const res = await splitsPost(req, { params: Promise.resolve({ id: feeBill.billId }) });
      expect(res.status).toBe(201);
      const json = await res.json();
      const portions = json.data.activeSplit.portions;
      expect(portions.length).toBe(3);

      // Portions 1 & 2:
      // Subtotal: 100 / 3 = 33.33
      // Tax: 10 / 3 = 3.33
      // Fee: 5 / 3 = 1.67
      // Discount: 7 / 3 = 2.33
      // Total: 33.33 + 3.33 + 1.67 - 2.33 = 36.00
      expect(portions[0].allocatedAmount).toBe("33.33");
      expect(portions[0].taxAmount).toBe("3.33");
      expect(portions[0].platformFeeAmount).toBe("1.67");
      expect(portions[0].discountAmount).toBe("2.33");
      expect(portions[0].totalAmount).toBe("36.00");

      expect(portions[1].allocatedAmount).toBe("33.33");
      expect(portions[1].taxAmount).toBe("3.33");
      expect(portions[1].platformFeeAmount).toBe("1.67");
      expect(portions[1].discountAmount).toBe("2.33");
      expect(portions[1].totalAmount).toBe("36.00");

      // Portion 3 (absorbs remainder):
      // Subtotal: 100 - 66.66 = 33.34
      // Tax: 10 - 6.66 = 3.34
      // Fee: 5 - 3.34 = 1.66
      // Discount: 7 - 4.66 = 2.34
      // Total: 108 - 72 = 36.00
      expect(portions[2].allocatedAmount).toBe("33.34");
      expect(portions[2].taxAmount).toBe("3.34");
      expect(portions[2].platformFeeAmount).toBe("1.66");
      expect(portions[2].discountAmount).toBe("2.34");
      expect(portions[2].totalAmount).toBe("36.00");

      // Exact sum assertions across all financial dimensions
      const sumSubtotals = Decimal.sum(...portions.map((p: any) => p.allocatedAmount));
      const sumTaxes = Decimal.sum(...portions.map((p: any) => p.taxAmount));
      const sumFees = Decimal.sum(...portions.map((p: any) => p.platformFeeAmount));
      const sumDiscounts = Decimal.sum(...portions.map((p: any) => p.discountAmount));
      const sumTotals = Decimal.sum(...portions.map((p: any) => p.totalAmount));

      expect(sumSubtotals.toFixed(2)).toBe("100.00");
      expect(sumTaxes.toFixed(2)).toBe("10.00");
      expect(sumFees.toFixed(2)).toBe("5.00");
      expect(sumDiscounts.toFixed(2)).toBe("7.00");
      expect(sumTotals.toFixed(2)).toBe("108.00");
    });
  });

  // ==========================================================================
  // SECTION 3: ITEM-BASED BILL SPLITTING
  // ==========================================================================

  describe("3. Item-Based Bill Splitting", () => {
    it("splits bill by allocating specific ordered items and quantities across portions", async () => {
      // Items available on Order:
      // oi1: Butter Chicken (qty: 2, unitPrice: 450)
      // oi2: Garlic Naan (qty: 3, unitPrice: 80)
      // oi3: Mango Lassi (qty: 1, unitPrice: 120)
      // Portion 1 (Alice): 1 Butter Chicken + 1 Garlic Naan = 450 + 80 = 530
      // Portion 2 (Bob): 1 Butter Chicken + 2 Garlic Naan + 1 Mango Lassi = 450 + 160 + 120 = 730
      // Subtotal = 530 + 730 = 1260 (exact match)
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${billIdA}/splits`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          splitType: "ITEM",
          portions: [
            {
              name: "Alice",
              items: [
                { orderItemId: orderItemId1, quantity: 1 },
                { orderItemId: orderItemId2, quantity: 1 },
              ],
            },
            {
              name: "Bob",
              items: [
                { orderItemId: orderItemId1, quantity: 1 },
                { orderItemId: orderItemId2, quantity: 2 },
                { orderItemId: orderItemId3, quantity: 1 },
              ],
            },
          ],
        }),
      });

      const res = await splitsPost(req, { params: Promise.resolve({ id: billIdA }) });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);

      const split = json.data.activeSplit;
      expect(split.splitType).toBe("ITEM");
      expect(split.portions.length).toBe(2);

      expect(split.portions[0].name).toBe("Alice");
      expect(split.portions[0].allocatedAmount).toBe("530.00");
      expect(split.portions[0].items?.length).toBe(2);

      expect(split.portions[1].name).toBe("Bob");
      expect(split.portions[1].allocatedAmount).toBe("730.00");
      expect(split.portions[1].items?.length).toBe(3);

      // Verify exact mathematical reconciliation to bill total
      const p1Total = Decimal.from(split.portions[0].totalAmount);
      const p2Total = Decimal.from(split.portions[1].totalAmount);
      expect(p1Total.plus(p2Total).toFixed(2)).toBe("1298.20");
    });

    it("rejects item split allocating more quantity than was ordered", async () => {
      // Ordered 2 Butter Chickens, but trying to assign 3 total (2 + 1)
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${billIdA}/splits`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          splitType: "ITEM",
          portions: [
            {
              name: "Guest 1",
              items: [{ orderItemId: orderItemId1, quantity: 2 }],
            },
            {
              name: "Guest 2",
              items: [{ orderItemId: orderItemId1, quantity: 1 }],
            },
          ],
        }),
      });

      const res = await splitsPost(req, { params: Promise.resolve({ id: billIdA }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_FAILED");
      expect(json.error.message).toContain("exceeds ordered quantity");
    });
  });

  // ==========================================================================
  // SECTION 4: CUSTOM AMOUNT BILL SPLITTING
  // ==========================================================================

  describe("4. Custom Amount Bill Splitting", () => {
    it("accepts custom split portions whose sum reconciles exactly to bill total", async () => {
      // Bill total = 1298.20. Custom split: 800.00 + 498.20
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${billIdA}/splits`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          splitType: "CUSTOM",
          portions: [
            { name: "Sponsor", totalAmount: "800.00" },
            { name: "Guest", totalAmount: "498.20" },
          ],
        }),
      });

      const res = await splitsPost(req, { params: Promise.resolve({ id: billIdA }) });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);

      const split = json.data.activeSplit;
      expect(split.splitType).toBe("CUSTOM");
      expect(split.portions.length).toBe(2);
      expect(split.portions[0].totalAmount).toBe("800.00");
      expect(split.portions[1].totalAmount).toBe("498.20");

      const guestPortion = split.portions.find((p: any) => p.name === "Guest");
      expect(guestPortion).toBeDefined();
      customGuestPortionId = guestPortion.portionId;
    });

    it("rejects custom split portions where sum does not reconcile to bill total", async () => {
      // 800.00 + 400.00 = 1200.00 != 1298.20 (under-allocation)
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${billIdA}/splits`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          splitType: "CUSTOM",
          portions: [
            { name: "Part 1", totalAmount: "800.00" },
            { name: "Part 2", totalAmount: "400.00" },
          ],
        }),
      });

      const res = await splitsPost(req, { params: Promise.resolve({ id: billIdA }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_FAILED");
      expect(json.error.message).toContain("does not reconcile to bill total");
    });
  });

  // ==========================================================================
  // SECTION 5: MULTI-PAYMENT SETTLEMENT & INVARIANTS
  // ==========================================================================

  describe("5. Multi-Payment Settlement & Invariants", () => {
    it("settles a specific split portion via partial payment and updates portion to PAID", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${billIdA}/payments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${staffTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          portionId: customGuestPortionId,
          amount: "498.20",
          paymentMethod: "UPI",
          gatewayTransactionReference: "UPI-TXN-123456",
        }),
      });

      const res = await paymentsPost(req, { params: Promise.resolve({ id: billIdA }) });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);

      const bill = json.data;
      expect(bill.status).toBe("PARTIALLY_PAID");
      expect(bill.settledAmount).toBe("498.20");
      expect(bill.remainingAmount).toBe("800.00");
      expect(bill.isFullySettled).toBe(false);

      // Verify portion is marked PAID
      const paidPortion = bill.activeSplit.portions.find((p: any) => p.portionId === customGuestPortionId);
      expect(paidPortion).toBeDefined();
      expect(paidPortion.status).toBe("PAID");
      expect(paidPortion.paidAmount).toBe("498.20");
      expect(paidPortion.remainingAmount).toBe("0.00");
    });

    it("rejects overpayment exceeding remaining portion or bill balance", async () => {
      // Remaining balance is 800.00. Attempting to pay 900.00 must be rejected
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${billIdA}/payments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${staffTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          amount: "900.00",
          paymentMethod: "CASH",
        }),
      });

      const res = await paymentsPost(req, { params: Promise.resolve({ id: billIdA }) });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error.code).toBe("BUSINESS_RULE_VIOLATION");
      expect(json.error.message).toContain("exceeds remaining bill balance");
    });

    it("blocks re-splitting a bill once payments have been recorded on its active split", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${billIdA}/splits`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          splitType: "EQUAL",
          portionsCount: 4,
        }),
      });

      const res = await splitsPost(req, { params: Promise.resolve({ id: billIdA }) });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error.code).toBe("BUSINESS_RULE_VIOLATION");
      expect(json.error.message).toContain("Cannot re-split a bill with settled or partially paid portions");
    });

    it("completes final settlement with second payment and transitions bill status to PAID", async () => {
      // Final payment of remaining 800.00
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${billIdA}/payments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${staffTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          amount: "800.00",
          paymentMethod: "CARD",
          gatewayTransactionReference: "CARD-AUTH-987654",
        }),
      });

      const res = await paymentsPost(req, { params: Promise.resolve({ id: billIdA }) });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);

      const bill = json.data;
      expect(bill.status).toBe("PAID");
      expect(bill.settledAmount).toBe("1298.20");
      expect(bill.remainingAmount).toBe("0.00");
      expect(bill.isFullySettled).toBe(true);
      expect(bill.settledAt).not.toBeNull();
      expect(bill.payments.length).toBe(2);
    });

    it("rejects payment on an already fully paid and settled bill", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${billIdA}/payments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${staffTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          amount: "10.00",
          paymentMethod: "CASH",
        }),
      });

      const res = await paymentsPost(req, { params: Promise.resolve({ id: billIdA }) });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error.code).toBe("BUSINESS_RULE_VIOLATION");
      expect(json.error.message).toContain("already fully paid and settled");
    });

    it("replays payment idempotently with cached response and zero duplicate transactions", async () => {
      const db = getDb();
      const [idempBill] = await db.insert(bills).values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        billNumber: `BILL-IDEMP-${Date.now().toString().slice(-4)}`,
        status: "OPEN",
        subtotalAmount: "100.0000",
        taxAmount: "10.0000",
        totalAmount: "110.0000",
        settledAmount: "0.0000",
      }).returning();

      const payKey = `idemp-pay-${Date.now()}`;
      const payload = {
        amount: "50.00",
        paymentMethod: "CASH",
        notes: "Idempotent payment test",
      };

      const req1 = new NextRequest(`http://localhost/api/v1/restaurant/bills/${idempBill.billId}/payments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${staffTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
          "idempotency-key": payKey,
        },
        body: JSON.stringify(payload),
      });

      const res1 = await paymentsPost(req1, { params: Promise.resolve({ id: idempBill.billId }) });
      expect(res1.status).toBe(201);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      const paymentId = json1.data.payments[0].paymentId;

      // Duplicate request with identical key
      const req2 = new NextRequest(`http://localhost/api/v1/restaurant/bills/${idempBill.billId}/payments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${staffTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
          "idempotency-key": payKey,
        },
        body: JSON.stringify(payload),
      });

      const res2 = await paymentsPost(req2, { params: Promise.resolve({ id: idempBill.billId }) });
      expect(res2.status).toBe(201);
      expect(res2.headers.get("x-idempotent-replay")).toBe("true");

      // Verify exactly one payment row exists in DB
      const dbPayments = await db
        .select()
        .from(paymentTransactions)
        .where(eq(paymentTransactions.billId, idempBill.billId));
      expect(dbPayments.length).toBe(1);
      expect(dbPayments[0].paymentId).toBe(paymentId);
    });

    it("enforces post-split tip settlement rule: split portions remain immutable, tip forms bill-level balance, and final settlement reconciles exactly to zero", async () => {
      const db = getDb();
      // Fresh bill: $110.00
      const [pstBill] = await db.insert(bills).values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        billNumber: `BILL-PST-${Date.now().toString().slice(-4)}`,
        status: "OPEN",
        subtotalAmount: "100.0000",
        taxAmount: "10.0000",
        totalAmount: "110.0000",
        settledAmount: "0.0000",
      }).returning();

      // 1. Equal split 2 ways: $55.00 + $55.00
      const splitReq = new NextRequest(`http://localhost/api/v1/restaurant/bills/${pstBill.billId}/splits`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({ splitType: "EQUAL", portionsCount: 2 }),
      });
      const splitRes = await splitsPost(splitReq, { params: Promise.resolve({ id: pstBill.billId }) });
      expect(splitRes.status).toBe(201);
      const splitData = (await splitRes.json()).data;
      const [p1, p2] = splitData.activeSplit.portions;
      expect(p1.totalAmount).toBe("55.00");
      expect(p2.totalAmount).toBe("55.00");

      // 2. Pay Portion 1 ($55.00)
      const pay1Req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${pstBill.billId}/payments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${staffTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          amount: "55.00",
          paymentMethod: "CARD",
          portionId: p1.portionId,
        }),
      });
      const pay1Res = await paymentsPost(pay1Req, { params: Promise.resolve({ id: pstBill.billId }) });
      expect(pay1Res.status).toBe(201);
      const pay1Bill = (await pay1Res.json()).data;
      expect(pay1Bill.status).toBe("PARTIALLY_PAID");
      expect(pay1Bill.settledAmount).toBe("55.00");
      expect(pay1Bill.remainingAmount).toBe("55.00");

      // 3. Add Tip ($10.00) post-split
      const tipReq = new NextRequest(`http://localhost/api/v1/restaurant/bills/${pstBill.billId}/tips`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({ tipAmount: "10.00" }),
      });
      const tipRes = await tipsPost(tipReq, { params: Promise.resolve({ id: pstBill.billId }) });
      expect(tipRes.status).toBe(201);
      const tipBill = (await tipRes.json()).data;
      expect(tipBill.totalAmount).toBe("120.00");
      expect(tipBill.remainingAmount).toBe("65.00");
      // Split portions remain immutable
      const recheckedP2 = tipBill.activeSplit.portions.find((p: any) => p.portionId === p2.portionId);
      expect(recheckedP2.totalAmount).toBe("55.00");
      expect(recheckedP2.remainingAmount).toBe("55.00");

      // 4. Overpayment check: Attempting to pay $65.00 against Portion 2 must be rejected
      const overPayReq = new NextRequest(`http://localhost/api/v1/restaurant/bills/${pstBill.billId}/payments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${staffTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          amount: "65.00",
          paymentMethod: "CASH",
          portionId: p2.portionId,
        }),
      });
      const overPayRes = await paymentsPost(overPayReq, { params: Promise.resolve({ id: pstBill.billId }) });
      expect(overPayRes.status).toBe(422);

      // 5. Pay Portion 2 ($55.00)
      const pay2Req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${pstBill.billId}/payments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${staffTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          amount: "55.00",
          paymentMethod: "CASH",
          portionId: p2.portionId,
        }),
      });
      const pay2Res = await paymentsPost(pay2Req, { params: Promise.resolve({ id: pstBill.billId }) });
      expect(pay2Res.status).toBe(201);
      const pay2Bill = (await pay2Res.json()).data;
      expect(pay2Bill.status).toBe("PARTIALLY_PAID");
      expect(pay2Bill.settledAmount).toBe("110.00");
      expect(pay2Bill.remainingAmount).toBe("10.00");

      // 6. Settle remaining tip balance ($10.00) at bill level
      const payTipReq = new NextRequest(`http://localhost/api/v1/restaurant/bills/${pstBill.billId}/payments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${staffTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          amount: "10.00",
          paymentMethod: "CASH",
        }),
      });
      const payTipRes = await paymentsPost(payTipReq, { params: Promise.resolve({ id: pstBill.billId }) });
      expect(payTipRes.status).toBe(201);
      const finalBill = (await payTipRes.json()).data;
      expect(finalBill.status).toBe("PAID");
      expect(finalBill.isFullySettled).toBe(true);
      expect(finalBill.settledAmount).toBe("120.00");
      expect(finalBill.remainingAmount).toBe("0.00");
    });
  });

  // ==========================================================================
  // SECTION 6: TIP / GRATUITY ALLOCATION & DISTRIBUTION
  // ==========================================================================

  describe("6. Tip / Gratuity Allocation & Distribution", () => {
    let tipBillId: string;

    beforeAll(async () => {
      // Create a fresh open bill for tip testing
      const db = getDb();
      const [newBill] = await db.insert(bills).values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        billNumber: `BILL-TIP-${Date.now().toString().slice(-4)}`,
        status: "OPEN",
        subtotalAmount: "1000.0000",
        taxAmount: "50.0000",
        platformFeeAmount: "0.0000",
        discountAmount: "0.0000",
        tipAmount: "0.0000",
        totalAmount: "1050.0000",
        settledAmount: "0.0000",
      }).returning();
      tipBillId = newBill.billId;
    });

    it("allocates tip to bill and updates total amount authoritatively (STAFF_POOL mode)", async () => {
      // Tip: 150.00 -> Total should become 1050 + 150 = 1200.00
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${tipBillId}/tips`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          tipAmount: "150.00",
          distributions: [
            { recipientName: "Head Server Arjun", amount: "100.00" },
            { recipientName: "Kitchen Pool", amount: "50.00" },
          ],
        }),
      });

      const res = await tipsPost(req, { params: Promise.resolve({ id: tipBillId }) });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);

      const bill = json.data;
      expect(bill.tipAmount).toBe("150.00");
      expect(bill.totalAmount).toBe("1200.00");
      expect(bill.remainingAmount).toBe("1200.00");
      expect(bill.tipDistributions.length).toBe(2);
      expect(bill.tipDistributions[0].recipientName).toBe("Head Server Arjun");
      expect(bill.tipDistributions[0].amount).toBe("100.00");
    });

    it("allocates tip to bill via UNALLOCATED mode (no distributions array)", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${tipBillId}/tips`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({ tipAmount: "20.00" }),
      });

      const res = await tipsPost(req, { params: Promise.resolve({ id: tipBillId }) });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.tipAmount).toBe("20.00");
      expect(json.data.tipDistributions).toEqual([]);
    });

    it("allocates tip to bill via DIRECT_SERVERS mode (validated staffId)", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${tipBillId}/tips`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          tipAmount: "30.00",
          distributions: [
            { recipientName: "Arjun", amount: "30.00", staffId: staffProfileIdA }
          ]
        }),
      });

      const res = await tipsPost(req, { params: Promise.resolve({ id: tipBillId }) });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.tipAmount).toBe("30.00");
      expect(json.data.tipDistributions[0].staffId).toBe(staffProfileIdA);
    });

    it("allocates tip to bill via PERCENTAGE_BASED mode", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${tipBillId}/tips`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          tipAmount: "100.00",
          distributions: [
            { recipientName: "Server Pool", amount: "60.00", percentage: "60.00" },
            { recipientName: "Kitchen Pool", amount: "40.00", percentage: "40.00" }
          ]
        }),
      });

      const res = await tipsPost(req, { params: Promise.resolve({ id: tipBillId }) });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.tipAmount).toBe("100.00");
      expect(json.data.tipDistributions.length).toBe(2);
    });

    it("allocates tip via PERCENTAGE_BASED mode with client providing only percentages and server authoritatively computing monetary amounts", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${tipBillId}/tips`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          tipAmount: "100.00",
          distributions: [
            { recipientName: "Server Pool", percentage: "60.00" },
            { recipientName: "Kitchen Pool", percentage: "40.00" },
          ],
        }),
      });

      const res = await tipsPost(req, { params: Promise.resolve({ id: tipBillId }) });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.tipAmount).toBe("100.00");
      expect(json.data.tipDistributions.length).toBe(2);
      // Verify exact authoritative amounts calculated server-side
      const serverPool = json.data.tipDistributions.find((d: any) => d.recipientName === "Server Pool");
      const kitchenPool = json.data.tipDistributions.find((d: any) => d.recipientName === "Kitchen Pool");
      expect(serverPool).toBeDefined();
      expect(serverPool.percentage).toBe("60.0000");
      expect(serverPool.amount).toBe("60.00");
      expect(kitchenPool).toBeDefined();
      expect(kitchenPool.percentage).toBe("40.0000");
      expect(kitchenPool.amount).toBe("40.00");
    });

    it("rejects PERCENTAGE_BASED tip distribution when percentages do not sum to 100%", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${tipBillId}/tips`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          tipAmount: "100.00",
          distributions: [
            { recipientName: "Server Pool", percentage: "50.00" },
            { recipientName: "Kitchen Pool", percentage: "35.00" }, // Sum = 85% != 100%
          ],
        }),
      });

      const res = await tipsPost(req, { params: Promise.resolve({ id: tipBillId }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_FAILED");
      expect(json.error.message).toContain("must equal 100%");
    });

    it("absorbs fractional cent remainder authoritatively into last recipient for 3-way odd percentage split", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${tipBillId}/tips`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          tipAmount: "100.00",
          distributions: [
            { recipientName: "Server 1", percentage: "33.33" },
            { recipientName: "Server 2", percentage: "33.33" },
            { recipientName: "Server 3", percentage: "33.34" },
          ],
        }),
      });

      const res = await tipsPost(req, { params: Promise.resolve({ id: tipBillId }) });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.tipAmount).toBe("100.00");
      expect(json.data.tipDistributions.length).toBe(3);

      const d1 = json.data.tipDistributions.find((d: any) => d.recipientName === "Server 1");
      const d2 = json.data.tipDistributions.find((d: any) => d.recipientName === "Server 2");
      const d3 = json.data.tipDistributions.find((d: any) => d.recipientName === "Server 3");

      expect(d1.amount).toBe("33.33");
      expect(d2.amount).toBe("33.33");
      expect(d3.amount).toBe("33.34");
      // Total of exact allocated amounts: 33.33 + 33.33 + 33.34 = 100.00
      const sum = Number(d1.amount) + Number(d2.amount) + Number(d3.amount);
      expect(sum).toBe(100);
    });

    it("denies unauthenticated or unauthorized customer/guest from allocating tips (returns 403)", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${tipBillId}/tips`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${guestTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          tipAmount: "20.00",
          distributions: [{ recipientName: "Direct Server", percentage: "100.00" }],
        }),
      });

      const res = await tipsPost(req, { params: Promise.resolve({ id: tipBillId }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("PERMISSION_DENIED");
    });

    it("rejects tip distribution whose sum does not reconcile to the tip amount", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${tipBillId}/tips`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          tipAmount: "150.00",
          distributions: [
            { recipientName: "Server 1", amount: "80.00" },
            { recipientName: "Server 2", amount: "50.00" }, // Sum = 130 != 150
          ],
        }),
      });

      const res = await tipsPost(req, { params: Promise.resolve({ id: tipBillId }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_FAILED");
      expect(json.error.message).toContain("must reconcile exactly to bill tip amount");
    });
  });

  // ==========================================================================
  // SECTION 7: MULTI-TENANT ISOLATION & RBAC AUTHORIZATION
  // ==========================================================================

  describe("7. Multi-Tenant Isolation & Role-Based Access Control", () => {
    let billIdB: string;

    beforeAll(async () => {
      // Create bill for Tenant B
      const db = getDb();
      const [bBill] = await db.insert(bills).values({
        tenantId: TENANT_B,
        outletId: outletIdB,
        billNumber: `BILL-TB-${Date.now().toString().slice(-4)}`,
        status: "OPEN",
        subtotalAmount: "500.0000",
        taxAmount: "25.0000",
        totalAmount: "525.0000",
        settledAmount: "0.0000",
      }).returning();
      billIdB = bBill.billId;
    });

    it("prevents Tenant A manager from retrieving Tenant B bill (returns 404)", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${billIdB}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "x-tenant-id": TENANT_A, // Request in Tenant A context
        },
      });

      const res = await billDetailGet(req, { params: Promise.resolve({ id: billIdB }) });
      expect(res.status).toBe(404);
    });

    it("prevents Tenant A manager from recording payment against Tenant B bill (returns 404)", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${billIdB}/payments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${managerTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          amount: "100.00",
          paymentMethod: "CASH",
        }),
      });

      const res = await paymentsPost(req, { params: Promise.resolve({ id: billIdB }) });
      expect(res.status).toBe(404);
    });

    it("allows Hotel Admin on Hotel tenant with RESTAURANT module enabled to generate bills", async () => {
      const req = new NextRequest("http://localhost/api/v1/restaurant/bills", {
        method: "POST",
        headers: {
          authorization: `Bearer ${hotelAdminTokenHotel}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_HOTEL_REST,
        },
        body: JSON.stringify({
          notes: "Hotel restaurant room folio bill",
        }),
      });

      // Will fail on validation for missing session/order rather than 403 authorization
      const res = await billsPost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("VALIDATION_FAILED");
      expect(json.error.message).toContain("tableSessionId or orderIds");
    });

    it("denies Hotel Admin without Restaurant module on standalone restaurant tenant (returns 403)", async () => {
      const req = new NextRequest("http://localhost/api/v1/restaurant/bills", {
        method: "POST",
        headers: {
          authorization: `Bearer ${hotelAdminTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          notes: "Unauthorized attempt",
        }),
      });

      const res = await billsPost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("PERMISSION_DENIED");
    });

    it("denies Guest from creating bill splits or administrative mutations (returns 403)", async () => {
      const req = new NextRequest(`http://localhost/api/v1/restaurant/bills/${billIdA}/splits`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${guestTokenA}`,
          "content-type": "application/json",
          "x-tenant-id": TENANT_A,
        },
        body: JSON.stringify({
          splitType: "EQUAL",
          portionsCount: 2,
        }),
      });

      const res = await splitsPost(req, { params: Promise.resolve({ id: billIdA }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("PERMISSION_DENIED");
    });
  });

  // ==========================================================================
  // SECTION 8: TRANSACTIONAL OUTBOX EVENTS
  // ==========================================================================

  describe("8. Transactional Outbox Events & Audit Ledger", () => {
    it("verifies all billing domain events were safely committed to domain_outbox_events", async () => {
      const db = getDb();
      const events = await db
        .select()
        .from(domainOutboxEvents)
        .where(eq(domainOutboxEvents.tenantId, TENANT_A));

      const eventTypes = events.map((e) => e.eventType);

      expect(eventTypes).toContain("RESTAURANT_BILL_GENERATED");
      expect(eventTypes).toContain("RESTAURANT_BILL_SPLIT_CREATED");
      expect(eventTypes).toContain("RESTAURANT_PAYMENT_RECEIVED");
      expect(eventTypes).toContain("RESTAURANT_BILL_SETTLED");
      expect(eventTypes).toContain("RESTAURANT_TIP_ALLOCATED");
    });
  });
});
