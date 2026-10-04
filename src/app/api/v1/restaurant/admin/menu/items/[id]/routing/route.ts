import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { authenticateKdsStaff } from "@/lib/restaurant/kds-auth";
import { updateMenuItemStationRouting } from "@/lib/restaurant/kds-service";
import { DEMO_TENANT_ID } from "@/lib/restaurant/seed";

export const dynamic = "force-dynamic";

const routingSchema = z.object({
  stationId: z.string().uuid("stationId must be a valid UUID").optional().nullable(),
  stationCode: z.string().max(50).optional(),
});

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const rawBody = await req.json();
    const parsed = routingSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        "Payload validation failed",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requireAuth: true,
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    authenticateKdsStaff(ctx, ["catalog.manage", "restaurant.kds.manage"], tenantId);

    await updateMenuItemStationRouting(
      tenantId,
      id,
      parsed.data.stationId || null,
      parsed.data.stationCode
    );

    return apiSuccess({ success: true, itemId: id }, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
