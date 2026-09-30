import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { closeTableSession } from "@/lib/restaurant/session-service";
import { listRestaurantOutlets } from "@/lib/restaurant/table-service";
import { DEMO_TENANT_ID } from "@/lib/restaurant/seed";

export const dynamic = "force-dynamic";

const closeSessionSchema = z.object({
  outletId: z.string().uuid().optional(),
  notes: z.string().optional(),
  nextTableStatus: z.enum(["CLEANING", "AVAILABLE"]).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is acceptable
    }

    const parsed = closeSessionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Payload validation failed",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requiredPermission: "restaurant.sessions.manage",
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

    const closed = await closeTableSession(
      tenantId,
      outletId,
      id,
      {
        notes: parsed.data.notes,
        nextTableStatus: parsed.data.nextTableStatus,
      },
      ctx.user?.sub
    );

    return apiSuccess(closed, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
