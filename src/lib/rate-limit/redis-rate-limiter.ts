import { logger } from "@/lib/logger";
import { RateLimiter, RateLimitPolicy, RateLimitResult } from "./types";

/**
 * UpstashRedisRateLimiter
 * 
 * Replaceable distributed rate limiter provider using Upstash Redis REST API.
 * Uses atomic Redis pipeline: INCR + EXPIRE NX + TTL in a single network roundtrip.
 * Completely decoupled from Node memory and isolated behind the ASSO RateLimiter interface.
 * 
 * Production Invariant:
 * - Operates outside PostgreSQL.
 * - Protects database and application instances from being overwhelmed.
 * - During an outage of the external Redis provider, critical endpoints fail-closed safely
 *   without triggering a destructive database write storm.
 */
export class UpstashRedisRateLimiter implements RateLimiter {
  private url: string;
  private token: string;

  constructor(url?: string, token?: string) {
    this.url = url || process.env.UPSTASH_REDIS_REST_URL || "";
    this.token = token || process.env.UPSTASH_REDIS_REST_TOKEN || "";
  }

  private maskKey(key: string): string {
    if (key.length <= 20) return key;
    return `${key.slice(0, 16)}...[hash]`;
  }

  async check(key: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
    const redisKey = `ratelimit:${policy.category.toLowerCase()}:${key}`;

    try {
      if (!this.url || !this.token) {
        throw new Error("Upstash Redis credentials are not configured");
      }

      // Single atomic pipeline:
      // 1. INCR key
      // 2. EXPIRE key windowSeconds NX (sets expiration only on initial creation)
      // 3. TTL key (returns remaining lifetime)
      const pipelineRes = await fetch(`${this.url}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", redisKey],
          ["EXPIRE", redisKey, policy.windowSeconds, "NX"],
          ["TTL", redisKey],
        ]),
      });

      if (!pipelineRes.ok) {
        throw new Error(`Upstash pipeline error: ${pipelineRes.status} ${pipelineRes.statusText}`);
      }

      const results = (await pipelineRes.json()) as Array<{ result: unknown }>;
      const currentCount = Number(results[0]?.result || 1);
      let ttl = Number(results[2]?.result ?? -1);

      // Fallback: If key had no TTL (e.g. NX not supported or key without expiry), set it explicitly
      if (ttl <= 0) {
        await fetch(`${this.url}/EXPIRE/${encodeURIComponent(redisKey)}/${policy.windowSeconds}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.token}` },
        });
        ttl = policy.windowSeconds;
      }

      const retryAfterSeconds = Math.max(1, ttl);
      const resetAt = new Date(Date.now() + retryAfterSeconds * 1000);
      const allowed = currentCount <= policy.maxRequests;
      const remaining = Math.max(0, policy.maxRequests - currentCount);

      return {
        allowed,
        limit: policy.maxRequests,
        remaining,
        resetAt,
        retryAfterSeconds,
        category: policy.category,
        key,
      };
    } catch (err: unknown) {
      const masked = this.maskKey(redisKey);

      if (policy.failClosed) {
        // Critical endpoints (AUTH, FINANCIAL_MUTATION, WEBHOOK) fail closed to prevent
        // credential attacks, double charges, and database overload during provider failure.
        logger.error({
          message: "Upstash rate limiter unavailable on fail-closed endpoint; safely rejecting request without database storm",
          module: "RATE_LIMIT",
          details: { category: policy.category, key: masked },
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          allowed: false,
          limit: policy.maxRequests,
          remaining: 0,
          resetAt: new Date(Date.now() + 5000), // Bounded 5s cooldown
          retryAfterSeconds: 5,
          category: policy.category,
          key,
        };
      } else {
        // Non-critical read endpoints (CUSTOMER_PUBLIC, ADMIN, GENERAL) fail open with alert
        logger.warn({
          message: "Upstash rate limiter unavailable on fail-open endpoint; allowing request with warning",
          module: "RATE_LIMIT",
          details: { category: policy.category, key: masked },
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          allowed: true,
          limit: policy.maxRequests,
          remaining: 1,
          resetAt: new Date(Date.now() + 1000),
          retryAfterSeconds: 0,
          category: policy.category,
          key,
        };
      }
    }
  }

  async reset(key: string): Promise<void> {
    if (!this.url || !this.token) return;
    const redisKey = `ratelimit:*:${key}`;
    await fetch(`${this.url}/DEL/${encodeURIComponent(redisKey)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
    });
  }

  async cleanupExpired(): Promise<number> {
    // Redis automatically evicts expired keys based on TTL; no manual sweep needed
    return 0;
  }
}
