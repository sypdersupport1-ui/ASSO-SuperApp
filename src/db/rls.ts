import { sql } from "drizzle-orm";
import { getDbClient } from "./client";
import { logger } from "@/lib/logger";
import { getTracer } from "@/lib/observability/tracing";
import { dbQueryDuration, dbQueryErrors, dbSlowTransactions } from "@/lib/observability/metrics";
import { SpanStatusCode } from "@opentelemetry/api";

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
  const tracer = getTracer("asso.db");
  const start = Date.now();

  return await tracer.startActiveSpan("db.tx.tenant_scope", async (span) => {
    span.setAttributes({
      "db.system": "postgresql",
      "db.operation": "transaction",
      "asso.tenant_id": sanitizedTenantId,
    });

    try {
      const result = await client.begin(async (tx) => {
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SELECT set_config('app.current_tenant_id', ${sanitizedTenantId}, true)`;
        return await callback(tx);
      });

      const durationMs = Date.now() - start;
      dbQueryDuration.record(durationMs, { "db.scope": "tenant" });
      if (durationMs > 1000) dbSlowTransactions.add(1, { "db.scope": "tenant" });
      span.setStatus({ code: SpanStatusCode.OK });
      return result as T;
    } catch (error) {
      const durationMs = Date.now() - start;
      dbQueryErrors.add(1, { "db.scope": "tenant" });
      dbQueryDuration.record(durationMs, { "db.scope": "tenant" });
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}

export const PLATFORM_CONTEXT_SECRET =
  process.env.PLATFORM_CONTEXT_SECRET || "asso_platform_auth_secret_dev_32b";

export function getPlatformContextToken(): string {
  return PLATFORM_CONTEXT_SECRET;
}

/**
 * Executes a callback within an authenticated platform transaction.
 * Strictly clears tenant context and establishes unforgeable platform token.
 */
export async function withPlatformScope<T>(
  callback: (txSql: any) => Promise<T>
): Promise<T> {
  const client = getDbClient();
  const token = getPlatformContextToken();
  const tracer = getTracer("asso.db");
  const start = Date.now();

  return await tracer.startActiveSpan("db.tx.platform_scope", async (span) => {
    span.setAttributes({
      "db.system": "postgresql",
      "db.operation": "transaction",
    });

    try {
      const result = await client.begin(async (tx) => {
        await tx`SELECT set_config('app.current_tenant_id', '', true)`;
        await tx`SELECT set_config('app.platform_context_token', ${token}, true)`;
        return await callback(tx);
      });

      const durationMs = Date.now() - start;
      dbQueryDuration.record(durationMs, { "db.scope": "platform" });
      if (durationMs > 1000) dbSlowTransactions.add(1, { "db.scope": "platform" });
      span.setStatus({ code: SpanStatusCode.OK });
      return result as T;
    } catch (error) {
      const durationMs = Date.now() - start;
      dbQueryErrors.add(1, { "db.scope": "platform" });
      dbQueryDuration.record(durationMs, { "db.scope": "platform" });
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}
