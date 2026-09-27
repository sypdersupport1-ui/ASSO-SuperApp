import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError, PermissionDeniedError } from "@/lib/api/errors";
import { hasPermission } from "@/lib/auth/rbac";
import { executeCheckOut, getStayById } from "@/lib/hotel/stay-service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";
import {
  computeRequestHash,
  checkOrAcquireIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/api/idempotency";

export const dynamic = "force-dynamic";

const checkOutSchema = z.object({
  notes: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: stayId } = await params;

    let rawBody: Record<string, unknown> = {};
    try {
      const text = await req.text();
      if (text && text.trim().length > 0) {
        rawBody = JSON.parse(text);
      }
    } catch {
      throw new ValidationError("Invalid JSON body.");
    }

    const parsed = checkOutSchema.safeParse(rawBody);
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
      !hasPermission(ctx.user, "hotel.checkout")
    ) {
      throw new PermissionDeniedError("hotel.stays.manage");
    }

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;

    // Fetch stay to verify existence and get outletId
    const stay = await getStayById(tenantId, stayId);
    const outletId = stay.outletId;

    const idempotencyKey = req.headers.get("idempotency-key");
    if (idempotencyKey) {
      const requestHash = computeRequestHash("POST", `/api/v1/hotel/stays/${stayId}/check-out`, rawBody);
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

    const updatedStay = await executeCheckOut(
      tenantId,
      outletId,
      {
        stayId,
        notes: parsed.data.notes,
      },
      ctx.user?.sub
    );

    const responseBody = {
      success: true,
      data: updatedStay,
      meta: {
        requestId: ctx.requestId,
        timestamp: new Date().toISOString(),
      },
    };

    if (idempotencyKey) {
      await saveIdempotentResponse(tenantId, idempotencyKey, 200, responseBody);
    }

    return apiSuccess(updatedStay, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
