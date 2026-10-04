import { NextRequest, NextResponse } from "next/server";
import { UpstashRedisRateLimiter } from "@/lib/rate-limit/redis-rate-limiter";
import { DEFAULT_IP_CEILINGS } from "@/lib/rate-limit/policies";
import { RateLimitCategory } from "@/lib/rate-limit/types";
import { resolveCorrelationId } from "@/lib/observability/correlation";

/**
 * ASSO EDGE MIDDLEWARE — SCALE FOUNDATION S3 + S5
 * 
 * First-Line Distributed Edge Rate Limiting & Abuse Protection.
 * S5: Correlation ID injection — generates or validates incoming X-Request-Id,
 *     propagates it in request headers and response headers for end-to-end traceability.
 * 
 * Target Architecture:
 * Internet
 * → CDN / Edge Middleware (Zero Node Route Handler execution, Zero PostgreSQL queries)
 * → Correlation ID generation/propagation (edge-compatible, no Node-only APIs)
 * → Distributed Edge Limiter (Upstash Redis REST)
 * → ASSO API Route Handlers
 * → Auth / Entitlements
 * → Durable Idempotency
 * → Domain Validation
 * → PostgreSQL Transaction
 * 
 * Security & Scalability Invariants:
 * 1. Abusive public/customer floods are rejected AT THE EDGE before any database connection
 *    pool checkout, JSON serialization, or business transaction logic occurs.
 * 2. Operates outside process-local Node memory and outside PostgreSQL.
 * 3. Uses atomic HTTP REST pipeline over distributed Redis.
 * 4. During a provider outage, fail-closed endpoints reject with 429 without causing a DB write storm.
 * 5. Correlation IDs are NEVER used for authorization — they are logging/tracing aids only.
 */

const edgeRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
const edgeRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const edgeLimiter = edgeRedisUrl && edgeRedisToken 
  ? new UpstashRedisRateLimiter(edgeRedisUrl, edgeRedisToken)
  : null;

function resolveCategory(pathname: string): RateLimitCategory {
  if (pathname.startsWith("/api/v1/auth")) return "AUTH";
  if (pathname.startsWith("/api/v1/webhooks")) return "WEBHOOK";
  if (pathname.includes("/orders")) return "FINANCIAL_MUTATION";
  if (pathname.startsWith("/api/v1/admin")) return "ADMIN";
  if (pathname.startsWith("/api/v1/customer") || pathname.includes("/menu")) return "CUSTOMER_PUBLIC";
  return "GENERAL";
}

function extractClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp && cfIp.trim()) return cfIp.trim();
  return "127.0.0.1";
}

export async function middleware(req: NextRequest) {
  // ─── S5: Correlation ID injection ──────────────────────────────────────────
  // Edge-compatible: uses only resolveCorrelationId (no AsyncLocalStorage in edge)
  const { id: requestId } = resolveCorrelationId(
    req.headers.get("x-request-id") || req.headers.get("x-correlation-id")
  );

  // Clone request headers to inject correlation ID for downstream route handlers
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  // If Edge Redis is not configured (e.g. offline dev/testing), delegate to route-level rate limiting
  if (!edgeLimiter) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("X-Request-Id", requestId);
    return response;
  }

  const ip = extractClientIp(req);
  const category = resolveCategory(req.nextUrl.pathname);
  const policy = DEFAULT_IP_CEILINGS[category] || DEFAULT_IP_CEILINGS.GENERAL;
  const edgeKey = `edge:ip:${ip}:cat:${category.toLowerCase()}`;

  try {
    const result = await edgeLimiter.check(edgeKey, policy);

    if (!result.allowed) {
      return new NextResponse(
        JSON.stringify({
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Request threshold breached at network edge. Please retry after cooldown.",
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
          },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": requestId,
            "Retry-After": String(result.retryAfterSeconds),
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.floor(result.resetAt.getTime() / 1000)),
          },
        }
      );
    }
  } catch {
    // If Redis encounters a network error on a critical fail-closed endpoint,
    // safely block at edge to protect database from DDoS amplification.
    if (policy.failClosed) {
      return new NextResponse(
        JSON.stringify({
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Service protection engaged at edge. Please retry shortly.",
          },
          meta: { requestId },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": requestId,
            "Retry-After": "5",
          },
        }
      );
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export const config = {
  matcher: [
    "/api/v1/customer/:path*",
    "/api/v1/restaurant/orders",
    "/api/v1/customer/room-service/orders",
    "/api/v1/auth/:path*",
    "/api/v1/webhooks/:path*",
    "/api/v1/restaurant/menu",
    "/api/v1/restaurant/customer/:path*",
  ],
};
