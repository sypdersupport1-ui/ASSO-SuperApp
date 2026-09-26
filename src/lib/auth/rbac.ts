import { PermissionDeniedError } from "../api/errors";
import type { JwtPayload } from "./jwt";

export function hasPermission(user: JwtPayload, requiredPermission: string): boolean {
  if (user.isSuperAdmin) {
    return true;
  }

  if (!user.permissions || user.permissions.length === 0) {
    return false;
  }

  // Exact match or wildcard match (e.g. "orders.*" matches "orders.create")
  return user.permissions.some((p) => {
    if (p === "*") return true;
    if (p === requiredPermission) return true;
    if (p.endsWith(".*")) {
      const prefix = p.slice(0, -2);
      return requiredPermission.startsWith(`${prefix}.`);
    }
    return false;
  });
}

export function assertPermission(user: JwtPayload, requiredPermission: string): void {
  if (!hasPermission(user, requiredPermission)) {
    throw new PermissionDeniedError(requiredPermission);
  }
}
