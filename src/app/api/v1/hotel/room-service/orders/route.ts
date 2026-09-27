import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { listStaffRoomServiceOrders } from "@/lib/hotel/room-service-service";
import { ValidationError } from "@/lib/api/errors";
import { type OrderStatus, isOrderStatus } from "@/lib/ordering/order-state-machines";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "HOTEL",
      requiredPermission: "hotel.read",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    const searchParams = req.nextUrl.searchParams;
    const outletId = searchParams.get("outletId") || ctx.outletId;

    if (!outletId) {
      throw new ValidationError("Query parameter 'outletId' is required.");
    }

    const statusParam = searchParams.get("status");
    let status: OrderStatus | undefined;
    if (statusParam) {
      if (!isOrderStatus(statusParam)) {
        throw new ValidationError(`Invalid order status filter '${statusParam}'.`);
      }
      status = statusParam;
    }

    const roomId = searchParams.get("roomId") || undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 50;
    const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : 0;

    const orders = await listStaffRoomServiceOrders({
      tenantId,
      outletId,
      status,
      roomId,
      limit,
      offset,
    });

    return apiSuccess(orders, ctx.requestId, 200);
  } catch (error) {
    return apiError(error);
  }
}
