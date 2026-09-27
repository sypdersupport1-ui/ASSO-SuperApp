import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import {
  createCustomerServiceRequest,
  listCustomerServiceRequests,
  type CreateCustomerServiceRequestInput,
} from "@/lib/customer/customer-service-request-service";
import { AuthenticationError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/customer/service-requests
 * Lists service requests for the authenticated room context.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
    });

    if (!ctx.user || ctx.user.sessionType !== "CUSTOMER") {
      throw new AuthenticationError("Customer session token required.");
    }

    const requests = await listCustomerServiceRequests(ctx.user);

    return apiSuccess(requests, ctx.requestId, 200);
  } catch (err) {
    return apiError(err);
  }
}

/**
 * POST /api/v1/customer/service-requests
 * Submits a new guest service request strictly bound to the customer session context.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
    });

    if (!ctx.user || ctx.user.sessionType !== "CUSTOMER") {
      throw new AuthenticationError("Customer session token required.");
    }

    const body: CreateCustomerServiceRequestInput = await req.json();

    const created = await createCustomerServiceRequest(ctx.user, body);

    return apiSuccess(created, ctx.requestId, 201);
  } catch (err) {
    return apiError(err);
  }
}
