import { type NextRequest } from "next/server";
import crypto from "crypto";
import { verifyJwt, type JwtPayload } from "../auth/jwt";
import { assertPermission } from "../auth/rbac";
import { assertModuleEntitlement } from "../entitlements/checker";
import { assertPolicy } from "../policy/engine";
import { AuthenticationError, NotFoundError } from "./errors";

export interface RequestContext {
  requestId: string;
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

export function extractRequestContext(req: NextRequest, options: SecurityOptions = {}): RequestContext {
  // 1. Request ID (correlation)
  const requestId = req.headers.get("x-request-id") || `req_${crypto.randomUUID().slice(0, 12)}`;

  // 2. Auth Header
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

  // 3. Module Entitlement Check
  if (options.requiredModule && tenantId) {
    assertModuleEntitlement(tenantId, options.requiredModule, user?.isSuperAdmin || false);
  }

  // 4. RBAC Permission Check
  if (options.requiredPermission && user) {
    assertPermission(user, options.requiredPermission);
  }

  // 5. Policy Check
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
    user,
    tenantId,
    outletId,
  };
}
