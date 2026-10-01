import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { hasPermission } from "@/lib/auth/rbac";
import { PermissionDeniedError, ValidationError } from "@/lib/api/errors";
import {
  getEffectiveTaxConfig,
  upsertTaxConfig,
} from "@/lib/restaurant/financial-config-service";

export const dynamic = "force-dynamic";

function assertTaxPermission(user: any, write = false) {
  if (user.isSuperAdmin) return;

  const readPerms = [
    "restaurant.settings.view",
    "restaurant.settings.manage",
    "restaurant.manage",
    "finance.manage",
    "finance.view",
  ];
  const writePerms = [
    "restaurant.settings.manage",
    "restaurant.manage",
    "finance.manage",
  ];

  const perms = write ? writePerms : readPerms;
  const authorized = perms.some((p) => hasPermission(user, p));

  if (!authorized) {
    throw new PermissionDeniedError(
      write ? "restaurant.settings.manage" : "restaurant.settings.view"
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
      requiredModule: "RESTAURANT",
    });

    if (!ctx.user || !ctx.tenantId) {
      throw new ValidationError("Valid authenticated tenant context required.");
    }

    assertTaxPermission(ctx.user, false);

    const outletId =
      req.nextUrl.searchParams.get("outletId") || ctx.outletId || undefined;
    const config = await getEffectiveTaxConfig(ctx.tenantId, outletId);

    return apiSuccess(config, ctx.requestId, 200);
  } catch (error) {
    return apiError(
      error,
      req.headers.get("x-request-id") || "req_tax_config_get"
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
      requiredModule: "RESTAURANT",
    });

    if (!ctx.user || !ctx.tenantId) {
      throw new ValidationError("Valid authenticated tenant context required.");
    }

    assertTaxPermission(ctx.user, true);

    const body = await req.json();
    if (!body || body.taxRate === undefined) {
      throw new ValidationError("taxRate field is required.");
    }

    const outletId = body.outletId || ctx.outletId || undefined;

    const updated = await upsertTaxConfig({
      tenantId: ctx.tenantId,
      outletId,
      taxRate: body.taxRate,
      taxName: body.taxName,
      isEnabled: body.isEnabled,
      userId: ctx.user.sub,
      ipAddress: req.headers.get("x-forwarded-for") || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    });

    return apiSuccess(updated, ctx.requestId, 200);
  } catch (error) {
    return apiError(
      error,
      req.headers.get("x-request-id") || "req_tax_config_put"
    );
  }
}
