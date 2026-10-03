import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { checkTableAvailability } from "@/lib/restaurant/reservation-service";
import { listRestaurantOutlets } from "@/lib/restaurant/table-service";
import { ensureRestaurantSeedData, DEMO_TENANT_ID } from "@/lib/restaurant/seed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
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

    const date = req.nextUrl.searchParams.get("date");
    const time = req.nextUrl.searchParams.get("time");
    const partySizeParam = req.nextUrl.searchParams.get("partySize");
    const durationParam = req.nextUrl.searchParams.get("durationMinutes");
    const excludeReservationId = req.nextUrl.searchParams.get("excludeReservationId") || undefined;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ValidationError("date parameter is required and must be formatted as YYYY-MM-DD.");
    }
    if (!time || !/^\d{2}:\d{2}$/.test(time)) {
      throw new ValidationError("time parameter is required and must be formatted as HH:MM.");
    }

    const partySize = Math.max(1, parseInt(partySizeParam || "2", 10) || 2);
    const durationMinutes = Math.max(15, parseInt(durationParam || "90", 10) || 90);

    const tables = await checkTableAvailability(
      tenantId,
      outletId,
      date,
      time,
      durationMinutes,
      partySize,
      excludeReservationId
    );

    const availableCount = tables.filter((t) => t.isAvailable).length;

    return apiSuccess(
      {
        date,
        time,
        partySize,
        durationMinutes,
        availableCount,
        tables,
      },
      ctx.requestId,
      200,
      { outletId, totalTables: tables.length, availableCount }
    );
  } catch (err) {
    return apiError(err);
  }
}
