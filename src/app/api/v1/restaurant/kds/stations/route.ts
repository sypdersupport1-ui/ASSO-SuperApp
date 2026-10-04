import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { authenticateKdsStaff } from "@/lib/restaurant/kds-auth";
import {
  listKitchenStations,
  createKitchenStation,
} from "@/lib/restaurant/kds-service";
import { listRestaurantOutlets } from "@/lib/restaurant/table-service";
import { ensureRestaurantSeedData, DEMO_TENANT_ID } from "@/lib/restaurant/seed";

export const dynamic = "force-dynamic";

const createStationSchema = z.object({
  outletId: z.string().uuid("outletId must be a valid UUID").optional(),
  code: z.string().min(2, "Code must be at least 2 characters").max(50),
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  description: z.string().max(500).optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requireAuth: true,
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    authenticateKdsStaff(
      ctx,
      ["restaurant.kds.view", "fulfillment.kds.view", "restaurant.kds.manage"],
      tenantId
    );

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

    const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "true";
    const stations = await listKitchenStations(tenantId, outletId, activeOnly);

    return apiSuccess(stations, ctx.requestId, 200, {
      outletId,
      count: stations.length,
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const parsed = createStationSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ValidationError(
        "Payload validation failed",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
      requireAuth: true,
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    authenticateKdsStaff(ctx, ["restaurant.kds.manage"], tenantId);

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

    const station = await createKitchenStation(tenantId, outletId, {
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description,
      displayOrder: parsed.data.displayOrder,
      isActive: parsed.data.isActive,
    });

    return apiSuccess(station, ctx.requestId, 201);
  } catch (err) {
    return apiError(err);
  }
}
