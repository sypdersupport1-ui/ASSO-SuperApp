import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError, NotFoundError } from "@/lib/api/errors";
import { getFrontOfficeSummary } from "@/lib/hotel/front-office-service";
import { listHotelProperties } from "@/lib/hotel/service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
      requiredModule: "HOTEL",
      requiredPermission: "hotel.read",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    const url = new URL(req.url);
    let outletId = url.searchParams.get("outletId") || ctx.outletId;
    const search = url.searchParams.get("search") || undefined;

    // Resolve property context if not provided
    if (!outletId) {
      const properties = await listHotelProperties(tenantId);
      if (properties.length > 0) {
        outletId = properties[0].outletId;
      } else {
        throw new ValidationError("No hotel property found. Please create a hotel property first.");
      }
    } else {
      // Validate property scope belongs to tenant
      const properties = await listHotelProperties(tenantId);
      const property = properties.find((p) => p.outletId === outletId);
      if (!property) {
        throw new NotFoundError(`Property with ID '${outletId}' not found for this tenant.`);
      }
    }

    const summary = await getFrontOfficeSummary(tenantId, outletId, search);

    return apiSuccess(summary, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
