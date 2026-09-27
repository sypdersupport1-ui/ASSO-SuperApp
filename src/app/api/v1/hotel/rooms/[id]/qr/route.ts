import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { generateOrGetRoomQr } from "@/lib/hotel/qr-service";
import { ValidationError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/hotel/rooms/[id]/qr
 * Retrieves or generates the active QR token and visual code representation for a hotel room.
 * Protected by Hotel Entitlement and RBAC permission ('hotel.rooms.manage' or 'hotel.read').
 */
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const roomId = params.id;

    const ctx = extractRequestContext(req, {
      requireAuth: true,
      requiredModule: "HOTEL",
      requiredPermission: "hotel.read",
    });

    const tenantId = ctx.tenantId!;
    const outletId = ctx.outletId || req.nextUrl.searchParams.get("outletId");

    if (!outletId) {
      throw new ValidationError("Missing required property parameter 'outletId'.");
    }

    const qrDetails = await generateOrGetRoomQr(
      tenantId,
      outletId,
      roomId,
      ctx.user?.sub
    );

    return apiSuccess(qrDetails, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
