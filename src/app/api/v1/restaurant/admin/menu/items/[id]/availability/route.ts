import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { updateMenuItemAvailability } from "@/lib/restaurant/menu-service";

export const dynamic = "force-dynamic";

const availabilitySchema = z.object({
  outletId: z.string().uuid("outletId must be a valid UUID").optional(),
  isAvailable: z.boolean({ required_error: "isAvailable boolean is required" }),
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
      requiredPermission: "restaurant.menu.availability",
    });

    if (!ctx.tenantId) {
      throw new ValidationError("Missing tenant context.");
    }

    const body = await req.json();
    const validated = availabilitySchema.parse(body);
    const outletId = validated.outletId || ctx.outletId || "";

    const updatedItem = await updateMenuItemAvailability(
      ctx.tenantId,
      outletId,
      id,
      validated.isAvailable,
      ctx.user?.sub
    );

    return apiSuccess(updatedItem, ctx.requestId, 200);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_item_avail");
  }
}
