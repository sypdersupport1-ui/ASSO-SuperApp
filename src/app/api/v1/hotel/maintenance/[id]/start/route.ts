import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { hasPermission } from "@/lib/auth/rbac";
import { PermissionDeniedError } from "@/lib/api/errors";
import { startMaintenanceRequest } from "@/lib/hotel/maintenance-service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

export async function POST(
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
      !hasPermission(ctx.user, "hotel.maintenance.manage") &&
      !hasPermission(ctx.user, "hotel.manage") &&
      !hasPermission(ctx.user, "service.update")
    ) {
      throw new PermissionDeniedError("hotel.maintenance.manage");
    }

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;

    const updated = await startMaintenanceRequest(
      tenantId,
      params.id,
      ctx.user?.sub
    );

    return apiSuccess(updated, ctx.requestId, 200);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_local");
  }
}
