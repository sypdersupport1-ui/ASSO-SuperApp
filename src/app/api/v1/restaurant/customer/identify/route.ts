import { NextRequest } from "next/server";
import { z } from "zod";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError, AuthenticationError } from "@/lib/api/errors";
import { identifyCustomerSession } from "@/lib/restaurant/customer-identity-service";

export const dynamic = "force-dynamic";

const identifySchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters").max(100),
  phone: z.string().min(7, "Phone number must be at least 7 characters").max(20),
  email: z.string().email("Invalid email format").optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
    });

    if (!ctx.user || ctx.user.sessionType !== "CUSTOMER") {
      throw new AuthenticationError("A valid customer session token is required to identify customer.");
    }

    if (!ctx.tenantId) {
      throw new ValidationError("Missing tenant context in customer session.");
    }

    const body = await req.json();
    const parsed = identifySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        "Customer name and phone number are required.",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), issue: i.message }))
      );
    }
    const validated = parsed.data;

    const result = await identifyCustomerSession(ctx.tenantId, ctx.user.sub, {
      fullName: validated.fullName,
      phone: validated.phone,
      email: validated.email ?? undefined,
    });

    return apiSuccess(
      {
        customer: {
          customerId: result.customer.customerId,
          fullName: result.customer.fullName,
          phone: result.customer.phone,
          email: result.customer.email,
        },
        sessionToken: result.sessionToken,
        sessionId: result.session.sessionId,
      },
      ctx.requestId,
      200
    );
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_cust_ident");
  }
}
