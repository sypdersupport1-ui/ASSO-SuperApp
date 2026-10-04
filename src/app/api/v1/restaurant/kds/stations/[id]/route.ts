import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { authenticateKdsStaff } from "@/lib/restaurant/kds-auth";
import {
  getKitchenStation,
  updateKitchenStation,
} from "@/lib/restaurant/kds-service";
import { DEMO_TENANT_ID } from "@/lib/restaurant/seed";

export const dynamic = "force-dynamic";

const updateStationSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requireAuth: true,
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    authenticateKdsStaff(
      ctx,
      ["restaurant.kds.view", "fulfillment.kds.view", "restaurant.kds.manage"],
      tenantId
    );

    const station = await getKitchenStation(tenantId, id);
    return apiSuccess(station, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const rawBody = await req.json();
    const parsed = updateStationSchema.safeParse(rawBody);
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
    authenticateKdsStaff(ctx, ["restaurant.kds.manage"], tenantId);

    const updated = await updateKitchenStation(tenantId, id, {
      name: parsed.data.name,
      description: parsed.data.description ?? undefined,
      displayOrder: parsed.data.displayOrder,
      isActive: parsed.data.isActive,
    });

    return apiSuccess(updated, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
