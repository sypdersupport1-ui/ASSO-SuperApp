import { type NextRequest } from "next/server";
import { verifyJwt, type JwtPayload } from "../auth/jwt";
import { assertPermission } from "../auth/rbac";
import { assertModuleEntitlement } from "../entitlements/checker";
import { assertPolicy } from "../policy/engine";
import { AuthenticationError } from "./errors";
import { resolveCorrelationId, runWithCorrelationContext, type RequestCorrelationContext } from "@/lib/observability/correlation";
import { logger } from "@/lib/logger";

export interface RequestContext {
  requestId: string;
  correlationId?: string;
  user?: JwtPayload;
  tenantId?: string;
  outletId?: string;
}

export interface SecurityOptions {
  requireAuth?: boolean;
  requiredModule?: string;
  requiredPermission?: string;
  policyAction?: string;
  policyAmount?: number;
}

/**
 * Extracts and validates request context from the incoming NextRequest.
 * Runs inside an AsyncLocalStorage correlation scope so that all downstream
 * calls (logger, service layer, DB helpers) can access request_id without
 * threading it through every function signature.
 *
 * S5: generates or validates the correlation ID, propagates into async context.
 *
 * Security: correlation IDs are NEVER used for authorization.
 */
export function extractRequestContext(req: NextRequest, options: SecurityOptions = {}): RequestContext {
  // ─── Correlation ID (S5) ──────────────────────────────────────────────────
  // Prefer the request ID injected by middleware (already validated)
  const { id: requestId, reused } = resolveCorrelationId(
    req.headers.get("x-request-id") || req.headers.get("x-correlation-id")
  );

  // ─── Auth Header ──────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  let user: JwtPayload | undefined;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    user = verifyJwt(token);
  } else if (options.requireAuth) {
    throw new AuthenticationError("Bearer token required in Authorization header.");
  }

  const tenantId = user?.tenantId || req.headers.get("x-tenant-id") || undefined;
  const outletId = user?.outletId || req.headers.get("x-outlet-id") || undefined;

  // ─── Entitlement / RBAC / Policy ─────────────────────────────────────────
  if (options.requiredModule && tenantId) {
    assertModuleEntitlement(tenantId, options.requiredModule, user?.isSuperAdmin || false);
  }

  if (options.requiredPermission && user) {
    assertPermission(user, options.requiredPermission, tenantId);
  }

  if (options.policyAction && user && tenantId) {
    assertPolicy({
      tenantId,
      user,
      action: options.policyAction,
      amount: options.policyAmount,
    });
  }

  return {
    requestId,
    correlationId: reused ? requestId : undefined,
    user,
    tenantId,
    outletId,
  };
}

/**
 * Runs a route handler callback inside a correlation context scope.
 * Enables the structured logger and downstream services to access
 * request_id/correlation_id without explicit threading.
 *
 * Usage (optional enhancement for individual route handlers):
 *   return await withRequestContext(ctx, req.method, "/api/v1/...", async () => { ... });
 */
export async function withRequestContext<T>(
  ctx: RequestContext,
  method: string,
  route: string,
  fn: () => Promise<T>
): Promise<T> {
  const correlationCtx: RequestCorrelationContext = {
    requestId: ctx.requestId,
    correlationId: ctx.correlationId,
    tenantId: ctx.tenantId,
    outletId: ctx.outletId,
    route,
    method,
    service: "api",
    startedAt: Date.now(),
  };

  return runWithCorrelationContext(correlationCtx, fn);
}
