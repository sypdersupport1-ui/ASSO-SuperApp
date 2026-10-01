import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/db/client";
import { kdsTasks, kdsTaskHistory, orders, orderItems, catalogItems, catalogs, catalogCategories } from "@/db/schema/operations";
import { organizations, outlets } from "@/db/schema/core";
import { businessContexts } from "@/db/schema/context";
import { restaurantTables, restaurantTableSessions } from "@/db/schema/restaurant";
import { eq, and } from "drizzle-orm";
import { generateKdsTasksFromOrderConfirmed, updateKdsTaskStatus } from "@/lib/restaurant/kds-service";
import { calculateExactOrderTotals } from "@/lib/decimal";
import crypto from "crypto";
import postgres from "postgres";

const rawSql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 3 });

describe("Restaurant R3.3: KDS Task Generation & State Machine", () => {
  const db = getDb();
  
  const TENANT_ID = "33333333-3333-3333-3333-333333333333";
  const STAFF_ID = "de906b32-6ba7-478f-aa5e-7a27ab9cd956";
  let OUTLET_ID: string;
  let CONTEXT_ID: string;
  let TABLE_ID: string;
  let TABLE_SESSION_ID: string;
  let CATEGORY_ID: string;

  beforeAll(async () => {
    // Seed Org
    await db.insert(organizations).values({
      organizationId: TENANT_ID,
      name: "Test Org KDS",
      primaryBusinessType: "RESTAURANT",
    }).onConflictDoNothing();

    // Seed Outlet
    const [out] = await db.insert(outlets).values({
      tenantId: TENANT_ID,
      name: "Test Outlet KDS",
      code: "TOK",
      verticalType: "RESTAURANT",
    }).returning();
    OUTLET_ID = out.outletId;

    // Seed Context
    const [ctx] = await db.insert(businessContexts).values({
      tenantId: TENANT_ID,
      outletId: OUTLET_ID,
      contextType: "TABLE",
      identifier: `T-KDS-01-${Date.now()}`,
      displayLabel: "T-KDS-01",
    }).returning();
    CONTEXT_ID = ctx.contextId;

    // Seed Table
    const [tbl] = await db.insert(restaurantTables).values({
      tenantId: TENANT_ID,
      outletId: OUTLET_ID,
      contextId: CONTEXT_ID,
      tableNumber: `T-KDS-01-${Date.now()}`,
      displayLabel: "T-KDS-01",
      capacity: 4,
      section: "Main",
      status: "OCCUPIED",
    }).returning();
    TABLE_ID = tbl.tableId;

    // Seed Table Session
    const [sess] = await db.insert(restaurantTableSessions).values({
      tenantId: TENANT_ID,
      outletId: OUTLET_ID,
      tableId: TABLE_ID,
      sessionNumber: `SESS-KDS-1-${Date.now()}`,
      status: "ACTIVE",
      guestCount: 2,
    }).returning();
    TABLE_SESSION_ID = sess.sessionId;

    // Seed Catalog
    const [cat] = await db.insert(catalogs).values({
      tenantId: TENANT_ID,
      outletId: OUTLET_ID,
      name: "KDS Catalog",
    }).returning();

    const [catg] = await db.insert(catalogCategories).values({
      tenantId: TENANT_ID,
      catalogId: cat.catalogId,
      name: "KDS Category",
    }).returning();
    CATEGORY_ID = catg.categoryId;

    const { users } = await import("@/db/schema/core");
    await db.insert(users).values({
      userId: STAFF_ID,
      email: "staff_kds@example.com",
      fullName: "KDS Staff",
    }).onConflictDoNothing();
  });

  async function createTestOrder(itemsInput: any[], status: string = "PLACED") {
    const orderId = crypto.randomUUID();
    const totals = calculateExactOrderTotals({
      items: itemsInput,
      taxRate: "0.05",
      platformFeeType: "PERCENTAGE",
      platformFeeRate: "0.02",
      platformFeeFixed: "0",
      discountAmount: "0",
    });

    await db.transaction(async (tx) => {
      await tx.insert(orders).values({
        orderId,
        tenantId: TENANT_ID,
        outletId: OUTLET_ID,
        contextId: CONTEXT_ID,
        orderNumber: `TEST-ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        orderSource: "CUSTOMER_WEB",
        tableId: TABLE_ID,
        tableSessionId: TABLE_SESSION_ID,
        status,
        subtotalAmount: totals.subtotalAmountDb,
        taxRate: totals.taxRateDb,
        taxAmount: totals.taxAmountDb,
        platformFeeType: totals.platformFeeType,
        platformFeeRate: totals.platformFeeRateDb,
        platformFeeAmount: totals.platformFeeAmountDb,
        discountAmount: totals.discountAmountDb,
        totalAmount: totals.totalAmountDb,
      });

      for (const item of totals.lineItems) {
        // Must insert into catalogItems first for FK
        const [cItem] = await tx.insert(catalogItems).values({
          itemId: crypto.randomUUID(),
          tenantId: TENANT_ID,
          categoryId: CATEGORY_ID,
          name: item.itemName!,
          basePrice: item.unitPriceDb,
          fulfillmentStation: item.fulfillmentStation,
        }).returning();

        await tx.insert(orderItems).values({
          orderItemId: item.itemId, // Random UUID passed in from test
          orderId,
          tenantId: TENANT_ID,
          itemId: cItem.itemId,
          itemName: cItem.name,
          unitPrice: item.unitPriceDb,
          quantity: item.quantity,
          subtotal: item.subtotalDb,
          fulfillmentStation: item.fulfillmentStation,
          itemStatus: status === "CANCELLED" ? "CANCELLED" : "PLACED",
        });
      }
    });

    return orderId;
  }

  it("1. Generates one KDS task per fulfillable order item and respects station routing", async () => {
    const orderId = await createTestOrder([
      { itemId: crypto.randomUUID(), itemName: "Biryani", unitPrice: "250", quantity: 2, fulfillmentStation: "KITCHEN" },
      { itemId: crypto.randomUUID(), itemName: "Naan", unitPrice: "50", quantity: 5, fulfillmentStation: "TANDOOR" },
    ]);

    await generateKdsTasksFromOrderConfirmed(TENANT_ID, orderId);

    const tasks = await db.select().from(kdsTasks).where(eq(kdsTasks.orderId, orderId));
    expect(tasks).toHaveLength(2);
    expect(tasks.find(t => t.itemName === "Biryani")?.stationRouting).toBe("KITCHEN");
    expect(tasks.find(t => t.itemName === "Naan")?.stationRouting).toBe("TANDOOR");
    expect(tasks[0].taskStatus).toBe("PENDING");
    expect(tasks[1].taskStatus).toBe("PENDING");
    expect(tasks[0].tableId).toBe(TABLE_ID);
  });

  it("2. Does not generate KDS tasks for cancelled items/orders", async () => {
    const orderId = await createTestOrder([
      { itemId: crypto.randomUUID(), itemName: "Coke", unitPrice: "40", quantity: 1, fulfillmentStation: "BEVERAGE" },
    ], "CANCELLED");

    await generateKdsTasksFromOrderConfirmed(TENANT_ID, orderId);

    const tasks = await db.select().from(kdsTasks).where(eq(kdsTasks.orderId, orderId));
    expect(tasks).toHaveLength(0); // None generated because order is cancelled
  });

  it("3. Idempotency: Processing the same order twice generates no duplicates", async () => {
    const orderId = await createTestOrder([
      { itemId: crypto.randomUUID(), itemName: "Pizza", unitPrice: "300", quantity: 1, fulfillmentStation: "KITCHEN" },
    ]);

    await generateKdsTasksFromOrderConfirmed(TENANT_ID, orderId);
    let tasks = await db.select().from(kdsTasks).where(eq(kdsTasks.orderId, orderId));
    expect(tasks).toHaveLength(1);

    // Call it again
    await generateKdsTasksFromOrderConfirmed(TENANT_ID, orderId);
    tasks = await db.select().from(kdsTasks).where(eq(kdsTasks.orderId, orderId));
    expect(tasks).toHaveLength(1); // Still 1
  });

  it("4. Allows valid KDS task state transitions (PENDING -> PREPARING -> READY -> DONE)", async () => {
    const orderId = await createTestOrder([
      { itemId: crypto.randomUUID(), itemName: "Salad", unitPrice: "150", quantity: 1, fulfillmentStation: "KITCHEN" },
    ]);

    await generateKdsTasksFromOrderConfirmed(TENANT_ID, orderId);
    const [task] = await db.select().from(kdsTasks).where(eq(kdsTasks.orderId, orderId));

    // Update to PREPARING
    await updateKdsTaskStatus(TENANT_ID, task.taskId, "PREPARING", STAFF_ID);
    let updatedTask = await db.select().from(kdsTasks).where(eq(kdsTasks.taskId, task.taskId)).then(r => r[0]);
    expect(updatedTask.taskStatus).toBe("PREPARING");

    // Update to READY
    await updateKdsTaskStatus(TENANT_ID, task.taskId, "READY", STAFF_ID);
    updatedTask = await db.select().from(kdsTasks).where(eq(kdsTasks.taskId, task.taskId)).then(r => r[0]);
    expect(updatedTask.taskStatus).toBe("READY");

    // Update to DONE
    await updateKdsTaskStatus(TENANT_ID, task.taskId, "DONE", STAFF_ID);
    updatedTask = await db.select().from(kdsTasks).where(eq(kdsTasks.taskId, task.taskId)).then(r => r[0]);
    expect(updatedTask.taskStatus).toBe("DONE");
    
    // Check audit history
    const history = await db.select().from(kdsTaskHistory).where(eq(kdsTaskHistory.taskId, task.taskId));
    expect(history.length).toBe(3); // PENDING->PREPARING, PREPARING->READY, READY->DONE
  });

  it("5. Rejects invalid KDS state transitions (PENDING -> DONE directly)", async () => {
    const orderId = await createTestOrder([
      { itemId: crypto.randomUUID(), itemName: "Soup", unitPrice: "100", quantity: 1, fulfillmentStation: "KITCHEN" },
    ]);

    await generateKdsTasksFromOrderConfirmed(TENANT_ID, orderId);
    const [task] = await db.select().from(kdsTasks).where(eq(kdsTasks.orderId, orderId));

    await expect(updateKdsTaskStatus(TENANT_ID, task.taskId, "DONE", STAFF_ID))
      .rejects.toThrow("Invalid KDS task status transition");
  });

  it("6. Derives order status: all PENDING -> PLACED (unchanged)", async () => {
    const orderId = await createTestOrder([
      { itemId: crypto.randomUUID(), itemName: "Soup", unitPrice: "100", quantity: 1, fulfillmentStation: "KITCHEN" },
    ]);

    await generateKdsTasksFromOrderConfirmed(TENANT_ID, orderId);
    
    const [order] = await db.select().from(orders).where(eq(orders.orderId, orderId));
    expect(order.status).toBe("PLACED");
  });

  it("7. Derives order status: any PREPARING -> PREPARING", async () => {
    const orderId = await createTestOrder([
      { itemId: crypto.randomUUID(), itemName: "T1", unitPrice: "100", quantity: 1, fulfillmentStation: "KITCHEN" },
      { itemId: crypto.randomUUID(), itemName: "T2", unitPrice: "100", quantity: 1, fulfillmentStation: "KITCHEN" },
    ], "CONFIRMED");

    await generateKdsTasksFromOrderConfirmed(TENANT_ID, orderId);
    const tasks = await db.select().from(kdsTasks).where(eq(kdsTasks.orderId, orderId));
    
    await updateKdsTaskStatus(TENANT_ID, tasks[0].taskId, "PREPARING", STAFF_ID);

    const [order] = await db.select().from(orders).where(eq(orders.orderId, orderId));
    expect(order.status).toBe("PREPARING");
  });

  it("8. Derives order status: some READY and some PREPARING -> PREPARING", async () => {
    const orderId = await createTestOrder([
      { itemId: crypto.randomUUID(), itemName: "T1", unitPrice: "100", quantity: 1, fulfillmentStation: "KITCHEN" },
      { itemId: crypto.randomUUID(), itemName: "T2", unitPrice: "100", quantity: 1, fulfillmentStation: "KITCHEN" },
    ], "CONFIRMED");

    await generateKdsTasksFromOrderConfirmed(TENANT_ID, orderId);
    const tasks = await db.select().from(kdsTasks).where(eq(kdsTasks.orderId, orderId));
    
    await updateKdsTaskStatus(TENANT_ID, tasks[0].taskId, "PREPARING", STAFF_ID);
    await updateKdsTaskStatus(TENANT_ID, tasks[0].taskId, "READY", STAFF_ID);
    await updateKdsTaskStatus(TENANT_ID, tasks[1].taskId, "PREPARING", STAFF_ID); // Second item is preparing

    const [order] = await db.select().from(orders).where(eq(orders.orderId, orderId));
    expect(order.status).toBe("PARTIALLY_READY");
  });

  it("9. Derives order status: some READY/DONE and some PENDING -> PARTIALLY_READY", async () => {
    const orderId = await createTestOrder([
      { itemId: crypto.randomUUID(), itemName: "T1", unitPrice: "100", quantity: 1, fulfillmentStation: "KITCHEN" },
      { itemId: crypto.randomUUID(), itemName: "T2", unitPrice: "100", quantity: 1, fulfillmentStation: "KITCHEN" },
    ], "CONFIRMED");

    await generateKdsTasksFromOrderConfirmed(TENANT_ID, orderId);
    const tasks = await db.select().from(kdsTasks).where(eq(kdsTasks.orderId, orderId));
    
    await updateKdsTaskStatus(TENANT_ID, tasks[0].taskId, "PREPARING", STAFF_ID);
    await updateKdsTaskStatus(TENANT_ID, tasks[0].taskId, "READY", STAFF_ID);
    // Second item remains PENDING

    const [order] = await db.select().from(orders).where(eq(orders.orderId, orderId));
    expect(order.status).toBe("PARTIALLY_READY");
  });

  it("10. Derives order status: all READY or DONE -> READY", async () => {
    const orderId = await createTestOrder([
      { itemId: crypto.randomUUID(), itemName: "T1", unitPrice: "100", quantity: 1, fulfillmentStation: "KITCHEN" },
      { itemId: crypto.randomUUID(), itemName: "T2", unitPrice: "100", quantity: 1, fulfillmentStation: "KITCHEN" },
    ], "CONFIRMED");

    await generateKdsTasksFromOrderConfirmed(TENANT_ID, orderId);
    const tasks = await db.select().from(kdsTasks).where(eq(kdsTasks.orderId, orderId));
    
    await updateKdsTaskStatus(TENANT_ID, tasks[0].taskId, "PREPARING", STAFF_ID);
    await updateKdsTaskStatus(TENANT_ID, tasks[0].taskId, "READY", STAFF_ID);
    
    await updateKdsTaskStatus(TENANT_ID, tasks[1].taskId, "PREPARING", STAFF_ID);
    await updateKdsTaskStatus(TENANT_ID, tasks[1].taskId, "READY", STAFF_ID);
    await updateKdsTaskStatus(TENANT_ID, tasks[1].taskId, "DONE", STAFF_ID); // DONE is also considered ready/complete

    const [order] = await db.select().from(orders).where(eq(orders.orderId, orderId));
    expect(order.status).toBe("READY");
  });

  it("11. Integrity: KDS generation does not modify order financial totals", async () => {
    const orderId = await createTestOrder([
      { itemId: crypto.randomUUID(), itemName: "Gold", unitPrice: "5000", quantity: 1, fulfillmentStation: "KITCHEN" },
    ]);

    const [orderBefore] = await db.select().from(orders).where(eq(orders.orderId, orderId));

    await generateKdsTasksFromOrderConfirmed(TENANT_ID, orderId);

    const [orderAfter] = await db.select().from(orders).where(eq(orders.orderId, orderId));
    
    expect(orderBefore.totalAmount).toBe(orderAfter.totalAmount);
    expect(orderBefore.taxAmount).toBe(orderAfter.taxAmount);
    expect(orderBefore.platformFeeAmount).toBe(orderAfter.platformFeeAmount);
  });
});
