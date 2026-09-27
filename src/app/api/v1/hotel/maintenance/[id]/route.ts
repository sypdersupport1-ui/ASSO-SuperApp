import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { hasPermission } from "@/lib/auth/rbac";
import { PermissionDeniedError } from "@/lib/api/errors";
import { getMaintenanceRequestById } from "@/lib/hotel/maintenance-service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const ctx = extractRequestContext(req, {
      requireAuth: true,
      requiredModule: "HOTEL",
    });

    if (
      ctx.user &&
      !hasPermission(ctx.user, "hotel.maintenance.read") &&
      !hasPermission(ctx.user, "hotel.read") &&
      !hasPermission(ctx.user, "service.view")
    ) {
      throw new PermissionDeniedError("hotel.maintenance.read");
    }

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    const outletId = req.nextUrl.searchParams.get("outletId") || undefined;

    const request = await getMaintenanceRequestById(tenantId, params.id, outletId);

    return apiSuccess(request, ctx.requestId, 200);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_local");
  }
}
