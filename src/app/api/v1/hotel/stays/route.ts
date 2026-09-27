import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { PermissionDeniedError } from "@/lib/api/errors";
import { hasPermission } from "@/lib/auth/rbac";
import { listStays } from "@/lib/hotel/stay-service";
import { listHotelProperties } from "@/lib/hotel/service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";
import type { HotelStayStatus } from "@/db/schema/hotel";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "HOTEL",
    });

    if (
      ctx.user &&
      !hasPermission(ctx.user, "hotel.stays.read") &&
      !hasPermission(ctx.user, "hotel.read")
    ) {
      throw new PermissionDeniedError("hotel.stays.read");
    }

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = req.nextUrl.searchParams.get("outletId") || ctx.outletId;

    if (!outletId) {
      const properties = await listHotelProperties(tenantId);
      if (properties.length > 0) {
        outletId = properties[0].outletId;
      }
    }

    const status = (req.nextUrl.searchParams.get("status") as HotelStayStatus) || undefined;
    const roomId = req.nextUrl.searchParams.get("roomId") || undefined;
    const guestId = req.nextUrl.searchParams.get("guestId") || undefined;
    const search = req.nextUrl.searchParams.get("search") || undefined;
    const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
    const offset = Number(req.nextUrl.searchParams.get("offset") || 0);

    const stays = await listStays(tenantId, {
      outletId,
      status,
      roomId,
      guestId,
      search,
      limit,
      offset,
    });

    return apiSuccess(stays, ctx.requestId, 200, {
      limit,
      offset,
      count: stays.length,
      outletId,
    });
  } catch (err) {
    return apiError(err);
  }
}
