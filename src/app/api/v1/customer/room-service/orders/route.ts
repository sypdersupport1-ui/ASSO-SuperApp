import { NextRequest, NextResponse } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import {
  createRoomServiceOrder,
  listCustomerOrders,
} from "@/lib/hotel/room-service-service";
import { AuthenticationError } from "@/lib/api/errors";
import { checkOrAcquireIdempotencyKey, computeRequestHash, saveIdempotentResponse } from "@/lib/api/idempotency";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
    });

    if (!ctx.user || ctx.user.sessionType !== "CUSTOMER") {
      throw new AuthenticationError("Customer session token required.");
    }

    const ordersList = await listCustomerOrders(ctx.user);
    return apiSuccess(ordersList, ctx.requestId, 200);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
    });

    if (!ctx.user || ctx.user.sessionType !== "CUSTOMER") {
      throw new AuthenticationError("Customer session token required.");
    }

    const body = await req.json();
    const idempotencyKey = req.headers.get("Idempotency-Key");

    if (idempotencyKey && ctx.tenantId) {
      const requestHash = computeRequestHash("POST", "/api/v1/customer/room-service/orders", body);
      const { acquired, cachedResponse } = await checkOrAcquireIdempotencyKey(
        ctx.tenantId,
        idempotencyKey,
        requestHash
      );

      if (!acquired && cachedResponse) {
        return NextResponse.json(cachedResponse.body, { status: cachedResponse.code });
      }
    }

    const order = await createRoomServiceOrder(ctx.user, {
      items: body.items,
      guestNotes: body.guestNotes,
      idempotencyKey: idempotencyKey || undefined,
    });

    const responsePayload = {
      success: true,
      data: order,
      meta: {
        requestId: ctx.requestId,
        timestamp: new Date().toISOString(),
      },
    };

    if (idempotencyKey && ctx.tenantId) {
      await saveIdempotentResponse(ctx.tenantId, idempotencyKey, 201, responsePayload);
    }

    return NextResponse.json(responsePayload, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
