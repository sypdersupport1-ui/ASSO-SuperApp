import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/db/client";
import postgres from "postgres";
import {
  orders,
  orderItems,
  catalogs,
  catalogCategories,
  catalogItems,
} from "@/db/schema/operations";
import { organizations, outlets, customers } from "@/db/schema/core";
import { businessContexts } from "@/db/schema/context";
import {
  restaurantTables,
  restaurantTableSessions,
} from "@/db/schema/restaurant";
import {
  generateRestaurantOrderNumber,
  getOrdersByTableSession,
  getRestaurantOrderById,
  validateItemPriceSnapshot,
  calculateAuthoritativeTotals,
} from "@/lib/restaurant/order-domain";
import {
  validateOrderStatusTransition,
  canCustomerCancelOrder,
  type OrderStatus,
} from "@/lib/ordering/order-state-machines";
import { eq, and } from "drizzle-orm";

describe("ASSO Restaurant Vertical — Slice 3.1: Order Domain & Database Foundation", () => {
  const TENANT_A = "11111111-1111-1111-1111-111111111111";
  const TENANT_B = "22222222-2222-2222-2222-222222222222";

  const rawSql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 3 });

  let outletIdA: string;
  let outletIdB: string;
  let contextIdA: string;
  let tableIdA: string;
  let tableSessionIdA: string;
  let customerIdA: string;
  let catalogItemIdA1: string;
  let catalogItemIdA2: string;
  let orderBId: string | null = null;

  beforeAll(async () => {
    const db = getDb();

    // 1. Setup Outlet A & Context A
    const outARows = await db
      .select()
      .from(outlets)
      .where(and(eq(outlets.tenantId, TENANT_A), eq(outlets.verticalType, "RESTAURANT")))
      .limit(1);

    if (outARows.length > 0) {
      outletIdA = outARows[0].outletId;
    } else {
      const [newOut] = await db
        .insert(outlets)
        .values({
          tenantId: TENANT_A,
          name: "Saffron Royal Court",
          code: `SRC_${Date.now().toString().slice(-4)}`,
          verticalType: "RESTAURANT",
        })
        .returning();
      outletIdA = newOut.outletId;
    }

    // Outlet B
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
          name: "Bistro Blue",
          code: `BB_${Date.now().toString().slice(-4)}`,
          verticalType: "RESTAURANT",
        })
        .returning();
      outletIdB = newOutB.outletId;
    }

    // 2. Business Context & Physical Table
    const [ctx] = await db
      .insert(businessContexts)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextType: "TABLE",
        identifier: `T-R3-01-${Date.now().toString().slice(-4)}`,
        displayLabel: "Terrace Dining T-R3-01",
      })
      .returning();
    contextIdA = ctx.contextId;

    const [tbl] = await db
      .insert(restaurantTables)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: contextIdA,
        tableNumber: `T-R3-01-${Date.now().toString().slice(-4)}`,
        displayLabel: "Terrace Dining T-R3-01",
        capacity: 4,
        section: "Terrace Dining",
        status: "OCCUPIED",
      })
      .returning();
    tableIdA = tbl.tableId;

    // 3. Open Dining Table Session
    const [sess] = await db
      .insert(restaurantTableSessions)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        tableId: tableIdA,
        sessionNumber: `TS-R3-${Date.now().toString().slice(-4)}`,
        status: "ACTIVE",
        guestCount: 2,
        customerName: "Vikramaditya Roy",
        customerPhone: "+919876543999",
      })
      .returning();
    tableSessionIdA = sess.sessionId;

    // 4. Shared Customer Engine
    const [cust] = await db
      .insert(customers)
      .values({
        tenantId: TENANT_A,
        fullName: "Vikramaditya Roy",
        phone: "+919876543999",
        email: "vikram@example.com",
      })
      .returning();
    customerIdA = cust.customerId;

    // 5. Catalog & Menu Items
    const [cat] = await db
      .insert(catalogs)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        name: "Saffron Dining Catalog",
        isActive: true,
      })
      .returning();

    const [category] = await db
      .insert(catalogCategories)
      .values({
        tenantId: TENANT_A,
        catalogId: cat.catalogId,
        name: "Mains & Biryani",
        displayOrder: 1,
        isActive: true,
      })
      .returning();

    const [item1] = await db
      .insert(catalogItems)
      .values({
        tenantId: TENANT_A,
        categoryId: category.categoryId,
        name: "Dum Handi Mutton Biryani",
        basePrice: "650.0000",
        taxRate: "0.0500",
        isAvailable: true,
        fulfillmentStation: "KITCHEN",
      })
      .returning();
    catalogItemIdA1 = item1.itemId;

    const [item2] = await db
      .insert(catalogItems)
      .values({
        tenantId: TENANT_A,
        categoryId: category.categoryId,
        name: "Garlic Butter Naan",
        basePrice: "120.0000",
        taxRate: "0.0500",
        isAvailable: true,
        fulfillmentStation: "TANDOOR",
      })
      .returning();
    catalogItemIdA2 = item2.itemId;
  });

  // ==========================================================================
  // 1. ORDER DOMAIN FOUNDATION
  // ==========================================================================

  let orderId1: string;
  let orderNumber1: string;
  let orderItem1Id: string;
  let orderItem2Id: string;
  const createdOrderIds: string[] = [];

  it("1. Restaurant order structure can represent a DINE_IN order", async () => {
    const db = getDb();
    orderNumber1 = generateRestaurantOrderNumber();

    const [order] = await db
      .insert(orders)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: contextIdA,
        tableId: tableIdA,
        tableSessionId: tableSessionIdA,
        customerId: customerIdA,
        orderNumber: orderNumber1,
        orderSource: "CUSTOMER_WEB",
        diningContext: "DINE_IN",
        status: "PLACED",
        subtotalAmount: "1540.0000",
        taxAmount: "77.0000",
        discountAmount: "0.0000",
        totalAmount: "1617.0000",
        idempotencyKey: `idemp-ord-1-${Date.now()}`,
      })
      .returning();

    createdOrderIds.push(order.orderId);

    expect(order.orderId).toBeDefined();
    expect(order.diningContext).toBe("DINE_IN");
    expect(order.orderSource).toBe("CUSTOMER_WEB");
    expect(order.status).toBe("PLACED");
    expect(order.tableId).toBe(tableIdA);
    expect(order.tableSessionId).toBe(tableSessionIdA);

    orderId1 = order.orderId;
  });

  it("2. Order references correct Restaurant/table session", async () => {
    const db = getDb();
    const [fetched] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderId, orderId1));

    expect(fetched.tableSessionId).toBe(tableSessionIdA);
    expect(fetched.tableId).toBe(tableIdA);
    expect(fetched.outletId).toBe(outletIdA);
    expect(fetched.tenantId).toBe(TENANT_A);
  });

  it("3. Multiple orders can exist under one table session (sequential dining rounds)", async () => {
    const db = getDb();

    // Order #2: Second round (Desserts & Drinks) under the SAME table session
    const orderNumber2 = generateRestaurantOrderNumber();
    const [order2] = await db
      .insert(orders)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: contextIdA,
        tableId: tableIdA,
        tableSessionId: tableSessionIdA, // SAME table session!
        customerId: customerIdA,
        orderNumber: orderNumber2,
        orderSource: "CUSTOMER_WEB",
        diningContext: "DINE_IN",
        status: "PLACED",
        subtotalAmount: "450.0000",
        taxAmount: "22.5000",
        discountAmount: "0.0000",
        totalAmount: "472.5000",
        idempotencyKey: `idemp-ord-2-${Date.now()}`,
      })
      .returning();

    createdOrderIds.push(order2.orderId);

    expect(order2.tableSessionId).toBe(tableSessionIdA);

    // Fetch all orders for this table session
    const sessionOrders = await getOrdersByTableSession(TENANT_A, tableSessionIdA);
    expect(sessionOrders.length).toBeGreaterThanOrEqual(2);
    expect(sessionOrders.some((o) => o.orderNumber === orderNumber1)).toBe(true);
    expect(sessionOrders.some((o) => o.orderNumber === orderNumber2)).toBe(true);
  });

  it("4. Multiple order items can exist under one order", async () => {
    const db = getDb();

    // Item 1: Dum Handi Biryani x 2 @ 650 = 1300
    const [item1] = await db
      .insert(orderItems)
      .values({
        tenantId: TENANT_A,
        orderId: orderId1,
        itemId: catalogItemIdA1,
        itemName: "Dum Handi Mutton Biryani",
        unitPrice: "650.0000",
        quantity: 2,
        subtotal: "1300.0000",
        fulfillmentStation: "KITCHEN",
        itemStatus: "PLACED",
        specialNotes: "Extra raita",
      })
      .returning();

    // Item 2: Garlic Butter Naan x 2 @ 120 = 240
    const [item2] = await db
      .insert(orderItems)
      .values({
        tenantId: TENANT_A,
        orderId: orderId1,
        itemId: catalogItemIdA2,
        itemName: "Garlic Butter Naan",
        unitPrice: "120.0000",
        quantity: 2,
        subtotal: "240.0000",
        fulfillmentStation: "TANDOOR",
        itemStatus: "PLACED",
        specialNotes: "Crispy",
      })
      .returning();

    orderItem1Id = item1.orderItemId;
    orderItem2Id = item2.orderItemId;

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId1));

    expect(items.length).toBe(2);
    expect(items[0].orderId).toBe(orderId1);
    expect(items[1].orderId).toBe(orderId1);
  });

  it("5. Each item is independently addressable with unique UUID primary key", async () => {
    expect(orderItem1Id).toBeDefined();
    expect(orderItem2Id).toBeDefined();
    expect(orderItem1Id).not.toBe(orderItem2Id);
  });

  it("6. Historical item price snapshot can be stored and remains immutable", async () => {
    const db = getDb();

    // 1. Verify stored snapshot price in order_items
    const [itemBefore] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderItemId, orderItem1Id));
    expect(parseFloat(itemBefore.unitPrice)).toBe(650.0);

    // 2. Menu price increases in catalog
    await db
      .update(catalogItems)
      .set({ basePrice: "720.0000" })
      .where(eq(catalogItems.itemId, catalogItemIdA1));

    // 3. Historical order item price remains unchanged (Snapshot preserved!)
    const [itemAfter] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderItemId, orderItem1Id));
    expect(parseFloat(itemAfter.unitPrice)).toBe(650.0);
    expect(parseFloat(itemAfter.subtotal)).toBe(1300.0);

    expect(
      validateItemPriceSnapshot(itemAfter.unitPrice, itemAfter.quantity, itemAfter.subtotal)
    ).toBe(true);
  });

  it("7. Order number is unique within outlet scope", async () => {
    const db = getDb();
    // Attempting to insert duplicate orderNumber1 for the same outletIdA must fail
    await expect(
      db.insert(orders).values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: contextIdA,
        orderNumber: orderNumber1, // Duplicate!
        orderSource: "CUSTOMER_WEB",
        diningContext: "DINE_IN",
        status: "PLACED",
      })
    ).rejects.toThrow();
  });

  it("8. Invalid quantities and negative amounts are rejected by DB constraints", async () => {
    const db = getDb();

    // 1. Quantity must be > 0
    await expect(
      db.insert(orderItems).values({
        tenantId: TENANT_A,
        orderId: orderId1,
        itemId: catalogItemIdA1,
        itemName: "Zero Qty Test",
        unitPrice: "100.0000",
        quantity: 0, // Invalid!
        subtotal: "0.0000",
      })
    ).rejects.toThrow();

    // 2. Unit price must be >= 0
    await expect(
      db.insert(orderItems).values({
        tenantId: TENANT_A,
        orderId: orderId1,
        itemId: catalogItemIdA1,
        itemName: "Negative Price Test",
        unitPrice: "-50.0000", // Invalid!
        quantity: 1,
        subtotal: "-50.0000",
      })
    ).rejects.toThrow();

    // 3. Order total amount must be >= 0
    await expect(
      db.insert(orders).values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: contextIdA,
        orderNumber: generateRestaurantOrderNumber(),
        orderSource: "CUSTOMER_WEB",
        diningContext: "DINE_IN",
        status: "PLACED",
        totalAmount: "-100.0000", // Invalid!
      })
    ).rejects.toThrow();
  });

  // ==========================================================================
  // 2. CUSTOMER & HOTEL COMPATIBILITY
  // ==========================================================================

  it("9. Shared customer reference works", async () => {
    const db = getDb();
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderId, orderId1));

    expect(order.customerId).toBe(customerIdA);

    // Verify referenced customer exists in shared customer table
    const [cust] = await db
      .select()
      .from(customers)
      .where(eq(customers.customerId, order.customerId!));
    expect(cust.fullName).toBe("Vikramaditya Roy");
  });

  it("10. Restaurant order does not require Hotel stay or room", async () => {
    const snapshot = await getRestaurantOrderById(TENANT_A, orderId1);
    expect(snapshot.diningContext).toBe("DINE_IN");
    expect(snapshot.tableId).toBe(tableIdA);
    expect(snapshot.tableSessionId).toBe(tableSessionIdA);
    // Standalone restaurant order has zero coupling to hotel stay
  });

  it("11. Hotel Room Service order behavior remains valid", async () => {
    const db = getDb();
    // Insert a Hotel room service order (with diningContext = 'ROOM_SERVICE' and tableSessionId = null)
    const hotelOrderNumber = `RS-${Date.now().toString().slice(-4)}`;
    const [hotelOrder] = await db
      .insert(orders)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: contextIdA,
        tableId: null,
        tableSessionId: null,
        orderNumber: hotelOrderNumber,
        orderSource: "QR_CUSTOMER",
        diningContext: "ROOM_SERVICE",
        status: "PLACED",
        subtotalAmount: "500.0000",
        taxAmount: "25.0000",
        totalAmount: "525.0000",
      })
      .returning();

    createdOrderIds.push(hotelOrder.orderId);

    expect(hotelOrder.diningContext).toBe("ROOM_SERVICE");
    expect(hotelOrder.tableSessionId).toBeNull();
    expect(hotelOrder.tableId).toBeNull();
  });

  // ==========================================================================
  // 3. TENANT ISOLATION & RLS
  // ==========================================================================

  it("12. Tenant A cannot access Tenant B orders (RLS)", async () => {
    // Insert order for Tenant B
    const db = getDb();
    const orderNumB = generateRestaurantOrderNumber();
    const [orderB] = await db
      .insert(orders)
      .values({
        tenantId: TENANT_B,
        outletId: outletIdB,
        contextId: contextIdA, // arbitrary context
        orderNumber: orderNumB,
        orderSource: "CUSTOMER_WEB",
        diningContext: "DINE_IN",
        status: "PLACED",
        subtotalAmount: "300.0000",
        taxAmount: "15.0000",
        totalAmount: "315.0000",
      })
      .returning();

    createdOrderIds.push(orderB.orderId);
    orderBId = orderB.orderId;

    // Query under Tenant A RLS session
    const rows = await rawSql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('app.current_tenant_id', ${TENANT_A}, true)`;
      return await tx`SELECT * FROM orders WHERE order_id = ${orderB.orderId}`;
    });

    expect(rows.length).toBe(0);
  });

  it("13. Tenant A cannot mutate Tenant B orders (RLS)", async () => {
    // Attempt cross-tenant update under Tenant A RLS
    const updateResult = await rawSql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('app.current_tenant_id', ${TENANT_A}, true)`;
      return await tx`UPDATE orders SET status = 'CANCELLED' WHERE tenant_id = ${TENANT_B}`;
    });

    expect(updateResult.count).toBe(0);
  });

  it("14. Missing tenant context fails closed (RLS)", async () => {
    const rows = await rawSql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('app.current_tenant_id', '', true)`;
      return await tx`SELECT * FROM orders`;
    });

    expect(rows.length).toBe(0);
  });

  // ==========================================================================
  // 4. ORDER STATE MACHINES & TRANSITIONS
  // ==========================================================================

  it("15. Valid state values and transitions accepted", () => {
    // DINE_IN Lifecycle: PLACED -> CONFIRMED -> PREPARING -> READY -> SERVED -> COMPLETED
    expect(() => validateOrderStatusTransition("PLACED", "CONFIRMED")).not.toThrow();
    expect(() => validateOrderStatusTransition("CONFIRMED", "PREPARING")).not.toThrow();
    expect(() => validateOrderStatusTransition("PREPARING", "READY")).not.toThrow();
    expect(() => validateOrderStatusTransition("READY", "SERVED")).not.toThrow();
    expect(() => validateOrderStatusTransition("SERVED", "COMPLETED")).not.toThrow();

    // Idempotent transition
    expect(() => validateOrderStatusTransition("READY", "READY")).not.toThrow();
  });

  it("16. Invalid state transitions are rejected", () => {
    // Cannot transition backward or from terminal state
    expect(() => validateOrderStatusTransition("COMPLETED", "PLACED")).toThrow();
    expect(() => validateOrderStatusTransition("CANCELLED", "CONFIRMED")).toThrow();
    expect(() => validateOrderStatusTransition("SERVED", "PLACED")).toThrow();

    // Cancellation rule: can cancel before preparation, but not after
    expect(canCustomerCancelOrder("PLACED")).toBe(true);
    expect(canCustomerCancelOrder("CONFIRMED")).toBe(true);
    expect(canCustomerCancelOrder("PREPARING")).toBe(false);
    expect(canCustomerCancelOrder("SERVED")).toBe(false);
    expect(canCustomerCancelOrder("COMPLETED")).toBe(false);
  });

  // ==========================================================================
  // 5. IDEMPOTENCY & KDS COMPATIBILITY
  // ==========================================================================

  it("17. Existing idempotency conventions are compatible with order creation", async () => {
    const idempKey = `idemp-test-${Date.now()}`;
    const db = getDb();
    const [order] = await db
      .insert(orders)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: contextIdA,
        orderNumber: generateRestaurantOrderNumber(),
        orderSource: "CUSTOMER_WEB",
        diningContext: "DINE_IN",
        status: "PLACED",
        subtotalAmount: "300.0000",
        taxAmount: "15.0000",
        totalAmount: "315.0000",
        idempotencyKey: idempKey,
      })
      .returning();

    createdOrderIds.push(order.orderId);

    expect(order.idempotencyKey).toBe(idempKey);
  });

  it("18. Duplicate order-create operations prevented by unique tenant idempotency index", async () => {
    const idempKey = `idemp-dup-test-${Date.now()}`;
    const db = getDb();

    // First insert succeeds
    const [ord18] = await db
      .insert(orders)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: contextIdA,
        orderNumber: generateRestaurantOrderNumber(),
        orderSource: "CUSTOMER_WEB",
        diningContext: "DINE_IN",
        status: "PLACED",
        subtotalAmount: "300.0000",
        taxAmount: "15.0000",
        totalAmount: "315.0000",
        idempotencyKey: idempKey,
      })
      .returning();

    createdOrderIds.push(ord18.orderId);

    // Duplicate insert with same idempotencyKey fails
    await expect(
      db.insert(orders).values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        contextId: contextIdA,
        orderNumber: generateRestaurantOrderNumber(),
        orderSource: "CUSTOMER_WEB",
        diningContext: "DINE_IN",
        status: "PLACED",
        subtotalAmount: "300.0000",
        taxAmount: "15.0000",
        totalAmount: "315.0000",
        idempotencyKey: idempKey, // Duplicate!
      })
    ).rejects.toThrow();
  });

  it("19. Order item can be independently referenced for future KDS task generation", async () => {
    const db = getDb();
    const [item] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderItemId, orderItem1Id));

    expect(item.orderItemId).toBeDefined();
    expect(item.fulfillmentStation).toBe("KITCHEN");
    expect(item.itemStatus).toBe("PLACED");

    // In R3.3, a KDS task will reference `item.orderItemId` and `item.fulfillmentStation`
  });

  afterAll(async () => {
    const db = getDb();
    for (const id of createdOrderIds) {
      await db.delete(orderItems).where(eq(orderItems.orderId, id));
      await db.delete(orders).where(eq(orders.orderId, id));
    }
    await rawSql.end();
  });
});
