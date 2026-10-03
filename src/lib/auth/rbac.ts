import { PermissionDeniedError } from "../api/errors";
import type { JwtPayload } from "./jwt";
import { isModuleEntitled } from "../entitlements/checker";

export function hasPermission(
  user: JwtPayload,
  requiredPermission: string,
  tenantId?: string
): boolean {
  if (user.isSuperAdmin) {
    return true;
  }

  // Exact match or wildcard match (e.g. "orders.*" matches "orders.create")
  if (user.permissions && user.permissions.length > 0) {
    const matched = user.permissions.some((p) => {
      if (p === "*") return true;
      if (p === requiredPermission) return true;
      if (p.endsWith(".*")) {
        const prefix = p.slice(0, -2);
        return requiredPermission.startsWith(`${prefix}.`);
      }
      return false;
    });
    if (matched) return true;
  }

  // Owner-level role authority check:
  // TENANT_ADMIN has full administrative authority across all entitled modules
  if (user.roles?.includes("TENANT_ADMIN")) {
    return true;
  }

  // HOTEL_ADMIN is the owner-level role for the Hotel business and controls the Hotel's enabled modules,
  // including the optional Hotel Restaurant module.
  // In a Hotel tenant with Restaurant module enabled, HOTEL_ADMIN retains owner-level authority over the Hotel Restaurant.
  // In a standalone Restaurant tenant (lacking HOTEL module), HOTEL_ADMIN has no authority.
  const effectiveTenantId = tenantId || user.tenantId;
  if (user.roles?.includes("HOTEL_ADMIN") && effectiveTenantId) {
    if (requiredPermission.startsWith("hotel.") || requiredPermission.startsWith("service.")) {
      return true;
    }
    if (requiredPermission.startsWith("restaurant.")) {
      const hotelEntitled = isModuleEntitled(effectiveTenantId, "HOTEL");
      const restaurantEntitled = isModuleEntitled(effectiveTenantId, "RESTAURANT");
      if (hotelEntitled && restaurantEntitled) {
        return true;
      }
    }
  }

  return false;
}

export function assertPermission(
  user: JwtPayload,
  requiredPermission: string,
  tenantId?: string
): void {
  if (!hasPermission(user, requiredPermission, tenantId)) {
    throw new PermissionDeniedError(requiredPermission);
  }
}

