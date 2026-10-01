import { NextRequest, NextResponse } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import {
  createRestaurantOrder,
  listCustomerSessionOrders,
} from "@/lib/restaurant/order-service";
import { AuthenticationError, ValidationError } from "@/lib/api/errors";
import {
  checkOrAcquireIdempotencyKey,
  computeRequestHash,
  saveIdempotentResponse,
} from "@/lib/api/idempotency";

export const dynamic = "force-dynamic";

// In-memory rate limiting map (IP / session scoped)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, limit = 20, windowMs = 60000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) {
    return false;
  }
  entry.count++;
  return true;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
      requiredModule: "RESTAURANT",
    });

    if (!ctx.user || (ctx.user.sessionType !== "CUSTOMER" && ctx.user.sessionType !== "STAFF")) {
      throw new AuthenticationError("Active customer session token required.");
    }

    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const ordersList = await listCustomerSessionOrders(ctx.user, limit);
    return apiSuccess(ordersList, ctx.requestId, 200);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_rest_orders_get");
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
      requiredModule: "RESTAURANT",
    });

    if (!ctx.user || (ctx.user.sessionType !== "CUSTOMER" && ctx.user.sessionType !== "STAFF")) {
      throw new AuthenticationError("Active customer session token required.");
    }

    if (!ctx.tenantId) {
      throw new ValidationError("Missing tenant context in session.");
    }

    // Abuse Prevention: Payload Size Check (< 64KB)
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 65536) {
      throw new ValidationError("Request payload exceeds allowed limit (64KB).");
    }

    // Abuse Prevention: Rate Limiting
    const clientKey = ctx.user.sub || req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(clientKey, 20, 60000)) {
      throw new ValidationError("Too many order requests. Please wait a moment before trying again.");
    }

    // Parse body safely (may be empty or contain guestNotes/idempotencyKey)
    let body: any = {};
    try {
      const text = await req.text();
      if (text && text.trim().length > 0) {
        body = JSON.parse(text);
      }
    } catch {
      throw new ValidationError("Invalid JSON body.");
    }

    // Security Invariant: The client is NEVER permitted to specify pricing, totals, status, table, or source.
    // If the client submitted these, they are ignored or rejected by the server authority.
    const idempotencyKey =
      req.headers.get("Idempotency-Key") || body.idempotencyKey || undefined;

    // HTTP-level idempotency caching
    if (idempotencyKey && ctx.tenantId) {
      const requestHash = computeRequestHash("POST", "/api/v1/restaurant/orders", body);
      const { acquired, cachedResponse } = await checkOrAcquireIdempotencyKey(
        ctx.tenantId,
        idempotencyKey,
        requestHash
      );

      if (!acquired && cachedResponse) {
        if (cachedResponse.body && (cachedResponse.body as any).meta) {
          (cachedResponse.body as any).meta.idempotentReplay = true;
        }
        return NextResponse.json(cachedResponse.body, { status: 200 });
      }
    }

    const { order, isIdempotentReplay } = await createRestaurantOrder(ctx.user, {
      guestNotes: body.guestNotes,
      idempotencyKey,
      orderSource: ctx.user.sessionType === "STAFF" ? body.orderSource : "CUSTOMER_WEB",
    });

    const responsePayload = {
      success: true,
      data: order,
      meta: {
        requestId: ctx.requestId,
        timestamp: new Date().toISOString(),
        idempotentReplay: isIdempotentReplay || undefined,
      },
    };

    const statusCode = isIdempotentReplay ? 200 : 201;

    if (idempotencyKey && ctx.tenantId && !isIdempotentReplay) {
      await saveIdempotentResponse(ctx.tenantId, idempotencyKey, statusCode, responsePayload);
    }

    return NextResponse.json(responsePayload, { status: statusCode });
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_rest_orders_create");
  }
}
