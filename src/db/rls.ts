import { sql } from "drizzle-orm";
import { getDbClient } from "./client";
import { logger } from "@/lib/logger";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TenantContextOptions {
  tenantId: string;
  isSuperAdmin?: boolean;
}

/**
 * Validates that the provided tenant ID is a valid UUID format.
 * Throws an exception if malformed (matching PostgreSQL cast failure 22P02).
 */
export function validateTenantId(tenantId: string): string {
  if (!tenantId || tenantId.trim() === "") {
    throw new Error("Tenant context is empty or missing (fail-closed)");
  }
  if (!UUID_REGEX.test(tenantId.trim())) {
    throw new Error(`Invalid tenant UUID format: '${tenantId}' (PostgreSQL 22P02 simulation)`);
  }
  return tenantId.trim();
}

/**
 * Executes a callback within a transaction where `app.current_tenant_id`
 * is strictly set using `SET LOCAL`.
 */
export async function withTenantScope<T>(
  options: TenantContextOptions,
  callback: (txSql: any) => Promise<T>
): Promise<T> {
  const sanitizedTenantId = validateTenantId(options.tenantId);
  const client = getDbClient();

  const result = await client.begin(async (tx) => {
    // Set transaction-local tenant context
    await tx`SET LOCAL app.current_tenant_id = ${sanitizedTenantId}`;

    logger.debug({
      message: "Set tenant transaction scope",
      tenantId: sanitizedTenantId,
      details: { isSuperAdmin: options.isSuperAdmin || false },
    });

    return await callback(tx);
  });

  return result as T;
}
