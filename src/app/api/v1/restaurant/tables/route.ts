import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import {
  listTables,
  createTable,
  listRestaurantOutlets,
} from "@/lib/restaurant/table-service";
import { ensureRestaurantSeedData, DEMO_TENANT_ID } from "@/lib/restaurant/seed";
import {
  computeRequestHash,
  checkOrAcquireIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/api/idempotency";
import { RESTAURANT_TABLE_STATUSES } from "@/db/schema/restaurant";

export const dynamic = "force-dynamic";

const createTableSchema = z.object({
  outletId: z.string().uuid("outletId must be a valid UUID").optional(),
  tableNumber: z.string().min(1, "Table number is required").max(50),
  displayLabel: z.string().max(100).optional(),
  capacity: z.number().int().min(1, "Capacity must be at least 1").optional(),
  section: z.string().max(100).optional(),
  status: z.enum(RESTAURANT_TABLE_STATUSES).optional(),
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

    const section = req.nextUrl.searchParams.get("section") || undefined;
    const status = req.nextUrl.searchParams.get("status") || undefined;
    const isActiveParam = req.nextUrl.searchParams.get("isActive");
    const isActive = isActiveParam !== null ? isActiveParam === "true" : undefined;
    const limitParam = req.nextUrl.searchParams.get("limit");
    const offsetParam = req.nextUrl.searchParams.get("offset");
    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100) : 50;
    const offset = offsetParam ? Math.max(0, parseInt(offsetParam, 10) || 0) : 0;

    const tables = await listTables(tenantId, outletId, {
      section,
      status,
      isActive,
      limit,
      offset,
    });

    return apiSuccess(tables, ctx.requestId, 200, { outletId, limit, offset, count: tables.length });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = createTableSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        "Payload validation failed",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requiredPermission: "restaurant.tables.manage",
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
      const requestHash = computeRequestHash("POST", "/api/v1/restaurant/tables", rawBody);
      const idempResult = await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, requestHash);
      if (!idempResult.acquired && idempResult.cachedResponse) {
        return Response.json(idempResult.cachedResponse.body, {
          status: idempResult.cachedResponse.code,
          headers: { "X-Idempotent-Replay": "true", "Content-Type": "application/json" },
        });
      }

      const created = await createTable(tenantId, outletId, parsed.data, ctx.user?.sub);
      const responsePayload = {
        success: true,
        data: created,
        meta: { requestId: ctx.requestId, timestamp: new Date().toISOString() },
      };
      await saveIdempotentResponse(tenantId, idempotencyKey, 201, responsePayload);

      return apiSuccess(created, ctx.requestId, 201);
    }

    const created = await createTable(tenantId, outletId, parsed.data, ctx.user?.sub);
    return apiSuccess(created, ctx.requestId, 201);
  } catch (err) {
    return apiError(err);
  }
}
