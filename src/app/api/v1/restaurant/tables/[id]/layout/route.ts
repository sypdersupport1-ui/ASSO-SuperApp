import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { updateTableLayout, listRestaurantOutlets } from "@/lib/restaurant/table-service";
import { ensureRestaurantSeedData, DEMO_TENANT_ID } from "@/lib/restaurant/seed";
import { RESTAURANT_TABLE_SHAPES } from "@/db/schema/restaurant";

export const dynamic = "force-dynamic";

const singleLayoutSchema = z.object({
  outletId: z.string().uuid("outletId must be a valid UUID").optional(),
  posX: z.number().int().min(0),
  posY: z.number().int().min(0),
  width: z.number().int().min(40).max(400).optional(),
  height: z.number().int().min(40).max(400).optional(),
  shape: z.enum(RESTAURANT_TABLE_SHAPES).optional(),
  rotation: z.number().int().optional(),
  sectionId: z.string().uuid().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rawBody = await req.json();
    const parsed = singleLayoutSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        "Payload validation failed",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requiredPermission: "restaurant.tables.manage",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = parsed.data.outletId || ctx.outletId;

    if (!outletId) {
      const outletsList = await listRestaurantOutlets(tenantId);
      if (outletsList.length > 0) {
        outletId = outletsList[0].outletId;
      } else {
        const seeded = await ensureRestaurantSeedData(tenantId);
        outletId = seeded.outlet.outletId;
      }
    }

    const updated = await updateTableLayout(
      tenantId,
      outletId,
      id,
      {
        posX: parsed.data.posX,
        posY: parsed.data.posY,
        width: parsed.data.width,
        height: parsed.data.height,
        shape: parsed.data.shape,
        rotation: parsed.data.rotation,
        sectionId: parsed.data.sectionId,
      },
      ctx.user?.sub
    );

    return apiSuccess(updated, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
