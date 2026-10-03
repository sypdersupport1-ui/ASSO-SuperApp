import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError, PermissionDeniedError } from "@/lib/api/errors";
import { assertPermission } from "@/lib/auth/rbac";
import { getBillDetails } from "@/lib/restaurant/billing-service";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: billId } = await params;

    const ctx = extractRequestContext(req, {
      requiredModule: "RESTAURANT",
    });

    const tenantId = ctx.tenantId;
    if (!tenantId) {
      throw new ValidationError("Missing tenant context.");
    }

    if (ctx.user?.sessionType === "STAFF") {
      assertPermission(ctx.user, "restaurant.bills.view", tenantId);
    } else {
      throw new PermissionDeniedError("restaurant.bills.view");
    }

    const bill = await getBillDetails(tenantId, billId);

    return apiSuccess(bill, ctx.requestId, 200);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_restaurant_bill_get_id");
  }
}
