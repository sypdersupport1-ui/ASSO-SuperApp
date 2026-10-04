import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { authenticateKdsStaff } from "@/lib/restaurant/kds-auth";
import { listKdsTickets } from "@/lib/restaurant/kds-service";
import { listRestaurantOutlets } from "@/lib/restaurant/table-service";
import { ensureRestaurantSeedData, DEMO_TENANT_ID } from "@/lib/restaurant/seed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requireAuth: true,
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    authenticateKdsStaff(
      ctx,
      ["restaurant.kds.view", "fulfillment.kds.view", "restaurant.kds.manage"],
      tenantId
    );

    let outletId = req.nextUrl.searchParams.get("outletId") || ctx.outletId;
    if (!outletId) {
      const outletsList = await listRestaurantOutlets(tenantId);
      if (outletsList.length === 0) {
        const seeded = await ensureRestaurantSeedData(tenantId);
        outletId = seeded.outlet.outletId;
      } else {
        outletId = outletsList[0].outletId;
      }
    }

    const stationRouting = req.nextUrl.searchParams.get("stationRouting") || req.nextUrl.searchParams.get("stationCode") || undefined;
    const activeOnly = req.nextUrl.searchParams.get("activeOnly") !== "false";

    const tickets = await listKdsTickets(tenantId, outletId, stationRouting, activeOnly);

    return apiSuccess(tickets, ctx.requestId, 200, {
      outletId,
      stationRouting: stationRouting || "ALL",
      count: tickets.length,
    });
  } catch (err) {
    return apiError(err);
  }
}
