import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { listRoomTypes, createRoomType, listHotelProperties } from "@/lib/hotel/service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";
import {
  computeRequestHash,
  checkOrAcquireIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/api/idempotency";

export const dynamic = "force-dynamic";

const createRoomTypeSchema = z.object({
  outletId: z.string().uuid("outletId must be a valid UUID").optional(),
  code: z.string().min(2, "Code must be at least 2 characters").max(50),
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  description: z.string().optional(),
  baseOccupancy: z.number().int().min(1, "Base occupancy must be at least 1").default(2),
  maxOccupancy: z.number().int().min(1, "Max occupancy must be at least 1").default(3),
  baseRate: z.union([z.string(), z.number()]),
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
      // Default to first active hotel property
      const properties = await listHotelProperties(tenantId);
      if (properties.length > 0) {
        outletId = properties[0].outletId;
      } else {
        return apiSuccess([], ctx.requestId, 200);
      }
    }

    const roomTypes = await listRoomTypes(tenantId, outletId);
    return apiSuccess(roomTypes, ctx.requestId, 200, { outletId });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = createRoomTypeSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        "Payload validation failed",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    const ctx = extractRequestContext(req, {
      requiredModule: "HOTEL",
      requiredPermission: "hotel.room_types.manage",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = parsed.data.outletId || ctx.outletId;

    if (!outletId) {
      const properties = await listHotelProperties(tenantId);
      if (properties.length > 0) {
        outletId = properties[0].outletId;
      } else {
        throw new ValidationError("No hotel property found for this tenant. Create a property first.");
      }
    }

    const idempotencyKey = req.headers.get("idempotency-key");
    if (idempotencyKey) {
      const requestHash = computeRequestHash("POST", "/api/v1/hotel/room-types", rawBody);
      const idempResult = await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, requestHash);
      if (!idempResult.acquired && idempResult.cachedResponse) {
        return Response.json(idempResult.cachedResponse.body, {
          status: idempResult.cachedResponse.code,
          headers: { "X-Idempotent-Replay": "true", "Content-Type": "application/json" },
        });
      }

      const created = await createRoomType(tenantId, outletId, parsed.data, ctx.user?.sub);
      const responsePayload = {
        success: true,
        data: created,
        meta: { requestId: ctx.requestId, timestamp: new Date().toISOString() },
      };
      await saveIdempotentResponse(tenantId, idempotencyKey, 201, responsePayload);

      return apiSuccess(created, ctx.requestId, 201);
    }

    const created = await createRoomType(tenantId, outletId, parsed.data, ctx.user?.sub);
    return apiSuccess(created, ctx.requestId, 201);
  } catch (err) {
    return apiError(err);
  }
}
