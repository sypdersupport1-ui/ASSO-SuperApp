import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { updateCatalogItemAvailability } from "@/lib/hotel/room-service-service";
import { ValidationError } from "@/lib/api/errors";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "HOTEL",
      requiredPermission: "hotel.rooms.manage",
    });

    const { id: itemId } = await params;
    const body = await req.json();

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    const outletId = body.outletId || ctx.outletId;

    if (!outletId) {
      throw new ValidationError("Parameter 'outletId' is required.");
    }
    if (typeof body.isAvailable !== "boolean") {
      throw new ValidationError("Field 'isAvailable' must be a boolean.");
    }

    const updated = await updateCatalogItemAvailability({
      tenantId,
      outletId,
      itemId,
      isAvailable: body.isAvailable,
      staffUserId: ctx.user?.sub || "system",
    });

    return apiSuccess(updated, ctx.requestId, 200);
  } catch (error) {
    return apiError(error);
  }
}
