import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { updateWaitlistStatus } from "@/lib/restaurant/waitlist-service";
import { listRestaurantOutlets } from "@/lib/restaurant/table-service";
import { DEMO_TENANT_ID } from "@/lib/restaurant/seed";
import { RESTAURANT_WAITLIST_STATUSES } from "@/db/schema/restaurant";

export const dynamic = "force-dynamic";

const waitlistStatusSchema = z.object({
  outletId: z.string().uuid().optional(),
  status: z.enum(RESTAURANT_WAITLIST_STATUSES),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rawBody = await req.json();
    const parsed = waitlistStatusSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        "Payload validation failed",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requiredPermission: "restaurant.waitlist.manage",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = parsed.data.outletId || req.nextUrl.searchParams.get("outletId") || ctx.outletId;

    if (!outletId) {
      const outletsList = await listRestaurantOutlets(tenantId);
      if (outletsList.length > 0) {
        outletId = outletsList[0].outletId;
      } else {
        throw new ValidationError("No restaurant outlet found for this tenant.");
      }
    }

    const updated = await updateWaitlistStatus(
      tenantId,
      outletId,
      id,
      parsed.data.status,
      ctx.user?.sub
    );

    return apiSuccess(updated, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
