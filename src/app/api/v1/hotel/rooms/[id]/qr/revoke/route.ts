import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { revokeRoomQr } from "@/lib/hotel/qr-service";
import { ValidationError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/hotel/rooms/[id]/qr/revoke
 * Revokes the active QR token(s) for a hotel room.
 * Protected by Hotel Entitlement and RBAC permission ('hotel.rooms.manage').
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const roomId = params.id;

    const ctx = extractRequestContext(req, {
      requireAuth: true,
      requiredModule: "HOTEL",
      requiredPermission: "hotel.rooms.manage",
    });

    const tenantId = ctx.tenantId!;
    let outletId = ctx.outletId;
    let reason = "REVOKED_BY_STAFF";

    try {
      const body = await req.json();
      if (body.outletId) outletId = body.outletId;
      if (body.reason) reason = body.reason;
    } catch {
      // Body may be empty
    }

    if (!outletId) {
      outletId = req.nextUrl.searchParams.get("outletId") || undefined;
    }

    if (!outletId) {
      throw new ValidationError("Missing required property parameter 'outletId'.");
    }

    const result = await revokeRoomQr(
      tenantId,
      outletId,
      roomId,
      ctx.user?.sub || "staff",
      reason
    );

    return apiSuccess(result, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
