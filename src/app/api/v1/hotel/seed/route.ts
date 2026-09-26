import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { DEMO_TENANT_ID, ensureHotelSeedData } from "@/lib/hotel/seed";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "HOTEL",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    const result = await ensureHotelSeedData(tenantId);

    return apiSuccess({
      message: "Hotel demo fixtures successfully initialized.",
      tenantId,
      propertyName: result.property.name,
      outletId: result.property.outletId,
      roomTypesCount: result.roomTypes.length,
      roomsCount: result.roomsCount,
    }, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
