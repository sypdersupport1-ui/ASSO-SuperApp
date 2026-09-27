import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { reopenFolio } from "@/lib/hotel/folio-service";
import { listHotelProperties } from "@/lib/hotel/service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

export const dynamic = "force-dynamic";

const reopenSchema = z.object({
  outletId: z.string().uuid().optional(),
  reason: z.string().min(1, "A documented reason is mandatory when reopening a closed folio.").max(500),
  notes: z.string().max(1000).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ stayId: string }> }
) {
  try {
    const { stayId } = await params;

    const ctx = extractRequestContext(req, {
      requiredModule: "HOTEL",
      requiredPermission: "hotel.stays.manage",
    });

    const tenantId = ctx.tenantId || req.headers.get("x-tenant-id") || DEMO_TENANT_ID;
    const body = await req.json().catch(() => ({}));
    const parseResult = reopenSchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError(
        "Invalid reopen input payload",
        parseResult.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }

    const input = parseResult.data;
    let outletId = input.outletId || req.nextUrl.searchParams.get("outletId") || ctx.outletId;

    if (!outletId) {
      const properties = await listHotelProperties(tenantId);
      if (properties.length > 0) {
        outletId = properties[0].outletId;
      } else {
        outletId = "00000000-0000-0000-0000-000000000002";
      }
    }

    const staffUserId = ctx.user?.sub || req.headers.get("x-user-id") || "00000000-0000-0000-0000-000000000001";

    const folioResult = await reopenFolio({
      tenantId,
      outletId,
      stayId,
      staffUserId,
      input: {
        reason: input.reason,
        notes: input.notes,
      },
    });

    return apiSuccess(folioResult, ctx.requestId, 200, { outletId });
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_folio_reopen");
  }
}
