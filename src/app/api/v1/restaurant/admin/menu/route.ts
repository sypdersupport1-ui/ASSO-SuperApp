import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { getRestaurantMenu } from "@/lib/restaurant/menu-service";
import { listRestaurantOutlets } from "@/lib/restaurant/table-service";
import { ensureRestaurantSeedData, DEMO_TENANT_ID } from "@/lib/restaurant/seed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
      requiredModule: "RESTAURANT",
      requiredPermission: "restaurant.menu.view",
    });

    const tenantId = ctx.tenantId || DEMO_TENANT_ID;
    let outletId = req.nextUrl.searchParams.get("outletId") || ctx.outletId;

    if (!outletId) {
      const outlets = await listRestaurantOutlets(tenantId);
      if (outlets.length === 0) {
        const seeded = await ensureRestaurantSeedData(tenantId);
        outletId = seeded.outlet.outletId;
      } else {
        outletId = outlets[0].outletId;
      }
    }

    if (!outletId) {
      throw new ValidationError("Restaurant outletId is required.");
    }

    // Admin view: include both available and unavailable items
    const menu = await getRestaurantMenu(tenantId, outletId, {
      includeUnavailable: true,
    });

    return apiSuccess(menu, ctx.requestId, 200);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_admin_menu");
  }
}
