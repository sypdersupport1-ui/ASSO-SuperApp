import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { PermissionDeniedError, ValidationError } from "@/lib/api/errors";
import {
  getEffectivePlatformFeeConfig,
  upsertPlatformFeeConfig,
} from "@/lib/restaurant/financial-config-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
    });

    const tenantId =
      req.nextUrl.searchParams.get("tenantId") || ctx.tenantId || undefined;
    const outletId =
      req.nextUrl.searchParams.get("outletId") || ctx.outletId || undefined;

    const config = await getEffectivePlatformFeeConfig(tenantId, outletId);

    return apiSuccess(config, ctx.requestId, 200);
  } catch (error) {
    return apiError(
      error,
      req.headers.get("x-request-id") || "req_platform_fee_get"
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
    });

    if (!ctx.user) {
      throw new ValidationError("Authenticated session required.");
    }

    // Strict Architectural Authority: Only ASSO Platform Super Admin can alter platform fee rules
    if (!ctx.user.isSuperAdmin) {
      throw new PermissionDeniedError(
        "platform.admin",
        "Only ASSO Platform Super Administrators are authorized to configure platform fees."
      );
    }

    const body = await req.json();
    if (!body || !body.feeType) {
      throw new ValidationError("feeType ('PERCENTAGE' | 'FIXED') is required.");
    }

    const updated = await upsertPlatformFeeConfig({
      tenantId: body.tenantId ?? null,
      outletId: body.outletId ?? null,
      feeType: body.feeType,
      feeRate: body.feeRate,
      fixedAmount: body.fixedAmount,
      isEnabled: body.isEnabled,
      description: body.description,
      userId: ctx.user.sub,
      ipAddress: req.headers.get("x-forwarded-for") || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    });

    return apiSuccess(updated, ctx.requestId, 200);
  } catch (error) {
    return apiError(
      error,
      req.headers.get("x-request-id") || "req_platform_fee_put"
    );
  }
}
