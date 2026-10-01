import { getDb } from "@/db/client";
import { taxConfigurations, platformFeeConfigurations } from "@/db/schema/finance";
import { eq, and, isNull } from "drizzle-orm";
import { ValidationError } from "@/lib/api/errors";
import { recordAuditEvent } from "@/lib/audit";

export interface EffectiveTaxConfig {
  configId?: string;
  taxName: string;
  taxRate: number; // e.g. 0.0500 for 5%
  isEnabled: boolean;
}

export interface EffectivePlatformFeeConfig {
  configId?: string;
  feeType: "PERCENTAGE" | "FIXED";
  feeRate: number; // e.g. 0.0200 for 2%
  fixedAmount: number; // e.g. 10.0000
  isEnabled: boolean;
}

/**
 * Authoritatively resolves the effective tax/GST configuration for an outlet or tenant.
 * Hierarchy:
 *   1. Outlet-specific configuration (if outletId provided)
 *   2. Tenant-level fallback configuration
 *   3. Safe Zero default: 0% tax, no policy invented
 */
export async function getEffectiveTaxConfig(
  tenantId: string,
  outletId?: string
): Promise<EffectiveTaxConfig> {
  const db = getDb();

  // 1. Try outlet-specific configuration
  if (outletId) {
    const [outletConfig] = await db
      .select()
      .from(taxConfigurations)
      .where(
        and(
          eq(taxConfigurations.tenantId, tenantId),
          eq(taxConfigurations.outletId, outletId)
        )
      )
      .limit(1);

    if (outletConfig) {
      if (!outletConfig.isEnabled) {
        return {
          configId: outletConfig.configId,
          taxName: outletConfig.taxName,
          taxRate: 0,
          isEnabled: false,
        };
      }
      return {
        configId: outletConfig.configId,
        taxName: outletConfig.taxName,
        taxRate: parseFloat(outletConfig.taxRate),
        isEnabled: true,
      };
    }
  }

  // 2. Try tenant-level fallback configuration
  const [tenantConfig] = await db
    .select()
    .from(taxConfigurations)
    .where(
      and(
        eq(taxConfigurations.tenantId, tenantId),
        isNull(taxConfigurations.outletId)
      )
    )
    .limit(1);

  if (tenantConfig) {
    if (!tenantConfig.isEnabled) {
      return {
        configId: tenantConfig.configId,
        taxName: tenantConfig.taxName,
        taxRate: 0,
        isEnabled: false,
      };
    }
    return {
      configId: tenantConfig.configId,
      taxName: tenantConfig.taxName,
      taxRate: parseFloat(tenantConfig.taxRate),
      isEnabled: true,
    };
  }

  // 3. Safe zero / no-tax fallback
  return {
    taxName: "GST",
    taxRate: 0,
    isEnabled: false,
  };
}

/**
 * Persists or updates the tax configuration for a tenant/outlet.
 * Authorization check and audit logging required.
 */
export async function upsertTaxConfig(params: {
  tenantId: string;
  outletId?: string | null;
  taxRate: number | string;
  taxName?: string;
  isEnabled?: boolean;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<EffectiveTaxConfig> {
  const db = getDb();
  const rateNum = typeof params.taxRate === "string" ? parseFloat(params.taxRate) : params.taxRate;

  if (isNaN(rateNum) || rateNum < 0 || rateNum > 1.0) {
    throw new ValidationError(
      "Tax rate must be a valid numeric decimal fraction between 0.0000 and 1.0000 (e.g. 0.05 for 5%, 0.18 for 18%)."
    );
  }

  const taxName = params.taxName?.trim() || "GST";
  const isEnabled = params.isEnabled ?? true;
  const outletId = params.outletId || null;

  // Check existing
  const existing = outletId
    ? await db
        .select()
        .from(taxConfigurations)
        .where(
          and(
            eq(taxConfigurations.tenantId, params.tenantId),
            eq(taxConfigurations.outletId, outletId)
          )
        )
        .limit(1)
    : await db
        .select()
        .from(taxConfigurations)
        .where(
          and(
            eq(taxConfigurations.tenantId, params.tenantId),
            isNull(taxConfigurations.outletId)
          )
        )
        .limit(1);

  let configId: string;

  if (existing.length > 0) {
    configId = existing[0].configId;
    await db
      .update(taxConfigurations)
      .set({
        taxName,
        taxRate: rateNum.toFixed(4),
        isEnabled,
        updatedAt: new Date(),
      })
      .where(eq(taxConfigurations.configId, configId));
  } else {
    const [inserted] = await db
      .insert(taxConfigurations)
      .values({
        tenantId: params.tenantId,
        outletId,
        taxName,
        taxRate: rateNum.toFixed(4),
        isEnabled,
      })
      .returning();
    configId = inserted.configId;
  }

  // Audit configuration change
  await recordAuditEvent({
    tenantId: params.tenantId,
    userId: params.userId,
    action: "TAX_CONFIGURATION_UPDATED",
    resourceType: "TAX_CONFIGURATION",
    resourceId: configId,
    payload: {
      outletId,
      taxName,
      taxRate: rateNum.toFixed(4),
      isEnabled,
    },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return {
    configId,
    taxName,
    taxRate: rateNum,
    isEnabled,
  };
}

/**
 * Authoritatively resolves the effective ASSO platform fee configuration.
 * Hierarchy:
 *   1. Outlet-specific override
 *   2. Tenant-specific override
 *   3. Platform-wide global configuration (tenant_id IS NULL AND outlet_id IS NULL)
 *   4. Safe Zero default: 0 fee
 */
export async function getEffectivePlatformFeeConfig(
  tenantId?: string,
  outletId?: string
): Promise<EffectivePlatformFeeConfig> {
  const db = getDb();

  // 1. Outlet-specific override
  if (tenantId && outletId) {
    const [outletConfig] = await db
      .select()
      .from(platformFeeConfigurations)
      .where(
        and(
          eq(platformFeeConfigurations.tenantId, tenantId),
          eq(platformFeeConfigurations.outletId, outletId)
        )
      )
      .limit(1);

    if (outletConfig) {
      if (!outletConfig.isEnabled) {
        return {
          configId: outletConfig.configId,
          feeType: outletConfig.feeType as "PERCENTAGE" | "FIXED",
          feeRate: 0,
          fixedAmount: 0,
          isEnabled: false,
        };
      }
      return {
        configId: outletConfig.configId,
        feeType: outletConfig.feeType as "PERCENTAGE" | "FIXED",
        feeRate: parseFloat(outletConfig.feeRate),
        fixedAmount: parseFloat(outletConfig.fixedAmount),
        isEnabled: true,
      };
    }
  }

  // 2. Tenant-specific override
  if (tenantId) {
    const [tenantConfig] = await db
      .select()
      .from(platformFeeConfigurations)
      .where(
        and(
          eq(platformFeeConfigurations.tenantId, tenantId),
          isNull(platformFeeConfigurations.outletId)
        )
      )
      .limit(1);

    if (tenantConfig) {
      if (!tenantConfig.isEnabled) {
        return {
          configId: tenantConfig.configId,
          feeType: tenantConfig.feeType as "PERCENTAGE" | "FIXED",
          feeRate: 0,
          fixedAmount: 0,
          isEnabled: false,
        };
      }
      return {
        configId: tenantConfig.configId,
        feeType: tenantConfig.feeType as "PERCENTAGE" | "FIXED",
        feeRate: parseFloat(tenantConfig.feeRate),
        fixedAmount: parseFloat(tenantConfig.fixedAmount),
        isEnabled: true,
      };
    }
  }

  // 3. Platform-wide global default
  const [globalConfig] = await db
    .select()
    .from(platformFeeConfigurations)
    .where(
      and(
        isNull(platformFeeConfigurations.tenantId),
        isNull(platformFeeConfigurations.outletId)
      )
    )
    .limit(1);

  if (globalConfig) {
    if (!globalConfig.isEnabled) {
      return {
        configId: globalConfig.configId,
        feeType: globalConfig.feeType as "PERCENTAGE" | "FIXED",
        feeRate: 0,
        fixedAmount: 0,
        isEnabled: false,
      };
    }
    return {
      configId: globalConfig.configId,
      feeType: globalConfig.feeType as "PERCENTAGE" | "FIXED",
      feeRate: parseFloat(globalConfig.feeRate),
      fixedAmount: parseFloat(globalConfig.fixedAmount),
      isEnabled: true,
    };
  }

  // 4. Safe zero / no-fee default
  return {
    feeType: "PERCENTAGE",
    feeRate: 0,
    fixedAmount: 0,
    isEnabled: false,
  };
}

/**
 * Persists or updates the ASSO platform fee configuration.
 * Strictly requires Super Admin authorization.
 */
export async function upsertPlatformFeeConfig(params: {
  tenantId?: string | null;
  outletId?: string | null;
  feeType: "PERCENTAGE" | "FIXED";
  feeRate?: number | string;
  fixedAmount?: number | string;
  isEnabled?: boolean;
  description?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<EffectivePlatformFeeConfig> {
  const db = getDb();
  const feeType = params.feeType;
  const isEnabled = params.isEnabled ?? true;
  const description = params.description?.trim() || null;
  const tenantId = params.tenantId || null;
  const outletId = params.outletId || null;

  let feeRateNum = 0;
  let fixedAmountNum = 0;

  if (feeType === "PERCENTAGE") {
    feeRateNum =
      typeof params.feeRate === "string"
        ? parseFloat(params.feeRate)
        : params.feeRate || 0;
    if (isNaN(feeRateNum) || feeRateNum < 0 || feeRateNum > 1.0) {
      throw new ValidationError(
        "Platform fee rate must be a valid numeric decimal fraction between 0.0000 and 1.0000 (e.g. 0.02 for 2%)."
      );
    }
  } else if (feeType === "FIXED") {
    fixedAmountNum =
      typeof params.fixedAmount === "string"
        ? parseFloat(params.fixedAmount)
        : params.fixedAmount || 0;
    if (isNaN(fixedAmountNum) || fixedAmountNum < 0) {
      throw new ValidationError(
        "Fixed platform fee amount must be a non-negative number."
      );
    }
  } else {
    throw new ValidationError("Invalid feeType: must be 'PERCENTAGE' or 'FIXED'.");
  }

  // Find existing
  const existing =
    tenantId && outletId
      ? await db
          .select()
          .from(platformFeeConfigurations)
          .where(
            and(
              eq(platformFeeConfigurations.tenantId, tenantId),
              eq(platformFeeConfigurations.outletId, outletId)
            )
          )
          .limit(1)
      : tenantId
      ? await db
          .select()
          .from(platformFeeConfigurations)
          .where(
            and(
              eq(platformFeeConfigurations.tenantId, tenantId),
              isNull(platformFeeConfigurations.outletId)
            )
          )
          .limit(1)
      : await db
          .select()
          .from(platformFeeConfigurations)
          .where(
            and(
              isNull(platformFeeConfigurations.tenantId),
              isNull(platformFeeConfigurations.outletId)
            )
          )
          .limit(1);

  let configId: string;

  if (existing.length > 0) {
    configId = existing[0].configId;
    await db
      .update(platformFeeConfigurations)
      .set({
        feeType,
        feeRate: feeRateNum.toFixed(4),
        fixedAmount: fixedAmountNum.toFixed(4),
        isEnabled,
        description,
        updatedAt: new Date(),
      })
      .where(eq(platformFeeConfigurations.configId, configId));
  } else {
    const [inserted] = await db
      .insert(platformFeeConfigurations)
      .values({
        tenantId,
        outletId,
        feeType,
        feeRate: feeRateNum.toFixed(4),
        fixedAmount: fixedAmountNum.toFixed(4),
        isEnabled,
        description,
      })
      .returning();
    configId = inserted.configId;
  }

  // Audit configuration change
  await recordAuditEvent({
    tenantId: tenantId || undefined,
    userId: params.userId,
    action: "PLATFORM_FEE_CONFIGURATION_UPDATED",
    resourceType: "PLATFORM_FEE_CONFIGURATION",
    resourceId: configId,
    payload: {
      tenantId,
      outletId,
      feeType,
      feeRate: feeRateNum.toFixed(4),
      fixedAmount: fixedAmountNum.toFixed(4),
      isEnabled,
    },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return {
    configId,
    feeType,
    feeRate: feeRateNum,
    fixedAmount: fixedAmountNum,
    isEnabled,
  };
}
