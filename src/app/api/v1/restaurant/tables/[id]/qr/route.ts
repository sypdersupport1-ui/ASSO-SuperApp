import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import {
  generateOrGetTableQr,
  getTableActiveQr,
} from "@/lib/restaurant/qr-service";
import { listRestaurantOutlets } from "@/lib/restaurant/table-service";
import { DEMO_TENANT_ID } from "@/lib/restaurant/seed";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requiredPermission: "restaurant.tables.view",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = req.nextUrl.searchParams.get("outletId") || ctx.outletId;

    if (!outletId) {
      const outletsList = await listRestaurantOutlets(tenantId);
      if (outletsList.length > 0) {
        outletId = outletsList[0].outletId;
      } else {
        throw new ValidationError("No restaurant outlet found for this tenant.");
      }
    }

    const qr = await generateOrGetTableQr(tenantId, outletId, id, ctx.user?.sub);
    return apiSuccess(qr, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
