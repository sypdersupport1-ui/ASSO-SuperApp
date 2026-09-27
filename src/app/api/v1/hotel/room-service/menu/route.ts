import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { listHotelCatalog } from "@/lib/hotel/room-service-service";
import { ValidationError } from "@/lib/api/errors";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "HOTEL",
      requiredPermission: "hotel.read",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    const outletId = req.nextUrl.searchParams.get("outletId") || ctx.outletId;

    if (!outletId) {
      throw new ValidationError("Query parameter 'outletId' is required.");
    }

    const menu = await listHotelCatalog(tenantId, outletId, true);
    return apiSuccess(menu, ctx.requestId, 200);
  } catch (error) {
    return apiError(error);
  }
}
