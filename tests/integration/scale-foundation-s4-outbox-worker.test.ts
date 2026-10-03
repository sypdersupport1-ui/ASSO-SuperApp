import { describe, it, expect, beforeEach } from "vitest";
import { getDbClient, getDb } from "@/db/client";
import { withPlatformScope } from "@/db/rls";
import {
  domainOutboxEvents,
  communicationDeliveryLogs,
} from "@/db/schema/communication";
import {
  orders,
  orderItems,
  kdsTasks,
} from "@/db/schema/operations";
import {
  OutboxWorker,
  claimEligibleEvents,
  completeOutboxEvent,
  failOutboxEvent,
  OutboxDispatcher,
  OutboxEventHandler,
  OutboxEvent,
  ProcessEventResult,
} from "@/lib/outbox";
import { createDomainEvent, recordOutboxEvent, processOutboxBatch } from "@/lib/events/outbox";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";

describe("ASSO Scale Foundation S4 — Standalone Transactional Outbox Worker", () => {
  beforeEach(async () => {
    // Clean up test outbox events and logs across test suites
    await withPlatformScope(async (tx) => {
      await tx`DELETE FROM communication_delivery_logs`;
      await tx`DELETE FROM domain_outbox_events`;
    });
  });

  // =========================================================================
  // 1. CONCURRENT CLAIMING & SKIP LOCKED SAFETY
  // =========================================================================
  describe("1. Concurrent Claiming & SKIP LOCKED Safety", () => {
    it("worker claims pending events and second worker skips locked rows (no double-claiming)", async () => {
      const db = getDb();
      const event1 = createDomainEvent({
        tenantId: TENANT_A,
        vertical: "HOTEL",
        eventType: "HOTEL_CHECK_IN_SUCCESS",
        aggregateType: "STAY",
        aggregateId: "stay_claim_1",
        payload: { guestName: "Guest 1" },
      });
      const event2 = createDomainEvent({
        tenantId: TENANT_A,
        vertical: "HOTEL",
        eventType: "HOTEL_CHECK_IN_SUCCESS",
        aggregateType: "STAY",
        aggregateId: "stay_claim_2",
        payload: { guestName: "Guest 2" },
      });

      await recordOutboxEvent(db, event1);
      await recordOutboxEvent(db, event2);

      // Worker 1 claims batch of 1
      const worker1Claims = await claimEligibleEvents({
        workerId: "worker_node_1",
        batchSize: 1,
        leaseSeconds: 60,
        maxAttempts: 3,
      });

      expect(worker1Claims.length).toBe(1);
      expect(worker1Claims[0].claimedBy).toBe("worker_node_1");
      expect(worker1Claims[0].status).toBe("PROCESSING");

      // Worker 2 claims batch of 1 - must skip the row claimed by worker 1
      const worker2Claims = await claimEligibleEvents({
        workerId: "worker_node_2",
        batchSize: 1,
        leaseSeconds: 60,
        maxAttempts: 3,
      });

      expect(worker2Claims.length).toBe(1);
      expect(worker2Claims[0].claimedBy).toBe("worker_node_2");
      expect(worker2Claims[0].status).toBe("PROCESSING");
      expect(worker2Claims[0].outboxId).not.toBe(worker1Claims[0].outboxId);

      // Verify no double-claiming in DB
      const [claimed1] = await db
        .select()
        .from(domainOutboxEvents)
        .where(eq(domainOutboxEvents.outboxId, worker1Claims[0].outboxId));
      expect(claimed1.claimedBy).toBe("worker_node_1");

      const [claimed2] = await db
        .select()
        .from(domainOutboxEvents)
        .where(eq(domainOutboxEvents.outboxId, worker2Claims[0].outboxId));
      expect(claimed2.claimedBy).toBe("worker_node_2");
    });

    it("concurrent workers race for a pool of events without collisions", async () => {
      const db = getDb();
      const totalEvents = 9;

      for (let i = 0; i < totalEvents; i++) {
        const ev = createDomainEvent({
          tenantId: TENANT_A,
          vertical: "HOTEL",
          eventType: "BILL_GENERATED",
          aggregateType: "FOLIO",
          aggregateId: `folio_race_${i}`,
          payload: { index: i },
        });
        await recordOutboxEvent(db, ev);
      }

      // 3 workers race to claim batches of 3
      const [w1, w2, w3] = await Promise.all([
        claimEligibleEvents({ workerId: "worker_race_1", batchSize: 3, leaseSeconds: 60, maxAttempts: 5 }),
        claimEligibleEvents({ workerId: "worker_race_2", batchSize: 3, leaseSeconds: 60, maxAttempts: 5 }),
        claimEligibleEvents({ workerId: "worker_race_3", batchSize: 3, leaseSeconds: 60, maxAttempts: 5 }),
      ]);

      const allClaimedIds = [...w1, ...w2, ...w3].map((e) => e.outboxId);
      expect(allClaimedIds.length).toBe(totalEvents);

      // Unique set size must match total count (zero duplicate claims)
      const uniqueIds = new Set(allClaimedIds);
      expect(uniqueIds.size).toBe(totalEvents);
    });
  });

  // =========================================================================
  // 2. LEASE EXPIRATION & CRASH RECOVERY
  // =========================================================================
  describe("2. Lease Expiration & Crash Recovery", () => {
    it("active unexpired lease is not stolen prematurely by another worker", async () => {
      const db = getDb();
      const ev = createDomainEvent({
        tenantId: TENANT_A,
        vertical: "HOTEL",
        eventType: "HOTEL_CHECK_IN_SUCCESS",
        aggregateType: "STAY",
        aggregateId: "stay_lease_active",
        payload: { active: true },
      });
      await recordOutboxEvent(db, ev);

      // Worker 1 claims with 60s lease
      const claims1 = await claimEligibleEvents({
        workerId: "worker_active_1",
        batchSize: 1,
        leaseSeconds: 60,
        maxAttempts: 3,
      });
      expect(claims1.length).toBe(1);

      // Worker 2 attempts to claim - must get 0 rows since lease is active
      const claims2 = await claimEligibleEvents({
        workerId: "worker_active_2",
        batchSize: 1,
        leaseSeconds: 60,
        maxAttempts: 3,
      });
      expect(claims2.length).toBe(0);
    });

    it("expired lease from crashed worker is recovered and claimed by another worker", async () => {
      const db = getDb();
      const ev = createDomainEvent({
        tenantId: TENANT_A,
        vertical: "HOTEL",
        eventType: "HOTEL_CHECK_IN_SUCCESS",
        aggregateType: "STAY",
        aggregateId: "stay_crash_recovery",
        payload: { crashed: true },
      });
      const recorded = await recordOutboxEvent(db, ev);

      // Simulate a crashed worker whose lease has expired
      await withPlatformScope(async (tx) => {
        await tx`
          UPDATE domain_outbox_events
          SET status = 'PROCESSING',
              claimed_by = 'crashed_worker_node',
              claim_expires_at = NOW() - INTERVAL '10 seconds',
              attempt_count = 1
          WHERE outbox_id = ${recorded.outboxId};
        `;
      });

      // Healthy worker should recover this event
      const recoveryClaims = await claimEligibleEvents({
        workerId: "recovery_worker_node",
        batchSize: 1,
        leaseSeconds: 60,
        maxAttempts: 3,
      });

      expect(recoveryClaims.length).toBe(1);
      expect(recoveryClaims[0].outboxId).toBe(recorded.outboxId);
      expect(recoveryClaims[0].claimedBy).toBe("recovery_worker_node");
      expect(recoveryClaims[0].attemptCount).toBe(2); // Attempt count incremented upon recovery
    });
  });

  // =========================================================================
  // 3. RETRY, BACKOFF, & POISON / DEAD-LETTER (DLQ)
  // =========================================================================
  describe("3. Retry, Backoff, & Poison / Dead-Letter (DLQ)", () => {
    it("retryable failure transitions to RETRY_WAITING with future next_retry_at and backoff", async () => {
      const db = getDb();
      const ev = createDomainEvent({
        tenantId: TENANT_A,
        vertical: "HOTEL",
        eventType: "HOTEL_CHECK_IN_SUCCESS",
        aggregateType: "STAY",
        aggregateId: "stay_retry_test",
        payload: { attempt: 1 },
      });
      const recorded = await recordOutboxEvent(db, ev);

      // Fail with retryable error
      const failRes = await failOutboxEvent(
        recorded.outboxId,
        "Network gateway timeout (504)",
        true,
        1,
        { maxAttempts: 3, baseBackoffSeconds: 30, maxBackoffSeconds: 300 }
      );

      expect(failRes.status).toBe("RETRY_WAITING");
      expect(failRes.nextRetryAt).not.toBeNull();
      expect(failRes.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());

      const [row] = await db
        .select()
        .from(domainOutboxEvents)
        .where(eq(domainOutboxEvents.outboxId, recorded.outboxId));

      expect(row.status).toBe("RETRY_WAITING");
      expect(row.lastError).toBe("Network gateway timeout (504)");
      expect(row.claimedBy).toBeNull();
      expect(row.claimExpiresAt).toBeNull();
    });

    it("non-retryable failure immediately transitions to DEAD_LETTER", async () => {
      const db = getDb();
      const ev = createDomainEvent({
        tenantId: TENANT_A,
        vertical: "HOTEL",
        eventType: "HOTEL_CHECK_IN_SUCCESS",
        aggregateType: "STAY",
        aggregateId: "stay_dlq_permanent",
        payload: { invalid: true },
      });
      const recorded = await recordOutboxEvent(db, ev);

      // Fail with permanent non-retryable error
      const failRes = await failOutboxEvent(
        recorded.outboxId,
        "INVALID_ARGUMENT: Malformed phone number",
        false,
        1,
        { maxAttempts: 5, baseBackoffSeconds: 30, maxBackoffSeconds: 300 }
      );

      expect(failRes.status).toBe("DEAD_LETTER");
      expect(failRes.nextRetryAt).toBeNull();

      const [row] = await db
        .select()
        .from(domainOutboxEvents)
        .where(eq(domainOutboxEvents.outboxId, recorded.outboxId));

      expect(row.status).toBe("DEAD_LETTER");
      expect(row.lastError).toContain("INVALID_ARGUMENT");
    });

    it("reaching maxAttempts transitions event to DEAD_LETTER", async () => {
      const db = getDb();
      const ev = createDomainEvent({
        tenantId: TENANT_A,
        vertical: "HOTEL",
        eventType: "HOTEL_CHECK_IN_SUCCESS",
        aggregateType: "STAY",
        aggregateId: "stay_max_attempts",
        payload: { attempts: 3 },
      });
      const recorded = await recordOutboxEvent(db, ev);

      // Attempt count = 3, maxAttempts = 3
      const failRes = await failOutboxEvent(
        recorded.outboxId,
        "Repeated downstream failure",
        true,
        3,
        { maxAttempts: 3, baseBackoffSeconds: 30, maxBackoffSeconds: 300 }
      );

      expect(failRes.status).toBe("DEAD_LETTER");

      const [row] = await db
        .select()
        .from(domainOutboxEvents)
        .where(eq(domainOutboxEvents.outboxId, recorded.outboxId));

      expect(row.status).toBe("DEAD_LETTER");
      expect(row.nextRetryAt).toBeNull();
    });

    it("dead-lettered events remain auditable in the database (never silently deleted)", async () => {
      const db = getDb();
      const ev = createDomainEvent({
        tenantId: TENANT_A,
        vertical: "HOTEL",
        eventType: "HOTEL_CHECK_IN_SUCCESS",
        aggregateType: "STAY",
        aggregateId: "stay_audit_dlq",
        payload: { audit: true },
      });
      const recorded = await recordOutboxEvent(db, ev);

      await failOutboxEvent(
        recorded.outboxId,
        "Critical poison payload",
        false,
        1,
        { maxAttempts: 3, baseBackoffSeconds: 30, maxBackoffSeconds: 300 }
      );

      const rows = await db
        .select()
        .from(domainOutboxEvents)
        .where(eq(domainOutboxEvents.outboxId, recorded.outboxId));

      expect(rows.length).toBe(1);
      expect(rows[0].status).toBe("DEAD_LETTER");
      expect(rows[0].lastError).toBe("Critical poison payload");
    });
  });

  // =========================================================================
  // 4. IDEMPOTENT PROCESSING & DUPLICATE SAFETY
  // =========================================================================
  describe("4. Idempotent Event Processing & Duplicate Safety", () => {
    it("repeated processing of an event does not create duplicate communication delivery logs", async () => {
      const db = getDb();
      const ev = createDomainEvent({
        tenantId: TENANT_A,
        vertical: "HOTEL",
        eventType: "HOTEL_CHECK_IN_SUCCESS",
        aggregateType: "STAY",
        aggregateId: "stay_idemp_comm",
        payload: {
          stayNumber: "STAY-IDEMP-01",
          guestName: "Alice Wonderland",
          guestPhone: "+919876543210",
        },
      });
      const recorded = await recordOutboxEvent(db, ev);

      const worker = new OutboxWorker({ batchSize: 5 });

      // First batch execution
      const stats1 = await worker.processBatch();
      expect(stats1.succeeded).toBeGreaterThanOrEqual(1);

      // Verify delivery log exists
      const logs1 = await db
        .select()
        .from(communicationDeliveryLogs)
        .where(eq(communicationDeliveryLogs.outboxId, recorded.outboxId));
      expect(logs1.length).toBeGreaterThanOrEqual(1);
      const initialLogCount = logs1.length;

      // Simulate re-processing: reset status to PENDING
      await withPlatformScope(async (tx) => {
        await tx`
          UPDATE domain_outbox_events
          SET status = 'PENDING',
              claimed_by = NULL,
              claim_expires_at = NULL
          WHERE outbox_id = ${recorded.outboxId};
        `;
      });

      // Second batch execution
      const stats2 = await worker.processBatch();
      expect(stats2.succeeded).toBeGreaterThanOrEqual(1);

      // Verify no duplicate delivery logs were inserted
      const logs2 = await db
        .select()
        .from(communicationDeliveryLogs)
        .where(eq(communicationDeliveryLogs.outboxId, recorded.outboxId));
      expect(logs2.length).toBe(initialLogCount);
    });

    it("KDS tasks from ORDER_CONFIRMED are generated idempotently across retries", async () => {
      const db = getDb();
      const testOrderId = crypto.randomUUID();
      const testItemId = crypto.randomUUID();
      const testOutletId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

      const [existingItem] = await withPlatformScope(async (tx) => {
        return await tx`SELECT item_id FROM catalog_items WHERE tenant_id = ${TENANT_A} LIMIT 1`;
      });

      let testCatalogItemId = existingItem?.item_id;
      if (!testCatalogItemId) {
        const catId = crypto.randomUUID();
        const catgId = crypto.randomUUID();
        testCatalogItemId = crypto.randomUUID();
        await withPlatformScope(async (tx) => {
          await tx`
            INSERT INTO catalogs (catalog_id, tenant_id, outlet_id, name)
            VALUES (${catId}, ${TENANT_A}, ${testOutletId}, 'Test Cat')
            ON CONFLICT DO NOTHING;
          `;
          await tx`
            INSERT INTO catalog_categories (category_id, tenant_id, catalog_id, name)
            VALUES (${catgId}, ${TENANT_A}, ${catId}, 'Test Catg')
            ON CONFLICT DO NOTHING;
          `;
          await tx`
            INSERT INTO catalog_items (item_id, tenant_id, category_id, name, base_price, fulfillment_station)
            VALUES (${testCatalogItemId}, ${TENANT_A}, ${catgId}, 'Paneer Tikka', 125.00, 'KITCHEN')
            ON CONFLICT DO NOTHING;
          `;
        });
      }

      const uniqueOrderNum = `ORD-KDS-S4-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      await withPlatformScope(async (tx) => {
        await tx`
          INSERT INTO orders (order_id, tenant_id, outlet_id, context_id, order_number, order_source, status, total_amount)
          VALUES (${testOrderId}, ${TENANT_A}, ${testOutletId}, 'cccccccc-cccc-cccc-cccc-cccccccccccc', ${uniqueOrderNum}, 'STAFF_POS', 'CONFIRMED', 250.00)
          ON CONFLICT (order_id) DO NOTHING;
        `;
        await tx`
          INSERT INTO order_items (order_item_id, tenant_id, order_id, item_id, item_name, quantity, unit_price, subtotal)
          VALUES (${testItemId}, ${TENANT_A}, ${testOrderId}, ${testCatalogItemId}, 'Paneer Tikka', 2, 125.00, 250.00)
          ON CONFLICT (order_item_id) DO NOTHING;
        `;
      });

      const ev = createDomainEvent({
        tenantId: TENANT_A,
        vertical: "RESTAURANT",
        eventType: "ORDER_CONFIRMED",
        aggregateType: "ORDER",
        aggregateId: testOrderId,
        payload: { orderNumber: "ORD-KDS-001" },
      });
      const recorded = await recordOutboxEvent(db, ev);

      const worker = new OutboxWorker({ batchSize: 5 });

      // Run 1: processes ORDER_CONFIRMED
      await worker.processBatch();

      const tasksRun1 = await db
        .select()
        .from(kdsTasks)
        .where(eq(kdsTasks.orderId, testOrderId));
      expect(tasksRun1.length).toBe(1);

      // Simulate retry: reset event to PENDING
      await withPlatformScope(async (tx) => {
        await tx`
          UPDATE domain_outbox_events
          SET status = 'PENDING',
              claimed_by = NULL,
              claim_expires_at = NULL
          WHERE outbox_id = ${recorded.outboxId};
        `;
      });

      // Run 2: re-processes ORDER_CONFIRMED
      await worker.processBatch();

      const tasksRun2 = await db
        .select()
        .from(kdsTasks)
        .where(eq(kdsTasks.orderId, testOrderId));
      // Idempotency check in KDS service ensures strictly 1 task per item
      expect(tasksRun2.length).toBe(1);
    });
  });

  // =========================================================================
  // 5. WORKER LIFECYCLE & GRACEFUL SHUTDOWN
  // =========================================================================
  describe("5. Worker Lifecycle & Graceful Shutdown", () => {
    it("starts polling loop, processes newly queued events, and shuts down cleanly", async () => {
      const db = getDb();
      const worker = new OutboxWorker({
        pollIntervalMs: 50,
        batchSize: 5,
        concurrency: 2,
      });

      expect(worker.active).toBe(false);

      // Start worker
      await worker.start();
      expect(worker.active).toBe(true);

      // Insert an event while worker is actively running
      const ev = createDomainEvent({
        tenantId: TENANT_A,
        vertical: "HOTEL",
        eventType: "BILL_GENERATED",
        aggregateType: "FOLIO",
        aggregateId: "folio_lifecycle_01",
        payload: { total: "500.00" },
      });
      const recorded = await recordOutboxEvent(db, ev);

      // Wait up to 1 second for worker polling loop to pick up and complete
      let isCompleted = false;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const [row] = await db
          .select()
          .from(domainOutboxEvents)
          .where(eq(domainOutboxEvents.outboxId, recorded.outboxId));
        if (row && row.status === "COMPLETED") {
          isCompleted = true;
          break;
        }
      }

      expect(isCompleted).toBe(true);

      // Stop worker gracefully
      await worker.stop();
      expect(worker.active).toBe(false);
    });
  });

  // =========================================================================
  // 6. TENANT ISOLATION & RLS VERIFICATION
  // =========================================================================
  describe("6. Tenant Isolation & RLS Security Context", () => {
    it("worker operates under platform scope to process cross-tenant events", async () => {
      const db = getDb();

      // Create event for Tenant A and event for Tenant B
      const evA = createDomainEvent({
        tenantId: TENANT_A,
        vertical: "HOTEL",
        eventType: "BILL_GENERATED",
        aggregateType: "FOLIO",
        aggregateId: "folio_tenant_a",
        payload: { tenant: "A" },
      });
      const evB = createDomainEvent({
        tenantId: TENANT_B,
        vertical: "HOTEL",
        eventType: "BILL_GENERATED",
        aggregateType: "FOLIO",
        aggregateId: "folio_tenant_b",
        payload: { tenant: "B" },
      });

      await recordOutboxEvent(db, evA);
      await recordOutboxEvent(db, evB);

      // Outbox worker claims without tenant restriction
      const worker = new OutboxWorker({ batchSize: 10 });
      const stats = await worker.processBatch();

      expect(stats.claimed).toBe(2);
      expect(stats.succeeded).toBe(2);

      // Verify both events transitioned to COMPLETED
      const [rowA] = await db.select().from(domainOutboxEvents).where(eq(domainOutboxEvents.aggregateId, "folio_tenant_a"));
      const [rowB] = await db.select().from(domainOutboxEvents).where(eq(domainOutboxEvents.aggregateId, "folio_tenant_b"));
      expect(rowA.status).toBe("COMPLETED");
      expect(rowB.status).toBe("COMPLETED");
    });

    it("ordinary authenticated tenant cannot read or claim outbox rows of another tenant", async () => {
      const db = getDb();

      const evB = createDomainEvent({
        tenantId: TENANT_B,
        vertical: "HOTEL",
        eventType: "BILL_GENERATED",
        aggregateType: "FOLIO",
        aggregateId: "folio_isolated_b",
        payload: { secret: "tenant_b_data" },
      });
      await recordOutboxEvent(db, evB);

      const client = getDbClient();

      // Run as Tenant A under authenticated role
      const tenantARead = await client.begin(async (tx) => {
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SELECT set_config('app.current_tenant_id', ${TENANT_A}, true)`;
        return await tx`SELECT * FROM domain_outbox_events WHERE tenant_id = ${TENANT_B}::uuid`;
      });

      expect(tenantARead.length).toBe(0); // Tenant B's outbox event is completely invisible to Tenant A
    });
  });

  // =========================================================================
  // 7. BACKWARDS COMPATIBILITY FOR processOutboxBatch
  // =========================================================================
  describe("7. processOutboxBatch Backwards Compatibility", () => {
    it("processOutboxBatch delegates to OutboxWorker correctly", async () => {
      const db = getDb();
      const ev = createDomainEvent({
        tenantId: TENANT_A,
        vertical: "HOTEL",
        eventType: "BILL_GENERATED",
        aggregateType: "FOLIO",
        aggregateId: "folio_legacy_compat",
        payload: { legacy: true },
      });
      await recordOutboxEvent(db, ev);

      const result = await processOutboxBatch({
        tenantId: TENANT_A,
        batchSize: 5,
      });

      expect(result.processed).toBeGreaterThanOrEqual(1);
      expect(result.succeeded).toBeGreaterThanOrEqual(1);
      expect(result.failed).toBe(0);

      const [row] = await db
        .select()
        .from(domainOutboxEvents)
        .where(eq(domainOutboxEvents.aggregateId, "folio_legacy_compat"));
      expect(row.status).toBe("COMPLETED");
    });
  });
});
