import { describe, it, expect, beforeEach } from "vitest";
import {
  computeRequestHash,
  canonicalizeJson,
  checkOrAcquireIdempotencyKey,
  saveIdempotentResponse,
  releaseIdempotencyKey,
  clearIdempotencyStore,
  getIdempotencyStore,
  PostgresIdempotencyStore,
} from "@/lib/api/idempotency";
import { IdempotencyConflictError } from "@/lib/api/errors";
import { getDbClient } from "@/db/client";

describe("ASSO Scale Foundation S2 — Durable Horizontally Scalable Idempotency", () => {
  const tenantA = "11111111-1111-1111-1111-111111111111";
  const tenantB = "22222222-2222-2222-2222-222222222222";
  const testKey = "s2_test_idemp_key_001";
  const testOperation = "POST:/api/v1/restaurant/orders";

  beforeEach(async () => {
    await clearIdempotencyStore();
  });

  describe("1. Basic Idempotency & Deterministic Hash Semantics", () => {
    it("first request claims the key (IN_PROGRESS)", async () => {
      const payload = { items: ["item_1", "item_2"], note: "extra spicy" };
      const hash = computeRequestHash("POST", "/api/v1/restaurant/orders", payload);

      const result = await checkOrAcquireIdempotencyKey(tenantA, testKey, hash, 24, testOperation);
      expect(result.acquired).toBe(true);
      expect(result.cachedResponse).toBeUndefined();

      // Check DB directly
      const store = getIdempotencyStore();
      const record = await store.get({ tenantId: tenantA, key: testKey, operation: testOperation });
      expect(record).not.toBeNull();
      expect(record?.status).toBe("IN_PROGRESS");
      expect(record?.tenantId).toBe(tenantA);
      expect(record?.operation).toBe(testOperation);
    });

    it("completed request with identical payload replays cached response", async () => {
      const payload = { amount: 500, orderType: "DINE_IN" };
      const hash = computeRequestHash("POST", "/api/v1/orders", payload);

      await checkOrAcquireIdempotencyKey(tenantA, testKey, hash, 24, testOperation);
      const originalResponse = { orderId: "ord_s2_123", total: 500, status: "PLACED" };
      await saveIdempotentResponse(tenantA, testKey, 201, originalResponse, testOperation, "ord_s2_123");

      const replay = await checkOrAcquireIdempotencyKey(tenantA, testKey, hash, 24, testOperation);
      expect(replay.acquired).toBe(false);
      expect(replay.cachedResponse).toBeDefined();
      expect(replay.cachedResponse?.code).toBe(201);
      expect(replay.cachedResponse?.body).toEqual(originalResponse);
    });

    it("reused key with mismatched payload rejects with 409 IdempotencyConflictError", async () => {
      const payloadA = { amount: 100, items: ["item_A"] };
      const payloadB = { amount: 200, items: ["item_B"] };

      const hashA = computeRequestHash("POST", "/api/v1/orders", payloadA);
      const hashB = computeRequestHash("POST", "/api/v1/orders", payloadB);

      await checkOrAcquireIdempotencyKey(tenantA, testKey, hashA, 24, testOperation);
      await saveIdempotentResponse(tenantA, testKey, 201, { success: true }, testOperation);

      await expect(
        checkOrAcquireIdempotencyKey(tenantA, testKey, hashB, 24, testOperation)
      ).rejects.toThrow(IdempotencyConflictError);
    });

    it("canonical JSON normalization guarantees identical hash regardless of key order", () => {
      const obj1 = { z: 1, a: "hello", m: [3, 2, 1], nested: { y: true, b: false } };
      const obj2 = { nested: { b: false, y: true }, m: [3, 2, 1], a: "hello", z: 1 };

      const canon1 = canonicalizeJson(obj1);
      const canon2 = canonicalizeJson(obj2);
      expect(canon1).toBe(canon2);

      const hash1 = computeRequestHash("POST", "/api/v1/test", obj1);
      const hash2 = computeRequestHash("POST", "/api/v1/test", obj2);
      expect(hash1).toBe(hash2);
    });
  });

  describe("2. Horizontal Concurrency Across Simulated Application Instances", () => {
    it("two concurrent instances submitting same key: exactly one acquires, second gets in-flight conflict", async () => {
      const instance1Store = new PostgresIdempotencyStore();
      const instance2Store = new PostgresIdempotencyStore();
      const payload = { tableId: "tbl_1", guestCount: 2 };
      const hash = computeRequestHash("POST", "/api/v1/restaurant/orders", payload);

      // Concurrent race across two store instances
      const [res1, res2] = await Promise.all([
        instance1Store.claim({ tenantId: tenantA, key: testKey, operation: testOperation, requestHash: hash }),
        instance2Store.claim({ tenantId: tenantA, key: testKey, operation: testOperation, requestHash: hash }),
      ]);

      const acquiredCount = [res1, res2].filter((r) => r.status === "ACQUIRED").length;
      const inProgressCount = [res1, res2].filter((r) => r.status === "IN_PROGRESS").length;

      expect(acquiredCount).toBe(1);
      expect(inProgressCount).toBe(1);

      // Verify database has exactly 1 record (no duplicate rows)
      const sql = getDbClient();
      const rows = await sql`
        SELECT count(*)::int as count FROM idempotency_keys
        WHERE tenant_id = ${tenantA} AND operation = ${testOperation} AND idempotency_key = ${testKey};
      `;
      expect(rows[0].count).toBe(1);
    });
  });

  describe("3. Crash Recovery & Lease Management", () => {
    it("claim then explicit failure allows immediate retry acquisition", async () => {
      const payload = { amount: 300 };
      const hash = computeRequestHash("POST", "/api/v1/orders", payload);

      const claim1 = await checkOrAcquireIdempotencyKey(tenantA, testKey, hash, 24, testOperation);
      expect(claim1.acquired).toBe(true);

      // Operation fails before completion
      await releaseIdempotencyKey(tenantA, testKey, testOperation, "Validation failed");

      // Verify immediate retry is allowed
      const retry = await checkOrAcquireIdempotencyKey(tenantA, testKey, hash, 24, testOperation);
      expect(retry.acquired).toBe(true);
    });

    it("expired processing lease allows crashed process recovery", async () => {
      const sql = getDbClient();
      const payload = { step: "crash_test" };
      const hash = computeRequestHash("POST", "/api/v1/orders", payload);

      // Initial claim
      await checkOrAcquireIdempotencyKey(tenantA, testKey, hash, 24, testOperation);

      // Simulate a crashed instance by manually backdating the lease_expires_at to the past
      await sql`
        UPDATE idempotency_keys
        SET lease_expires_at = NOW() - interval '10 seconds'
        WHERE tenant_id = ${tenantA} AND operation = ${testOperation} AND idempotency_key = ${testKey};
      `;

      // New instance attempts retry after lease expiration
      const recoveryInstance = new PostgresIdempotencyStore();
      const result = await recoveryInstance.claim({
        tenantId: tenantA,
        key: testKey,
        operation: testOperation,
        requestHash: hash,
        leaseSeconds: 60,
      });

      expect(result.status).toBe("ACQUIRED");
      expect(result.record.status).toBe("IN_PROGRESS");
    });

    it("completed response survives process restart and re-instantiation", async () => {
      const payload = { orderId: "ord_persisted_999" };
      const hash = computeRequestHash("POST", "/api/v1/orders", payload);

      const instance1 = new PostgresIdempotencyStore();
      await instance1.claim({ tenantId: tenantA, key: testKey, operation: testOperation, requestHash: hash });
      await instance1.complete({
        tenantId: tenantA,
        key: testKey,
        operation: testOperation,
        responseCode: 201,
        responseBody: { success: true, orderId: "ord_persisted_999" },
      });

      // Simulate brand new process spinning up with fresh instance
      const instance2 = new PostgresIdempotencyStore();
      const replay = await instance2.claim({
        tenantId: tenantA,
        key: testKey,
        operation: testOperation,
        requestHash: hash,
      });

      expect(replay.status).toBe("COMPLETED");
      if (replay.status === "COMPLETED") {
        expect(replay.cachedResponse.code).toBe(201);
        expect(replay.cachedResponse.body).toEqual({ success: true, orderId: "ord_persisted_999" });
      }
    });
  });

  describe("4. Multi-Tenant Isolation", () => {
    it("Tenant A and Tenant B can independently acquire the same idempotency key string without cross-talk", async () => {
      const payload = { action: "create" };
      const hash = computeRequestHash("POST", "/api/v1/orders", payload);

      // Tenant A acquires
      const resA = await checkOrAcquireIdempotencyKey(tenantA, testKey, hash, 24, testOperation);
      expect(resA.acquired).toBe(true);

      // Tenant B acquires same key string independently
      const resB = await checkOrAcquireIdempotencyKey(tenantB, testKey, hash, 24, testOperation);
      expect(resB.acquired).toBe(true);

      // Tenant A completes with Response A
      await saveIdempotentResponse(tenantA, testKey, 201, { data: "tenant_A_order" }, testOperation);

      // Tenant B completes with Response B
      await saveIdempotentResponse(tenantB, testKey, 201, { data: "tenant_B_order" }, testOperation);

      // Tenant A replays and receives Tenant A's response
      const replayA = await checkOrAcquireIdempotencyKey(tenantA, testKey, hash, 24, testOperation);
      expect(replayA.cachedResponse?.body).toEqual({ data: "tenant_A_order" });

      // Tenant B replays and receives Tenant B's response
      const replayB = await checkOrAcquireIdempotencyKey(tenantB, testKey, hash, 24, testOperation);
      expect(replayB.cachedResponse?.body).toEqual({ data: "tenant_B_order" });
    });
  });

  describe("5. Expiration & Bounded Cleanup", () => {
    it("cleanup removes expired records while preserving active records", async () => {
      const sql = getDbClient();
      const store = getIdempotencyStore();

      // Active key (expires in 24h)
      const hash1 = computeRequestHash("POST", "/api/v1/test", { id: 1 });
      await store.claim({ tenantId: tenantA, key: "active_key", requestHash: hash1 });
      await store.complete({ tenantId: tenantA, key: "active_key", responseCode: 200, responseBody: { ok: true } });

      // Expired key (backdated to 1 day ago)
      const hash2 = computeRequestHash("POST", "/api/v1/test", { id: 2 });
      await store.claim({ tenantId: tenantA, key: "expired_key", requestHash: hash2 });
      await store.complete({ tenantId: tenantA, key: "expired_key", responseCode: 200, responseBody: { ok: true } });
      await sql`
        UPDATE idempotency_keys
        SET expires_at = NOW() - interval '1 hour'
        WHERE idempotency_key = 'expired_key';
      `;

      // Run cleanup
      const { deletedCount } = await store.cleanup({ limit: 100 });
      expect(deletedCount).toBeGreaterThanOrEqual(1);

      // Verify active key still exists
      const activeRecord = await store.get({ tenantId: tenantA, key: "active_key" });
      expect(activeRecord).not.toBeNull();

      // Verify expired key is deleted
      const expiredRecord = await store.get({ tenantId: tenantA, key: "expired_key" });
      expect(expiredRecord).toBeNull();
    });
  });
});
