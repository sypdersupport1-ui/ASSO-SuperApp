import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { getHotelDashboardMetrics, listHotelProperties } from "@/lib/hotel/service";
import { DEMO_TENANT_ID, ensureHotelSeedData } from "@/lib/hotel/seed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "HOTEL",
      requiredPermission: "hotel.read",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = req.nextUrl.searchParams.get("outletId") || ctx.outletId;

    if (!outletId) {
      let properties = await listHotelProperties(tenantId);
      if (properties.length === 0) {
        // Automatically ensure seed data exists for seamless local/dev experience
        await ensureHotelSeedData(tenantId);
        properties = await listHotelProperties(tenantId);
      }
      if (properties.length > 0) {
        outletId = properties[0].outletId;
      }
    }

    if (!outletId) {
      return apiSuccess({
        totalRooms: 0,
        availableRooms: 0,
        occupiedRooms: 0,
        reservedRooms: 0,
        outOfServiceRooms: 0,
        occupancyRatePct: 0,
        housekeepingBreakdown: { clean: 0, dirty: 0, inspected: 0, cleaning: 0, maintenance: 0 },
        roomTypeBreakdown: [],
      }, ctx.requestId, 200);
    }

    const metrics = await getHotelDashboardMetrics(tenantId, outletId);
    return apiSuccess(metrics, ctx.requestId, 200, { outletId, tenantId });
  } catch (err) {
    return apiError(err);
  }
}
