import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import {
  listSections,
  createSection,
} from "@/lib/restaurant/section-service";
import { listRestaurantOutlets } from "@/lib/restaurant/table-service";
import { ensureRestaurantSeedData, DEMO_TENANT_ID } from "@/lib/restaurant/seed";

export const dynamic = "force-dynamic";

const createSectionSchema = z.object({
  outletId: z.string().uuid("outletId must be a valid UUID").optional(),
  name: z.string().min(1, "Section name is required").max(100),
  code: z.string().max(50).optional(),
  displayOrder: z.number().int().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requiredPermission: "restaurant.tables.view",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    let outletId = req.nextUrl.searchParams.get("outletId") || ctx.outletId;

    if (!outletId) {
      const outletsList = await listRestaurantOutlets(tenantId);
      if (outletsList.length === 0) {
        const seeded = await ensureRestaurantSeedData(tenantId);
        outletId = seeded.outlet.outletId;
      } else {
        outletId = outletsList[0].outletId;
      }
    }

    const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "true";
    const sections = await listSections(tenantId, outletId, includeInactive);

    return apiSuccess(sections, ctx.requestId, 200, { outletId, count: sections.length });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = createSectionSchema.safeParse(rawBody);
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
      if (outletsList.length === 0) {
        const seeded = await ensureRestaurantSeedData(tenantId);
        outletId = seeded.outlet.outletId;
      } else {
        outletId = outletsList[0].outletId;
      }
    }

    const section = await createSection(
      tenantId,
      outletId,
      {
        name: parsed.data.name,
        code: parsed.data.code,
        displayOrder: parsed.data.displayOrder,
      },
      ctx.user?.sub
    );

    return apiSuccess(section, ctx.requestId, 201);
  } catch (err) {
    return apiError(err);
  }
}
