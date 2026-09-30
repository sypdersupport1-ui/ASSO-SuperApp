import { NextRequest } from "next/server";
import { verifySecureReceiptToken } from "@/lib/events/types";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ValidationError } from "@/lib/api/errors";
import { extractRequestContext } from "@/lib/api/context";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req);
    const searchParams = req.nextUrl.searchParams;
    const token = searchParams.get("token");

    if (!token) {
      throw new ValidationError("Missing receipt verification token.");
    }

    const verified = verifySecureReceiptToken(token);
    if (!verified) {
      throw new ValidationError("Invalid, altered, or expired receipt verification token.");
    }

    return apiSuccess(
      {
        verified: true,
        referenceType: verified.referenceType,
        referenceId: verified.referenceId,
        amount: verified.amount || null,
        vertical: verified.vertical,
        expiresAt: new Date(verified.expiresAt).toISOString(),
      },
      ctx.requestId,
      200
    );
  } catch (err: unknown) {
    return apiError(err);
  }
}
