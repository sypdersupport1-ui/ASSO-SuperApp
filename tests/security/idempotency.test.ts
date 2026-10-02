import { describe, it, expect, beforeEach } from "vitest";
import {
  computeRequestHash,
  checkOrAcquireIdempotencyKey,
  saveIdempotentResponse,
  clearIdempotencyStore,
} from "@/lib/api/idempotency";
import { IdempotencyConflictError } from "@/lib/api/errors";

describe("API Idempotency Framework Verification", () => {
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const idempotencyKey = "idemp_test_abc123";
  const payload = { amount: 1500, currency: "INR", items: ["item_1"] };

  beforeEach(async () => {
    await clearIdempotencyStore();
  });

  it("1. Fresh request acquires lock (IN_PROGRESS)", async () => {
    const hash = computeRequestHash("POST", "/api/v1/orders", payload);
    const result = await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, hash);

    expect(result.acquired).toBe(true);
    expect(result.cachedResponse).toBeUndefined();
  });

  it("2. Replayed request with matching payload returns cached response", async () => {
    const hash = computeRequestHash("POST", "/api/v1/orders", payload);

    // Initial acquisition & save
    await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, hash);
    const originalResponse = { orderId: "ord_999", status: "PLACED" };
    await saveIdempotentResponse(tenantId, idempotencyKey, 201, originalResponse);

    // Replay attempt
    const replay = await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, hash);
    expect(replay.acquired).toBe(false);
    expect(replay.cachedResponse).toBeDefined();
    expect(replay.cachedResponse?.code).toBe(201);
    expect(replay.cachedResponse?.body).toEqual(originalResponse);
  });

  it("3. Reused key with mismatched payload throws 409 IDEMPOTENCY_CONFLICT", async () => {
    const hash1 = computeRequestHash("POST", "/api/v1/orders", payload);
    await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, hash1);
    await saveIdempotentResponse(tenantId, idempotencyKey, 201, { success: true });

    // Different payload with same key
    const differentPayload = { amount: 9999, currency: "INR" };
    const hash2 = computeRequestHash("POST", "/api/v1/orders", differentPayload);

    await expect(
      checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, hash2)
    ).rejects.toThrow(IdempotencyConflictError);
  });

  it("4. In-flight concurrent request throws 409 conflict", async () => {
    const hash = computeRequestHash("POST", "/api/v1/orders", payload);
    // Acquire without completing
    await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, hash);

    // Concurrent request comes in before completion
    await expect(
      checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, hash)
    ).rejects.toThrow(IdempotencyConflictError);
  });

  it("5. Tenant isolation in idempotency keys (different tenants can use same key string safely)", async () => {
    const tenant2 = "22222222-2222-2222-2222-222222222222";
    const hash = computeRequestHash("POST", "/api/v1/orders", payload);

    // Tenant 1 acquires
    const res1 = await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, hash);
    expect(res1.acquired).toBe(true);

    // Tenant 2 acquires same key string independently
    const res2 = await checkOrAcquireIdempotencyKey(tenant2, idempotencyKey, hash);
    expect(res2.acquired).toBe(true);
  });
});
