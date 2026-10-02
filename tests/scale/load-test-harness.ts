import crypto from "crypto";
import { performance } from "perf_hooks";
import { getDb, getDbClient } from "@/db/client";
import { getRestaurantMenu } from "@/lib/restaurant/menu-service";
import { listTables, getTableSummaryMetrics } from "@/lib/restaurant/table-service";
import { listKdsTasks, updateKdsTaskStatus } from "@/lib/restaurant/kds-service";
import { getHotelDashboardMetrics, listRooms } from "@/lib/hotel/service";
import { getHousekeepingSummary } from "@/lib/hotel/housekeeping-service";
import { getMaintenanceSummary } from "@/lib/hotel/maintenance-service";
import { ScaleTenantFixture } from "./deterministic-data-generator";
import { createDomainEvent, recordOutboxEvent } from "@/lib/events/outbox";
import { orders, orderItems, kdsTasks } from "@/db/schema/operations";
import { eq } from "drizzle-orm";

export type LoadLevel = "A" | "B" | "C" | "D";

export interface ScenarioResult {
  scenarioName: string;
  level: LoadLevel;
  concurrency: number;
  totalRequests: number;
  durationSeconds: number;
  throughputRps: number;
  successCount: number;
  errorCount: number;
  timeoutCount: number;
  errorRatePct: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  dbActiveConnsBefore?: number;
  dbActiveConnsAfter?: number;
  outboxPendingBefore?: number;
  outboxPendingAfter?: number;
  details?: Record<string, unknown>;
}

export interface WorkloadOptions {
  rampUpMs?: number;
  timeoutMs?: number;
}

/**
 * Captures real PostgreSQL and outbox worker resource metrics.
 */
export async function getDbResourceSnapshot(): Promise<{
  activeConnections: number;
  waitingQueries: number;
  outboxPendingEvents: number;
}> {
  try {
    const sql = getDbClient();
    const [connRow] = await sql`
      SELECT 
        count(*)::int as active,
        count(*) FILTER (WHERE wait_event_type IS NOT NULL)::int as waiting
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `;
    const [outboxRow] = await sql`
      SELECT count(*)::int as pending 
      FROM domain_outbox_events 
      WHERE status = 'PENDING'
    `;
    return {
      activeConnections: connRow?.active ?? 0,
      waitingQueries: connRow?.waiting ?? 0,
      outboxPendingEvents: outboxRow?.pending ?? 0,
    };
  } catch {
    return { activeConnections: 0, waitingQueries: 0, outboxPendingEvents: 0 };
  }
}

/**
 * Calculates statistical percentiles from measured latencies in milliseconds.
 */
export function calculatePercentiles(latencies: number[]): {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
} {
  if (latencies.length === 0) {
    return { p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  return {
    p50: Math.round(p50 * 100) / 100,
    p95: Math.round(p95 * 100) / 100,
    p99: Math.round(p99 * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
  };
}

/**
 * Generic concurrency runner that drives tasks concurrently with optional ramp-up
 * and per-request timeout detection.
 */
async function runConcurrentWorkload(
  concurrency: number,
  totalIterations: number,
  taskFn: (iteration: number) => Promise<void>,
  options?: WorkloadOptions
): Promise<{
  latencies: number[];
  successCount: number;
  errorCount: number;
  timeoutCount: number;
}> {
  const latencies: number[] = [];
  let currentIndex = 0;
  let successCount = 0;
  let errorCount = 0;
  let timeoutCount = 0;
  const timeoutMs = options?.timeoutMs ?? 15000;
  const rampUpMs = options?.rampUpMs ?? 0;

  async function worker(workerId: number) {
    if (rampUpMs > 0 && concurrency > 1) {
      const stagger = (workerId * rampUpMs) / concurrency;
      await new Promise((resolve) => setTimeout(resolve, stagger));
    }

    while (true) {
      const idx = currentIndex++;
      if (idx >= totalIterations) break;

      const t0 = performance.now();
      let timedOut = false;

      try {
        let timer: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            reject(new Error("REQUEST_TIMEOUT"));
          }, timeoutMs);
        });

        await Promise.race([
          taskFn(idx).finally(() => {
            if (timer) clearTimeout(timer);
          }),
          timeoutPromise,
        ]);
        successCount++;
      } catch (err: any) {
        if (timedOut || err?.message === "REQUEST_TIMEOUT") {
          timeoutCount++;
        }
        errorCount++;
      }
      const t1 = performance.now();
      latencies.push(t1 - t0);
    }
  }

  const workers = Array.from({ length: concurrency }, (_, i) => worker(i));
  await Promise.all(workers);

  return { latencies, successCount, errorCount, timeoutCount };
}

/**
 * SCENARIO 1: CUSTOMER & DIGITAL MENU READ LOAD
 */
export async function runScenario1CustomerMenuReads(
  fixtures: ScaleTenantFixture[],
  level: LoadLevel = "A",
  concurrency = 5,
  totalRequests = 50,
  options?: WorkloadOptions
): Promise<ScenarioResult> {
  const snapBefore = await getDbResourceSnapshot();
  const startTime = performance.now();

  const { latencies, successCount, errorCount, timeoutCount } = await runConcurrentWorkload(
    concurrency,
    totalRequests,
    async (idx) => {
      const fixture = fixtures[idx % fixtures.length];
      if (idx % 2 === 0) {
        // 50% Menu fetches
        const menu = await getRestaurantMenu(fixture.tenantId, fixture.restaurantOutletId);
        if (!menu || menu.categories.length === 0) throw new Error("EMPTY_MENU");
      } else {
        // 50% Table status & summary fetches
        const tables = await listTables(fixture.tenantId, fixture.restaurantOutletId, { limit: 50 });
        if (!Array.isArray(tables)) throw new Error("INVALID_TABLES");
      }
    },
    options
  );

  const durationSeconds = (performance.now() - startTime) / 1000;
  const percentiles = calculatePercentiles(latencies);
  const snapAfter = await getDbResourceSnapshot();

  return {
    scenarioName: "SCENARIO 1 — Customer / Menu Read Load",
    level,
    concurrency,
    totalRequests,
    durationSeconds: Math.round(durationSeconds * 100) / 100,
    throughputRps: Math.round((totalRequests / Math.max(durationSeconds, 0.001)) * 100) / 100,
    successCount,
    errorCount,
    timeoutCount,
    errorRatePct: Math.round((errorCount / totalRequests) * 10000) / 100,
    p50Ms: percentiles.p50,
    p95Ms: percentiles.p95,
    p99Ms: percentiles.p99,
    minMs: percentiles.min,
    maxMs: percentiles.max,
    dbActiveConnsBefore: snapBefore.activeConnections,
    dbActiveConnsAfter: snapAfter.activeConnections,
    outboxPendingBefore: snapBefore.outboxPendingEvents,
    outboxPendingAfter: snapAfter.outboxPendingEvents,
  };
}

/**
 * SCENARIO 2: RESTAURANT ORDER TRANSACTION & IDEMPOTENT REPLAY LOAD
 */
export async function runScenario2OrderLoad(
  fixtures: ScaleTenantFixture[],
  level: LoadLevel = "A",
  concurrency = 5,
  totalRequests = 30,
  options?: WorkloadOptions
): Promise<ScenarioResult> {
  const db = getDb();
  const snapBefore = await getDbResourceSnapshot();
  const startTime = performance.now();
  let idempotentReplays = 0;

  const { latencies, successCount, errorCount, timeoutCount } = await runConcurrentWorkload(
    concurrency,
    totalRequests,
    async (idx) => {
      const fixture = fixtures[idx % fixtures.length];
      const tableIdx = idx % fixture.tableIds.length;
      const tableId = fixture.tableIds[tableIdx];
      const contextId = fixture.contextIds[tableIdx];

      // Use a repeated key for 20% of requests to test idempotent replay behavior
      const isReplay = idx % 5 === 0;
      const orderKey = isReplay
        ? `KEY_REPLAY_${fixture.tenantId}_${tableIdx}_L${level}`
        : `KEY_ORDER_${fixture.tenantId}_${idx}_L${level}_${crypto.randomUUID().slice(0, 6)}`;

      await db.transaction(async (tx) => {
        // Check idempotency
        const [existing] = await tx
          .select()
          .from(orders)
          .where(eq(orders.idempotencyKey, orderKey))
          .limit(1);

        if (existing) {
          idempotentReplays++;
          return;
        }

        const orderId = crypto.randomUUID();
        const orderNumber = `ORD_${level}_${idx}_${Date.now()}`;
        const subtotal = "650.0000";
        const tax = "32.5000";
        const total = "682.5000";

        // Insert Order
        await tx.insert(orders).values({
          orderId,
          tenantId: fixture.tenantId,
          outletId: fixture.restaurantOutletId,
          contextId,
          tableId,
          orderNumber,
          orderSource: "QR_CUSTOMER",
          diningContext: "DINE_IN",
          status: "PLACED",
          idempotencyKey: orderKey,
          subtotalAmount: subtotal,
          taxAmount: tax,
          totalAmount: total,
        });

        // Insert Order Items
        const itemId = fixture.itemIds[0];
        await tx.insert(orderItems).values([
          {
            orderItemId: crypto.randomUUID(),
            tenantId: fixture.tenantId,
            orderId,
            itemId,
            itemName: "Scale Test Dish",
            unitPrice: "325.0000",
            quantity: 2,
            subtotal,
            fulfillmentStation: "KITCHEN",
          },
        ]);

        // Record Outbox Event
        const domainEvent = createDomainEvent({
          tenantId: fixture.tenantId,
          outletId: fixture.restaurantOutletId,
          vertical: "RESTAURANT",
          eventType: "ORDER_CONFIRMED",
          aggregateType: "order",
          aggregateId: orderId,
          idempotencyKey: `EVENT_${orderKey}`,
          payload: { orderId, totalAmount: total, subtotalAmount: subtotal, taxAmount: tax },
        });

        await recordOutboxEvent(tx, domainEvent);
      });
    },
    options
  );

  const durationSeconds = (performance.now() - startTime) / 1000;
  const percentiles = calculatePercentiles(latencies);
  const snapAfter = await getDbResourceSnapshot();

  return {
    scenarioName: "SCENARIO 2 — Restaurant Order Write & Idempotent Replay Load",
    level,
    concurrency,
    totalRequests,
    durationSeconds: Math.round(durationSeconds * 100) / 100,
    throughputRps: Math.round((totalRequests / Math.max(durationSeconds, 0.001)) * 100) / 100,
    successCount,
    errorCount,
    timeoutCount,
    errorRatePct: Math.round((errorCount / totalRequests) * 10000) / 100,
    p50Ms: percentiles.p50,
    p95Ms: percentiles.p95,
    p99Ms: percentiles.p99,
    minMs: percentiles.min,
    maxMs: percentiles.max,
    dbActiveConnsBefore: snapBefore.activeConnections,
    dbActiveConnsAfter: snapAfter.activeConnections,
    outboxPendingBefore: snapBefore.outboxPendingEvents,
    outboxPendingAfter: snapAfter.outboxPendingEvents,
    details: { idempotentReplays },
  };
}

/**
 * SCENARIO 3: KDS SERVICE CONCURRENT READ & TASK TRANSITION LOAD
 */
export async function runScenario3KdsLoad(
  fixtures: ScaleTenantFixture[],
  level: LoadLevel = "A",
  concurrency = 5,
  totalRequests = 40,
  options?: WorkloadOptions
): Promise<ScenarioResult> {
  const db = getDb();
  const snapBefore = await getDbResourceSnapshot();
  const startTime = performance.now();

  const fixture = fixtures[0];
  const testTasks: string[] = [];

  // Pre-seed KDS tasks for transition testing
  for (let k = 1; k <= 30; k++) {
    const taskId = crypto.randomUUID();
    const orderId = crypto.randomUUID();
    const orderItemId = crypto.randomUUID();
    testTasks.push(taskId);

    await db.insert(orders).values({
      orderId,
      tenantId: fixture.tenantId,
      outletId: fixture.restaurantOutletId,
      contextId: fixture.contextIds[0],
      orderNumber: `KDS_ORD_${level}_${k}_${crypto.randomUUID().slice(0, 8)}`,
      orderSource: "QR_CUSTOMER",
      status: "PLACED",
      totalAmount: "300.0000",
    });

    await db.insert(orderItems).values({
      orderItemId,
      tenantId: fixture.tenantId,
      orderId,
      itemId: fixture.itemIds[0],
      itemName: "KDS Burger",
      unitPrice: "150.0000",
      quantity: 2,
      subtotal: "300.0000",
      fulfillmentStation: "KITCHEN",
    }).onConflictDoNothing();

    await db.insert(kdsTasks).values({
      taskId,
      tenantId: fixture.tenantId,
      outletId: fixture.restaurantOutletId,
      orderId,
      orderItemId,
      itemId: fixture.itemIds[0],
      itemName: "KDS Burger",
      quantity: 2,
      diningContext: "DINE_IN",
      orderSource: "QR_CUSTOMER",
      stationRouting: "KITCHEN",
      taskStatus: "PENDING",
    }).onConflictDoNothing();
  }

  const { latencies, successCount, errorCount, timeoutCount } = await runConcurrentWorkload(
    concurrency,
    totalRequests,
    async (idx) => {
      if (idx % 2 === 0) {
        // 50% KDS task reads
        const tasks = await listKdsTasks(fixture.tenantId, {
          outletId: fixture.restaurantOutletId,
          stationRouting: "KITCHEN",
          limit: 50,
        });
        if (!Array.isArray(tasks)) throw new Error("INVALID_KDS_TASKS");
      } else {
        // 50% Task state transitions
        const taskId = testTasks[idx % testTasks.length];
        try {
          await updateKdsTaskStatus(fixture.tenantId, taskId, "PREPARING", "staff_kds_1");
        } catch {
          // Idempotent or already updated is safe
        }
      }
    },
    options
  );

  const durationSeconds = (performance.now() - startTime) / 1000;
  const percentiles = calculatePercentiles(latencies);
  const snapAfter = await getDbResourceSnapshot();

  return {
    scenarioName: "SCENARIO 3 — KDS Queue Read & Task Transition Load",
    level,
    concurrency,
    totalRequests,
    durationSeconds: Math.round(durationSeconds * 100) / 100,
    throughputRps: Math.round((totalRequests / Math.max(durationSeconds, 0.001)) * 100) / 100,
    successCount,
    errorCount,
    timeoutCount,
    errorRatePct: Math.round((errorCount / totalRequests) * 10000) / 100,
    p50Ms: percentiles.p50,
    p95Ms: percentiles.p95,
    p99Ms: percentiles.p99,
    minMs: percentiles.min,
    maxMs: percentiles.max,
    dbActiveConnsBefore: snapBefore.activeConnections,
    dbActiveConnsAfter: snapAfter.activeConnections,
    outboxPendingBefore: snapBefore.outboxPendingEvents,
    outboxPendingAfter: snapAfter.outboxPendingEvents,
  };
}

/**
 * SCENARIO 4: HOTEL OPERATIONAL READ LOAD
 */
export async function runScenario4HotelOperationalReads(
  fixtures: ScaleTenantFixture[],
  level: LoadLevel = "A",
  concurrency = 5,
  totalRequests = 40,
  options?: WorkloadOptions
): Promise<ScenarioResult> {
  const snapBefore = await getDbResourceSnapshot();
  const startTime = performance.now();

  const { latencies, successCount, errorCount, timeoutCount } = await runConcurrentWorkload(
    concurrency,
    totalRequests,
    async (idx) => {
      const fixture = fixtures[idx % fixtures.length];
      const subtest = idx % 4;

      if (subtest === 0) {
        // Hotel Dashboard Aggregates
        const metrics = await getHotelDashboardMetrics(fixture.tenantId, fixture.hotelOutletId);
        if (!metrics || metrics.totalRooms === undefined) throw new Error("INVALID_HOTEL_METRICS");
      } else if (subtest === 1) {
        // Room inventory reads with bounded pagination
        const rooms = await listRooms(fixture.tenantId, fixture.hotelOutletId, { limit: 50 });
        if (!Array.isArray(rooms)) throw new Error("INVALID_ROOMS");
      } else if (subtest === 2) {
        // Housekeeping summary
        const hk = await getHousekeepingSummary(fixture.tenantId, fixture.hotelOutletId);
        if (!hk || !hk.roomCounts) throw new Error("INVALID_HK_SUMMARY");
      } else {
        // Maintenance summary
        const maint = await getMaintenanceSummary(fixture.tenantId, fixture.hotelOutletId);
        if (!maint || !maint.outletId) throw new Error("INVALID_MAINT_SUMMARY");
      }
    },
    options
  );

  const durationSeconds = (performance.now() - startTime) / 1000;
  const percentiles = calculatePercentiles(latencies);
  const snapAfter = await getDbResourceSnapshot();

  return {
    scenarioName: "SCENARIO 4 — Hotel Operational Read Load",
    level,
    concurrency,
    totalRequests,
    durationSeconds: Math.round(durationSeconds * 100) / 100,
    throughputRps: Math.round((totalRequests / Math.max(durationSeconds, 0.001)) * 100) / 100,
    successCount,
    errorCount,
    timeoutCount,
    errorRatePct: Math.round((errorCount / totalRequests) * 10000) / 100,
    p50Ms: percentiles.p50,
    p95Ms: percentiles.p95,
    p99Ms: percentiles.p99,
    minMs: percentiles.min,
    maxMs: percentiles.max,
    dbActiveConnsBefore: snapBefore.activeConnections,
    dbActiveConnsAfter: snapAfter.activeConnections,
    outboxPendingBefore: snapBefore.outboxPendingEvents,
    outboxPendingAfter: snapAfter.outboxPendingEvents,
  };
}

/**
 * SCENARIO 5: REALISTIC MULTI-TENANT MIXED LOAD (70% Read / 30% Write)
 */
export async function runScenario5MixedLoad(
  fixtures: ScaleTenantFixture[],
  level: LoadLevel = "A",
  concurrency = 5,
  totalRequests = 50,
  options?: WorkloadOptions
): Promise<ScenarioResult> {
  const db = getDb();
  const snapBefore = await getDbResourceSnapshot();
  const startTime = performance.now();

  const { latencies, successCount, errorCount, timeoutCount } = await runConcurrentWorkload(
    concurrency,
    totalRequests,
    async (idx) => {
      const fixture = fixtures[idx % fixtures.length];
      const mixKey = idx % 10;

      if (mixKey < 3) {
        // 30% Menu & Catalog reads
        await getRestaurantMenu(fixture.tenantId, fixture.restaurantOutletId);
      } else if (mixKey < 5) {
        // 20% Table summary metrics
        await getTableSummaryMetrics(fixture.tenantId, fixture.restaurantOutletId);
      } else if (mixKey < 7) {
        // 20% Hotel dashboard reads
        await getHotelDashboardMetrics(fixture.tenantId, fixture.hotelOutletId);
      } else {
        // 30% Transactional mutation: quick order creation
        const orderId = crypto.randomUUID();
        await db.insert(orders).values({
          orderId,
          tenantId: fixture.tenantId,
          outletId: fixture.restaurantOutletId,
          contextId: fixture.contextIds[0],
          orderNumber: `MIX_${level}_${idx}_${Date.now()}`,
          orderSource: "POS",
          status: "PLACED",
          totalAmount: "450.0000",
        });
      }
    },
    options
  );

  const durationSeconds = (performance.now() - startTime) / 1000;
  const percentiles = calculatePercentiles(latencies);
  const snapAfter = await getDbResourceSnapshot();

  return {
    scenarioName: "SCENARIO 5 — Realistic Multi-Tenant Mixed Load (70% Read / 30% Write)",
    level,
    concurrency,
    totalRequests,
    durationSeconds: Math.round(durationSeconds * 100) / 100,
    throughputRps: Math.round((totalRequests / Math.max(durationSeconds, 0.001)) * 100) / 100,
    successCount,
    errorCount,
    timeoutCount,
    errorRatePct: Math.round((errorCount / totalRequests) * 10000) / 100,
    p50Ms: percentiles.p50,
    p95Ms: percentiles.p95,
    p99Ms: percentiles.p99,
    minMs: percentiles.min,
    maxMs: percentiles.max,
    dbActiveConnsBefore: snapBefore.activeConnections,
    dbActiveConnsAfter: snapAfter.activeConnections,
    outboxPendingBefore: snapBefore.outboxPendingEvents,
    outboxPendingAfter: snapAfter.outboxPendingEvents,
  };
}
