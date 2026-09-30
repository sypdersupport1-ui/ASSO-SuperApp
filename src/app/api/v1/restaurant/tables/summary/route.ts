import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import {
  getTableSummaryMetrics,
  listRestaurantOutlets,
} from "@/lib/restaurant/table-service";
import { ensureRestaurantSeedData, DEMO_TENANT_ID } from "@/lib/restaurant/seed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requiredPermission: "restaurant.tables.view",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = req.nextUrl.searchParams.get("outletId") || ctx.outletId;

    if (!outletId) {
      let outletsList = await listRestaurantOutlets(tenantId);
      if (outletsList.length === 0) {
        const seeded = await ensureRestaurantSeedData(tenantId);
        outletId = seeded.outlet.outletId;
      } else {
        outletId = outletsList[0].outletId;
      }
    }

    const summary = await getTableSummaryMetrics(tenantId, outletId);
    return apiSuccess(summary, ctx.requestId, 200, { outletId });
  } catch (err) {
    return apiError(err);
  }
}
