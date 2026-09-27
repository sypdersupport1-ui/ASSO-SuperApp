import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { PermissionDeniedError } from "@/lib/api/errors";
import { hasPermission } from "@/lib/auth/rbac";
import { getHousekeepingTaskById } from "@/lib/hotel/housekeeping-service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = extractRequestContext(req, {
      requireAuth: true,
      requiredModule: "HOTEL",
    });

    if (
      ctx.user &&
      !hasPermission(ctx.user, "hotel.housekeeping.read") &&
      !hasPermission(ctx.user, "hotel.read")
    ) {
      throw new PermissionDeniedError("hotel.housekeeping.read");
    }

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    const task = await getHousekeepingTaskById(tenantId, id);

    return apiSuccess(task, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
