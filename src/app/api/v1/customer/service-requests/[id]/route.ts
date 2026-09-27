import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { getCustomerServiceRequestById } from "@/lib/customer/customer-service-request-service";
import { AuthenticationError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/customer/service-requests/[id]
 * Retrieves details of a specific service request ensuring it belongs to caller's room.
 */
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const requestId = params.id;

    const ctx = extractRequestContext(req, {
      requireAuth: true,
    });

    if (!ctx.user || ctx.user.sessionType !== "CUSTOMER") {
      throw new AuthenticationError("Customer session token required.");
    }

    const request = await getCustomerServiceRequestById(ctx.user, requestId);

    return apiSuccess(request, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}
