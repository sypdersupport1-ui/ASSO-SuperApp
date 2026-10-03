import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError, PermissionDeniedError } from "@/lib/api/errors";
import { assertPermission } from "@/lib/auth/rbac";
import {
  recordBillPayment,
  getBillDetails,
} from "@/lib/restaurant/billing-service";
import {
  computeRequestHash,
  checkOrAcquireIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/api/idempotency";

export const dynamic = "force-dynamic";

const paymentSchema = z.object({
  portionId: z.string().uuid().optional(),
  amount: z.union([z.string(), z.number()]),
  paymentMethod: z.enum(["CASH", "UPI", "CARD", "NETBANKING", "GATEWAY", "HOUSE_ACCOUNT"]).default("CASH"),
  gatewayTransactionReference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: billId } = await params;
    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
    });

    const tenantId = ctx.tenantId;
    if (!tenantId) {
      throw new ValidationError("Missing tenant context.");
    }

    if (ctx.user?.sessionType === "STAFF") {
      assertPermission(ctx.user, "restaurant.bills.view", tenantId);
    } else {
      throw new PermissionDeniedError("restaurant.bills.view");
    }

    const bill = await getBillDetails(tenantId, billId);
    return apiSuccess(bill.payments, ctx.requestId, 200);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_restaurant_payments_get");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: billId } = await params;
    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
    });

    const tenantId = ctx.tenantId;
    if (!tenantId) {
      throw new ValidationError("Missing tenant context.");
    }

    if (ctx.user?.sessionType === "STAFF") {
      assertPermission(ctx.user, "restaurant.bills.manage", tenantId);
    } else {
      throw new PermissionDeniedError("restaurant.bills.manage");
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsed = paymentSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(
        "Invalid payment input payload",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    // Idempotency check
    const idempotencyKey = req.headers.get("idempotency-key");
    if (idempotencyKey) {
      const requestHash = computeRequestHash("POST", `/api/v1/restaurant/bills/${billId}/payments`, rawBody);
      const idempResult = await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, requestHash);
      if (!idempResult.acquired && idempResult.cachedResponse) {
        return Response.json(idempResult.cachedResponse.body, {
          status: idempResult.cachedResponse.code,
          headers: { "X-Idempotent-Replay": "true", "Content-Type": "application/json" },
        });
      }

      const updatedBill = await recordBillPayment(
        tenantId,
        billId,
        {
          portionId: parsed.data.portionId,
          amount: parsed.data.amount,
          paymentMethod: parsed.data.paymentMethod,
          gatewayTransactionReference: parsed.data.gatewayTransactionReference,
          notes: parsed.data.notes,
          idempotencyKey,
        },
        ctx.user
      );

      const responsePayload = {
        success: true,
        data: updatedBill,
        meta: { requestId: ctx.requestId, timestamp: new Date().toISOString() },
      };
      await saveIdempotentResponse(tenantId, idempotencyKey, 201, responsePayload);

      return apiSuccess(updatedBill, ctx.requestId, 201);
    }

    const updatedBill = await recordBillPayment(
      tenantId,
      billId,
      {
        portionId: parsed.data.portionId,
        amount: parsed.data.amount,
        paymentMethod: parsed.data.paymentMethod,
        gatewayTransactionReference: parsed.data.gatewayTransactionReference,
        notes: parsed.data.notes,
      },
      ctx.user
    );

    return apiSuccess(updatedBill, ctx.requestId, 201);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_restaurant_payments_post");
  }
}
