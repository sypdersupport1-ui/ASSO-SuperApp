import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { transferTableSession } from "@/lib/restaurant/session-service";
import { listRestaurantOutlets } from "@/lib/restaurant/table-service";
import { ensureRestaurantSeedData, DEMO_TENANT_ID } from "@/lib/restaurant/seed";
import {
  computeRequestHash,
  checkOrAcquireIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/api/idempotency";

export const dynamic = "force-dynamic";

const transferSessionSchema = z.object({
  outletId: z.string().uuid("outletId must be a valid UUID").optional(),
  targetTableId: z.string().uuid("targetTableId must be a valid UUID"),
  notes: z.string().optional(),
  nextSourceTableStatus: z.enum(["CLEANING", "AVAILABLE"]).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const rawBody = await req.json();
    const parsed = transferSessionSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        "Payload validation failed",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requiredPermission: "restaurant.sessions.manage",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = parsed.data.outletId || ctx.outletId;

    if (!outletId) {
      const outletsList = await listRestaurantOutlets(tenantId);
      if (outletsList.length > 0) {
        outletId = outletsList[0].outletId;
      } else {
        const seeded = await ensureRestaurantSeedData(tenantId);
        outletId = seeded.outlet.outletId;
      }
    }

    // Idempotency check if header provided
    const idempotencyKey = req.headers.get("idempotency-key");
    if (idempotencyKey) {
      const requestHash = computeRequestHash("POST", `/api/v1/restaurant/sessions/${sessionId}/transfer`, rawBody);
      const idempResult = await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, requestHash);
      if (!idempResult.acquired && idempResult.cachedResponse) {
        return Response.json(idempResult.cachedResponse.body, {
          status: idempResult.cachedResponse.code,
          headers: { "X-Idempotent-Replay": "true", "Content-Type": "application/json" },
        });
      }

      const result = await transferTableSession(
        tenantId,
        outletId,
        sessionId,
        {
          targetTableId: parsed.data.targetTableId,
          notes: parsed.data.notes,
          nextSourceTableStatus: parsed.data.nextSourceTableStatus,
        },
        ctx.user?.sub
      );

      const responsePayload = {
        success: true,
        data: result,
        meta: { requestId: ctx.requestId, timestamp: new Date().toISOString() },
      };
      await saveIdempotentResponse(tenantId, idempotencyKey, 200, responsePayload);

      return apiSuccess(result, ctx.requestId, 200);
    }

    const result = await transferTableSession(
      tenantId,
      outletId,
      sessionId,
      {
        targetTableId: parsed.data.targetTableId,
        notes: parsed.data.notes,
        nextSourceTableStatus: parsed.data.nextSourceTableStatus,
      },
      ctx.user?.sub
    );

    return apiSuccess(result, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
