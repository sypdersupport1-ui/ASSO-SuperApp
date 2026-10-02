import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { getRestaurantMenu } from "@/lib/restaurant/menu-service";
import { listRestaurantOutlets } from "@/lib/restaurant/table-service";
import { ensureRestaurantSeedData, DEMO_TENANT_ID } from "@/lib/restaurant/seed";
import { assertRateLimit, applyRateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const rateLimitResult = await assertRateLimit(req, {
      category: "CUSTOMER_PUBLIC",
      operation: "menu_view",
      requestId: req.headers.get("x-request-id") || "req_menu",
    });

    const ctx = extractRequestContext(req);

    // Resolve tenantId
    const tenantId =
      ctx.tenantId ||
      req.headers.get("x-tenant-id") ||
      req.nextUrl.searchParams.get("tenantId") ||
      DEMO_TENANT_ID;

    // Resolve outletId
    let outletId =
      ctx.outletId ||
      req.headers.get("x-outlet-id") ||
      req.nextUrl.searchParams.get("outletId");

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
      throw new ValidationError("Restaurant outletId is required to load digital menu.");
    }

    // Customer-facing menu: authoritative available items only
    const menu = await getRestaurantMenu(tenantId, outletId, {
      includeUnavailable: false,
    });

    const response = apiSuccess(menu, ctx.requestId, 200);
    return applyRateLimitHeaders(response, rateLimitResult);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_menu");
  }
}
