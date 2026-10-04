import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { authenticateKdsStaff } from "@/lib/restaurant/kds-auth";
import { listKdsTasks } from "@/lib/restaurant/kds-service";
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

    const stationRouting = req.nextUrl.searchParams.get("stationRouting") || undefined;
    const stationId = req.nextUrl.searchParams.get("stationId") || undefined;
    const taskStatus = req.nextUrl.searchParams.get("taskStatus") || undefined;
    const priority = req.nextUrl.searchParams.get("priority") || undefined;
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
    const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0", 10);

    const tasks = await listKdsTasks(tenantId, {
      outletId,
      stationRouting,
      stationId,
      taskStatus,
      priority,
      limit,
      offset,
    });

    return apiSuccess(tasks, ctx.requestId, 200, {
      outletId,
      stationRouting: stationRouting || "ALL",
      count: tasks.length,
    });
  } catch (err) {
    return apiError(err);
  }
}
