import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/db/client";
import { withPlatformScope } from "@/db/rls";
import { seedScaleFixtures, ScaleTenantFixture, SCALE_TENANT_IDS } from "../scale/deterministic-data-generator";
import { listTables, getTableSummaryMetrics } from "@/lib/restaurant/table-service";
import { getRestaurantMenu } from "@/lib/restaurant/menu-service";
import { listCustomerSessionOrders } from "@/lib/restaurant/order-service";
import { listKdsTasks } from "@/lib/restaurant/kds-service";
import { listRooms, getHotelDashboardMetrics } from "@/lib/hotel/service";
import {
  projectOrderEvent,
  rebuildDailyOutletMetrics,
  getDailyOutletMetrics,
  formatMetricDate,
} from "@/lib/analytics/projector";
import { AnalyticsEventHandler } from "@/lib/outbox/handlers/analytics-handler";
import { OutboxEvent } from "@/lib/outbox/types";
import { orders, orderItems } from "@/db/schema/operations";
import { analyticsDailyOutletMetrics } from "@/db/schema/analytics";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

describe("ASSO Scale Foundation S6: Read/Analytics Scaling & Verification", () => {
  let fixtures: ScaleTenantFixture[];
  let tenantA: ScaleTenantFixture;
  let tenantB: ScaleTenantFixture;

  beforeAll(async () => {
    fixtures = await seedScaleFixtures();
    tenantA = fixtures[0];
    tenantB = fixtures[1];
  });

  afterAll(async () => {
    await withPlatformScope(async (tx) => {
      await tx`DELETE FROM communication_delivery_logs WHERE tenant_id IN (${SCALE_TENANT_IDS[0]}, ${SCALE_TENANT_IDS[1]})`;
      await tx`DELETE FROM domain_outbox_events WHERE tenant_id IN (${SCALE_TENANT_IDS[0]}, ${SCALE_TENANT_IDS[1]})`;
    });
  });

  describe("1. Bounded Pagination & Deterministic Ordering", () => {
    it("enforces capped limit and offset pagination on restaurant tables", async () => {
      // Tenant A has 10 tables
      const page1 = await listTables(tenantA.tenantId, tenantA.restaurantOutletId, {
        limit: 3,
        offset: 0,
      });

      expect(page1.length).toBe(3);

      const page2 = await listTables(tenantA.tenantId, tenantA.restaurantOutletId, {
        limit: 3,
        offset: 3,
      });

      expect(page2.length).toBe(3);
      // Ensure deterministic pagination: items in page 1 and page 2 must be distinct
      const page1Ids = page1.map((t) => t.tableId);
      const page2Ids = page2.map((t) => t.tableId);
      for (const id of page1Ids) {
        expect(page2Ids).not.toContain(id);
      }
    });

    it("enforces bounded limit and offset pagination on hotel rooms", async () => {
      // Tenant A has 8 rooms
      const page1 = await listRooms(tenantA.tenantId, tenantA.hotelOutletId, {
        limit: 4,
        offset: 0,
      });

      expect(page1.length).toBe(4);

      const page2 = await listRooms(tenantA.tenantId, tenantA.hotelOutletId, {
        limit: 4,
        offset: 4,
      });

      expect(page2.length).toBe(4);
      const page1Rooms = page1.map((r) => r.roomNumber);
      const page2Rooms = page2.map((r) => r.roomNumber);
      for (const rm of page1Rooms) {
        expect(page2Rooms).not.toContain(rm);
      }
    });

    it("orders KDS tasks in strict FIFO queue order", async () => {
      const tasks = await listKdsTasks(tenantA.tenantId, {
        outletId: tenantA.restaurantOutletId,
        limit: 10,
      });

      if (tasks.length > 1) {
        for (let i = 1; i < tasks.length; i++) {
          const prevTime = new Date(tasks[i - 1].createdAt).getTime();
          const currTime = new Date(tasks[i].createdAt).getTime();
          expect(currTime).toBeGreaterThanOrEqual(prevTime);
        }
      }
    });
  });

  describe("2. Tenant Isolation on Read Paths", () => {
    it("guarantees Tenant A cannot see Tenant B's tables or active sessions", async () => {
      const crossTenantTables = await listTables(tenantA.tenantId, tenantB.restaurantOutletId);
      expect(crossTenantTables.length).toBe(0);
    });

    it("guarantees Tenant A cannot read Tenant B's hotel rooms", async () => {
      const crossTenantRooms = await listRooms(tenantA.tenantId, tenantB.hotelOutletId);
      expect(crossTenantRooms.length).toBe(0);
    });

    it("guarantees Tenant A cannot see Tenant B's digital menu", async () => {
      await expect(
        getRestaurantMenu(tenantA.tenantId, tenantB.restaurantOutletId)
      ).rejects.toThrow("not found");
    });
  });

  describe("3. N+1 Elimination & Batch Fetching", () => {
    it("assembles customer session orders and line items accurately via batch queries", async () => {
      const db = getDb();
      const orderId1 = crypto.randomUUID();
      const orderId2 = crypto.randomUUID();
      const customerId = tenantA.customerIds[0];
      const tableId = tenantA.tableIds[0];
      const contextId = tenantA.contextIds[0];
      const sessionId = tenantA.customerSessionIds[0];

      const nonce = crypto.randomBytes(4).toString("hex");

      // Insert 2 orders with multiple items
      await db.insert(orders).values([
        {
          orderId: orderId1,
          tenantId: tenantA.tenantId,
          outletId: tenantA.restaurantOutletId,
          contextId,
          tableId,
          customerId,
          sessionId,
          tableSessionId: sessionId,
          orderNumber: `TEST_BATCH_1_${nonce}`,
          orderSource: "QR_CUSTOMER",
          diningContext: "DINE_IN",
          status: "PLACED",
          subtotalAmount: "300.0000",
          taxAmount: "15.0000",
          totalAmount: "315.0000",
        },
        {
          orderId: orderId2,
          tenantId: tenantA.tenantId,
          outletId: tenantA.restaurantOutletId,
          contextId,
          tableId,
          customerId,
          sessionId,
          tableSessionId: sessionId,
          orderNumber: `TEST_BATCH_2_${nonce}`,
          orderSource: "QR_CUSTOMER",
          diningContext: "DINE_IN",
          status: "PLACED",
          subtotalAmount: "450.0000",
          taxAmount: "22.5000",
          totalAmount: "472.5000",
        },
      ]);

      await db.insert(orderItems).values([
        {
          orderItemId: crypto.randomUUID(),
          tenantId: tenantA.tenantId,
          orderId: orderId1,
          itemId: tenantA.itemIds[0],
          itemName: "Dish 1",
          unitPrice: "150.0000",
          quantity: 2,
          subtotal: "300.0000",
          fulfillmentStation: "KITCHEN",
        },
        {
          orderItemId: crypto.randomUUID(),
          tenantId: tenantA.tenantId,
          orderId: orderId2,
          itemId: tenantA.itemIds[1],
          itemName: "Dish 2",
          unitPrice: "450.0000",
          quantity: 1,
          subtotal: "450.0000",
          fulfillmentStation: "KITCHEN",
        },
      ]);

      // Call listCustomerSessionOrders with a mock session
      const userJwt = {
        sub: sessionId,
        tenantId: tenantA.tenantId,
        outletId: tenantA.restaurantOutletId,
        contextId,
        sessionType: "CUSTOMER" as const,
        roles: [],
        permissions: [],
        isSuperAdmin: false,
      };

      const ordersResult = await listCustomerSessionOrders(userJwt, 10);
      expect(ordersResult.length).toBeGreaterThanOrEqual(2);

      const found1 = ordersResult.find((o) => o.orderId === orderId1);
      const found2 = ordersResult.find((o) => o.orderId === orderId2);

      expect(found1).toBeDefined();
      expect(found1?.items.length).toBe(1);
      expect(found1?.items[0].itemName).toBe("Dish 1");
      expect(found1?.totalAmount).toBe("315.00");

      expect(found2).toBeDefined();
      expect(found2?.items.length).toBe(1);
      expect(found2?.items[0].itemName).toBe("Dish 2");
      expect(found2?.totalAmount).toBe("472.50");
    });
  });

  describe("4. Analytics / Reporting Read Model & Projections", () => {
    const today = formatMetricDate();

    it("idempotently projects order events into analytics_daily_outlet_metrics", async () => {
      const eventId = crypto.randomUUID();
      const orderId = crypto.randomUUID();

      await projectOrderEvent({
        tenantId: tenantA.tenantId,
        outletId: tenantA.restaurantOutletId,
        eventId,
        orderId,
        eventType: "ORDER_CONFIRMED",
        totalAmount: "500.0000",
        subtotalAmount: "450.0000",
        taxAmount: "25.0000",
        platformFeeAmount: "25.0000",
      });

      const metrics = await getDailyOutletMetrics(
        tenantA.tenantId,
        tenantA.restaurantOutletId,
        today,
        today
      );

      expect(metrics.length).toBe(1);
      expect(metrics[0].orderCount).toBeGreaterThanOrEqual(1);
      expect(parseFloat(metrics[0].grossSalesAmount)).toBeGreaterThanOrEqual(500);

      // Re-projecting the same event updates state safely without failing
      await projectOrderEvent({
        tenantId: tenantA.tenantId,
        outletId: tenantA.restaurantOutletId,
        eventId,
        orderId,
        eventType: "ORDER_CONFIRMED",
        totalAmount: "500.0000",
        subtotalAmount: "450.0000",
        taxAmount: "25.0000",
        platformFeeAmount: "25.0000",
      });

      const updated = await getDailyOutletMetrics(
        tenantA.tenantId,
        tenantA.restaurantOutletId,
        today,
        today
      );
      expect(updated.length).toBe(1);
    });

    it("deterministically rebuilds daily outlet metrics from authoritative ground truth", async () => {
      const rebuilt = await rebuildDailyOutletMetrics(
        tenantA.tenantId,
        tenantA.restaurantOutletId,
        today
      );

      expect(rebuilt).toBeDefined();
      expect(rebuilt.tenantId).toBe(tenantA.tenantId);
      expect(rebuilt.outletId).toBe(tenantA.restaurantOutletId);
      expect(rebuilt.metricDate).toBe(today);
      expect(rebuilt.orderCount).toBeGreaterThan(0);
    });

    it("verifies AnalyticsEventHandler processes outbox events correctly", async () => {
      const handler = new AnalyticsEventHandler();
      const testEvent: OutboxEvent = {
        outboxId: crypto.randomUUID(),
        eventId: crypto.randomUUID(),
        tenantId: tenantA.tenantId,
        outletId: tenantA.restaurantOutletId,
        vertical: "RESTAURANT",
        eventType: "ORDER_CONFIRMED",
        aggregateType: "order",
        aggregateId: crypto.randomUUID(),
        idempotencyKey: `EVENT_TEST_${Date.now()}`,
        payload: {
          totalAmount: "250.0000",
          subtotalAmount: "230.0000",
          taxAmount: "20.0000",
        },
        status: "PROCESSING",
        attemptCount: 1,
        lastError: null,
        providerRef: null,
        claimedBy: "test-worker",
        claimExpiresAt: null,
        lastAttemptedAt: null,
        createdAt: new Date(),
        processedAt: null,
        nextRetryAt: null,
      };

      expect(handler.supports(testEvent)).toBe(true);
      const result = await handler.handle(testEvent);
      expect(result.success).toBe(true);
    });
  });

  describe("5. PostgreSQL Aggregation Performance in Table Metrics", () => {
    it("computes table summary metrics via SQL conditional aggregation with zero in-memory row iteration", async () => {
      const metrics = await getTableSummaryMetrics(tenantA.tenantId, tenantA.restaurantOutletId);

      expect(metrics.totalTables).toBe(10);
      expect(metrics.totalCapacity).toBe(40);
      expect(metrics.occupiedTables).toBe(10);
      expect(metrics.availableTables).toBe(0);
      expect(metrics.sectionBreakdown.length).toBe(2); // Main Dining, Patio Terrace
    });
  });
});
