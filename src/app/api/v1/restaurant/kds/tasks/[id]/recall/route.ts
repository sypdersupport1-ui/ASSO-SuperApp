import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { authenticateKdsStaff } from "@/lib/restaurant/kds-auth";
import { recallKdsTask } from "@/lib/restaurant/kds-service";
import { DEMO_TENANT_ID } from "@/lib/restaurant/seed";

export const dynamic = "force-dynamic";

const recallSchema = z.object({
  targetStatus: z.enum(["READY", "PREPARING", "PENDING"]),
  reason: z.string().min(3, "Audit reason must be at least 3 characters").max(500),
});

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const rawBody = await req.json();
    const parsed = recallSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid recall payload",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requireAuth: true,
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    const staff = authenticateKdsStaff(ctx, ["restaurant.kds.manage"], tenantId);

    const staffId = staff.sub || "system_kds_manager";

    await recallKdsTask(
      tenantId,
      id,
      parsed.data.targetStatus,
      staffId,
      parsed.data.reason
    );

    return apiSuccess({ success: true, taskId: id, status: parsed.data.targetStatus }, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
