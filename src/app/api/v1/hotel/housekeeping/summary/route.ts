import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { PermissionDeniedError, NotFoundError } from "@/lib/api/errors";
import { hasPermission } from "@/lib/auth/rbac";
import { getHousekeepingSummary } from "@/lib/hotel/housekeeping-service";
import { listHotelProperties } from "@/lib/hotel/service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
      requiredModule: "HOTEL",
    });

    if (
      ctx.user &&
      !hasPermission(ctx.user, "hotel.housekeeping.read") &&
      !hasPermission(ctx.user, "hotel.read")
    ) {
      throw new PermissionDeniedError("hotel.housekeeping.read");
    }

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = req.nextUrl.searchParams.get("outletId") || ctx.outletId;

    if (!outletId) {
      const properties = await listHotelProperties(tenantId);
      if (properties.length > 0) {
        outletId = properties[0].outletId;
      } else {
        throw new NotFoundError("No hotel properties found for this tenant.");
      }
    } else {
      const properties = await listHotelProperties(tenantId);
      const property = properties.find((p) => p.outletId === outletId);
      if (!property) {
        throw new NotFoundError(`Property with ID '${outletId}' not found for this tenant.`);
      }
    }

    const summary = await getHousekeepingSummary(tenantId, outletId);

    return apiSuccess(summary, ctx.requestId, 200, { outletId });
  } catch (err) {
    return apiError(err);
  }
}
