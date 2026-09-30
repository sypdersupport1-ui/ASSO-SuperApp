import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import {
  openTableSession,
  listTableSessions,
} from "@/lib/restaurant/session-service";
import { listRestaurantOutlets } from "@/lib/restaurant/table-service";
import { ensureRestaurantSeedData, DEMO_TENANT_ID } from "@/lib/restaurant/seed";
import {
  computeRequestHash,
  checkOrAcquireIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/api/idempotency";

export const dynamic = "force-dynamic";

const openSessionSchema = z.object({
  outletId: z.string().uuid().optional(),
  tableId: z.string().uuid("tableId must be a valid UUID"),
  guestCount: z.number().int().min(1, "Guest count must be at least 1").optional(),
  customerName: z.string().max(100).optional(),
  customerPhone: z.string().max(50).optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requiredPermission: "restaurant.tables.view",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = req.nextUrl.searchParams.get("outletId") || ctx.outletId;

    if (!outletId) {
      let outletsList = await listRestaurantOutlets(tenantId);
      if (outletsList.length === 0) {
        const seeded = await ensureRestaurantSeedData(tenantId);
        outletId = seeded.outlet.outletId;
      } else {
        outletId = outletsList[0].outletId;
      }
    }

    const tableId = req.nextUrl.searchParams.get("tableId") || undefined;
    const status = req.nextUrl.searchParams.get("status") || undefined;
    const limit = req.nextUrl.searchParams.get("limit")
      ? parseInt(req.nextUrl.searchParams.get("limit")!, 10)
      : undefined;
    const offset = req.nextUrl.searchParams.get("offset")
      ? parseInt(req.nextUrl.searchParams.get("offset")!, 10)
      : undefined;

    const sessions = await listTableSessions(tenantId, outletId, {
      tableId,
      status,
      limit,
      offset,
    });

    return apiSuccess(sessions, ctx.requestId, 200, { outletId });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = openSessionSchema.safeParse(rawBody);
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
      let outletsList = await listRestaurantOutlets(tenantId);
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
      const requestHash = computeRequestHash("POST", "/api/v1/restaurant/sessions", rawBody);
      const idempResult = await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, requestHash);
      if (!idempResult.acquired && idempResult.cachedResponse) {
        return Response.json(idempResult.cachedResponse.body, {
          status: idempResult.cachedResponse.code,
          headers: { "X-Idempotent-Replay": "true", "Content-Type": "application/json" },
        });
      }

      const session = await openTableSession(tenantId, outletId, parsed.data, ctx.user?.sub);
      const responsePayload = {
        success: true,
        data: session,
        meta: { requestId: ctx.requestId, timestamp: new Date().toISOString() },
      };
      await saveIdempotentResponse(tenantId, idempotencyKey, 201, responsePayload);

      return apiSuccess(session, ctx.requestId, 201);
    }

    const session = await openTableSession(tenantId, outletId, parsed.data, ctx.user?.sub);
    return apiSuccess(session, ctx.requestId, 201);
  } catch (err) {
    return apiError(err);
  }
}
