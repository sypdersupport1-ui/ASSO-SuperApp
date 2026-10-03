import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError, PermissionDeniedError } from "@/lib/api/errors";
import { assertPermission } from "@/lib/auth/rbac";
import {
  generateRestaurantBill,
  listBills,
} from "@/lib/restaurant/billing-service";
import { listRestaurantOutlets } from "@/lib/restaurant/table-service";
import { ensureRestaurantSeedData } from "@/lib/restaurant/seed";
import {
  computeRequestHash,
  checkOrAcquireIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/api/idempotency";

export const dynamic = "force-dynamic";

const generateBillSchema = z.object({
  outletId: z.string().uuid().optional(),
  tableSessionId: z.string().uuid().optional(),
  orderIds: z.array(z.string().uuid()).optional(),
  notes: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  try {
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

    const outletId = req.nextUrl.searchParams.get("outletId") || ctx.outletId || undefined;
    const status = req.nextUrl.searchParams.get("status") || undefined;
    const tableSessionId = req.nextUrl.searchParams.get("tableSessionId") || undefined;
    const limitParam = req.nextUrl.searchParams.get("limit");
    const offsetParam = req.nextUrl.searchParams.get("offset");

    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100) : 50;
    const offset = offsetParam ? Math.max(0, parseInt(offsetParam, 10) || 0) : 0;

    const billsList = await listBills(tenantId, {
      outletId,
      status,
      tableSessionId,
      limit,
      offset,
    });

    return apiSuccess(billsList, ctx.requestId, 200, { total: billsList.length });
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_restaurant_bills_get");
  }
}

export async function POST(req: NextRequest) {
  try {
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
    const parsed = generateBillSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(
        "Invalid bill generation input payload",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    let outletId = parsed.data.outletId || ctx.outletId;
    if (!outletId) {
      const outletsList = await listRestaurantOutlets(tenantId);
      if (outletsList.length === 0) {
        const seeded = await ensureRestaurantSeedData(tenantId);
        outletId = seeded.outlet.outletId;
      } else {
        outletId = outletsList[0].outletId;
      }
    }

    // Idempotency check
    const idempotencyKey = req.headers.get("idempotency-key");
    if (idempotencyKey) {
      const requestHash = computeRequestHash("POST", "/api/v1/restaurant/bills", rawBody);
      const idempResult = await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, requestHash);
      if (!idempResult.acquired && idempResult.cachedResponse) {
        return Response.json(idempResult.cachedResponse.body, {
          status: idempResult.cachedResponse.code,
          headers: { "X-Idempotent-Replay": "true", "Content-Type": "application/json" },
        });
      }

      const generated = await generateRestaurantBill(
        tenantId,
        outletId,
        {
          tableSessionId: parsed.data.tableSessionId,
          orderIds: parsed.data.orderIds,
          notes: parsed.data.notes,
        },
        ctx.user
      );

      const responsePayload = {
        success: true,
        data: generated,
        meta: { requestId: ctx.requestId, timestamp: new Date().toISOString() },
      };
      await saveIdempotentResponse(tenantId, idempotencyKey, 201, responsePayload);

      return apiSuccess(generated, ctx.requestId, 201);
    }

    const generated = await generateRestaurantBill(
      tenantId,
      outletId,
      {
        tableSessionId: parsed.data.tableSessionId,
        orderIds: parsed.data.orderIds,
        notes: parsed.data.notes,
      },
      ctx.user
    );

    return apiSuccess(generated, ctx.requestId, 201);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_restaurant_bills_post");
  }
}
