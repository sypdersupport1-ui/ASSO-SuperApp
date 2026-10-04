import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/db/client";
import {
  kdsTasks,
  kdsTaskHistory,
  orders,
  orderItems,
  catalogItems,
  catalogs,
  catalogCategories,
  kitchenStations,
} from "@/db/schema/operations";
import { organizations, outlets, users } from "@/db/schema/core";
import { businessContexts } from "@/db/schema/context";
import { restaurantTables, restaurantTableSessions } from "@/db/schema/restaurant";
import { domainOutboxEvents } from "@/db/schema/communication";
import { eq, and, inArray } from "drizzle-orm";
import {
  createKitchenStation,
  updateKitchenStation,
  listKitchenStations,
  getKitchenStation,
  updateMenuItemStationRouting,
  generateKdsTasksFromOrderConfirmed,
  updateKdsTaskStatus,
  updateKdsTaskPriority,
  recallKdsTask,
  bumpStationTicket,
  listKdsTasks,
  listKdsTickets,
} from "@/lib/restaurant/kds-service";
import { calculateExactOrderTotals } from "@/lib/decimal";
import { signJwt } from "@/lib/auth/jwt";
import { setTenantEntitlements } from "@/lib/entitlements/checker";
import { NextRequest } from "next/server";
import { GET as stationsGet, POST as stationsPost } from "@/app/api/v1/restaurant/kds/stations/route";
import { GET as stationDetailGet, PATCH as stationDetailPatch } from "@/app/api/v1/restaurant/kds/stations/[id]/route";
import { PATCH as menuItemRoutingPatch } from "@/app/api/v1/restaurant/admin/menu/items/[id]/routing/route";
import { GET as tasksGet } from "@/app/api/v1/restaurant/kds/tasks/route";
import { GET as ticketsGet } from "@/app/api/v1/restaurant/kds/tickets/route";
import { PATCH as taskStatusPatch } from "@/app/api/v1/restaurant/kds/tasks/[id]/status/route";
import { PATCH as taskPriorityPatch } from "@/app/api/v1/restaurant/kds/tasks/[id]/priority/route";
import { POST as taskRecallPost } from "@/app/api/v1/restaurant/kds/tasks/[id]/recall/route";
import { POST as bumpPost } from "@/app/api/v1/restaurant/kds/bump/route";
import crypto from "crypto";
import postgres from "postgres";

const rawSql = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 3 });

describe("Restaurant R3.7: KDS Phase 2 / Advanced Fulfillment & Station Routing", () => {
  const db = getDb();

  const TENANT_ID = "44444444-4444-4444-4444-444444444444";
  const OTHER_TENANT_ID = "55555555-5555-5555-5555-555555555555";
  const STAFF_ID = "de906b32-6ba7-478f-aa5e-7a27ab9cd956";
  const MANAGER_ID = "ee906b32-6ba7-478f-aa5e-7a27ab9cd957";

  const staffToken = signJwt({
    sub: STAFF_ID,
    tenantId: TENANT_ID,
    roles: ["RESTAURANT_STAFF"],
    permissions: ["restaurant.kds.view", "restaurant.kds.update"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const managerToken = signJwt({
    sub: MANAGER_ID,
    tenantId: TENANT_ID,
    roles: ["RESTAURANT_MANAGER"],
    permissions: ["restaurant.*", "catalog.manage", "restaurant.kds.manage"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const guestToken = signJwt({
    sub: "usr_guest_kds",
    tenantId: TENANT_ID,
    roles: ["GUEST"],
    permissions: ["customer.read"],
    sessionType: "CUSTOMER",
    isSuperAdmin: false,
  });

  const otherTenantToken = signJwt({
    sub: "usr_other_staff",
    tenantId: OTHER_TENANT_ID,
    roles: ["RESTAURANT_STAFF"],
    permissions: ["restaurant.*", "catalog.manage", "restaurant.kds.manage"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  let OUTLET_ID: string;
  let OTHER_OUTLET_ID: string;
  let CONTEXT_ID: string;
  let TABLE_ID: string;
  let TABLE_SESSION_ID: string;
  let CATEGORY_ID: string;

  let HOT_KITCHEN_STATION_ID: string;
  let TANDOOR_STATION_ID: string;
  let BEVERAGE_STATION_ID: string;

  beforeAll(async () => {
    setTenantEntitlements(TENANT_ID, ["CORE", "RESTAURANT", "POS", "ORDERING"]);
    setTenantEntitlements(OTHER_TENANT_ID, ["CORE", "RESTAURANT", "POS", "ORDERING"]);

    // 1. Seed Organizations
    await db
      .insert(organizations)
      .values([
        {
          organizationId: TENANT_ID,
          name: "Test Org KDS R3.7",
          primaryBusinessType: "RESTAURANT",
        },
        {
          organizationId: OTHER_TENANT_ID,
          name: "Other Org KDS R3.7",
          primaryBusinessType: "RESTAURANT",
        },
      ])
      .onConflictDoNothing();

    // 2. Seed Outlets
    const [out] = await db
      .insert(outlets)
      .values({
        tenantId: TENANT_ID,
        name: "Main Restaurant Outlet",
        code: "MRO-37",
        verticalType: "RESTAURANT",
      })
      .returning();
    OUTLET_ID = out.outletId;

    const [otherOut] = await db
      .insert(outlets)
      .values({
        tenantId: OTHER_TENANT_ID,
        name: "Other Tenant Outlet",
        code: "OTO-37",
        verticalType: "RESTAURANT",
      })
      .returning();
    OTHER_OUTLET_ID = otherOut.outletId;

    // 3. Seed Context & Table
    const [ctx] = await db
      .insert(businessContexts)
      .values({
        tenantId: TENANT_ID,
        outletId: OUTLET_ID,
        contextType: "TABLE",
        identifier: `T-37-${Date.now()}`,
        displayLabel: "Table 7",
      })
      .returning();
    CONTEXT_ID = ctx.contextId;

    const [tbl] = await db
      .insert(restaurantTables)
      .values({
        tenantId: TENANT_ID,
        outletId: OUTLET_ID,
        contextId: CONTEXT_ID,
        tableNumber: "7",
        displayLabel: "Table 7 - Main Dining",
        capacity: 4,
        section: "Main",
        status: "OCCUPIED",
      })
      .returning();
    TABLE_ID = tbl.tableId;

    const [sess] = await db
      .insert(restaurantTableSessions)
      .values({
        tenantId: TENANT_ID,
        outletId: OUTLET_ID,
        tableId: TABLE_ID,
        sessionNumber: `SESS-37-${Date.now()}`,
        status: "ACTIVE",
        guestCount: 3,
      })
      .returning();
    TABLE_SESSION_ID = sess.sessionId;

    // 4. Seed Catalog
    const [cat] = await db
      .insert(catalogs)
      .values({
        tenantId: TENANT_ID,
        outletId: OUTLET_ID,
        name: "R3.7 Test Menu",
      })
      .returning();

    const [catg] = await db
      .insert(catalogCategories)
      .values({
        tenantId: TENANT_ID,
        catalogId: cat.catalogId,
        name: "Main Courses",
      })
      .returning();
    CATEGORY_ID = catg.categoryId;

    // 5. Seed Users
    await db
      .insert(users)
      .values([
        {
          userId: STAFF_ID,
          email: "staff_r37@example.com",
          fullName: "Line Cook Staff",
        },
        {
          userId: MANAGER_ID,
          email: "manager_r37@example.com",
          fullName: "Kitchen Manager",
        },
      ])
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await rawSql.end();
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
        orderNumber: `ORD-37-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`,
        orderSource: "POS",
        diningContext: "DINE_IN",
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

      for (const it of itemsInput) {
        const itemId = it.itemId || crypto.randomUUID();
        const [existingItem] = await tx
          .select({ itemId: catalogItems.itemId })
          .from(catalogItems)
          .where(eq(catalogItems.itemId, itemId))
          .limit(1);

        if (!existingItem) {
          await tx.insert(catalogItems).values({
            itemId,
            tenantId: TENANT_ID,
            categoryId: CATEGORY_ID,
            name: it.itemName || "Test Catalog Item",
            basePrice: it.unitPrice || "100.0000",
            fulfillmentStation: it.fulfillmentStation || "KITCHEN",
          });
        }

        await tx.insert(orderItems).values({
          orderItemId: it.orderItemId || crypto.randomUUID(),
          tenantId: TENANT_ID,
          orderId,
          itemId,
          itemName: it.itemName,
          unitPrice: it.unitPrice,
          quantity: it.quantity,
          subtotal: (parseFloat(it.unitPrice) * it.quantity).toFixed(4),
          fulfillmentStation: it.fulfillmentStation || "KITCHEN",
          itemStatus: it.itemStatus || "PLACED",
          specialNotes: it.specialNotes || null,
        });
      }
    });

    return orderId;
  }

  // ============================================================================
  // 1. KITCHEN STATIONS DOMAIN
  // ============================================================================

  describe("1. Kitchen Stations Model", () => {
    it("1.1. Creates configurable kitchen stations with tenant and outlet scoping", async () => {
      const hotKitchen = await createKitchenStation(TENANT_ID, OUTLET_ID, {
        code: "HOT_KITCHEN",
        name: "Hot Kitchen / Curry Station",
        description: "Curries, biryanis, and gravies",
        displayOrder: 1,
      });
      HOT_KITCHEN_STATION_ID = hotKitchen.stationId;
      expect(hotKitchen.code).toBe("HOT_KITCHEN");
      expect(hotKitchen.name).toBe("Hot Kitchen / Curry Station");
      expect(hotKitchen.isActive).toBe(true);

      const tandoor = await createKitchenStation(TENANT_ID, OUTLET_ID, {
        code: "TANDOOR",
        name: "Tandoor & Breads",
        description: "Naans, rotis, and tikkas",
        displayOrder: 2,
      });
      TANDOOR_STATION_ID = tandoor.stationId;
      expect(tandoor.code).toBe("TANDOOR");

      const beverage = await createKitchenStation(TENANT_ID, OUTLET_ID, {
        code: "BEVERAGE",
        name: "Beverage & Bar Station",
        displayOrder: 3,
      });
      BEVERAGE_STATION_ID = beverage.stationId;
      expect(beverage.code).toBe("BEVERAGE");
    });

    it("1.2. Rejects duplicate station code within the same outlet", async () => {
      await expect(
        createKitchenStation(TENANT_ID, OUTLET_ID, {
          code: "HOT_KITCHEN",
          name: "Duplicate Hot Kitchen",
        })
      ).rejects.toThrow("already exists");
    });

    it("1.3. Updates station display name, order, and active state", async () => {
      const updated = await updateKitchenStation(TENANT_ID, HOT_KITCHEN_STATION_ID, {
        name: "Executive Hot Kitchen",
        displayOrder: 10,
        isActive: true,
      });
      expect(updated.name).toBe("Executive Hot Kitchen");
      expect(updated.displayOrder).toBe(10);
    });

    it("1.4. Enforces strict tenant and outlet isolation on station list queries", async () => {
      const tenantAStations = await listKitchenStations(TENANT_ID, OUTLET_ID);
      expect(tenantAStations.length).toBeGreaterThanOrEqual(3);

      const otherTenantStations = await listKitchenStations(OTHER_TENANT_ID, OTHER_OUTLET_ID);
      expect(otherTenantStations.length).toBe(0);
    });
  });

  // ============================================================================
  // 2. MENU ITEM -> STATION ROUTING
  // ============================================================================

  describe("2. Menu Item -> Station Routing", () => {
    let biryaniItemId: string;
    let naanItemId: string;
    let lassiItemId: string;

    beforeAll(async () => {
      const [biryani] = await db
        .insert(catalogItems)
        .values({
          tenantId: TENANT_ID,
          categoryId: CATEGORY_ID,
          name: "Dum Biryani",
          basePrice: "350.0000",
          fulfillmentStation: "KITCHEN",
        })
        .returning();
      biryaniItemId = biryani.itemId;

      const [naan] = await db
        .insert(catalogItems)
        .values({
          tenantId: TENANT_ID,
          categoryId: CATEGORY_ID,
          name: "Butter Naan",
          basePrice: "60.0000",
          fulfillmentStation: "KITCHEN",
        })
        .returning();
      naanItemId = naan.itemId;

      const [lassi] = await db
        .insert(catalogItems)
        .values({
          tenantId: TENANT_ID,
          categoryId: CATEGORY_ID,
          name: "Mango Lassi",
          basePrice: "120.0000",
          fulfillmentStation: "KITCHEN",
        })
        .returning();
      lassiItemId = lassi.itemId;
    });

    it("2.1. Configures default fulfillment station for menu items", async () => {
      await updateMenuItemStationRouting(TENANT_ID, biryaniItemId, HOT_KITCHEN_STATION_ID);
      await updateMenuItemStationRouting(TENANT_ID, naanItemId, TANDOOR_STATION_ID);
      await updateMenuItemStationRouting(TENANT_ID, lassiItemId, BEVERAGE_STATION_ID);

      const [b] = await db.select().from(catalogItems).where(eq(catalogItems.itemId, biryaniItemId));
      expect(b.fulfillmentStation).toBe("HOT_KITCHEN");
      expect(b.stationId).toBe(HOT_KITCHEN_STATION_ID);

      const [n] = await db.select().from(catalogItems).where(eq(catalogItems.itemId, naanItemId));
      expect(n.fulfillmentStation).toBe("TANDOOR");

      const [l] = await db.select().from(catalogItems).where(eq(catalogItems.itemId, lassiItemId));
      expect(l.fulfillmentStation).toBe("BEVERAGE");
    });

    it("2.2. Preserves historical KDS task routing snapshot when menu item routing changes in future", async () => {
      // 1. Create order with Biryani routed to HOT_KITCHEN
      const orderId = await createTestOrder(
        [
          {
            itemId: biryaniItemId,
            itemName: "Dum Biryani",
            unitPrice: "350",
            quantity: 1,
            fulfillmentStation: "HOT_KITCHEN",
          },
        ],
        "CONFIRMED"
      );

      await generateKdsTasksFromOrderConfirmed(TENANT_ID, orderId);
      const [originalTask] = await db
        .select()
        .from(kdsTasks)
        .where(eq(kdsTasks.orderId, orderId));
      expect(originalTask.stationRouting).toBe("HOT_KITCHEN");

      // 2. Change future catalog item routing to GRILL
      const grillStation = await createKitchenStation(TENANT_ID, OUTLET_ID, {
        code: "GRILL",
        name: "Grill Station",
      });
      await updateMenuItemStationRouting(TENANT_ID, biryaniItemId, grillStation.stationId);

      // 3. Verify already-created KDS task is completely untouched
      const [recheckedTask] = await db
        .select()
        .from(kdsTasks)
        .where(eq(kdsTasks.taskId, originalTask.taskId));
      expect(recheckedTask.stationRouting).toBe("HOT_KITCHEN"); // Unchanged snapshot
    });
  });

  // ============================================================================
  // 3. MULTI-STATION TASK GENERATION & OPERATIONAL FILTERING
  // ============================================================================

  describe("3. Multi-Station Order Generation & Separation", () => {
    let multiStationOrderId: string;

    it("3.1. Generates discrete tasks routed to different kitchen stations for a single order", async () => {
      multiStationOrderId = await createTestOrder(
        [
          {
            itemId: crypto.randomUUID(),
            itemName: "Chicken Tikka Masala",
            unitPrice: "320",
            quantity: 2,
            fulfillmentStation: "HOT_KITCHEN",
            specialNotes: "Medium spice",
          },
          {
            itemId: crypto.randomUUID(),
            itemName: "Garlic Naan",
            unitPrice: "70",
            quantity: 3,
            fulfillmentStation: "TANDOOR",
          },
          {
            itemId: crypto.randomUUID(),
            itemName: "Fresh Lime Soda",
            unitPrice: "90",
            quantity: 2,
            fulfillmentStation: "BEVERAGE",
            specialNotes: "Sweet and salt",
          },
        ],
        "CONFIRMED"
      );

      await generateKdsTasksFromOrderConfirmed(TENANT_ID, multiStationOrderId);

      const tasks = await db
        .select()
        .from(kdsTasks)
        .where(eq(kdsTasks.orderId, multiStationOrderId));

      expect(tasks.length).toBe(3);
      const stations = tasks.map((t) => t.stationRouting);
      expect(stations).toContain("HOT_KITCHEN");
      expect(stations).toContain("TANDOOR");
      expect(stations).toContain("BEVERAGE");

      // Check destination context
      expect(tasks[0].destinationLabel).toBe("Table 7 - Main Dining");
      // Check priority default
      expect(tasks[0].priority).toBe("NORMAL");
    });

    it("3.2. Idempotent generation: re-running generation produces zero duplicate tasks", async () => {
      await generateKdsTasksFromOrderConfirmed(TENANT_ID, multiStationOrderId);

      const tasks = await db
        .select()
        .from(kdsTasks)
        .where(eq(kdsTasks.orderId, multiStationOrderId));
      expect(tasks.length).toBe(3);
    });

    it("3.3. Station-filtered task listing only returns tasks assigned to that station", async () => {
      const hotKitchenTasks = await listKdsTasks(TENANT_ID, {
        outletId: OUTLET_ID,
        stationRouting: "HOT_KITCHEN",
      });
      expect(hotKitchenTasks.every((t) => t.stationRouting === "HOT_KITCHEN")).toBe(true);

      const tandoorTasks = await listKdsTasks(TENANT_ID, {
        outletId: OUTLET_ID,
        stationRouting: "TANDOOR",
      });
      expect(tandoorTasks.every((t) => t.stationRouting === "TANDOOR")).toBe(true);

      const beverageTasks = await listKdsTasks(TENANT_ID, {
        outletId: OUTLET_ID,
        stationRouting: "BEVERAGE",
      });
      expect(beverageTasks.every((t) => t.stationRouting === "BEVERAGE")).toBe(true);
    });

    it("3.4. listKdsTickets aggregates tasks by order into ticket cards with elapsed time", async () => {
      const tickets = await listKdsTickets(TENANT_ID, OUTLET_ID, "ALL", true);
      const ourTicket = tickets.find((t) => t.orderId === multiStationOrderId);

      expect(ourTicket).toBeDefined();
      expect(ourTicket?.destination).toBe("Table 7 - Main Dining");
      expect(ourTicket?.items.length).toBe(3);
      expect(ourTicket?.elapsedSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // 4. TASK STATE TRANSITIONS & TIMESTAMPS
  // ============================================================================

  describe("4. Task State Machine, Timing & Granular Transitions", () => {
    let testTaskId: string;

    beforeAll(async () => {
      const orderId = await createTestOrder(
        [
          {
            itemId: crypto.randomUUID(),
            itemName: "Paneer Tikka",
            unitPrice: "280",
            quantity: 1,
            fulfillmentStation: "TANDOOR",
          },
        ],
        "CONFIRMED"
      );
      await generateKdsTasksFromOrderConfirmed(TENANT_ID, orderId);
      const [t] = await db.select().from(kdsTasks).where(eq(kdsTasks.orderId, orderId));
      testTaskId = t.taskId;
    });

    it("4.1. Transition PENDING -> PREPARING sets startedAt timestamp", async () => {
      await updateKdsTaskStatus(TENANT_ID, testTaskId, "PREPARING", STAFF_ID);
      const [t] = await db.select().from(kdsTasks).where(eq(kdsTasks.taskId, testTaskId));
      expect(t.taskStatus).toBe("PREPARING");
      expect(t.startedAt).toBeDefined();
      expect(t.startedAt).not.toBeNull();
    });

    it("4.2. Transition PREPARING -> READY sets readyAt timestamp", async () => {
      await updateKdsTaskStatus(TENANT_ID, testTaskId, "READY", STAFF_ID);
      const [t] = await db.select().from(kdsTasks).where(eq(kdsTasks.taskId, testTaskId));
      expect(t.taskStatus).toBe("READY");
      expect(t.readyAt).toBeDefined();
      expect(t.readyAt).not.toBeNull();
    });

    it("4.3. Transition READY -> DONE sets completedAt timestamp", async () => {
      await updateKdsTaskStatus(TENANT_ID, testTaskId, "DONE", STAFF_ID);
      const [t] = await db.select().from(kdsTasks).where(eq(kdsTasks.taskId, testTaskId));
      expect(t.taskStatus).toBe("DONE");
      expect(t.completedAt).toBeDefined();
      expect(t.completedAt).not.toBeNull();
    });

    it("4.4. Rejects invalid transition (DONE -> PREPARING directly via standard action)", async () => {
      await expect(
        updateKdsTaskStatus(TENANT_ID, testTaskId, "PREPARING", STAFF_ID)
      ).rejects.toThrow("Invalid KDS task status transition");
    });
  });

  // ============================================================================
  // 5. PRIORITY & EXPEDITING
  // ============================================================================

  describe("5. Priority & Expediting", () => {
    let expediteTaskId: string;

    beforeAll(async () => {
      const orderId = await createTestOrder(
        [
          {
            itemId: crypto.randomUUID(),
            itemName: "VIP Steak",
            unitPrice: "850",
            quantity: 1,
            fulfillmentStation: "HOT_KITCHEN",
          },
        ],
        "CONFIRMED"
      );
      await generateKdsTasksFromOrderConfirmed(TENANT_ID, orderId);
      const [t] = await db.select().from(kdsTasks).where(eq(kdsTasks.orderId, orderId));
      expediteTaskId = t.taskId;
    });

    it("5.1. Updates task priority to PRIORITY with audit reason", async () => {
      await updateKdsTaskPriority(TENANT_ID, expediteTaskId, "PRIORITY", MANAGER_ID, "Guest waiting 20 min");
      const [t] = await db.select().from(kdsTasks).where(eq(kdsTasks.taskId, expediteTaskId));
      expect(t.priority).toBe("PRIORITY");

      const history = await db
        .select()
        .from(kdsTaskHistory)
        .where(eq(kdsTaskHistory.taskId, expediteTaskId));
      expect(history.some((h) => h.reason?.includes("Priority updated"))).toBe(true);
    });

    it("5.2. Escalates priority to URGENT", async () => {
      await updateKdsTaskPriority(TENANT_ID, expediteTaskId, "URGENT", MANAGER_ID, "Manager override");
      const [t] = await db.select().from(kdsTasks).where(eq(kdsTasks.taskId, expediteTaskId));
      expect(t.priority).toBe("URGENT");
    });

    it("5.3. Rejects invalid priority values", async () => {
      await expect(
        updateKdsTaskPriority(TENANT_ID, expediteTaskId, "SUPER_URGENT" as any, MANAGER_ID)
      ).rejects.toThrow("Invalid priority");
    });
  });

  // ============================================================================
  // 6. AUDITED RECALL & REOPEN WORKFLOW
  // ============================================================================

  describe("6. Audited Recall / Reopen", () => {
    let recallTaskId: string;

    beforeAll(async () => {
      const orderId = await createTestOrder(
        [
          {
            itemId: crypto.randomUUID(),
            itemName: "Mushroom Risotto",
            unitPrice: "400",
            quantity: 1,
            fulfillmentStation: "HOT_KITCHEN",
          },
        ],
        "CONFIRMED"
      );
      await generateKdsTasksFromOrderConfirmed(TENANT_ID, orderId);
      const [t] = await db.select().from(kdsTasks).where(eq(kdsTasks.orderId, orderId));
      recallTaskId = t.taskId;

      // Move through to DONE
      await updateKdsTaskStatus(TENANT_ID, recallTaskId, "PREPARING", STAFF_ID);
      await updateKdsTaskStatus(TENANT_ID, recallTaskId, "READY", STAFF_ID);
      await updateKdsTaskStatus(TENANT_ID, recallTaskId, "DONE", STAFF_ID);
    });

    it("6.1. Rejects recall without mandatory audit reason", async () => {
      await expect(
        recallKdsTask(TENANT_ID, recallTaskId, "READY", MANAGER_ID, "   ")
      ).rejects.toThrow("audit reason is required");
    });

    it("6.2. Performs audited recall from DONE -> READY and resets completedAt", async () => {
      await recallKdsTask(
        TENANT_ID,
        recallTaskId,
        "READY",
        MANAGER_ID,
        "Chef accidentally bumped ticket before plating complete"
      );

      const [t] = await db.select().from(kdsTasks).where(eq(kdsTasks.taskId, recallTaskId));
      expect(t.taskStatus).toBe("READY");
      expect(t.completedAt).toBeNull(); // Reset

      const history = await db
        .select()
        .from(kdsTaskHistory)
        .where(eq(kdsTaskHistory.taskId, recallTaskId));
      expect(history.some((h) => h.reason?.includes("Audited recall to READY"))).toBe(true);
    });

    it("6.3. Performs audited recall from READY -> PREPARING and resets readyAt", async () => {
      await recallKdsTask(
        TENANT_ID,
        recallTaskId,
        "PREPARING",
        MANAGER_ID,
        "Guest requested less garlic, remaking portion"
      );

      const [t] = await db.select().from(kdsTasks).where(eq(kdsTasks.taskId, recallTaskId));
      expect(t.taskStatus).toBe("PREPARING");
      expect(t.readyAt).toBeNull();
    });

    it("6.4. Rejects invalid recall transition (e.g. PREPARING -> READY via recall API)", async () => {
      await expect(
        recallKdsTask(TENANT_ID, recallTaskId, "READY", MANAGER_ID, "Invalid recall")
      ).rejects.toThrow("Invalid KDS task recall transition");
    });
  });

  // ============================================================================
  // 7. BATCH STATION TICKET BUMP
  // ============================================================================

  describe("7. Batch Station Ticket Bump", () => {
    it("7.1. Bumps all items belonging to a station in an order in one atomic operation", async () => {
      const orderId = await createTestOrder(
        [
          {
            itemId: crypto.randomUUID(),
            itemName: "Roti 1",
            unitPrice: "40",
            quantity: 2,
            fulfillmentStation: "TANDOOR",
          },
          {
            itemId: crypto.randomUUID(),
            itemName: "Roti 2",
            unitPrice: "40",
            quantity: 2,
            fulfillmentStation: "TANDOOR",
          },
        ],
        "CONFIRMED"
      );
      await generateKdsTasksFromOrderConfirmed(TENANT_ID, orderId);

      const bumpResult = await bumpStationTicket(
        TENANT_ID,
        OUTLET_ID,
        orderId,
        "TANDOOR",
        "PENDING",
        "PREPARING",
        STAFF_ID
      );
      expect(bumpResult.bumpedCount).toBe(2);

      const tasks = await db.select().from(kdsTasks).where(eq(kdsTasks.orderId, orderId));
      expect(tasks.every((t) => t.taskStatus === "PREPARING")).toBe(true);
    });
  });

  // ============================================================================
  // 8. DOMAIN OUTBOX EVENTS & FINANCIAL SAFETY
  // ============================================================================

  describe("8. Domain Outbox Events & Financial Safety Invariant", () => {
    it("8.1. Verifies trusted domain events recorded in transactional outbox", async () => {
      const outboxRows = await db
        .select()
        .from(domainOutboxEvents)
        .where(eq(domainOutboxEvents.tenantId, TENANT_ID))
        .limit(50);

      const eventTypes = outboxRows.map((r) => r.eventType);
      expect(eventTypes).toContain("RESTAURANT_KDS_TASK_CREATED");
      expect(eventTypes).toContain("RESTAURANT_KDS_TASK_STARTED");
      expect(eventTypes).toContain("RESTAURANT_KDS_TASK_READY");
      expect(eventTypes).toContain("RESTAURANT_KDS_TASK_DONE");
      expect(eventTypes).toContain("RESTAURANT_KDS_PRIORITY_UPDATED");
      expect(eventTypes).toContain("RESTAURANT_KDS_TASK_RECALLED");
    });

    it("8.2. Invariant: zero mutation to order financial totals across all KDS workflows", async () => {
      const orderId = await createTestOrder(
        [
          {
            itemId: crypto.randomUUID(),
            itemName: "Saffron Biryani",
            unitPrice: "650",
            quantity: 2,
            fulfillmentStation: "HOT_KITCHEN",
          },
        ],
        "CONFIRMED"
      );

      const [orderInitial] = await db.select().from(orders).where(eq(orders.orderId, orderId));
      await generateKdsTasksFromOrderConfirmed(TENANT_ID, orderId);
      const [t] = await db.select().from(kdsTasks).where(eq(kdsTasks.orderId, orderId));

      await updateKdsTaskStatus(TENANT_ID, t.taskId, "PREPARING", STAFF_ID);
      await updateKdsTaskPriority(TENANT_ID, t.taskId, "URGENT", MANAGER_ID);
      await updateKdsTaskStatus(TENANT_ID, t.taskId, "READY", STAFF_ID);
      await updateKdsTaskStatus(TENANT_ID, t.taskId, "DONE", STAFF_ID);
      await recallKdsTask(TENANT_ID, t.taskId, "READY", MANAGER_ID, "Audit test");

      const [orderFinal] = await db.select().from(orders).where(eq(orders.orderId, orderId));

      expect(orderFinal.subtotalAmount).toBe(orderInitial.subtotalAmount);
      expect(orderFinal.taxAmount).toBe(orderInitial.taxAmount);
      expect(orderFinal.platformFeeAmount).toBe(orderInitial.platformFeeAmount);
      expect(orderFinal.totalAmount).toBe(orderInitial.totalAmount);
    });
  });

  // ============================================================================
  // 9. HTTP API ROUTES, RBAC & TENANT ISOLATION
  // ============================================================================

  describe("9. HTTP API Routes, RBAC & Tenant Isolation", () => {
    let apiOrderId: string;
    let apiTaskId: string;
    let apiStationId: string;
    let apiCatalogItemId: string;

    beforeAll(async () => {
      // Create a test order and tasks specifically for HTTP route testing
      apiCatalogItemId = crypto.randomUUID();
      apiOrderId = await createTestOrder(
        [
          {
            itemId: apiCatalogItemId,
            itemName: "Butter Chicken API",
            unitPrice: "480",
            quantity: 1,
            fulfillmentStation: "HOT_KITCHEN",
          },
        ],
        "CONFIRMED"
      );
      await generateKdsTasksFromOrderConfirmed(TENANT_ID, apiOrderId);
      const [t] = await db.select().from(kdsTasks).where(eq(kdsTasks.orderId, apiOrderId));
      apiTaskId = t.taskId;
    });

    it("9.1. GET /api/v1/restaurant/kds/stations enforces authentication & RBAC", async () => {
      // 1. Unauthenticated -> 401
      const unauthReq = new NextRequest("http://localhost/api/v1/restaurant/kds/stations");
      const unauthRes = await stationsGet(unauthReq);
      expect(unauthRes.status).toBe(401);

      // 2. Customer session -> 403
      const custReq = new NextRequest("http://localhost/api/v1/restaurant/kds/stations", {
        headers: { authorization: `Bearer ${guestToken}` },
      });
      const custRes = await stationsGet(custReq);
      expect(custRes.status).toBe(403);

      // 3. Staff -> 200
      const staffReq = new NextRequest(
        `http://localhost/api/v1/restaurant/kds/stations?outletId=${OUTLET_ID}`,
        {
          headers: { authorization: `Bearer ${staffToken}` },
        }
      );
      const staffRes = await stationsGet(staffReq);
      expect(staffRes.status).toBe(200);
      const body = await staffRes.json();
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it("9.2. POST /api/v1/restaurant/kds/stations enforces manage permission", async () => {
      // Staff without manage permission -> 403
      const forbiddenReq = new NextRequest("http://localhost/api/v1/restaurant/kds/stations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          outletId: OUTLET_ID,
          code: `TEST_STATION_${Date.now()}`,
          name: "Test Station",
        }),
      });
      const forbiddenRes = await stationsPost(forbiddenReq);
      expect(forbiddenRes.status).toBe(403);

      // Manager with manage permission -> 201
      const code = `DESSERT_BAR_${Date.now()}`;
      const managerReq = new NextRequest("http://localhost/api/v1/restaurant/kds/stations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          outletId: OUTLET_ID,
          code,
          name: "Dessert Bar Station",
          displayOrder: 9,
        }),
      });
      const managerRes = await stationsPost(managerReq);
      expect(managerRes.status).toBe(201);
      const body = await managerRes.json();
      expect(body.data.code).toBe(code);
      apiStationId = body.data.stationId;
    });

    it("9.3. GET & PATCH /api/v1/restaurant/kds/stations/[id]", async () => {
      const getReq = new NextRequest(
        `http://localhost/api/v1/restaurant/kds/stations/${apiStationId}`,
        {
          headers: { authorization: `Bearer ${staffToken}` },
        }
      );
      const getRes = await stationDetailGet(getReq, {
        params: Promise.resolve({ id: apiStationId }),
      });
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.data.stationId).toBe(apiStationId);

      // PATCH as manager
      const patchReq = new NextRequest(
        `http://localhost/api/v1/restaurant/kds/stations/${apiStationId}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            name: "Dessert Bar Station Updated",
            displayOrder: 15,
          }),
        }
      );
      const patchRes = await stationDetailPatch(patchReq, {
        params: Promise.resolve({ id: apiStationId }),
      });
      expect(patchRes.status).toBe(200);
      const patchBody = await patchRes.json();
      expect(patchBody.data.name).toBe("Dessert Bar Station Updated");
      expect(patchBody.data.displayOrder).toBe(15);
    });

    it("9.4. PATCH /api/v1/restaurant/admin/menu/items/[id]/routing sets station routing", async () => {
      const req = new NextRequest(
        `http://localhost/api/v1/restaurant/admin/menu/items/${apiCatalogItemId}/routing`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            stationId: apiStationId,
            stationCode: "DESSERT_BAR",
          }),
        }
      );
      const res = await menuItemRoutingPatch(req, {
        params: Promise.resolve({ id: apiCatalogItemId }),
      });
      expect(res.status).toBe(200);

      const [item] = await db
        .select()
        .from(catalogItems)
        .where(eq(catalogItems.itemId, apiCatalogItemId));
      expect(item.stationId).toBe(apiStationId);
    });

    it("9.5. GET /api/v1/restaurant/kds/tickets groups tasks into tickets", async () => {
      const req = new NextRequest(
        `http://localhost/api/v1/restaurant/kds/tickets?outletId=${OUTLET_ID}&stationCode=HOT_KITCHEN`,
        {
          headers: { authorization: `Bearer ${staffToken}` },
        }
      );
      const res = await ticketsGet(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      const ticket = body.data.find((t: any) => t.orderId === apiOrderId);
      expect(ticket).toBeDefined();
      expect(ticket.items.length).toBeGreaterThanOrEqual(1);
    });

    it("9.6. PATCH /api/v1/restaurant/kds/tasks/[id]/status transitions state & rejects invalid", async () => {
      // 1. Advance to PREPARING -> 200
      const prepReq = new NextRequest(
        `http://localhost/api/v1/restaurant/kds/tasks/${apiTaskId}/status`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${staffToken}`,
          },
          body: JSON.stringify({ status: "PREPARING" }),
        }
      );
      const prepRes = await taskStatusPatch(prepReq, {
        params: Promise.resolve({ id: apiTaskId }),
      });
      expect(prepRes.status).toBe(200);

      // 2. Advance to READY -> 200
      const readyReq = new NextRequest(
        `http://localhost/api/v1/restaurant/kds/tasks/${apiTaskId}/status`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${staffToken}`,
          },
          body: JSON.stringify({ status: "READY" }),
        }
      );
      const readyRes = await taskStatusPatch(readyReq, {
        params: Promise.resolve({ id: apiTaskId }),
      });
      expect(readyRes.status).toBe(200);

      // 3. Advance to DONE -> 200
      const doneReq = new NextRequest(
        `http://localhost/api/v1/restaurant/kds/tasks/${apiTaskId}/status`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${staffToken}`,
          },
          body: JSON.stringify({ status: "DONE" }),
        }
      );
      const doneRes = await taskStatusPatch(doneReq, {
        params: Promise.resolve({ id: apiTaskId }),
      });
      expect(doneRes.status).toBe(200);

      // 4. Invalid transition directly to PREPARING without recall -> 400
      const invalidReq = new NextRequest(
        `http://localhost/api/v1/restaurant/kds/tasks/${apiTaskId}/status`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${staffToken}`,
          },
          body: JSON.stringify({ status: "PREPARING" }),
        }
      );
      const invalidRes = await taskStatusPatch(invalidReq, {
        params: Promise.resolve({ id: apiTaskId }),
      });
      expect(invalidRes.status).toBe(400);
    });

    it("9.7. PATCH /api/v1/restaurant/kds/tasks/[id]/priority escalates priority", async () => {
      // 1. Staff without manage permission -> 403
      const staffReq = new NextRequest(
        `http://localhost/api/v1/restaurant/kds/tasks/${apiTaskId}/priority`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${staffToken}`,
          },
          body: JSON.stringify({ priority: "URGENT" }),
        }
      );
      const staffRes = await taskPriorityPatch(staffReq, {
        params: Promise.resolve({ id: apiTaskId }),
      });
      expect(staffRes.status).toBe(403);

      // 2. Manager -> 200
      const managerReq = new NextRequest(
        `http://localhost/api/v1/restaurant/kds/tasks/${apiTaskId}/priority`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({ priority: "URGENT" }),
        }
      );
      const managerRes = await taskPriorityPatch(managerReq, {
        params: Promise.resolve({ id: apiTaskId }),
      });
      expect(managerRes.status).toBe(200);

      const [task] = await db.select().from(kdsTasks).where(eq(kdsTasks.taskId, apiTaskId));
      expect(task.priority).toBe("URGENT");
    });

    it("9.8. POST /api/v1/restaurant/kds/tasks/[id]/recall enforces audit reason & permission", async () => {
      // 1. Staff without manage permission -> 403
      const staffReq = new NextRequest(
        `http://localhost/api/v1/restaurant/kds/tasks/${apiTaskId}/recall`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${staffToken}`,
          },
          body: JSON.stringify({
            targetStatus: "READY",
            reason: "Staff attempt",
          }),
        }
      );
      const staffRes = await taskRecallPost(staffReq, {
        params: Promise.resolve({ id: apiTaskId }),
      });
      expect(staffRes.status).toBe(403);

      // 2. Manager without sufficient reason -> 400 (Zod validation error)
      const invalidReq = new NextRequest(
        `http://localhost/api/v1/restaurant/kds/tasks/${apiTaskId}/recall`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            targetStatus: "READY",
            reason: "x", // too short (< 3 chars)
          }),
        }
      );
      const invalidRes = await taskRecallPost(invalidReq, {
        params: Promise.resolve({ id: apiTaskId }),
      });
      expect(invalidRes.status).toBe(400);

      // 3. Manager with valid audit reason -> 200
      const managerReq = new NextRequest(
        `http://localhost/api/v1/restaurant/kds/tasks/${apiTaskId}/recall`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${managerToken}`,
          },
          body: JSON.stringify({
            targetStatus: "READY",
            reason: "Customer requested extra hot plate preparation check",
          }),
        }
      );
      const managerRes = await taskRecallPost(managerReq, {
        params: Promise.resolve({ id: apiTaskId }),
      });
      expect(managerRes.status).toBe(200);

      const [recalledTask] = await db.select().from(kdsTasks).where(eq(kdsTasks.taskId, apiTaskId));
      expect(recalledTask.taskStatus).toBe("READY");
    });

    it("9.9. POST /api/v1/restaurant/kds/bump batch completes station items", async () => {
      const bumpReq = new NextRequest("http://localhost/api/v1/restaurant/kds/bump", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          outletId: OUTLET_ID,
          orderId: apiOrderId,
          stationCode: "HOT_KITCHEN",
          fromStatus: "READY",
          toStatus: "DONE",
        }),
      });
      const bumpRes = await bumpPost(bumpReq);
      expect(bumpRes.status).toBe(200);
      const body = await bumpRes.json();
      expect(body.data.bumpedCount).toBe(1);

      const [task] = await db.select().from(kdsTasks).where(eq(kdsTasks.taskId, apiTaskId));
      expect(task.taskStatus).toBe("DONE");
    });

    it("9.10. Tenant isolation: Token from Tenant B cannot access or mutate Tenant A KDS tasks", async () => {
      // 1. Reading Tenant A's station with Tenant B's token fails with 404
      const otherGetStationReq = new NextRequest(
        `http://localhost/api/v1/restaurant/kds/stations/${apiStationId}`,
        {
          headers: { authorization: `Bearer ${otherTenantToken}` },
        }
      );
      const otherGetStationRes = await stationDetailGet(otherGetStationReq, {
        params: Promise.resolve({ id: apiStationId }),
      });
      expect(otherGetStationRes.status).toBe(404);

      // 2. Modifying Tenant A's task status with Tenant B's token fails with 404
      const otherPatchTaskReq = new NextRequest(
        `http://localhost/api/v1/restaurant/kds/tasks/${apiTaskId}/status`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${otherTenantToken}`,
          },
          body: JSON.stringify({ status: "PREPARING" }),
        }
      );
      const otherPatchTaskRes = await taskStatusPatch(otherPatchTaskReq, {
        params: Promise.resolve({ id: apiTaskId }),
      });
      expect(otherPatchTaskRes.status).toBe(404);
    });
  });
});
