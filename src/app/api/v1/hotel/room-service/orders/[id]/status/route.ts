import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { updateStaffRoomServiceOrderStatus } from "@/lib/hotel/room-service-service";
import { ValidationError } from "@/lib/api/errors";
import { type OrderStatus, isOrderStatus } from "@/lib/ordering/order-state-machines";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "HOTEL",
      requiredPermission: "hotel.rooms.manage",
    });

    const { id: orderId } = await params;
    const body = await req.json();

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    const outletId = body.outletId || ctx.outletId;

    if (!outletId) {
      throw new ValidationError("Parameter 'outletId' is required.");
    }
    if (!body.status || !isOrderStatus(body.status)) {
      throw new ValidationError(`Valid 'status' parameter is required.`);
    }

    const updated = await updateStaffRoomServiceOrderStatus({
      tenantId,
      outletId,
      orderId,
      nextStatus: body.status as OrderStatus,
      staffUserId: ctx.user?.sub || "system",
      reason: body.reason,
    });

    return apiSuccess(updated, ctx.requestId, 200);
  } catch (error) {
    return apiError(error);
  }
}
