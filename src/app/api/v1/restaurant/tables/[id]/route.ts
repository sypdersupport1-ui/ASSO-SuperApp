import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import {
  getTableById,
  updateTable,
  listRestaurantOutlets,
} from "@/lib/restaurant/table-service";
import { RESTAURANT_TABLE_SHAPES } from "@/db/schema/restaurant";
import { DEMO_TENANT_ID } from "@/lib/restaurant/seed";

export const dynamic = "force-dynamic";

const updateTableSchema = z.object({
  outletId: z.string().uuid().optional(),
  displayLabel: z.string().max(100).optional(),
  capacity: z.number().int().min(1).optional(),
  section: z.string().max(100).optional(),
  sectionId: z.string().uuid().nullable().optional(),
  posX: z.number().int().optional(),
  posY: z.number().int().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  shape: z.enum(RESTAURANT_TABLE_SHAPES).optional(),
  rotation: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requiredPermission: "restaurant.tables.view",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = req.nextUrl.searchParams.get("outletId") || ctx.outletId;

    if (!outletId) {
      const outletsList = await listRestaurantOutlets(tenantId);
      if (outletsList.length > 0) {
        outletId = outletsList[0].outletId;
      } else {
        throw new ValidationError("No restaurant outlet found for this tenant.");
      }
    }

    const table = await getTableById(tenantId, outletId, id);
    return apiSuccess(table, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rawBody = await req.json();
    const parsed = updateTableSchema.safeParse(rawBody);
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
        throw new ValidationError("No restaurant outlet found for this tenant.");
      }
    }

    const updated = await updateTable(tenantId, outletId, id, parsed.data, ctx.user?.sub);
    return apiSuccess(updated, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
