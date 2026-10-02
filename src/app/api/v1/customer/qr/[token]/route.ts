import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/response";
import { resolveCustomerQr } from "@/lib/customer/customer-session-service";
import { assertRateLimit, applyRateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/customer/qr/[token]
 * Public endpoint for resolving opaque QR tokens and minting ephemeral customer sessions.
 */
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ token: string }> }
) {
  try {
    const params = await props.params;
    const token = params.token;

    // Rate Limiting (Edge/Distributed) - evaluated BEFORE resolveCustomerQr (PostgreSQL query)
    const rateLimitResult = await assertRateLimit(req, {
      category: "CUSTOMER_PUBLIC",
      operation: "qr_resolve",
      contextToken: token,
      requestId: "req_customer_qr_resolve",
    });

    const userAgent = req.headers.get("user-agent") || undefined;
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : undefined;

    const sessionResolution = await resolveCustomerQr(token, {
      userAgent,
      ip,
    });

    const response = apiSuccess(sessionResolution, "req_customer_qr_resolve", 200);
    return applyRateLimitHeaders(response, rateLimitResult);
  } catch (err) {
    return apiError(err, "req_customer_qr_resolve");
  }
}
