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

import { createHash } from "crypto";

export function hashIdentifier(val: string): string {
  if (!val) return "anon";
  return createHash("sha256").update(val.trim()).digest("hex").slice(0, 16);
}

export interface ResolveKeyOptions {
  category: RateLimitCategory;
  tenantId?: string;
  userId?: string;
  operation?: string;
  contextToken?: string;
  targetIdentifier?: string;
  customKey?: string;
}

export interface LayeredRateLimitKeys {
  ipKey: string;
  ipKeyClass: string;
  primaryKey: string;
  primaryKeyClass: string;
}

/**
 * Derives layered rate limit keys:
 * 1. ipKey: Coarse global IP ceiling (mitigates token rotation, URL rotation, scraping)
 * 2. primaryKey: Fine-grained context/target/tenant quota
 * 
 * Sensitive tokens, phones, and identifiers are hashed with SHA-256 before transmission.
 */
export function resolveLayeredKeys(req: NextRequest, options: ResolveKeyOptions): LayeredRateLimitKeys {
  const ip = extractClientIp(req);
  const ipKey = `ip:${ip}:cat:${options.category.toLowerCase()}`;
  const ipKeyClass = "IP";

  if (options.customKey) {
    return {
      ipKey,
      ipKeyClass,
      primaryKey: `custom:${options.category}:${options.customKey}`,
      primaryKeyClass: "CUSTOM",
    };
  }

  switch (options.category) {
    case "AUTH": {
      const target = options.targetIdentifier 
        ? `target:${hashIdentifier(options.targetIdentifier)}` 
        : `ip:${ip}`;
      return {
        ipKey,
        ipKeyClass,
        primaryKey: `auth:${options.operation || "login"}:${target}`,
        primaryKeyClass: options.targetIdentifier ? "TARGET_ACCOUNT" : "IP",
      };
    }

    case "CUSTOMER_PUBLIC": {
      const ctx = options.contextToken
        ? `ctx:${hashIdentifier(options.contextToken)}`
        : (options.operation ? `op:${options.operation}` : `ip:${ip}`);
      return {
        ipKey,
        ipKeyClass,
        primaryKey: `customer:${ctx}`,
        primaryKeyClass: options.contextToken ? "CONTEXT_TOKEN" : "IP",
      };
    }

    case "FINANCIAL_MUTATION": {
      const op = options.operation || "mutation";
      if (options.tenantId && options.userId) {
        return {
          ipKey,
          ipKeyClass,
          primaryKey: `fin:t:${options.tenantId}:u:${hashIdentifier(options.userId)}:op:${op}`,
          primaryKeyClass: "TENANT_USER",
        };
      }
      if (options.tenantId) {
        return {
          ipKey,
          ipKeyClass,
          primaryKey: `fin:t:${options.tenantId}:ip:${ip}:op:${op}`,
          primaryKeyClass: "TENANT_IP",
        };
      }
      return {
        ipKey,
        ipKeyClass,
        primaryKey: `fin:unknown:ip:${ip}:op:${op}`,
        primaryKeyClass: "IP",
      };
    }

    case "ADMIN": {
      if (options.tenantId && options.userId) {
        return {
          ipKey,
          ipKeyClass,
          primaryKey: `admin:t:${options.tenantId}:u:${hashIdentifier(options.userId)}`,
          primaryKeyClass: "TENANT_USER",
        };
      }
      return {
        ipKey,
        ipKeyClass,
        primaryKey: `admin:ip:${ip}`,
        primaryKeyClass: "IP",
      };
    }

    case "WEBHOOK": {
      const provider = options.operation || "provider";
      return {
        ipKey,
        ipKeyClass,
        primaryKey: `webhook:provider:${provider}`,
        primaryKeyClass: "WEBHOOK_PROVIDER",
      };
    }

    case "GENERAL":
    default: {
      if (options.tenantId && options.userId) {
        return {
          ipKey,
          ipKeyClass,
          primaryKey: `gen:t:${options.tenantId}:u:${hashIdentifier(options.userId)}`,
          primaryKeyClass: "TENANT_USER",
        };
      }
      return {
        ipKey,
        ipKeyClass,
        primaryKey: `gen:ip:${ip}`,
        primaryKeyClass: "IP",
      };
    }
  }
}

/**
 * Authoritatively derives the rate limit key according to endpoint category and security rules:
 * Backwards compatible with legacy callers.
 */
export function resolveRateLimitKey(req: NextRequest, options: ResolveKeyOptions): { key: string; keyClass: string } {
  const layered = resolveLayeredKeys(req, options);
  return {
    key: layered.primaryKey,
    keyClass: layered.primaryKeyClass,
  };
}

export interface AssertRateLimitOptions extends ResolveKeyOptions {
  policyOverrides?: Partial<RateLimitPolicy>;
  requestId?: string;
}

/**
 * Core enforcement function:
 * Checks dual-layer rate limits against distributed store:
 * Layer 1: Coarse Edge/IP Ceiling (blocks flood and rotation attacks)
 * Layer 2: Specific Tenant / User / Context Quota
 * 
 * Logs structured telemetry without leaking sensitive values.
 * Throws RateLimitError (HTTP 429) if threshold is breached.
 */
export async function assertRateLimit(
  req: NextRequest,
  options: AssertRateLimitOptions
): Promise<RateLimitResult> {
  const limiter = getRateLimiter();
  const keys = resolveLayeredKeys(req, options);
  const policy = getRateLimitPolicy(options.category, options.policyOverrides);
  const ipPolicy = getRateLimitPolicy(options.category, {
    maxRequests: Math.max(policy.maxRequests, options.category === "CUSTOMER_PUBLIC" ? 60 : 30),
    windowSeconds: policy.windowSeconds,
  });

  const requestId = options.requestId || req.headers.get("x-request-id") || "req_unknown";

  // Layer 1: Coarse IP Ceiling (unless customKey is used)
  if (!options.customKey && keys.ipKey) {
    const ipResult = await limiter.check(keys.ipKey, ipPolicy);
    if (!ipResult.allowed) {
      logger.warn({
        message: "Rate limit breached at IP ceiling",
        module: "RATE_LIMIT",
        requestId,
        details: {
          category: policy.category,
          allowed: false,
          keyClass: keys.ipKeyClass,
          limit: ipResult.limit,
          remaining: 0,
          retryAfterSeconds: ipResult.retryAfterSeconds,
        },
      });

      throw new RateLimitError("Request threshold breached at network edge. Please retry after cooldown.", {
        retryAfterSeconds: ipResult.retryAfterSeconds,
        limit: ipResult.limit,
        remaining: 0,
        category: ipResult.category,
      });
    }
  }

  // Layer 2: Context / Tenant / User Specific Limit
  const primaryResult = await limiter.check(keys.primaryKey, policy);

  if (!primaryResult.allowed) {
    logger.warn({
      message: "Rate limit breached on target quota",
      module: "RATE_LIMIT",
      requestId,
      details: {
        category: policy.category,
        allowed: false,
        keyClass: keys.primaryKeyClass,
        limit: primaryResult.limit,
        remaining: primaryResult.remaining,
        retryAfterSeconds: primaryResult.retryAfterSeconds,
      },
    });

    throw new RateLimitError("Request threshold breached. Please retry after cooldown.", {
      retryAfterSeconds: primaryResult.retryAfterSeconds,
      limit: primaryResult.limit,
      remaining: 0,
      category: primaryResult.category,
    });
  }

  return primaryResult;
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
