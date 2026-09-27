import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { PermissionDeniedError } from "@/lib/api/errors";
import { hasPermission } from "@/lib/auth/rbac";
import { completeHousekeepingTask } from "@/lib/hotel/housekeeping-service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

export const dynamic = "force-dynamic";

export async function POST(
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
      !hasPermission(ctx.user, "hotel.housekeeping.clean") &&
      !hasPermission(ctx.user, "hotel.housekeeping.manage") &&
      !hasPermission(ctx.user, "hotel.manage") &&
      !hasPermission(ctx.user, "hotel.*")
    ) {
      throw new PermissionDeniedError("hotel.housekeeping.clean");
    }

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let body = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is acceptable
    }

    const task = await completeHousekeepingTask(tenantId, id, body, ctx.user?.sub);

    return apiSuccess(task, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
