import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import {
  getSectionById,
  updateSection,
  deleteSection,
} from "@/lib/restaurant/section-service";
import { listRestaurantOutlets } from "@/lib/restaurant/table-service";
import { ensureRestaurantSeedData, DEMO_TENANT_ID } from "@/lib/restaurant/seed";

export const dynamic = "force-dynamic";

const updateSectionSchema = z.object({
  outletId: z.string().uuid("outletId must be a valid UUID").optional(),
  name: z.string().min(1).max(100).optional(),
  code: z.string().max(50).optional(),
  displayOrder: z.number().int().optional(),
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
        const seeded = await ensureRestaurantSeedData(tenantId);
        outletId = seeded.outlet.outletId;
      }
    }

    const section = await getSectionById(tenantId, outletId, id);
    return apiSuccess(section, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rawBody = await req.json();
    const parsed = updateSectionSchema.safeParse(rawBody);
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

    const updated = await updateSection(
      tenantId,
      outletId,
      id,
      {
        name: parsed.data.name,
        code: parsed.data.code,
        displayOrder: parsed.data.displayOrder,
        isActive: parsed.data.isActive,
      },
      ctx.user?.sub
    );

    return apiSuccess(updated, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requiredPermission: "restaurant.tables.manage",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = req.nextUrl.searchParams.get("outletId") || ctx.outletId;

    if (!outletId) {
      const outletsList = await listRestaurantOutlets(tenantId);
      if (outletsList.length > 0) {
        outletId = outletsList[0].outletId;
      } else {
        throw new ValidationError("Restaurant outlet is required.");
      }
    }

    const result = await deleteSection(tenantId, outletId, id, ctx.user?.sub);
    return apiSuccess(result, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
