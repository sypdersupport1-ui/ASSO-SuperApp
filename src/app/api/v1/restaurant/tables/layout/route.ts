import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { batchUpdateTableLayout, listRestaurantOutlets } from "@/lib/restaurant/table-service";
import { ensureRestaurantSeedData, DEMO_TENANT_ID } from "@/lib/restaurant/seed";
import { RESTAURANT_TABLE_SHAPES } from "@/db/schema/restaurant";

export const dynamic = "force-dynamic";

const batchLayoutSchema = z.object({
  outletId: z.string().uuid("outletId must be a valid UUID").optional(),
  tables: z.array(
    z.object({
      tableId: z.string().uuid("tableId must be a valid UUID"),
      posX: z.number().int().min(0),
      posY: z.number().int().min(0),
      width: z.number().int().min(40).max(400).optional(),
      height: z.number().int().min(40).max(400).optional(),
      shape: z.enum(RESTAURANT_TABLE_SHAPES).optional(),
      rotation: z.number().int().optional(),
      sectionId: z.string().uuid().optional(),
    })
  ).min(1, "At least one table layout item must be provided"),
});

export async function PUT(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = batchLayoutSchema.safeParse(rawBody);
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

    const updatedTables = await batchUpdateTableLayout(
      tenantId,
      outletId,
      parsed.data.tables,
      ctx.user?.sub
    );

    return apiSuccess(updatedTables, ctx.requestId, 200, {
      outletId,
      updatedCount: updatedTables.length,
    });
  } catch (err) {
    return apiError(err);
  }
}
