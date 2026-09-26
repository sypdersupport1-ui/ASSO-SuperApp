import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import {
  getReservationById,
  updateReservationStatus,
  assignRoomToReservation,
} from "@/lib/hotel/reservation-service";
import { listHotelProperties } from "@/lib/hotel/service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";
import { HOTEL_RESERVATION_STATUSES } from "@/db/schema/hotel";

export const dynamic = "force-dynamic";

const patchReservationSchema = z.object({
  outletId: z.string().uuid().optional(),
  status: z.enum(HOTEL_RESERVATION_STATUSES).optional(),
  assignedRoomId: z.string().uuid().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = extractRequestContext(req, {
      requiredModule: "HOTEL",
      requiredPermission: "hotel.reservations.read",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = req.nextUrl.searchParams.get("outletId") || ctx.outletId;

    if (!outletId) {
      const properties = await listHotelProperties(tenantId);
      if (properties.length > 0) {
        outletId = properties[0].outletId;
      } else {
        throw new ValidationError("No hotel property found.");
      }
    }

    const reservation = await getReservationById(tenantId, outletId, id);
    return apiSuccess(reservation, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rawBody = await req.json();
    const parsed = patchReservationSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        "Payload validation failed",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    const ctx = extractRequestContext(req, {
      requiredModule: "HOTEL",
      requiredPermission: "hotel.reservations.manage",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = parsed.data.outletId || ctx.outletId;

    if (!outletId) {
      const properties = await listHotelProperties(tenantId);
      if (properties.length > 0) {
        outletId = properties[0].outletId;
      } else {
        throw new ValidationError("No hotel property found.");
      }
    }

    let updated;

    // Handle room assignment if provided
    if (parsed.data.assignedRoomId) {
      updated = await assignRoomToReservation(
        tenantId,
        outletId,
        id,
        parsed.data.assignedRoomId,
        ctx.user?.sub
      );
    }

    // Handle status transition if provided
    if (parsed.data.status) {
      updated = await updateReservationStatus(
        tenantId,
        outletId,
        id,
        parsed.data.status,
        ctx.user?.sub
      );
    }

    if (!updated) {
      updated = await getReservationById(tenantId, outletId, id);
    }

    return apiSuccess(updated, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
