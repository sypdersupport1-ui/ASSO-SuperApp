import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { listReservations, createReservation } from "@/lib/hotel/reservation-service";
import { listHotelProperties } from "@/lib/hotel/service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";
import {
  computeRequestHash,
  checkOrAcquireIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/api/idempotency";
import { HOTEL_RESERVATION_STATUSES } from "@/db/schema/hotel";

export const dynamic = "force-dynamic";

const createReservationSchema = z.object({
  outletId: z.string().uuid().optional(),
  guestId: z.string().uuid("guestId must be a valid UUID"),
  roomTypeId: z.string().uuid("roomTypeId must be a valid UUID"),
  assignedRoomId: z.string().uuid().optional(),
  arrivalDate: z.string().min(1, "arrivalDate is required"),
  departureDate: z.string().min(1, "departureDate is required"),
  adultCount: z.number().int().min(1).default(1),
  childrenCount: z.number().int().min(0).default(0),
  specialRequests: z.string().optional(),
  status: z.enum(HOTEL_RESERVATION_STATUSES).optional(),
});

export async function GET(req: NextRequest) {
  try {
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
        return apiSuccess([], ctx.requestId, 200);
      }
    }

    const status = req.nextUrl.searchParams.get("status") || undefined;
    const roomTypeId = req.nextUrl.searchParams.get("roomTypeId") || undefined;
    const assignedRoomId = req.nextUrl.searchParams.get("assignedRoomId") || undefined;
    const arrivalAfterStr = req.nextUrl.searchParams.get("arrivalAfter");
    const departureBeforeStr = req.nextUrl.searchParams.get("departureBefore");
    const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
    const offset = Number(req.nextUrl.searchParams.get("offset") || 0);

    const result = await listReservations(tenantId, outletId, {
      status,
      roomTypeId,
      assignedRoomId,
      arrivalAfter: arrivalAfterStr ? new Date(arrivalAfterStr) : undefined,
      departureBefore: departureBeforeStr ? new Date(departureBeforeStr) : undefined,
      limit,
      offset,
    });

    return apiSuccess(result.reservations, ctx.requestId, 200, {
      total: result.total,
      limit,
      offset,
      outletId,
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = createReservationSchema.safeParse(rawBody);
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
        throw new ValidationError("No hotel property found. Create a property first.");
      }
    }

    const idempotencyKey = req.headers.get("idempotency-key");
    if (idempotencyKey) {
      const requestHash = computeRequestHash("POST", "/api/v1/hotel/reservations", rawBody);
      const idempResult = await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, requestHash);
      if (!idempResult.acquired && idempResult.cachedResponse) {
        return Response.json(idempResult.cachedResponse.body, {
          status: idempResult.cachedResponse.code,
          headers: { "X-Idempotent-Replay": "true", "Content-Type": "application/json" },
        });
      }

      const reservation = await createReservation(tenantId, outletId, parsed.data, ctx.user?.sub);
      const responsePayload = {
        success: true,
        data: reservation,
        meta: { requestId: ctx.requestId, timestamp: new Date().toISOString() },
      };
      await saveIdempotentResponse(tenantId, idempotencyKey, 201, responsePayload);

      return apiSuccess(reservation, ctx.requestId, 201);
    }

    const reservation = await createReservation(tenantId, outletId, parsed.data, ctx.user?.sub);
    return apiSuccess(reservation, ctx.requestId, 201);
  } catch (err) {
    return apiError(err);
  }
}
