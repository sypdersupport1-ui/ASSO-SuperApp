import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { authenticateKdsStaff } from "@/lib/restaurant/kds-auth";
import { updateKdsTaskStatus } from "@/lib/restaurant/kds-service";
import { DEMO_TENANT_ID } from "@/lib/restaurant/seed";

export const dynamic = "force-dynamic";

const updateStatusSchema = z.object({
  status: z.enum(["PREPARING", "READY", "DONE", "CANCELLED"]),
});

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const rawBody = await req.json();
    const parsed = updateStatusSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid status transition payload",
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

    await updateKdsTaskStatus(tenantId, id, parsed.data.status, staffId);

    return apiSuccess({ success: true, taskId: id, status: parsed.data.status }, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
