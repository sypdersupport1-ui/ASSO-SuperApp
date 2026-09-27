import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError, PermissionDeniedError } from "@/lib/api/errors";
import { hasPermission } from "@/lib/auth/rbac";
import { executeCheckIn } from "@/lib/hotel/stay-service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";
import {
  computeRequestHash,
  checkOrAcquireIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/api/idempotency";

export const dynamic = "force-dynamic";

const checkInSchema = z.object({
  roomId: z.string().uuid("Invalid room ID format").optional(),
  notes: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: reservationId } = await params;

    let rawBody: Record<string, unknown> = {};
    try {
      const text = await req.text();
      if (text && text.trim().length > 0) {
        rawBody = JSON.parse(text);
      }
    } catch {
      throw new ValidationError("Invalid JSON body.");
    }

    const parsed = checkInSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        "Payload validation failed",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    const ctx = extractRequestContext(req, {
      requiredModule: "HOTEL",
    });

    if (
      ctx.user &&
      !hasPermission(ctx.user, "hotel.stays.manage") &&
      !hasPermission(ctx.user, "hotel.manage") &&
      !hasPermission(ctx.user, "hotel.checkin")
    ) {
      throw new PermissionDeniedError("hotel.stays.manage");
    }

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;

    const idempotencyKey = req.headers.get("idempotency-key");
    if (idempotencyKey) {
      const requestHash = computeRequestHash("POST", `/api/v1/hotel/reservations/${reservationId}/check-in`, rawBody);
      const idempResult = await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, requestHash);

      if (!idempResult.acquired && idempResult.cachedResponse) {
        return Response.json(idempResult.cachedResponse.body, {
          status: idempResult.cachedResponse.code,
          headers: {
            "Content-Type": "application/json",
            "x-idempotent-replay": "true",
            "x-request-id": ctx.requestId,
          },
        });
      }
    }

    const stay = await executeCheckIn(
      tenantId,
      undefined,
      {
        reservationId,
        roomId: parsed.data.roomId,
        notes: parsed.data.notes,
      },
      ctx.user?.sub
    );

    const responseBody = {
      success: true,
      data: stay,
      meta: {
        requestId: ctx.requestId,
        timestamp: new Date().toISOString(),
      },
    };

    if (idempotencyKey) {
      await saveIdempotentResponse(tenantId, idempotencyKey, 201, responseBody);
    }

    return apiSuccess(stay, ctx.requestId, 201);
  } catch (err) {
    return apiError(err);
  }
}
