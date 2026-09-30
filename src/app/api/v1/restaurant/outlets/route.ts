import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { listRestaurantOutlets, createRestaurantOutlet } from "@/lib/restaurant/table-service";
import { DEMO_TENANT_ID } from "@/lib/restaurant/seed";

export const dynamic = "force-dynamic";

const createOutletSchema = z.object({
  name: z.string().min(1, "Outlet name is required").max(255),
  code: z.string().min(1, "Outlet code is required").max(50),
  timezone: z.string().optional(),
  currency: z.string().max(3).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requiredPermission: "restaurant.tables.view",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    const outletsList = await listRestaurantOutlets(tenantId);

    return apiSuccess(outletsList, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = createOutletSchema.safeParse(rawBody);
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
    const created = await createRestaurantOutlet(tenantId, parsed.data, ctx.user?.sub);

    return apiSuccess(created, ctx.requestId, 201);
  } catch (err) {
    return apiError(err);
  }
}
