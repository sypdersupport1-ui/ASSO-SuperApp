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
import { assertRateLimit, applyRateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

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

    // Abuse Prevention: Distributed Rate Limiting (FINANCIAL_MUTATION Category)
    // Evaluated BEFORE idempotency acquisition, domain validation, or database transaction
    const rateLimitResult = await assertRateLimit(req, {
      category: "FINANCIAL_MUTATION",
      tenantId: ctx.tenantId,
      userId: ctx.user.sub,
      operation: "create_order",
      requestId: ctx.requestId,
    });

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

    const response = NextResponse.json(responsePayload, { status: statusCode });
    return applyRateLimitHeaders(response, rateLimitResult);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_rest_orders_create");
  }
}
