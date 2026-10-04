import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { authenticateKdsStaff } from "@/lib/restaurant/kds-auth";
import { bumpStationTicket } from "@/lib/restaurant/kds-service";
import { DEMO_TENANT_ID } from "@/lib/restaurant/seed";

export const dynamic = "force-dynamic";

const bumpSchema = z
  .object({
    outletId: z.string().uuid("outletId must be a valid UUID"),
    orderId: z.string().uuid("orderId must be a valid UUID"),
    stationRouting: z.string().min(1).optional(),
    stationCode: z.string().min(1).optional(),
    fromStatus: z.enum(["PENDING", "PREPARING", "READY"]),
    toStatus: z.enum(["PREPARING", "READY", "DONE"]),
  })
  .refine((data) => !!(data.stationRouting || data.stationCode), {
    message: "Either stationRouting or stationCode is required",
    path: ["stationRouting"],
  });

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = bumpSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid bump payload",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requireAuth: true,
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    const staff = authenticateKdsStaff(
      ctx,
      ["restaurant.kds.update", "fulfillment.kds.update", "restaurant.kds.manage"],
      tenantId
    );

    const staffId = staff.sub || "system_kds_staff";
    const routing = parsed.data.stationRouting || parsed.data.stationCode!;

    const result = await bumpStationTicket(
      tenantId,
      parsed.data.outletId,
      parsed.data.orderId,
      routing,
      parsed.data.fromStatus,
      parsed.data.toStatus,
      staffId
    );

    return apiSuccess(result, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
