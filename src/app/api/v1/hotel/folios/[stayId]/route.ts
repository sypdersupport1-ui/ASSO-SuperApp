import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { getFolioDetailByStayId } from "@/lib/hotel/folio-service";
import { listHotelProperties } from "@/lib/hotel/service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ stayId: string }> }
) {
  try {
    const { stayId } = await params;

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
        outletId = "00000000-0000-0000-0000-000000000002";
      }
    }

    const staffUserId = ctx.user?.sub || req.headers.get("x-user-id") || undefined;

    const folioDetail = await getFolioDetailByStayId(
      tenantId,
      outletId,
      stayId,
      staffUserId
    );

    return apiSuccess(folioDetail, ctx.requestId, 200, { outletId });
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_folio");
  }
}
