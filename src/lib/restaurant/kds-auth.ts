import { RequestContext } from "@/lib/api/context";
import { AuthenticationError, PermissionDeniedError } from "@/lib/api/errors";
import { assertPermission, hasPermission } from "@/lib/auth/rbac";
import type { JwtPayload } from "@/lib/auth/jwt";

export function authenticateKdsStaff(
  ctx: RequestContext,
  requiredPermissions: string[],
  tenantId: string
): JwtPayload {
  if (!ctx.user) {
    throw new AuthenticationError("Bearer token required in Authorization header.");
  }

  if (ctx.user.sessionType !== "STAFF" && !ctx.user.isSuperAdmin) {
    throw new PermissionDeniedError(requiredPermissions[0]);
  }

  const hasAny = requiredPermissions.some((p) => hasPermission(ctx.user!, p, tenantId));
  if (!hasAny) {
    assertPermission(ctx.user, requiredPermissions[0], tenantId);
  }

  return ctx.user;
}
