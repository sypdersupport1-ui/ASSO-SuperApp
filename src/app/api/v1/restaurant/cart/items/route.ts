import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { AuthenticationError, ValidationError } from "@/lib/api/errors";
import { addItemToCart } from "@/lib/restaurant/cart-service";

export const dynamic = "force-dynamic";

const addItemSchema = z.object({
  itemId: z.string().uuid("itemId must be a valid UUID"),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(50).optional(),
  specialInstructions: z.string().max(255).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
    });

    if (!ctx.user || ctx.user.sessionType !== "CUSTOMER") {
      throw new AuthenticationError("Active customer session required to add items to cart.");
    }

    if (!ctx.tenantId) {
      throw new ValidationError("Missing tenant context.");
    }

    const body = await req.json();
    const validated = addItemSchema.parse(body);

    const updatedCart = await addItemToCart(ctx.tenantId, ctx.user.sub, {
      itemId: validated.itemId,
      quantity: validated.quantity,
      specialInstructions: validated.specialInstructions,
    });

    return apiSuccess(updatedCart, ctx.requestId, 200);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_cart_add");
  }
}
