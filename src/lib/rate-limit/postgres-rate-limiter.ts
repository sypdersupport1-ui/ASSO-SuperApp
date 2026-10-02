import { getDbClient } from "@/db/client";
import { logger } from "@/lib/logger";
import { RateLimiter, RateLimitPolicy, RateLimitResult } from "./types";

/**
 * PostgresRateLimiter
 * 
 * Horizontally scalable distributed rate limiter backed by PostgreSQL.
 * Executes a single atomic Upsert with sliding/fixed window semantics.
 * 
 * Key Architectural Properties:
 * 1. Distributed: Shared across all Node.js / Vercel API instances connecting to the database.
 * 2. Atomic: Zero race conditions or double increments; PostgreSQL row-level locks handle concurrency.
 * 3. Hot-path optimized: Single network round trip; RETURNING count, expires_at.
 * 4. Outside business transactions: Never participates in tenant transactions.
 * 5. Fail-Safe: Implements category-aware fail-closed vs fail-open behavior on database disruption.
 */
export class PostgresRateLimiter implements RateLimiter {
  async check(key: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
    try {
      const sql = getDbClient();

      const [row] = await sql`
        INSERT INTO rate_limits (key, category, count, window_start, expires_at, updated_at)
        VALUES (
          ${key},
          ${policy.category},
          1,
          NOW(),
          NOW() + (${policy.windowSeconds} || ' seconds')::interval,
          NOW()
        )
        ON CONFLICT (key) DO UPDATE
        SET count = CASE
              WHEN rate_limits.expires_at <= NOW() THEN 1
              ELSE rate_limits.count + 1
            END,
            window_start = CASE
              WHEN rate_limits.expires_at <= NOW() THEN NOW()
              ELSE rate_limits.window_start
            END,
            expires_at = CASE
              WHEN rate_limits.expires_at <= NOW() THEN NOW() + (${policy.windowSeconds} || ' seconds')::interval
              ELSE rate_limits.expires_at
            END,
            updated_at = NOW()
        RETURNING count, expires_at;
      `;

      const currentCount = Number(row.count);
      const expiresAt = new Date(row.expires_at);
      const nowMs = Date.now();
      const retryAfterSeconds = Math.min(
        policy.windowSeconds,
        Math.max(0, Math.ceil((expiresAt.getTime() - nowMs) / 1000))
      );
      const allowed = currentCount <= policy.maxRequests;
      const remaining = Math.max(0, policy.maxRequests - currentCount);

      return {
        allowed,
        limit: policy.maxRequests,
        remaining,
        resetAt: expiresAt,
        retryAfterSeconds,
        category: policy.category,
        key,
      };
    } catch (err: unknown) {
      if (policy.failClosed) {
        logger.error({
          message: "PostgresRateLimiter: failure on fail-closed endpoint, rejecting request",
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
          message: "PostgresRateLimiter: failure on fail-open endpoint, allowing request with warning",
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
    const sql = getDbClient();
    await sql`DELETE FROM rate_limits WHERE key = ${key}`;
  }

  async cleanupExpired(limit = 1000): Promise<number> {
    const sql = getDbClient();
    const result = await sql`
      WITH expired AS (
        SELECT key FROM rate_limits WHERE expires_at < NOW() LIMIT ${limit}
      )
      DELETE FROM rate_limits WHERE key IN (SELECT key FROM expired);
    `;
    return result.count;
  }
}
