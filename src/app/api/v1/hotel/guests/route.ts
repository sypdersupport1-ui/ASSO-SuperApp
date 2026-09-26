import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { listHotelGuests, createHotelGuest } from "@/lib/hotel/guest-service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";
import {
  computeRequestHash,
  checkOrAcquireIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/api/idempotency";

export const dynamic = "force-dynamic";

const createGuestSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  phone: z.string().optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  idProofType: z.string().optional(),
  idProofNumberMasked: z.string().optional(),
  nationality: z.string().optional(),
  vipStatus: z.enum(["STANDARD", "VIP", "VVIP"]).optional(),
  preferences: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "HOTEL",
      requiredPermission: "hotel.guests.read",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    const search = req.nextUrl.searchParams.get("search") || undefined;
    const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
    const offset = Number(req.nextUrl.searchParams.get("offset") || 0);

    const result = await listHotelGuests(tenantId, { search, limit, offset });

    return apiSuccess(result.guests, ctx.requestId, 200, {
      total: result.total,
      limit,
      offset,
      tenantId,
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = createGuestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        "Payload validation failed",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    const ctx = extractRequestContext(req, {
      requiredModule: "HOTEL",
      requiredPermission: "hotel.guests.manage",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    const idempotencyKey = req.headers.get("idempotency-key");

    if (idempotencyKey) {
      const requestHash = computeRequestHash("POST", "/api/v1/hotel/guests", rawBody);
      const idempResult = await checkOrAcquireIdempotencyKey(tenantId, idempotencyKey, requestHash);
      if (!idempResult.acquired && idempResult.cachedResponse) {
        return Response.json(idempResult.cachedResponse.body, {
          status: idempResult.cachedResponse.code,
          headers: { "X-Idempotent-Replay": "true", "Content-Type": "application/json" },
        });
      }

      const guest = await createHotelGuest(
        tenantId,
        {
          ...parsed.data,
          email: parsed.data.email || undefined,
        },
        ctx.user?.sub
      );

      const responsePayload = {
        success: true,
        data: guest,
        meta: { requestId: ctx.requestId, timestamp: new Date().toISOString() },
      };
      await saveIdempotentResponse(tenantId, idempotencyKey, 201, responsePayload);

      return apiSuccess(guest, ctx.requestId, 201);
    }

    const guest = await createHotelGuest(
      tenantId,
      {
        ...parsed.data,
        email: parsed.data.email || undefined,
      },
      ctx.user?.sub
    );

    return apiSuccess(guest, ctx.requestId, 201);
  } catch (err) {
    return apiError(err);
  }
}
