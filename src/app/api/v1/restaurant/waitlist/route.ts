import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError, PermissionDeniedError } from "@/lib/api/errors";
import {
  listWaitlist,
  addToWaitlist,
  type AddToWaitlistInput,
} from "@/lib/restaurant/waitlist-service";
import { listRestaurantOutlets } from "@/lib/restaurant/table-service";
import { ensureRestaurantSeedData, DEMO_TENANT_ID } from "@/lib/restaurant/seed";
import {
  computeRequestHash,
  checkOrAcquireIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/api/idempotency";
import { RESTAURANT_WAITLIST_STATUSES } from "@/db/schema/restaurant";

export const dynamic = "force-dynamic";

const addToWaitlistSchema = z.object({
  outletId: z.string().uuid("outletId must be a valid UUID").optional(),
  customerName: z.string().min(2, "Customer name must be at least 2 characters").max(255),
  customerPhone: z.string().min(7, "Customer phone must be at least 7 digits").max(50),
  customerEmail: z.string().email("Invalid email format").optional().or(z.literal("")),
  partySize: z.number().int().min(1, "Party size must be at least 1"),
  preferredSectionId: z.string().uuid("preferredSectionId must be a valid UUID").optional().nullable(),
  estimatedWaitMinutes: z.number().int().positive().optional(),
  notes: z.string().max(1000).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requiredPermission: "restaurant.waitlist.view",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = req.nextUrl.searchParams.get("outletId") || ctx.outletId;

    if (!outletId) {
      const outletsList = await listRestaurantOutlets(tenantId);
      if (outletsList.length === 0) {
        const seeded = await ensureRestaurantSeedData(tenantId);
        outletId = seeded.outlet.outletId;
      } else {
        outletId = outletsList[0].outletId;
      }
    }

    const statusParam = req.nextUrl.searchParams.get("status") || undefined;
    const search = req.nextUrl.searchParams.get("search") || undefined;
    const limitParam = req.nextUrl.searchParams.get("limit");
    const offsetParam = req.nextUrl.searchParams.get("offset");

    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100) : 50;
    const offset = offsetParam ? Math.max(0, parseInt(offsetParam, 10) || 0) : 0;

    const waitlist = await listWaitlist(tenantId, outletId, {
      status: statusParam as any,
      search,
      limit,
      offset,
    });

    return apiSuccess(waitlist, ctx.requestId, 200, {
      outletId,
      limit,
      offset,
      count: waitlist.length,
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = addToWaitlistSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        "Payload validation failed",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
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

    // RBAC validation:
    if (ctx.user?.sessionType === "STAFF") {
      const perms = ctx.user.permissions || [];
      const hasPerm =
        ctx.user.isSuperAdmin ||
        perms.includes("restaurant.*") ||
        perms.includes("restaurant.waitlist.manage") ||
        perms.includes("restaurant.tables.manage");
      if (!hasPerm) {
        throw new PermissionDeniedError("restaurant.waitlist.manage");
      }
    }

    // Idempotency check
    const idempotencyKey = req.headers.get("idempotency-key");
    if (idempotencyKey) {
      const requestHash = computeRequestHash("POST", "/api/v1/restaurant/waitlist", rawBody);
      const idempResult = await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, requestHash);
      if (!idempResult.acquired && idempResult.cachedResponse) {
        return Response.json(idempResult.cachedResponse.body, {
          status: idempResult.cachedResponse.code,
          headers: { "X-Idempotent-Replay": "true", "Content-Type": "application/json" },
        });
      }

      const input: AddToWaitlistInput = {
        customerName: parsed.data.customerName,
        customerPhone: parsed.data.customerPhone,
        customerEmail: parsed.data.customerEmail || undefined,
        partySize: parsed.data.partySize,
        preferredSectionId: parsed.data.preferredSectionId || undefined,
        estimatedWaitMinutes: parsed.data.estimatedWaitMinutes,
        notes: parsed.data.notes,
      };

      const created = await addToWaitlist(tenantId, outletId, input, ctx.user?.sub);
      const responsePayload = {
        success: true,
        data: created,
        meta: { requestId: ctx.requestId, timestamp: new Date().toISOString() },
      };
      await saveIdempotentResponse(tenantId, idempotencyKey, 201, responsePayload);

      return apiSuccess(created, ctx.requestId, 201);
    }

    const input: AddToWaitlistInput = {
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      customerEmail: parsed.data.customerEmail || undefined,
      partySize: parsed.data.partySize,
      preferredSectionId: parsed.data.preferredSectionId || undefined,
      estimatedWaitMinutes: parsed.data.estimatedWaitMinutes,
      notes: parsed.data.notes,
    };

    const created = await addToWaitlist(tenantId, outletId, input, ctx.user?.sub);
    return apiSuccess(created, ctx.requestId, 201);
  } catch (err) {
    return apiError(err);
  }
}
