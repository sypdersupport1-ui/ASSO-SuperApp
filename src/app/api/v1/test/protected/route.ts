import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import {
  computeRequestHash,
  checkOrAcquireIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/api/idempotency";
import { ValidationError } from "@/lib/api/errors";

const mutationSchema = z.object({
  action: z.string().default("test_mutation"),
  amount: z.number().optional(),
  payload: z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();

    const parsed = mutationSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        "Payload validation failed",
        parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          issue: i.message,
        }))
      );
    }

    // 1. Enforce 5-layer security check
    const ctx = extractRequestContext(req, {
      requireAuth: true,
      requiredModule: "INVENTORY",
      requiredPermission: "inventory.adjust",
      policyAction: "inventory.adjust",
      policyAmount: parsed.data.amount,
    });

    const tenantId = ctx.tenantId!;
    const idempotencyKey = req.headers.get("idempotency-key");

    // 2. Handle Idempotency if key is present
    if (idempotencyKey) {
      const requestHash = computeRequestHash("POST", "/api/v1/test/protected", rawBody);
      const idempResult = await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, requestHash);

      if (!idempResult.acquired && idempResult.cachedResponse) {
        // Return cached replay response
        return NextResponse.json(idempResult.cachedResponse.body, {
          status: idempResult.cachedResponse.code,
          headers: { "X-Idempotent-Replay": "true" },
        });
      }

      // Fresh mutation execution
      const responseData = {
        message: "Protected mutation executed successfully",
        tenantId,
        userSub: ctx.user?.sub,
        data: parsed.data,
      };

      const response = apiSuccess(responseData, ctx.requestId, 201);
      const jsonBody = {
        success: true,
        data: responseData,
        meta: { requestId: ctx.requestId, timestamp: new Date().toISOString() },
      };

      await saveIdempotentResponse(tenantId, idempotencyKey, 201, jsonBody);
      return response;
    }

    // Non-idempotent flow
    return apiSuccess(
      {
        message: "Protected mutation executed successfully",
        tenantId,
        userSub: ctx.user?.sub,
        data: parsed.data,
      },
      ctx.requestId,
      200
    );
  } catch (err) {
    return apiError(err);
  }
}
