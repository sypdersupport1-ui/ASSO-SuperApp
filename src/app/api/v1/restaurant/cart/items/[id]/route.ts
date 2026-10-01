import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { AuthenticationError, ValidationError } from "@/lib/api/errors";
import { updateCartItemQuantity, removeCartItem } from "@/lib/restaurant/cart-service";

export const dynamic = "force-dynamic";

const updateQuantitySchema = z.object({
  quantity: z.number().int().min(0, "Quantity must be non-negative").max(50),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = extractRequestContext(req, {
      requireAuth: true,
    });

    if (!ctx.user || ctx.user.sessionType !== "CUSTOMER") {
      throw new AuthenticationError("Active customer session required to update cart.");
    }

    if (!ctx.tenantId) {
      throw new ValidationError("Missing tenant context.");
    }

    const body = await req.json();
    const validated = updateQuantitySchema.parse(body);

    const updatedCart = await updateCartItemQuantity(
      ctx.tenantId,
      ctx.user.sub,
      id,
      validated.quantity
    );

    return apiSuccess(updatedCart, ctx.requestId, 200);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_cart_patch");
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = extractRequestContext(req, {
      requireAuth: true,
    });

    if (!ctx.user || ctx.user.sessionType !== "CUSTOMER") {
      throw new AuthenticationError("Active customer session required to modify cart.");
    }

    if (!ctx.tenantId) {
      throw new ValidationError("Missing tenant context.");
    }

    const updatedCart = await removeCartItem(ctx.tenantId, ctx.user.sub, id);
    return apiSuccess(updatedCart, ctx.requestId, 200);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_cart_del_item");
  }
}
