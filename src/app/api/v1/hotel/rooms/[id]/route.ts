import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { updateRoomStatus, listHotelProperties } from "@/lib/hotel/service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";
import {
  HOTEL_OPERATIONAL_STATUSES,
  HOTEL_HOUSEKEEPING_STATUSES,
} from "@/db/schema/hotel";

export const dynamic = "force-dynamic";

const updateRoomStatusSchema = z.object({
  outletId: z.string().uuid().optional(),
  operationalStatus: z.enum(HOTEL_OPERATIONAL_STATUSES).optional(),
  housekeepingStatus: z.enum(HOTEL_HOUSEKEEPING_STATUSES).optional(),
  isOccupied: z.boolean().optional(),
  notes: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rawBody = await req.json();
    const parsed = updateRoomStatusSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        "Payload validation failed",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    const ctx = extractRequestContext(req, {
      requiredModule: "HOTEL",
      requiredPermission: "hotel.rooms.manage",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = parsed.data.outletId || ctx.outletId;

    if (!outletId) {
      const properties = await listHotelProperties(tenantId);
      if (properties.length > 0) {
        outletId = properties[0].outletId;
      } else {
        throw new ValidationError("No hotel property found for this tenant.");
      }
    }

    const updated = await updateRoomStatus(
      tenantId,
      outletId,
      id,
      {
        operationalStatus: parsed.data.operationalStatus,
        housekeepingStatus: parsed.data.housekeepingStatus,
        isOccupied: parsed.data.isOccupied,
        notes: parsed.data.notes,
      },
      ctx.user?.sub
    );

    return apiSuccess(updated, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
