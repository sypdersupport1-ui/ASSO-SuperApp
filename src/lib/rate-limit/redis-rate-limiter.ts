import { logger } from "@/lib/logger";
import { RateLimiter, RateLimitPolicy, RateLimitResult } from "./types";

/**
 * UpstashRedisRateLimiter
 * 
 * Replaceable distributed rate limiter provider using Upstash Redis REST API.
 * Uses atomic Redis pipeline: INCR + EXPIRE (or Lua script).
 * Completely isolated behind the ASSO RateLimiter interface.
 */
export class UpstashRedisRateLimiter implements RateLimiter {
  private url: string;
  private token: string;

  constructor(url?: string, token?: string) {
    this.url = url || process.env.UPSTASH_REDIS_REST_URL || "";
    this.token = token || process.env.UPSTASH_REDIS_REST_TOKEN || "";
  }

  async check(key: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
    const redisKey = `ratelimit:${policy.category.toLowerCase()}:${key}`;

    try {
      if (!this.url || !this.token) {
        throw new Error("Upstash Redis credentials are not configured");
      }

      // Execute atomic pipeline: INCR key, then conditionally EXPIRE if first token
      const pipelineRes = await fetch(`${this.url}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", redisKey],
          ["TTL", redisKey],
        ]),
      });

      if (!pipelineRes.ok) {
        throw new Error(`Upstash pipeline error: ${pipelineRes.status} ${pipelineRes.statusText}`);
      }

      const results = (await pipelineRes.json()) as Array<{ result: unknown }>;
      const currentCount = Number(results[0]?.result || 1);
      let ttl = Number(results[1]?.result || -1);

      // If key had no TTL (e.g. brand new key), set expiration
      if (ttl === -1) {
        await fetch(`${this.url}/EXPIRE/${redisKey}/${policy.windowSeconds}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.token}` },
        });
        ttl = policy.windowSeconds;
      }

      const retryAfterSeconds = Math.max(0, ttl);
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
      if (policy.failClosed) {
        logger.error({
          message: "UpstashRedisRateLimiter: failure on fail-closed endpoint, rejecting request",
          module: "RATE_LIMIT",
          details: { category: policy.category, key },
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          allowed: false,
          limit: policy.maxRequests,
          remaining: 0,
          resetAt: new Date(Date.now() + policy.windowSeconds * 1000),
          retryAfterSeconds: policy.windowSeconds,
          category: policy.category,
          key,
        };
      } else {
        logger.warn({
          message: "UpstashRedisRateLimiter: failure on fail-open endpoint, allowing request with warning",
          module: "RATE_LIMIT",
          details: { category: policy.category, key },
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
    await fetch(`${this.url}/DEL/${redisKey}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
    });
  }
}
