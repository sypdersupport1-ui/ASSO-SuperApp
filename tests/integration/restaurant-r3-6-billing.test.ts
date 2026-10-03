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
import { organizations, outlets } from "@/db/schema/core";
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

    it("allocates tip to bill and updates total amount authoritatively", async () => {
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
