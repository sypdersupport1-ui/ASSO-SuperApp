import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { cancelCustomerOrder } from "@/lib/hotel/room-service-service";
import { AuthenticationError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
    });

    if (!ctx.user || ctx.user.sessionType !== "CUSTOMER") {
      throw new AuthenticationError("Customer session token required.");
    }

    const { id } = await params;
    let reason: string | undefined;
    try {
      const body = await req.json();
      reason = body.reason;
    } catch {
      // Body optional
    }

    const updatedOrder = await cancelCustomerOrder(ctx.user, id, reason);
    return apiSuccess(updatedOrder, ctx.requestId, 200);
  } catch (error) {
    return apiError(error);
  }
}
