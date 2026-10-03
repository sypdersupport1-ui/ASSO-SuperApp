import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError, PermissionDeniedError } from "@/lib/api/errors";
import {
  listReservations,
  createReservation,
  type CreateReservationInput,
} from "@/lib/restaurant/reservation-service";
import { listRestaurantOutlets } from "@/lib/restaurant/table-service";
import { ensureRestaurantSeedData, DEMO_TENANT_ID } from "@/lib/restaurant/seed";
import {
  computeRequestHash,
  checkOrAcquireIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/api/idempotency";
import {
  RESTAURANT_RESERVATION_STATUSES,
  RESTAURANT_RESERVATION_SOURCES,
} from "@/db/schema/restaurant";

export const dynamic = "force-dynamic";

const createReservationSchema = z.object({
  outletId: z.string().uuid("outletId must be a valid UUID").optional(),
  customerName: z.string().min(2, "Customer name must be at least 2 characters").max(255),
  customerPhone: z.string().min(7, "Customer phone must be at least 7 digits").max(50),
  customerEmail: z.string().email("Invalid email format").optional().or(z.literal("")),
  partySize: z.number().int().min(1, "Party size must be at least 1"),
  reservationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "reservationDate must be YYYY-MM-DD"),
  reservationTime: z.string().regex(/^\d{2}:\d{2}$/, "reservationTime must be HH:MM"),
  durationMinutes: z.number().int().positive().optional(),
  assignedTableId: z.string().uuid("assignedTableId must be a valid UUID").optional().nullable(),
  sectionId: z.string().uuid("sectionId must be a valid UUID").optional().nullable(),
  notes: z.string().max(1000).optional(),
  source: z.enum(RESTAURANT_RESERVATION_SOURCES).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requiredPermission: "restaurant.reservations.view",
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

    const date = req.nextUrl.searchParams.get("date") || undefined;
    const startDate = req.nextUrl.searchParams.get("startDate") || undefined;
    const endDate = req.nextUrl.searchParams.get("endDate") || undefined;
    const statusParam = req.nextUrl.searchParams.get("status") || undefined;
    const assignedTableId = req.nextUrl.searchParams.get("assignedTableId") || undefined;
    const sectionId = req.nextUrl.searchParams.get("sectionId") || undefined;
    const search = req.nextUrl.searchParams.get("search") || undefined;
    const limitParam = req.nextUrl.searchParams.get("limit");
    const offsetParam = req.nextUrl.searchParams.get("offset");

    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100) : 50;
    const offset = offsetParam ? Math.max(0, parseInt(offsetParam, 10) || 0) : 0;

    const reservations = await listReservations(tenantId, outletId, {
      date,
      startDate,
      endDate,
      status: statusParam as any,
      assignedTableId,
      sectionId,
      search,
      limit,
      offset,
    });

    return apiSuccess(reservations, ctx.requestId, 200, {
      outletId,
      limit,
      offset,
      count: reservations.length,
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = createReservationSchema.safeParse(rawBody);
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

    // RBAC & Customer boundary checks:
    // If user is staff, check permission
    if (ctx.user?.sessionType === "STAFF") {
      const perms = ctx.user.permissions || [];
      const hasPerm =
        ctx.user.isSuperAdmin ||
        perms.includes("restaurant.*") ||
        perms.includes("restaurant.reservations.manage") ||
        perms.includes("restaurant.tables.manage");
      if (!hasPerm) {
        throw new PermissionDeniedError("restaurant.reservations.manage");
      }
    } else {
      // Customer-facing reservation flow: customers cannot arbitrarily assign internal tables
      if (parsed.data.assignedTableId) {
        throw new PermissionDeniedError(
          "restaurant.reservations.manage",
          "Table assignment is strictly reserved for authorized restaurant staff."
        );
      }
    }

    // Idempotency check
    const idempotencyKey = req.headers.get("idempotency-key");
    if (idempotencyKey) {
      const requestHash = computeRequestHash("POST", "/api/v1/restaurant/reservations", rawBody);
      const idempResult = await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, requestHash);
      if (!idempResult.acquired && idempResult.cachedResponse) {
        return Response.json(idempResult.cachedResponse.body, {
          status: idempResult.cachedResponse.code,
          headers: { "X-Idempotent-Replay": "true", "Content-Type": "application/json" },
        });
      }

      const input: CreateReservationInput = {
        customerName: parsed.data.customerName,
        customerPhone: parsed.data.customerPhone,
        customerEmail: parsed.data.customerEmail || undefined,
        partySize: parsed.data.partySize,
        reservationDate: parsed.data.reservationDate,
        reservationTime: parsed.data.reservationTime,
        durationMinutes: parsed.data.durationMinutes,
        assignedTableId: parsed.data.assignedTableId || undefined,
        sectionId: parsed.data.sectionId || undefined,
        notes: parsed.data.notes,
        source: parsed.data.source || (ctx.user?.sessionType === "STAFF" ? "STAFF_POS" : "CUSTOMER_WEB"),
      };

      const created = await createReservation(tenantId, outletId, input, ctx.user?.sub);
      const responsePayload = {
        success: true,
        data: created,
        meta: { requestId: ctx.requestId, timestamp: new Date().toISOString() },
      };
      await saveIdempotentResponse(tenantId, idempotencyKey, 201, responsePayload);

      return apiSuccess(created, ctx.requestId, 201);
    }

    const input: CreateReservationInput = {
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      customerEmail: parsed.data.customerEmail || undefined,
      partySize: parsed.data.partySize,
      reservationDate: parsed.data.reservationDate,
      reservationTime: parsed.data.reservationTime,
      durationMinutes: parsed.data.durationMinutes,
      assignedTableId: parsed.data.assignedTableId || undefined,
      sectionId: parsed.data.sectionId || undefined,
      notes: parsed.data.notes,
      source: parsed.data.source || (ctx.user?.sessionType === "STAFF" ? "STAFF_POS" : "CUSTOMER_WEB"),
    };

    const created = await createReservation(tenantId, outletId, input, ctx.user?.sub);
    return apiSuccess(created, ctx.requestId, 201);
  } catch (err) {
    return apiError(err);
  }
}
