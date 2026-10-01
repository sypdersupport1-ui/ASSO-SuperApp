import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { updateMenuItemPrice } from "@/lib/restaurant/menu-service";

export const dynamic = "force-dynamic";

const priceSchema = z.object({
  outletId: z.string().uuid("outletId must be a valid UUID").optional(),
  basePrice: z.string().min(1, "basePrice is required"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = extractRequestContext(req, {
      requireAuth: true,
      requiredModule: "RESTAURANT",
      requiredPermission: "restaurant.menu.price.manage",
    });

    if (!ctx.tenantId) {
      throw new ValidationError("Missing tenant context.");
    }

    const body = await req.json();
    const validated = priceSchema.parse(body);
    const outletId = validated.outletId || ctx.outletId || "";

    const updatedItem = await updateMenuItemPrice(
      ctx.tenantId,
      outletId,
      id,
      validated.basePrice,
      ctx.user?.sub
    );

    return apiSuccess(updatedItem, ctx.requestId, 200);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_item_price");
  }
}
