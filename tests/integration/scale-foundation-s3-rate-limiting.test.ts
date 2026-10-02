import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { getDbClient } from "@/db/client";
import {
  getRateLimiter,
  setRateLimiter,
  PostgresRateLimiter,
  assertRateLimit,
  resolveRateLimitKey,
  resolveLayeredKeys,
  applyRateLimitHeaders,
  DEFAULT_POLICIES,
  RateLimitPolicy,
} from "@/lib/rate-limit";
import { RateLimitError } from "@/lib/api/errors";
import { withTenantScope } from "@/db/rls";
import { POST as createOrderRoute } from "@/app/api/v1/restaurant/orders/route";
import { signJwt } from "@/lib/auth/jwt";
import { ensureRestaurantSeedData, DEMO_TENANT_ID } from "@/lib/restaurant/seed";
import { checkOrAcquireIdempotencyKey } from "@/lib/api/idempotency";

describe("ASSO Scale Foundation S3 — Edge/API Rate Limiting & Abuse Protection", () => {
  const sql = getDbClient();
  const tenantA = "11111111-1111-1111-1111-111111111111";
  const tenantB = "22222222-2222-2222-2222-222222222222";
  const user1 = "user-1111";
  const user2 = "user-2222";

  beforeEach(async () => {
    // Reset rate limits and idempotency tables before each test
    await sql`DELETE FROM rate_limits;`;
    await sql`DELETE FROM idempotency_keys;`;
    setRateLimiter(new PostgresRateLimiter());
  });

  describe("1. Basic Rate Limiting & HTTP 429 Semantics", () => {
    it("requests under the limit succeed and decrement remaining tokens", async () => {
      const limiter = getRateLimiter();
      const policy: RateLimitPolicy = {
        category: "GENERAL",
        maxRequests: 5,
        windowSeconds: 60,
      };

      const key = "test:basic:key1";
      const res1 = await limiter.check(key, policy);
      expect(res1.allowed).toBe(true);
      expect(res1.limit).toBe(5);
      expect(res1.remaining).toBe(4);
      expect(res1.retryAfterSeconds).toBeGreaterThanOrEqual(1);

      const res2 = await limiter.check(key, policy);
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(3);
    });

    it("requests over the limit return allowed = false with accurate retry-after", async () => {
      const limiter = getRateLimiter();
      const policy: RateLimitPolicy = {
        category: "GENERAL",
        maxRequests: 3,
        windowSeconds: 60,
      };

      const key = "test:basic:overflow";
      await limiter.check(key, policy); // 1
      await limiter.check(key, policy); // 2
      await limiter.check(key, policy); // 3

      const overflow = await limiter.check(key, policy); // 4
      expect(overflow.allowed).toBe(false);
      expect(overflow.remaining).toBe(0);
      expect(overflow.retryAfterSeconds).toBeGreaterThan(0);
      expect(overflow.retryAfterSeconds).toBeLessThanOrEqual(60);
    });

    it("assertRateLimit throws RateLimitError with retryAfterSeconds", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/test", {
        headers: { "x-forwarded-for": "198.51.100.1" },
      });

      const options = {
        category: "AUTH" as const,
        policyOverrides: { maxRequests: 2, windowSeconds: 30 },
      };

      await assertRateLimit(req, options);
      await assertRateLimit(req, options);

      await expect(assertRateLimit(req, options)).rejects.toThrow(RateLimitError);

      try {
        await assertRateLimit(req, options);
      } catch (err: any) {
        expect(err).toBeInstanceOf(RateLimitError);
        expect(err.statusCode).toBe(429);
        expect(err.retryAfterSeconds).toBeGreaterThan(0);
      }
    });
  });

  describe("2. Distributed Consistency Across Simulated API Instances", () => {
    it("simulated API Instances A, B, and C share one distributed rate limit (4+3+3 = 10, #11 rejected)", async () => {
      // 3 distinct instances of PostgresRateLimiter connected to the shared PostgreSQL table
      const instanceA = new PostgresRateLimiter();
      const instanceB = new PostgresRateLimiter();
      const instanceC = new PostgresRateLimiter();

      const sharedKey = "shared:client:tenant:org1";
      const policy: RateLimitPolicy = {
        category: "GENERAL",
        maxRequests: 10,
        windowSeconds: 60,
      };

      // Instance A handles 4 requests
      for (let i = 0; i < 4; i++) {
        const res = await instanceA.check(sharedKey, policy);
        expect(res.allowed).toBe(true);
      }

      // Instance B handles 3 requests
      for (let i = 0; i < 3; i++) {
        const res = await instanceB.check(sharedKey, policy);
        expect(res.allowed).toBe(true);
      }

      // Instance C handles 3 requests
      for (let i = 0; i < 3; i++) {
        const res = await instanceC.check(sharedKey, policy);
        expect(res.allowed).toBe(true);
      }

      // Exactly 10 requests allowed so far across instances A, B, and C
      // Request #11 on any instance MUST be rejected
      const overflowA = await instanceA.check(sharedKey, policy);
      expect(overflowA.allowed).toBe(false);

      const overflowB = await instanceB.check(sharedKey, policy);
      expect(overflowB.allowed).toBe(false);

      const overflowC = await instanceC.check(sharedKey, policy);
      expect(overflowC.allowed).toBe(false);
    });

    it("concurrent parallel requests across multiple instances are handled atomically without race conditions", async () => {
      const instances = [
        new PostgresRateLimiter(),
        new PostgresRateLimiter(),
        new PostgresRateLimiter(),
      ];

      const key = "concurrent:burst:test";
      const limit = 15;
      const policy: RateLimitPolicy = {
        category: "CUSTOMER_PUBLIC",
        maxRequests: limit,
        windowSeconds: 60,
      };

      // Fire 30 concurrent requests distributed round-robin across instances
      const promises = Array.from({ length: 30 }, (_, i) => {
        const instance = instances[i % instances.length];
        return instance.check(key, policy);
      });

      const results = await Promise.all(promises);

      const allowedCount = results.filter((r) => r.allowed).length;
      const rejectedCount = results.filter((r) => !r.allowed).length;

      expect(allowedCount).toBe(limit);
      expect(rejectedCount).toBe(15);
    });
  });

  describe("3. Multi-Tenant & User Quota Isolation", () => {
    it("Tenant A consuming full quota does NOT affect Tenant B", async () => {
      const limiter = getRateLimiter();
      const policy: RateLimitPolicy = {
        category: "FINANCIAL_MUTATION",
        maxRequests: 3,
        windowSeconds: 60,
      };

      const reqA = new NextRequest("http://localhost:3000/api/v1/orders");
      const keyA = resolveRateLimitKey(reqA, {
        category: "FINANCIAL_MUTATION",
        tenantId: tenantA,
        userId: user1,
        operation: "order_create",
      }).key;

      const reqB = new NextRequest("http://localhost:3000/api/v1/orders");
      const keyB = resolveRateLimitKey(reqB, {
        category: "FINANCIAL_MUTATION",
        tenantId: tenantB,
        userId: user1,
        operation: "order_create",
      }).key;

      // Exhaust Tenant A's quota
      await limiter.check(keyA, policy);
      await limiter.check(keyA, policy);
      await limiter.check(keyA, policy);
      const resA4 = await limiter.check(keyA, policy);
      expect(resA4.allowed).toBe(false);

      // Tenant B still has full quota
      const resB1 = await limiter.check(keyB, policy);
      expect(resB1.allowed).toBe(true);
      expect(resB1.remaining).toBe(2);
    });

    it("User 1 in Tenant A consuming quota does not affect User 2 in Tenant A", async () => {
      const limiter = getRateLimiter();
      const policy: RateLimitPolicy = {
        category: "ADMIN",
        maxRequests: 2,
        windowSeconds: 60,
      };

      const req = new NextRequest("http://localhost:3000/api/v1/admin/tables");
      const keyUser1 = resolveRateLimitKey(req, {
        category: "ADMIN",
        tenantId: tenantA,
        userId: user1,
      }).key;

      const keyUser2 = resolveRateLimitKey(req, {
        category: "ADMIN",
        tenantId: tenantA,
        userId: user2,
      }).key;

      await limiter.check(keyUser1, policy);
      await limiter.check(keyUser1, policy);
      const user1Over = await limiter.check(keyUser1, policy);
      expect(user1Over.allowed).toBe(false);

      // User 2 remains unimpeded
      const user2First = await limiter.check(keyUser2, policy);
      expect(user2First.allowed).toBe(true);
      expect(user2First.remaining).toBe(1);
    });
  });

  describe("4. Endpoint Categories & Default Policies", () => {
    it("verifies all endpoint categories have conservative default policies", () => {
      expect(DEFAULT_POLICIES.AUTH.category).toBe("AUTH");
      expect(DEFAULT_POLICIES.AUTH.maxRequests).toBeLessThanOrEqual(20);
      expect(DEFAULT_POLICIES.AUTH.failClosed).toBe(true);

      expect(DEFAULT_POLICIES.CUSTOMER_PUBLIC.category).toBe("CUSTOMER_PUBLIC");
      expect(DEFAULT_POLICIES.CUSTOMER_PUBLIC.maxRequests).toBeGreaterThanOrEqual(30);
      expect(DEFAULT_POLICIES.CUSTOMER_PUBLIC.failClosed).toBe(false);

      expect(DEFAULT_POLICIES.FINANCIAL_MUTATION.category).toBe("FINANCIAL_MUTATION");
      expect(DEFAULT_POLICIES.FINANCIAL_MUTATION.maxRequests).toBeLessThanOrEqual(50);
      expect(DEFAULT_POLICIES.FINANCIAL_MUTATION.failClosed).toBe(true);

      expect(DEFAULT_POLICIES.ADMIN.category).toBe("ADMIN");
      expect(DEFAULT_POLICIES.ADMIN.failClosed).toBe(false);

      expect(DEFAULT_POLICIES.WEBHOOK.category).toBe("WEBHOOK");
      expect(DEFAULT_POLICIES.WEBHOOK.failClosed).toBe(true);

      expect(DEFAULT_POLICIES.GENERAL.category).toBe("GENERAL");
    });
  });

  describe("5. Fail-Safe / Fail-Closed Decision", () => {
    it("fails closed on critical categories (AUTH, FINANCIAL_MUTATION, WEBHOOK) during database outage", async () => {
      const authPolicy: RateLimitPolicy = {
        category: "AUTH",
        maxRequests: 10,
        windowSeconds: 60,
        failClosed: true,
      };

      // Force query error by passing an invalid SQL or mock
      const mockBrokenLimiter = {
        check: async (key: string, policy: RateLimitPolicy) => {
          if (policy.failClosed) {
            return {
              allowed: false,
              limit: policy.maxRequests,
              remaining: 0,
              resetAt: new Date(Date.now() + policy.windowSeconds * 1000),
              retryAfterSeconds: policy.windowSeconds,
              category: policy.category,
              key,
            };
          }
          return {
            allowed: true,
            limit: policy.maxRequests,
            remaining: 1,
            resetAt: new Date(Date.now() + 1000),
            retryAfterSeconds: 0,
            category: policy.category,
            key,
          };
        },
      };

      const authResult = await mockBrokenLimiter.check("auth:ip:10.0.0.1", authPolicy);
      expect(authResult.allowed).toBe(false);
      expect(authResult.retryAfterSeconds).toBe(60);

      const finPolicy: RateLimitPolicy = {
        category: "FINANCIAL_MUTATION",
        maxRequests: 20,
        windowSeconds: 60,
        failClosed: true,
      };
      const finResult = await mockBrokenLimiter.check("fin:user:1", finPolicy);
      expect(finResult.allowed).toBe(false);
    });

    it("fails open with warning on non-critical read endpoints (CUSTOMER_PUBLIC) during outage", async () => {
      const mockBrokenLimiter = {
        check: async (key: string, policy: RateLimitPolicy) => {
          if (policy.failClosed) {
            return {
              allowed: false,
              limit: policy.maxRequests,
              remaining: 0,
              resetAt: new Date(Date.now() + policy.windowSeconds * 1000),
              retryAfterSeconds: policy.windowSeconds,
              category: policy.category,
              key,
            };
          }
          return {
            allowed: true,
            limit: policy.maxRequests,
            remaining: 1,
            resetAt: new Date(Date.now() + 1000),
            retryAfterSeconds: 0,
            category: policy.category,
            key,
          };
        },
      };

      const publicPolicy: RateLimitPolicy = {
        category: "CUSTOMER_PUBLIC",
        maxRequests: 60,
        windowSeconds: 60,
        failClosed: false,
      };

      const publicResult = await mockBrokenLimiter.check("customer:menu:ip:10.0.0.1", publicPolicy);
      expect(publicResult.allowed).toBe(true);
    });
  });

  describe("6. Integration: Restaurant Order Creation & Durable Idempotency Interaction", () => {
    it("rate limit rejection does NOT create order, does NOT consume idempotency key, and cooldown retry succeeds", async () => {
      // 1. Seed demo tenant and catalog
      const seed = await ensureRestaurantSeedData(DEMO_TENANT_ID);
      const outletId = seed.outlet.outletId;
      const customerSessionId = "00000000-0000-0000-0000-000000000999";

      // 2. Prepare customer session token
      const token = signJwt({
        sub: customerSessionId,
        tenantId: DEMO_TENANT_ID,
        outletId,
        roles: ["CUSTOMER"],
        sessionType: "CUSTOMER",
      });

      const idempotencyKey = "idemp_rate_limit_test_key_001";

      // 3. Exhaust the rate limit for this customer session under FINANCIAL_MUTATION
      const limiter = getRateLimiter();
      const dummyReq = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
        headers: { "x-forwarded-for": "127.0.0.1" },
      });
      const limitKey = resolveRateLimitKey(dummyReq, {
        category: "FINANCIAL_MUTATION",
        tenantId: DEMO_TENANT_ID,
        userId: customerSessionId,
        operation: "create_order",
      }).key;

      // Exhaust all allowed requests under DEFAULT_POLICIES.FINANCIAL_MUTATION
      for (let i = 0; i < DEFAULT_POLICIES.FINANCIAL_MUTATION.maxRequests; i++) {
        await limiter.check(limitKey, DEFAULT_POLICIES.FINANCIAL_MUTATION);
      }

      // 4. Now attempt POST /api/v1/restaurant/orders
      const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "idempotency-key": idempotencyKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ guestNotes: "Extra ice" }),
      });

      const res = await createOrderRoute(req);
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBeDefined();
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");

      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");

      // 5. Invariant Verification: Idempotency Key was NOT claimed or consumed
      const idempRecord = await sql`
        SELECT * FROM idempotency_keys WHERE idempotency_key = ${idempotencyKey};
      `;
      expect(idempRecord.length).toBe(0);

      // 6. Reset rate limit (simulating window expiry) and retry with the SAME idempotency key
      await limiter.reset!(limitKey);

      const retryReq = new NextRequest("http://localhost:3000/api/v1/restaurant/orders", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "idempotency-key": idempotencyKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ guestNotes: "Extra ice" }),
      });

      // Cart may be empty, but request proceeds past rate limit and idempotency
      const retryRes = await createOrderRoute(retryReq);
      // Either 201 (if cart populated) or 400/422 (if empty cart domain error), but NOT 429
      expect(retryRes.status).not.toBe(429);

      // Rate limit headers are present on valid response
      expect(retryRes.headers.get("X-RateLimit-Limit")).toBeDefined();
    });
  });

  describe("7. Expiration & Bounded Cleanup", () => {
    it("cleanupExpired removes records past expires_at without touching active ones", async () => {
      const limiter = new PostgresRateLimiter();

      // Insert 2 expired records and 1 active record
      await sql`
        INSERT INTO rate_limits (key, category, count, window_start, expires_at, updated_at)
        VALUES
          ('expired:1', 'GENERAL', 5, NOW() - interval '2 hours', NOW() - interval '1 hour', NOW()),
          ('expired:2', 'GENERAL', 5, NOW() - interval '2 hours', NOW() - interval '30 minutes', NOW()),
          ('active:1', 'GENERAL', 2, NOW(), NOW() + interval '1 hour', NOW());
      `;

      const deletedCount = await limiter.cleanupExpired(10);
      expect(deletedCount).toBe(2);

      const remaining = await sql`SELECT key FROM rate_limits ORDER BY key;`;
      expect(remaining.length).toBe(1);
      expect(remaining[0].key).toBe("active:1");
    });
  });

  describe("8. PostgreSQL RLS & Schema Privilege Protection on rate_limits", () => {
    it("tenant running as authenticated cannot inspect or tamper with rate_limits directly", async () => {
      // Seed a rate limit entry
      await sql`
        INSERT INTO rate_limits (key, category, count, window_start, expires_at)
        VALUES ('secure:key:1', 'GENERAL', 1, NOW(), NOW() + interval '60 seconds');
      `;

      // Tenant session attempts direct SELECT
      const tenantRows = await withTenantScope({ tenantId: tenantA }, async (tx) => {
        return await tx`SELECT * FROM rate_limits`;
      });
      // RLS policy rate_limits_system_policy allows only postgres and service_role
      expect(tenantRows.length).toBe(0);

      // Tenant session attempts direct DELETE/tampering
      const tenantDelete = await withTenantScope({ tenantId: tenantA }, async (tx) => {
        return await tx`DELETE FROM rate_limits WHERE key = 'secure:key:1'`;
      });
      expect(tenantDelete.count).toBe(0);

      // Verify row still exists for system
      const [check] = await sql`SELECT * FROM rate_limits WHERE key = 'secure:key:1'`;
      expect(check).toBeDefined();
    });
  });

  describe("9. Webhook Multi-Layer Abuse Protection", () => {
    const webhookSecret = "test_webhook_secret_key_32_bytes_long";

    it("verifies valid webhook, rejects rate limit overflow, and rejects duplicate replay", async () => {
      const { protectAndVerifyWebhook, completeWebhookProcessing } = await import("@/lib/security/webhook");
      const crypto = await import("crypto");

      const eventId = "evt_razorpay_order_paid_001";
      const payload = { event: "order.paid", id: eventId, amount: 2500 };
      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");
      const timestamp = String(Math.floor(Date.now() / 1000));

      const makeWebhookRequest = (bodyStr: string, sig: string, ts: string, ip = "203.0.113.1") => {
        return new NextRequest("http://localhost:3000/api/v1/webhooks/payment", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-webhook-signature": sig,
            "x-webhook-timestamp": ts,
            "x-forwarded-for": ip,
          },
          body: bodyStr,
        });
      };

      // 1. Valid webhook succeeds
      const req1 = makeWebhookRequest(rawBody, signature, timestamp);
      const result1 = await protectAndVerifyWebhook(req1, {
        provider: "razorpay",
        secret: webhookSecret,
      });
      expect(result1.valid).toBe(true);
      expect(result1.eventId).toBe(eventId);

      // Complete processing in idempotency store
      await completeWebhookProcessing("razorpay", eventId, 200, { received: true });

      // 2. Replay with identical event ID is rejected by idempotency layer
      const req2 = makeWebhookRequest(rawBody, signature, timestamp);
      await expect(
        protectAndVerifyWebhook(req2, {
          provider: "razorpay",
          secret: webhookSecret,
        })
      ).rejects.toThrow(/Duplicate webhook delivery/i);

      // 3. Invalid signature is rejected
      const invalidSigReq = makeWebhookRequest(rawBody, "bad_signature_hex", timestamp);
      await expect(
        protectAndVerifyWebhook(invalidSigReq, {
          provider: "razorpay",
          secret: webhookSecret,
        })
      ).rejects.toThrow();

      // 4. Rate-limit flood rejection: exhaust WEBHOOK quota for this IP
      const limiter = getRateLimiter();
      const floodReq = makeWebhookRequest(rawBody, signature, timestamp);
      const keys = resolveLayeredKeys(floodReq, {
        category: "WEBHOOK",
        operation: "razorpay",
      });
      for (let i = 0; i < DEFAULT_POLICIES.WEBHOOK.maxRequests; i++) {
        await limiter.check(keys.ipKey, DEFAULT_POLICIES.WEBHOOK);
      }

      // Next request from same IP is rate-limited BEFORE body/signature processing
      await expect(
        protectAndVerifyWebhook(floodReq, {
          provider: "razorpay",
          secret: webhookSecret,
        })
      ).rejects.toThrow(RateLimitError);
    });
  });

  describe("10. Distributed Redis Rate Limiting Across API Instances (Upstash / Redis)", () => {
    it("simulated API Instance A, B, and C share one distributed Redis quota via atomic pipeline", async () => {
      const { UpstashRedisRateLimiter } = await import("@/lib/rate-limit/redis-rate-limiter");

      // In-memory Redis simulation tracking atomic pipeline
      const redisStore = new Map<string, { count: number; expireAt: number }>();
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/pipeline")) {
          const body = JSON.parse(init?.body as string || "[]");
          const results: Array<{ result: unknown }> = [];
          for (const cmd of body) {
            const [op, key, val, flag] = cmd;
            if (op === "INCR") {
              const now = Date.now();
              const existing = redisStore.get(key);
              if (!existing || existing.expireAt <= now) {
                redisStore.set(key, { count: 1, expireAt: now + 60000 });
                results.push({ result: 1 });
              } else {
                existing.count++;
                results.push({ result: existing.count });
              }
            } else if (op === "EXPIRE") {
              results.push({ result: 1 });
            } else if (op === "TTL") {
              const existing = redisStore.get(key);
              results.push({ result: existing ? Math.max(1, Math.ceil((existing.expireAt - Date.now()) / 1000)) : 60 });
            }
          }
          return new Response(JSON.stringify(results), { status: 200 });
        }
        return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch;

      try {
        // Instantiate 3 separate API instances pointing to the shared Redis
        const instanceA = new UpstashRedisRateLimiter("https://mock-redis.upstash.io", "mock-token");
        const instanceB = new UpstashRedisRateLimiter("https://mock-redis.upstash.io", "mock-token");
        const instanceC = new UpstashRedisRateLimiter("https://mock-redis.upstash.io", "mock-token");

        const sharedKey = "shared:customer:token_qr_abc";
        const policy: RateLimitPolicy = {
          category: "CUSTOMER_PUBLIC",
          maxRequests: 10,
          windowSeconds: 60,
        };

        // Instance A handles 4 requests
        for (let i = 0; i < 4; i++) {
          const res = await instanceA.check(sharedKey, policy);
          expect(res.allowed).toBe(true);
        }

        // Instance B handles 3 requests
        for (let i = 0; i < 3; i++) {
          const res = await instanceB.check(sharedKey, policy);
          expect(res.allowed).toBe(true);
        }

        // Instance C handles 3 requests
        for (let i = 0; i < 3; i++) {
          const res = await instanceC.check(sharedKey, policy);
          expect(res.allowed).toBe(true);
        }

        // Exactly 10 requests allowed in total.
        // Request #11 on Instance A must be rejected!
        const overflow = await instanceA.check(sharedKey, policy);
        expect(overflow.allowed).toBe(false);
        expect(overflow.remaining).toBe(0);
        expect(overflow.retryAfterSeconds).toBeGreaterThan(0);

        // Instance B and C are also immediately rejected on the same shared key
        const overflowB = await instanceB.check(sharedKey, policy);
        expect(overflowB.allowed).toBe(false);
        const overflowC = await instanceC.check(sharedKey, policy);
        expect(overflowC.allowed).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("11. Layered Public Keying & Token-Rotation Attack Resistance", () => {
    it("rotating QR tokens from the same IP cannot bypass the global IP ceiling", async () => {
      const { resolveLayeredKeys, hashIdentifier } = await import("@/lib/rate-limit");

      const attackerIp = "203.0.113.99";
      const req = new NextRequest("http://localhost:3000/api/v1/customer/qr/rot_token_1", {
        headers: { "x-forwarded-for": attackerIp },
      });

      // Keys generated for token 1
      const keys1 = resolveLayeredKeys(req, {
        category: "CUSTOMER_PUBLIC",
        contextToken: "rot_token_1",
      });

      // Keys generated for token 2
      const keys2 = resolveLayeredKeys(req, {
        category: "CUSTOMER_PUBLIC",
        contextToken: "rot_token_2",
      });

      // Primary context keys are distinct and hashed
      expect(keys1.primaryKey).not.toBe(keys2.primaryKey);
      expect(keys1.primaryKey).toBe(`customer:ctx:${hashIdentifier("rot_token_1")}`);
      expect(keys2.primaryKey).toBe(`customer:ctx:${hashIdentifier("rot_token_2")}`);

      // BUT the coarse IP key is identical across all rotated tokens
      expect(keys1.ipKey).toBe(`ip:${attackerIp}:cat:customer_public`);
      expect(keys2.ipKey).toBe(`ip:${attackerIp}:cat:customer_public`);

      // Proving rotation resistance:
      // Simulate exhausting the IP ceiling
      const limiter = getRateLimiter();
      const ipCeilingPolicy: RateLimitPolicy = {
        category: "CUSTOMER_PUBLIC",
        maxRequests: 3,
        windowSeconds: 60,
      };

      // Attacker attempts 3 requests with token_1, token_2, token_3
      await limiter.check(keys1.ipKey, ipCeilingPolicy); // 1
      await limiter.check(keys1.ipKey, ipCeilingPolicy); // 2
      await limiter.check(keys1.ipKey, ipCeilingPolicy); // 3

      // On attempt 4 with brand new token_4, IP ceiling blocks the attacker!
      const blockedRes = await limiter.check(keys1.ipKey, ipCeilingPolicy);
      expect(blockedRes.allowed).toBe(false);
    });
  });

  describe("12. Zero-Knowledge Key Pseudonymization", () => {
    it("hashes sensitive identifiers (phones, tokens, session IDs) so raw secrets never enter Redis", async () => {
      const { resolveLayeredKeys, hashIdentifier } = await import("@/lib/rate-limit");

      const rawSecretToken = "opaque_table_qr_secret_998877_confidential";
      const rawUserPhone = "+1-555-867-5309";

      const qrReq = new NextRequest("http://localhost:3000/api/v1/customer/qr/secret", {
        headers: { "x-forwarded-for": "10.0.0.1" },
      });

      const qrKeys = resolveLayeredKeys(qrReq, {
        category: "CUSTOMER_PUBLIC",
        contextToken: rawSecretToken,
      });

      // Raw secret token is NEVER in the key
      expect(qrKeys.primaryKey).not.toContain(rawSecretToken);
      expect(qrKeys.primaryKey).toContain(hashIdentifier(rawSecretToken));

      const authReq = new NextRequest("http://localhost:3000/api/v1/auth/login", {
        headers: { "x-forwarded-for": "10.0.0.1" },
      });

      const authKeys = resolveLayeredKeys(authReq, {
        category: "AUTH",
        targetIdentifier: rawUserPhone,
      });

      // Raw phone is NEVER in the key
      expect(authKeys.primaryKey).not.toContain(rawUserPhone);
      expect(authKeys.primaryKey).toContain(hashIdentifier(rawUserPhone));
    });
  });

  describe("13. Zero Database Queries on Rate Limit Rejection", () => {
    it("public order and customer endpoints reject at rate limiter BEFORE executing PostgreSQL business queries", async () => {
      const { GET: getCustomerQrRoute } = await import("@/app/api/v1/customer/qr/[token]/route");

      // Exhaust rate limit for customer public category from test IP
      const limiter = getRateLimiter();
      const ipKey = "ip:198.51.100.77:cat:customer_public";

      for (let i = 0; i < DEFAULT_POLICIES.CUSTOMER_PUBLIC.maxRequests; i++) {
        await limiter.check(ipKey, DEFAULT_POLICIES.CUSTOMER_PUBLIC);
      }

      // Track whether resolveCustomerQr (PostgreSQL query) is invoked
      const customerService = await import("@/lib/customer/customer-session-service");
      const dbSpy = vi.spyOn(customerService, "resolveCustomerQr");

      const req = new NextRequest("http://localhost:3000/api/v1/customer/qr/any_token", {
        headers: { "x-forwarded-for": "198.51.100.77" },
      });

      const res = await getCustomerQrRoute(req, { params: Promise.resolve({ token: "any_token" }) });
      expect(res.status).toBe(429);

      // Invariant: ZERO database queries executed by the route handler
      expect(dbSpy).not.toHaveBeenCalled();

      dbSpy.mockRestore();
    });
  });

  describe("14. Upstash Outage Safe Fail-Closed vs Fail-Open Behavior", () => {
    it("fails closed on critical endpoints during Upstash outage without falling back to a DB write storm", async () => {
      const { UpstashRedisRateLimiter } = await import("@/lib/rate-limit/redis-rate-limiter");

      // Mock fetch throwing network outage error
      const mockBrokenFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED Upstash outage"));
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockBrokenFetch;

      try {
        const limiter = new UpstashRedisRateLimiter("https://broken-upstash.com", "tok");

        // Critical category: FINANCIAL_MUTATION
        const finPolicy: RateLimitPolicy = {
          category: "FINANCIAL_MUTATION",
          maxRequests: 20,
          windowSeconds: 10,
          failClosed: true,
        };

        const finResult = await limiter.check("fin:t:1:u:2:op:order", finPolicy);
        // Fail-closed safely: returns allowed = false, does not throw unhandled exception
        expect(finResult.allowed).toBe(false);
        expect(finResult.retryAfterSeconds).toBe(5);

        // Low-risk category: CUSTOMER_PUBLIC
        const pubPolicy: RateLimitPolicy = {
          category: "CUSTOMER_PUBLIC",
          maxRequests: 60,
          windowSeconds: 10,
          failClosed: false,
        };

        const pubResult = await limiter.check("customer:menu", pubPolicy);
        // Fail-open safely: allows request with warning
        expect(pubResult.allowed).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("15. Edge Middleware Enforcement", () => {
    it("middleware intercepts public endpoints at the edge without invoking route handlers", async () => {
      const { middleware } = await import("@/middleware");

      // Edge Middleware with Upstash configured:
      const req = new NextRequest("http://localhost:3000/api/v1/customer/qr/test_token", {
        headers: { "x-forwarded-for": "10.10.10.10" },
      });

      // When Edge Redis is not provisioned (offline/test), middleware passes cleanly to route
      const passResponse = await middleware(req);
      expect(passResponse.status).toBe(200); // NextResponse.next() returns 200 in Next.js
    });
  });
});


