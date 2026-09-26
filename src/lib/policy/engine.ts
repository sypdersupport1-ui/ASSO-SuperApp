import { PolicyViolationError } from "../api/errors";
import type { JwtPayload } from "../auth/jwt";

export interface PolicyContext {
  tenantId: string;
  user: JwtPayload;
  action: string;
  amount?: number;
  [key: string]: unknown;
}

export interface PolicyResult {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
}

export function evaluatePolicy(context: PolicyContext): PolicyResult {
  // Super admin bypasses operational thresholds
  if (context.user.isSuperAdmin) {
    return { allowed: true, requiresApproval: false };
  }

  // Example: High-value refund policy (> ₹5,000 requires manager role)
  if (context.action === "payments.refund" && context.amount && context.amount > 5000) {
    const isManager = context.user.roles?.some((r) => ["MANAGER", "TENANT_ADMIN", "FINANCE_CONTROLLER"].includes(r));
    if (!isManager) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: "Refunds exceeding ₹5,000 require Manager approval.",
      };
    }
  }

  // Example: High-value expense voucher (> ₹10,000 requires tenant admin)
  if (context.action === "expenses.create" && context.amount && context.amount > 10000) {
    const isTenantAdmin = context.user.roles?.includes("TENANT_ADMIN");
    if (!isTenantAdmin) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: "Expenses exceeding ₹10,000 require Tenant Admin approval.",
      };
    }
  }

  return { allowed: true, requiresApproval: false };
}

export function assertPolicy(context: PolicyContext): void {
  const result = evaluatePolicy(context);
  if (!result.allowed) {
    throw new PolicyViolationError(result.reason || "Operation rejected by business policy engine.", {
      action: context.action,
      requiresApproval: result.requiresApproval,
    });
  }
}
