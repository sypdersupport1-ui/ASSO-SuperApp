import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { toggleCategoryStatus } from "@/lib/restaurant/menu-service";

export const dynamic = "force-dynamic";

const statusSchema = z.object({
  outletId: z.string().uuid("outletId must be a valid UUID").optional(),
  isActive: z.boolean({ required_error: "isActive boolean is required" }),
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
      requiredPermission: "restaurant.menu.manage",
    });

    if (!ctx.tenantId) {
      throw new ValidationError("Missing tenant context.");
    }

    const body = await req.json();
    const validated = statusSchema.parse(body);
    const outletId = validated.outletId || ctx.outletId || "";

    await toggleCategoryStatus(
      ctx.tenantId,
      outletId,
      id,
      validated.isActive,
      ctx.user?.sub
    );

    return apiSuccess({ categoryId: id, isActive: validated.isActive }, ctx.requestId, 200);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_cat_status");
  }
}
