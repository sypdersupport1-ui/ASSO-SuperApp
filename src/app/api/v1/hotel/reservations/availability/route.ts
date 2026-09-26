import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { calculateAvailability } from "@/lib/hotel/reservation-service";
import { listHotelProperties } from "@/lib/hotel/service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

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
      const properties = await listHotelProperties(tenantId);
      if (properties.length > 0) {
        outletId = properties[0].outletId;
      } else {
        return apiSuccess([], ctx.requestId, 200);
      }
    }

    const arrivalParam = req.nextUrl.searchParams.get("arrivalDate");
    const departureParam = req.nextUrl.searchParams.get("departureDate");
    const roomTypeId = req.nextUrl.searchParams.get("roomTypeId") || undefined;

    if (!arrivalParam || !departureParam) {
      throw new ValidationError("Both 'arrivalDate' and 'departureDate' query parameters are required.");
    }

    const arrivalDate = new Date(arrivalParam);
    const departureDate = new Date(departureParam);

    const availability = await calculateAvailability(
      tenantId,
      outletId,
      arrivalDate,
      departureDate,
      roomTypeId
    );

    return apiSuccess(availability, ctx.requestId, 200, {
      outletId,
      arrivalDate: arrivalDate.toISOString(),
      departureDate: departureDate.toISOString(),
    });
  } catch (err) {
    return apiError(err);
  }
}
