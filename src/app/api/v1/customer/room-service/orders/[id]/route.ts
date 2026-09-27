import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { getCustomerOrderById } from "@/lib/hotel/room-service-service";
import { AuthenticationError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export async function GET(
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
    const order = await getCustomerOrderById(ctx.user, id);
    return apiSuccess(order, ctx.requestId, 200);
  } catch (error) {
    return apiError(error);
  }
}
