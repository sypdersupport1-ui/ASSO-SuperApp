import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { AuthenticationError, ValidationError } from "@/lib/api/errors";
import { getCart, clearCart } from "@/lib/restaurant/cart-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
    });

    if (!ctx.user || ctx.user.sessionType !== "CUSTOMER") {
      throw new AuthenticationError("Active customer session required to access cart.");
    }

    if (!ctx.tenantId) {
      throw new ValidationError("Missing tenant context.");
    }

    const cart = await getCart(ctx.tenantId, ctx.user.sub);
    return apiSuccess(cart, ctx.requestId, 200);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_cart_get");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
    });

    if (!ctx.user || ctx.user.sessionType !== "CUSTOMER") {
      throw new AuthenticationError("Active customer session required to clear cart.");
    }

    if (!ctx.tenantId) {
      throw new ValidationError("Missing tenant context.");
    }

    const cleared = await clearCart(ctx.tenantId, ctx.user.sub);
    return apiSuccess(cleared, ctx.requestId, 200);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_cart_clear");
  }
}
