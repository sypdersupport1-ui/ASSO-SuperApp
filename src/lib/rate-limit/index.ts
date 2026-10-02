import { NextRequest, NextResponse } from "next/server";
import { RateLimiter, RateLimitCategory, RateLimitPolicy, RateLimitResult } from "./types";
import { getRateLimitPolicy } from "./policies";
import { PostgresRateLimiter } from "./postgres-rate-limiter";
import { UpstashRedisRateLimiter } from "./redis-rate-limiter";
import { RateLimitError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";

export * from "./types";
export * from "./policies";
export * from "./postgres-rate-limiter";
export * from "./redis-rate-limiter";

// Global singleton rate limiter instance
let rateLimiterInstance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!rateLimiterInstance) {
    if (
      process.env.RATE_LIMITER_PROVIDER === "redis" ||
      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
    ) {
      rateLimiterInstance = new UpstashRedisRateLimiter();
    } else {
      rateLimiterInstance = new PostgresRateLimiter();
    }
  }
  return rateLimiterInstance;
}

export function setRateLimiter(limiter: RateLimiter): void {
  rateLimiterInstance = limiter;
}

/**
 * Extract client IP reliably from standard forwarding headers
 */
export function extractClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }
  return "127.0.0.1";
}

export interface ResolveKeyOptions {
  category: RateLimitCategory;
  tenantId?: string;
  userId?: string;
  operation?: string;
  customKey?: string;
}

/**
 * Authoritatively derives the rate limit key according to endpoint category and security rules:
 * - Public/Unauthenticated: IP + Category + Context
 * - Authenticated Tenant: Category + TenantId + UserId + Operation
 * Guarantees Tenant A's usage never drains Tenant B's quota.
 */
export function resolveRateLimitKey(req: NextRequest, options: ResolveKeyOptions): { key: string; keyClass: string } {
  const ip = extractClientIp(req);

  if (options.customKey) {
    return {
      key: `custom:${options.category}:${options.customKey}`,
      keyClass: "CUSTOM",
    };
  }

  switch (options.category) {
    case "AUTH": {
      // Key on IP and optional operation
      const op = options.operation || "auth";
      return {
        key: `auth:${op}:ip:${ip}`,
        keyClass: "IP",
      };
    }

    case "CUSTOMER_PUBLIC": {
      // Key on context identifier if available, otherwise IP
      const context = options.operation || "public";
      return {
        key: `customer:${context}:ip:${ip}`,
        keyClass: "IP",
      };
    }

    case "FINANCIAL_MUTATION": {
      // Sensitive mutation: isolate by Tenant and User (or IP if unauthenticated session)
      const op = options.operation || "mutation";
      if (options.tenantId && options.userId) {
        return {
          key: `financial:${options.tenantId}:user:${options.userId}:${op}`,
          keyClass: "TENANT_USER",
        };
      }
      if (options.tenantId) {
        return {
          key: `financial:${options.tenantId}:ip:${ip}:${op}`,
          keyClass: "TENANT_IP",
        };
      }
      return {
        key: `financial:unknown:ip:${ip}:${op}`,
        keyClass: "IP",
      };
    }

    case "ADMIN": {
      if (options.tenantId && options.userId) {
        return {
          key: `admin:${options.tenantId}:user:${options.userId}`,
          keyClass: "TENANT_USER",
        };
      }
      return {
        key: `admin:ip:${ip}`,
        keyClass: "IP",
      };
    }

    case "WEBHOOK": {
      const provider = options.operation || "provider";
      return {
        key: `webhook:${provider}:ip:${ip}`,
        keyClass: "WEBHOOK_IP",
      };
    }

    case "GENERAL":
    default: {
      if (options.tenantId && options.userId) {
        return {
          key: `general:${options.tenantId}:user:${options.userId}`,
          keyClass: "TENANT_USER",
        };
      }
      return {
        key: `general:ip:${ip}`,
        keyClass: "IP",
      };
    }
  }
}

export interface AssertRateLimitOptions extends ResolveKeyOptions {
  policyOverrides?: Partial<RateLimitPolicy>;
  requestId?: string;
}

/**
 * Core enforcement function:
 * Checks rate limit against distributed store, logs structured telemetry,
 * and throws RateLimitError (HTTP 429) if threshold is breached.
 */
export async function assertRateLimit(
  req: NextRequest,
  options: AssertRateLimitOptions
): Promise<RateLimitResult> {
  const limiter = getRateLimiter();
  const { key, keyClass } = resolveRateLimitKey(req, options);
  const policy = getRateLimitPolicy(options.category, options.policyOverrides);

  const result = await limiter.check(key, policy);

  // Observability Preparation (Scale Foundation S3 / S5):
  // Structured logging of all rate limit decisions without logging secrets
  const requestId = options.requestId || req.headers.get("x-request-id") || "req_unknown";
  if (!result.allowed) {
    logger.warn({
      message: "Rate limit breached",
      module: "RATE_LIMIT",
      requestId,
      details: {
        category: policy.category,
        allowed: false,
        keyClass,
        limit: result.limit,
        remaining: result.remaining,
        retryAfterSeconds: result.retryAfterSeconds,
      },
    });

    throw new RateLimitError("Request threshold breached. Please retry after some time.", {
      retryAfterSeconds: result.retryAfterSeconds,
      limit: result.limit,
      remaining: 0,
      category: result.category,
    });
  }

  return result;
}

/**
 * Apply standard HTTP rate limit headers to a NextResponse
 */
export function applyRateLimitHeaders(response: NextResponse, result: RateLimitResult): NextResponse {
  response.headers.set("X-RateLimit-Limit", String(result.limit));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Reset", String(Math.floor(result.resetAt.getTime() / 1000)));
  if (!result.allowed && result.retryAfterSeconds > 0) {
    response.headers.set("Retry-After", String(result.retryAfterSeconds));
  }
  return response;
}
