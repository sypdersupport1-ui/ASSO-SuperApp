import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { postAdjustment } from "@/lib/hotel/folio-service";
import { listHotelProperties } from "@/lib/hotel/service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";
import {
  computeRequestHash,
  checkOrAcquireIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/api/idempotency";

export const dynamic = "force-dynamic";

const adjustmentSchema = z.object({
  outletId: z.string().uuid().optional(),
  amount: z.union([z.number(), z.string()]),
  reason: z.string().min(1, "Reason is mandatory for adjustments").max(500),
  reversesEntryId: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ stayId: string }> }
) {
  try {
    const { stayId } = await params;

    const ctx = extractRequestContext(req, {
      requiredModule: "HOTEL",
      requiredPermission: "hotel.stays.manage",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    const body = await req.json().catch(() => ({}));
    const parseResult = adjustmentSchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError(
        "Invalid adjustment input payload",
        parseResult.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    const input = parseResult.data;
    let outletId = input.outletId || req.nextUrl.searchParams.get("outletId") || ctx.outletId;

    if (!outletId) {
      const properties = await listHotelProperties(tenantId);
      if (properties.length > 0) {
        outletId = properties[0].outletId;
      } else {
        outletId = "00000000-0000-0000-0000-000000000002";
      }
    }

    const staffUserId = ctx.user?.sub || req.headers.get("x-user-id") || undefined;

    // Idempotency check
    const idempotencyKey = req.headers.get("idempotency-key");
    if (idempotencyKey) {
      const requestHash = computeRequestHash("POST", `/api/v1/hotel/folios/${stayId}/adjustments`, body);
      const idempotencyResult = await checkOrAcquireIdempotencyKey(
        tenantId,
        idempotencyKey,
        requestHash
      );

      if (!idempotencyResult.acquired && idempotencyResult.cachedResponse) {
        return apiSuccess(
          idempotencyResult.cachedResponse.body,
          ctx.requestId,
          idempotencyResult.cachedResponse.code || 201
        );
      }
    }

    const folioResult = await postAdjustment({
      tenantId,
      outletId,
      stayId,
      input: {
        amount: input.amount,
        reason: input.reason,
        reversesEntryId: input.reversesEntryId,
        notes: input.notes,
      },
      postedByStaffId: staffUserId,
    });

    if (idempotencyKey) {
      await saveIdempotentResponse(tenantId, idempotencyKey, 201, folioResult);
    }

    return apiSuccess(folioResult, ctx.requestId, 201, { outletId });
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_folio_adjustment");
  }
}
