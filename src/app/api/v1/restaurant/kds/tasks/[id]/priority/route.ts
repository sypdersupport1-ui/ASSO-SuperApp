import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { authenticateKdsStaff } from "@/lib/restaurant/kds-auth";
import { updateKdsTaskPriority } from "@/lib/restaurant/kds-service";
import { DEMO_TENANT_ID } from "@/lib/restaurant/seed";

export const dynamic = "force-dynamic";

const updatePrioritySchema = z.object({
  priority: z.enum(["NORMAL", "PRIORITY", "URGENT"]),
  reason: z.string().max(255).optional(),
});

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const rawBody = await req.json();
    const parsed = updatePrioritySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid priority payload",
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
      ["restaurant.kds.manage"],
      tenantId
    );

    const staffId = staff.sub || "system_kds_staff";

    await updateKdsTaskPriority(
      tenantId,
      id,
      parsed.data.priority,
      staffId,
      parsed.data.reason
    );

    return apiSuccess({ success: true, taskId: id, priority: parsed.data.priority }, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
