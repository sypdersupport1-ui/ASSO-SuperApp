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
  runIdempotentTransaction,
} from "@/lib/api/idempotency";
import { IdempotencyConflictError } from "@/lib/api/errors";
import { getDbClient } from "@/db/client";
import { withPlatformScope, withTenantScope, getPlatformContextToken } from "@/db/rls";

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

  describe("3. Strict Crash Scenarios & Lease Safety (No Double-Execution)", () => {
    it("Crash Scenario 1: Owner crashes before business transaction begins (explicit failure allows clean retry)", async () => {
      const payload = { amount: 300 };
      const hash = computeRequestHash("POST", "/api/v1/orders", payload);

      // Request 1 claims key
      const claim1 = await checkOrAcquireIdempotencyKey(tenantA, testKey, hash, 24, testOperation);
      expect(claim1.acquired).toBe(true);

      // Error caught before business commit; key explicitly released
      await releaseIdempotencyKey(tenantA, testKey, testOperation, "Validation failed before commit");

      // Retry arrives from another instance
      const retry = await checkOrAcquireIdempotencyKey(tenantA, testKey, hash, 24, testOperation);
      expect(retry.acquired).toBe(true);
    });

    it("Crash Scenario 2 & 4: Owner is executing operation; retry from another process is strictly rejected with 409 in-flight conflict", async () => {
      const payload = { step: "in_flight_test" };
      const hash = computeRequestHash("POST", "/api/v1/orders", payload);

      // Instance 1 claims key
      await checkOrAcquireIdempotencyKey(tenantA, testKey, hash, 24, testOperation);

      // Instance 2 arrives while operation is in progress
      await expect(
        checkOrAcquireIdempotencyKey(tenantA, testKey, hash, 24, testOperation)
      ).rejects.toThrow(IdempotencyConflictError);
    });

    it("Crash Scenario 5 & 6: Operation takes longer than the configured lease; retry is STILL rejected (time alone cannot replace active owner)", async () => {
      const sql = getDbClient();
      const payload = { step: "long_running_operation" };
      const hash = computeRequestHash("POST", "/api/v1/orders", payload);

      // Instance 1 claims key
      await checkOrAcquireIdempotencyKey(tenantA, testKey, hash, 24, testOperation);

      // Simulate lease expiration while Instance 1 is still running by backdating lease_expires_at
      await sql`
        UPDATE idempotency_keys
        SET lease_expires_at = NOW() - interval '10 seconds'
        WHERE tenant_id = ${tenantA} AND operation = ${testOperation} AND idempotency_key = ${testKey};
      `;

      // Instance 2 retries: Must NOT be permitted to steal ownership and run duplicate business mutation!
      await expect(
        checkOrAcquireIdempotencyKey(tenantA, testKey, hash, 24, testOperation)
      ).rejects.toThrow(IdempotencyConflictError);

      // Instance 1 eventually finishes and marks COMPLETED
      await saveIdempotentResponse(tenantA, testKey, 201, { success: true, processedBy: "instance_1" }, testOperation);

      // Instance 2 retries now and safely receives REPLAY without duplicate execution!
      const replay = await checkOrAcquireIdempotencyKey(tenantA, testKey, hash, 24, testOperation);
      expect(replay.acquired).toBe(false);
      expect(replay.cachedResponse?.body).toEqual({ success: true, processedBy: "instance_1" });
    });

    it("Crash Scenario 3: Business transaction committed before crash; domain layer prevents duplicate and enables response replay", async () => {
      // In Restaurant R3.2, orders.idempotency_key has a unique constraint in the DB.
      // If a crash occurs after commit but before saveIdempotentResponse, the subsequent retry
      // discovers the existing committed order and safely records the response.
      const sql = getDbClient();
      const orderId = "aaaa1111-0000-0000-0000-000000000999";
      const payload = { guestNotes: "allergic to nuts" };
      const hash = computeRequestHash("POST", "/api/v1/restaurant/orders", payload);

      // 1. Claim key
      await checkOrAcquireIdempotencyKey(tenantA, testKey, hash, 24, testOperation);

      // 2. Business transaction commits order with idempotencyKey into DB
      const outletA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
      const contextA = "cccccccc-cccc-cccc-cccc-cccccccccccc";
      await sql`
        INSERT INTO orders (
          order_id, tenant_id, outlet_id, context_id, order_number, order_source, status, idempotency_key, total_amount
        ) VALUES (
          ${orderId}, ${tenantA}, ${outletA}, ${contextA}, 'ORD-CRASH-001', 'CUSTOMER_WEB', 'PLACED', ${testKey}, 150.00
        ) ON CONFLICT (tenant_id, idempotency_key) WHERE (idempotency_key IS NOT NULL) DO NOTHING;
      `;

      // 3. Process crashes before saveIdempotentResponse was called.
      // 4. Retry arrives: domain check finds existing order by idempotencyKey
      const [existingOrder] = await sql`
        SELECT order_id, order_number, total_amount FROM orders
        WHERE tenant_id = ${tenantA} AND idempotency_key = ${testKey};
      `;
      expect(existingOrder).toBeDefined();
      expect(existingOrder.order_id).toBe(orderId);

      // Response writing is completed using authoritative committed order
      await saveIdempotentResponse(tenantA, testKey, 201, { orderId: existingOrder.order_id }, testOperation);

      // Future retries replay
      const replay = await checkOrAcquireIdempotencyKey(tenantA, testKey, hash, 24, testOperation);
      expect(replay.acquired).toBe(false);
      expect(replay.cachedResponse?.body).toEqual({ orderId });
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

    it("Atomic Idempotent Transaction: commits business change + idempotency completion atomically", async () => {
      const payload = { action: "atomic_test" };
      const hash = computeRequestHash("POST", "/api/v1/atomic", payload);

      // Execute within same transaction
      const result1 = await runIdempotentTransaction(
        { tenantId: tenantA, key: "atomic_key_1", operation: "POST:/api/v1/atomic", requestHash: hash },
        async (tx) => {
          return { statusCode: 201, responsePayload: { counter: 42 }, resourceId: "res_42" };
        }
      );

      expect(result1.isIdempotentReplay).toBe(false);
      expect(result1.statusCode).toBe(201);
      expect(result1.responsePayload).toEqual({ counter: 42 });

      // Immediate retry within atomic transaction replays without running work callback
      let workExecuted = false;
      const result2 = await runIdempotentTransaction(
        { tenantId: tenantA, key: "atomic_key_1", operation: "POST:/api/v1/atomic", requestHash: hash },
        async (tx) => {
          workExecuted = true;
          return { statusCode: 201, responsePayload: { counter: 999 } };
        }
      );

      expect(workExecuted).toBe(false);
      expect(result2.isIdempotentReplay).toBe(true);
      expect(result2.responsePayload).toEqual({ counter: 42 });
    });
  });

  describe("4. Multi-Tenant Isolation & Strict Platform-Wide RLS Security", () => {
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

    it("RLS Isolation: Tenant A cannot read Tenant B's idempotency record under authenticated role", async () => {
      const sql = getDbClient();
      const payload = { secret: "tenant_b_data" };
      const hash = computeRequestHash("POST", "/api/v1/secret", payload);

      // Seed Tenant B key
      await checkOrAcquireIdempotencyKey(tenantB, "tenant_b_secret_key", hash, 24, testOperation);

      // Tenant A queries under authenticated role with app.current_tenant_id = Tenant A
      const rows = await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SELECT set_config('app.current_tenant_id', ${tenantA}, true)`;
        return await tx`SELECT * FROM idempotency_keys WHERE idempotency_key = 'tenant_b_secret_key'`;
      });

      expect(rows.length).toBe(0);
    });

    it("Attack Spoofing 1 & 2: Tenant A attempting to set app.is_platform_context = true or set_config cannot SELECT platform-wide records", async () => {
      const sql = getDbClient();
      const platformKey = "platform_admin_global_key";
      const hash = computeRequestHash("POST", "/api/v1/system", { sys: true });

      // Seed platform-wide record via trusted platform scope
      await withPlatformScope(async (tx) => {
        await tx`
          INSERT INTO idempotency_keys (
            tenant_id, operation, idempotency_key, request_hash, status,
            locked_at, lease_expires_at, expires_at
          ) VALUES (
            NULL, 'PLATFORM_OP', ${platformKey}, ${hash}, 'COMPLETED',
            NOW(), NOW() + interval '120 seconds', NOW() + interval '24 hours'
          )
          ON CONFLICT (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), operation, idempotency_key)
          DO NOTHING;
        `;
      });

      // Attack 1: Tenant A executes SET LOCAL app.is_platform_context = 'true'
      const rows1 = await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SELECT set_config('app.current_tenant_id', ${tenantA}, true)`;
        await tx`SET LOCAL app.is_platform_context = 'true'`;
        return await tx`SELECT * FROM idempotency_keys WHERE idempotency_key = ${platformKey}`;
      });
      expect(rows1.length).toBe(0);

      // Attack 2: Tenant A executes SELECT set_config('app.is_platform_context', 'true', true)
      const rows2 = await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SELECT set_config('app.current_tenant_id', ${tenantA}, true)`;
        await tx`SELECT set_config('app.is_platform_context', 'true', true)`;
        return await tx`SELECT * FROM idempotency_keys WHERE idempotency_key = ${platformKey}`;
      });
      expect(rows2.length).toBe(0);
    });

    it("Attack Spoofing 3: Tenant A attempting UPDATE on platform-wide record is denied (0 rows affected)", async () => {
      const sql = getDbClient();
      const platformKey = "platform_update_attack_key";
      const hash = computeRequestHash("POST", "/api/v1/system", { sys: true });

      await withPlatformScope(async (tx) => {
        await tx`
          INSERT INTO idempotency_keys (
            tenant_id, operation, idempotency_key, request_hash, status,
            locked_at, lease_expires_at, expires_at
          ) VALUES (
            NULL, 'PLATFORM_OP', ${platformKey}, ${hash}, 'COMPLETED',
            NOW(), NOW() + interval '120 seconds', NOW() + interval '24 hours'
          )
          ON CONFLICT (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), operation, idempotency_key)
          DO NOTHING;
        `;
      });

      const updateResult = await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SELECT set_config('app.current_tenant_id', ${tenantA}, true)`;
        await tx`SELECT set_config('app.is_platform_context', 'true', true)`;
        return await tx`UPDATE idempotency_keys SET status = 'FAILED' WHERE idempotency_key = ${platformKey}`;
      });
      expect(updateResult.count).toBe(0);
    });

    it("Attack Spoofing 4: Tenant A attempting DELETE on platform-wide record is denied (0 rows affected)", async () => {
      const sql = getDbClient();
      const platformKey = "platform_delete_attack_key";
      const hash = computeRequestHash("POST", "/api/v1/system", { sys: true });

      await withPlatformScope(async (tx) => {
        await tx`
          INSERT INTO idempotency_keys (
            tenant_id, operation, idempotency_key, request_hash, status,
            locked_at, lease_expires_at, expires_at
          ) VALUES (
            NULL, 'PLATFORM_OP', ${platformKey}, ${hash}, 'COMPLETED',
            NOW(), NOW() + interval '120 seconds', NOW() + interval '24 hours'
          )
          ON CONFLICT (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), operation, idempotency_key)
          DO NOTHING;
        `;
      });

      const deleteResult = await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SELECT set_config('app.current_tenant_id', ${tenantA}, true)`;
        await tx`SELECT set_config('app.is_platform_context', 'true', true)`;
        return await tx`DELETE FROM idempotency_keys WHERE idempotency_key = ${platformKey}`;
      });
      expect(deleteResult.count).toBe(0);

      // Verify row remains in database
      const [record] = await withPlatformScope(async (tx) => {
        return await tx`SELECT * FROM idempotency_keys WHERE idempotency_key = ${platformKey}`;
      });
      expect(record).toBeDefined();
    });

    it("Attack Spoofing 5: Tenant A attempting INSERT of platform-wide record (tenant_id IS NULL) is strictly denied", async () => {
      const sql = getDbClient();
      const hash = computeRequestHash("POST", "/api/v1/system", { spoof: true });

      await expect(
        sql.begin(async (tx) => {
          await tx`SET LOCAL ROLE authenticated`;
          await tx`SELECT set_config('app.current_tenant_id', ${tenantA}, true)`;
          await tx`SELECT set_config('app.is_platform_context', 'true', true)`;
          await tx`
            INSERT INTO idempotency_keys (
              tenant_id, operation, idempotency_key, request_hash, status,
              locked_at, lease_expires_at, expires_at
            ) VALUES (
              NULL, 'PLATFORM_OP', 'spoofed_platform_insert', ${hash}, 'IN_PROGRESS',
              NOW(), NOW() + interval '120 seconds', NOW() + interval '24 hours'
            );
          `;
        })
      ).rejects.toThrow(/violates row-level security policy/i);
    });

    it("Attack Spoofing 6: Tenant A attempting to read private platform secret from asso_private is denied", async () => {
      const sql = getDbClient();

      await expect(
        sql.begin(async (tx) => {
          await tx`SET LOCAL ROLE authenticated`;
          await tx`SELECT set_config('app.current_tenant_id', ${tenantA}, true)`;
          return await tx`SELECT * FROM asso_private.platform_secret`;
        })
      ).rejects.toThrow(/permission denied for schema asso_private/i);
    });

    it("Attack Spoofing 7: Tenant A attempting to pass valid token while in tenant session cannot access platform rows", async () => {
      const sql = getDbClient();
      const token = getPlatformContextToken();
      const platformKey = "platform_token_spoof_key";
      const hash = computeRequestHash("POST", "/api/v1/system", { sys: true });

      await withPlatformScope(async (tx) => {
        await tx`
          INSERT INTO idempotency_keys (
            tenant_id, operation, idempotency_key, request_hash, status,
            locked_at, lease_expires_at, expires_at
          ) VALUES (
            NULL, 'PLATFORM_OP', ${platformKey}, ${hash}, 'COMPLETED',
            NOW(), NOW() + interval '120 seconds', NOW() + interval '24 hours'
          )
          ON CONFLICT (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), operation, idempotency_key)
          DO NOTHING;
        `;
      });

      // Even with token passed, presence of app.current_tenant_id and authenticated role disqualifies platform access
      const rows = await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SELECT set_config('app.current_tenant_id', ${tenantA}, true)`;
        await tx`SELECT set_config('app.platform_context_token', ${token}, true)`;
        return await tx`SELECT * FROM idempotency_keys WHERE idempotency_key = ${platformKey}`;
      });
      expect(rows.length).toBe(0);
    });

    it("Attack Spoofing 8: Tenant A attempting to replay platform key from tenant context receives isolated namespace / cannot hijack platform key", async () => {
      const platformKey = "platform_replay_key";
      const hash = computeRequestHash("POST", "/api/v1/system", { sys: true });

      // Platform creates and completes key
      const store = getIdempotencyStore();
      await store.claim({ tenantId: null, key: platformKey, requestHash: hash, operation: "PLATFORM_OP" });
      await store.complete({
        tenantId: null,
        key: platformKey,
        operation: "PLATFORM_OP",
        responseCode: 200,
        responseBody: { platformSecret: "confidential_system_data" },
      });

      // Tenant A attempts to claim same key string in their tenant context
      const tenantClaim = await checkOrAcquireIdempotencyKey(tenantA, platformKey, hash, 24, "PLATFORM_OP");
      // Tenant A acquires their own fresh key in their tenant namespace, completely isolated from platform
      expect(tenantClaim.acquired).toBe(true);
      expect(tenantClaim.cachedResponse).toBeUndefined();
    });

    it("Trusted Platform Scope: withPlatformScope can create, read, update, and delete platform-wide records", async () => {
      const platformKey = "platform_admin_verified_lifecycle_key";
      const hash = computeRequestHash("POST", "/api/v1/system", { sys: true });

      // Create
      await withPlatformScope(async (tx) => {
        await tx`
          INSERT INTO idempotency_keys (
            tenant_id, operation, idempotency_key, request_hash, status,
            locked_at, lease_expires_at, expires_at
          ) VALUES (
            NULL, 'PLATFORM_OP', ${platformKey}, ${hash}, 'IN_PROGRESS',
            NOW(), NOW() + interval '120 seconds', NOW() + interval '24 hours'
          );
        `;
      });

      // Read
      const rows = await withPlatformScope(async (tx) => {
        return await tx`SELECT * FROM idempotency_keys WHERE idempotency_key = ${platformKey}`;
      });
      expect(rows.length).toBe(1);
      expect(rows[0].idempotency_key).toBe(platformKey);
      expect(rows[0].tenant_id).toBeNull();

      // Update
      const updateResult = await withPlatformScope(async (tx) => {
        return await tx`UPDATE idempotency_keys SET status = 'COMPLETED' WHERE idempotency_key = ${platformKey}`;
      });
      expect(updateResult.count).toBe(1);

      // Delete
      const deleteResult = await withPlatformScope(async (tx) => {
        return await tx`DELETE FROM idempotency_keys WHERE idempotency_key = ${platformKey}`;
      });
      expect(deleteResult.count).toBe(1);
    });

    it("Execution Identity Verification: demonstrates actual PostgreSQL current_user, session_user, and invoker role semantics", async () => {
      const sql = getDbClient();
      const token = getPlatformContextToken();
      const platformKey = "platform_identity_test_key";
      const hash = computeRequestHash("POST", "/api/v1/system", { sys: true });

      // Seed a platform record
      await withPlatformScope(async (tx) => {
        await tx`
          INSERT INTO idempotency_keys (
            tenant_id, operation, idempotency_key, request_hash, status,
            locked_at, lease_expires_at, expires_at
          ) VALUES (
            NULL, 'PLATFORM_OP', ${platformKey}, ${hash}, 'COMPLETED',
            NOW(), NOW() + interval '120 seconds', NOW() + interval '24 hours'
          )
          ON CONFLICT (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), operation, idempotency_key)
          DO NOTHING;
        `;
      });

      // 1, 2, 3: Demonstrate execution identities inside and outside SECURITY DEFINER
      const identities = await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE authenticated`;
        const [outside] = await tx`SELECT current_user, session_user`;
        return { outside };
      });

      // Outside role is authenticated (invoker)
      expect(identities.outside.current_user).toBe("authenticated");
      expect(identities.outside.session_user).toBe("postgres");

      // 4: Tenant request using withTenantScope cannot access platform rows
      const tenantRows = await withTenantScope({ tenantId: tenantA }, async (tx) => {
        return await tx`SELECT * FROM idempotency_keys WHERE idempotency_key = ${platformKey}`;
      });
      expect(tenantRows.length).toBe(0);

      // 5 & 10: Direct attempts to manipulate platform-context GUC do not bypass policy
      const manipulatedRows = await withTenantScope({ tenantId: tenantA }, async (tx) => {
        await tx`SET LOCAL app.is_platform_context = 'true'`;
        await tx`SELECT set_config('app.is_platform_context', 'true', true)`;
        return await tx`SELECT * FROM idempotency_keys WHERE idempotency_key = ${platformKey}`;
      });
      expect(manipulatedRows.length).toBe(0);

      // 6: Tenant request with arbitrary token does not gain access
      const guessedTokenRows = await withTenantScope({ tenantId: tenantA }, async (tx) => {
        await tx`SELECT set_config('app.platform_context_token', 'malicious_guess', true)`;
        return await tx`SELECT * FROM idempotency_keys WHERE idempotency_key = ${platformKey}`;
      });
      expect(guessedTokenRows.length).toBe(0);

      // 7: Tenant request cannot read asso_private.platform_secret
      await expect(
        withTenantScope({ tenantId: tenantA }, async (tx) => {
          return await tx`SELECT * FROM asso_private.platform_secret`;
        })
      ).rejects.toThrow(/permission denied for schema asso_private/i);

      // 8: Trusted withPlatformScope can access platform rows
      const platformRows = await withPlatformScope(async (tx) => {
        return await tx`SELECT * FROM idempotency_keys WHERE idempotency_key = ${platformKey}`;
      });
      expect(platformRows.length).toBe(1);
      expect(platformRows[0].idempotency_key).toBe(platformKey);
      expect(platformRows[0].tenant_id).toBeNull();

      // 9: Cross-tenant access remains strictly blocked
      const crossTenantRows = await withTenantScope({ tenantId: tenantB }, async (tx) => {
        return await tx`SELECT * FROM idempotency_keys WHERE idempotency_key = ${platformKey}`;
      });
      expect(crossTenantRows.length).toBe(0);

      // Cleanup
      await withPlatformScope(async (tx) => {
        await tx`DELETE FROM idempotency_keys WHERE idempotency_key = ${platformKey}`;
      });
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
