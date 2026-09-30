import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { revokeTableQr } from "@/lib/restaurant/qr-service";
import { listRestaurantOutlets } from "@/lib/restaurant/table-service";
import { DEMO_TENANT_ID } from "@/lib/restaurant/seed";

export const dynamic = "force-dynamic";

const revokeSchema = z.object({
  outletId: z.string().uuid().optional(),
  reason: z.string().min(1, "Revocation reason is required").max(255),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rawBody = await req.json();
    const parsed = revokeSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        "Payload validation failed",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requiredPermission: "restaurant.qr.manage",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = parsed.data.outletId || ctx.outletId;

    if (!outletId) {
      const outletsList = await listRestaurantOutlets(tenantId);
      if (outletsList.length > 0) {
        outletId = outletsList[0].outletId;
      } else {
        throw new ValidationError("No restaurant outlet found for this tenant.");
      }
    }

    const result = await revokeTableQr(
      tenantId,
      outletId,
      id,
      ctx.user?.sub,
      parsed.data.reason
    );

    return apiSuccess(result, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
