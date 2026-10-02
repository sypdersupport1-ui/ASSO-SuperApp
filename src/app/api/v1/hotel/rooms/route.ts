import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { listRooms, createRoom, listHotelProperties } from "@/lib/hotel/service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";
import {
  computeRequestHash,
  checkOrAcquireIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/api/idempotency";
import {
  HOTEL_OPERATIONAL_STATUSES,
  HOTEL_HOUSEKEEPING_STATUSES,
} from "@/db/schema/hotel";

export const dynamic = "force-dynamic";

const createRoomSchema = z.object({
  outletId: z.string().uuid("outletId must be a valid UUID").optional(),
  roomTypeId: z.string().uuid("roomTypeId must be a valid UUID"),
  roomNumber: z.string().min(1, "Room number is required").max(50),
  floorNumber: z.string().max(20).optional(),
  operationalStatus: z.enum(HOTEL_OPERATIONAL_STATUSES).optional(),
  housekeepingStatus: z.enum(HOTEL_HOUSEKEEPING_STATUSES).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "HOTEL",
      requiredPermission: "hotel.read",
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

    const floorNumber = req.nextUrl.searchParams.get("floorNumber") || undefined;
    const operationalStatus = req.nextUrl.searchParams.get("operationalStatus") || undefined;
    const housekeepingStatus = req.nextUrl.searchParams.get("housekeepingStatus") || undefined;
    const roomTypeId = req.nextUrl.searchParams.get("roomTypeId") || undefined;
    const limitParam = req.nextUrl.searchParams.get("limit");
    const offsetParam = req.nextUrl.searchParams.get("offset");
    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100) : 50;
    const offset = offsetParam ? Math.max(0, parseInt(offsetParam, 10) || 0) : 0;

    const rooms = await listRooms(tenantId, outletId, {
      floorNumber,
      operationalStatus,
      housekeepingStatus,
      roomTypeId,
      limit,
      offset,
    });

    return apiSuccess(rooms, ctx.requestId, 200, { outletId, limit, offset, count: rooms.length });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = createRoomSchema.safeParse(rawBody);
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
        throw new ValidationError("No hotel property found. Create a property first.");
      }
    }

    const idempotencyKey = req.headers.get("idempotency-key");
    if (idempotencyKey) {
      const requestHash = computeRequestHash("POST", "/api/v1/hotel/rooms", rawBody);
      const idempResult = await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, requestHash);
      if (!idempResult.acquired && idempResult.cachedResponse) {
        return Response.json(idempResult.cachedResponse.body, {
          status: idempResult.cachedResponse.code,
          headers: { "X-Idempotent-Replay": "true", "Content-Type": "application/json" },
        });
      }

      const created = await createRoom(tenantId, outletId, parsed.data, ctx.user?.sub);
      const responsePayload = {
        success: true,
        data: created,
        meta: { requestId: ctx.requestId, timestamp: new Date().toISOString() },
      };
      await saveIdempotentResponse(tenantId, idempotencyKey, 201, responsePayload);

      return apiSuccess(created, ctx.requestId, 201);
    }

    const created = await createRoom(tenantId, outletId, parsed.data, ctx.user?.sub);
    return apiSuccess(created, ctx.requestId, 201);
  } catch (err) {
    return apiError(err);
  }
}
