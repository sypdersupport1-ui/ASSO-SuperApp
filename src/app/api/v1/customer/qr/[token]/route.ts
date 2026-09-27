import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/response";
import { resolveCustomerQr } from "@/lib/customer/customer-session-service";

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

    const userAgent = req.headers.get("user-agent") || undefined;
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : undefined;

    const sessionResolution = await resolveCustomerQr(token, {
      userAgent,
      ip,
    });

    return apiSuccess(sessionResolution, "req_customer_qr_resolve", 200);
  } catch (err) {
    return apiError(err);
  }
}
