import crypto from "crypto";
import { getDbClient } from "@/db/client";
import { withPlatformScope, withTenantScope } from "@/db/rls";
import { IdempotencyConflictError } from "./errors";

export interface IdempotencyRecord {
  id: string;
  tenantId: string | null;
  key: string;
  operation: string;
  requestHash: string;
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  responseCode?: number | null;
  responseBody?: unknown;
  responseHeaders?: Record<string, string> | null;
  resourceId?: string | null;
  lockedAt: Date;
  leaseExpiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export type ClaimResult =
  | {
      status: "ACQUIRED";
      record: IdempotencyRecord;
    }
  | {
      status: "COMPLETED";
      record: IdempotencyRecord;
      cachedResponse: {
        code: number;
        body: unknown;
        headers?: Record<string, string>;
      };
    }
  | {
      status: "IN_PROGRESS";
      record: IdempotencyRecord;
    }
  | {
      status: "MISMATCH";
      record: IdempotencyRecord;
    };

/**
 * Abstract storage interface for idempotency records.
 * Decouples domain and API logic from PostgreSQL, enabling Redis/Upstash extraction
 * if future measured load warrants dedicated caching infrastructure.
 */
export interface IdempotencyStore {
  claim(params: {
    tenantId?: string | null;
    key: string;
    operation?: string;
    requestHash: string;
    ttlHours?: number;
    leaseSeconds?: number;
  }): Promise<ClaimResult>;

  get(params: {
    tenantId?: string | null;
    key: string;
    operation?: string;
  }): Promise<IdempotencyRecord | null>;

  complete(params: {
    tenantId?: string | null;
    key: string;
    operation?: string;
    responseCode: number;
    responseBody: unknown;
    responseHeaders?: Record<string, string>;
    resourceId?: string;
  }): Promise<void>;

  fail(params: {
    tenantId?: string | null;
    key: string;
    operation?: string;
    reason?: string;
  }): Promise<void>;

  cleanup(params?: {
    olderThanSeconds?: number;
    limit?: number;
  }): Promise<{ deletedCount: number }>;

  clear(tenantId?: string): Promise<void>;
}

/**
 * Deterministically sorts object keys recursively to guarantee that JSON serialization
 * produces identical output regardless of key order.
 */
export function canonicalizeJson(data: unknown): string {
  if (data === undefined || data === null) {
    return "";
  }
  let parsed = data;
  if (typeof data === "string") {
    const trimmed = data.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    } else {
      return trimmed;
    }
  }

  function sortObject(val: unknown): unknown {
    if (val === null || typeof val !== "object") {
      return val;
    }
    if (Array.isArray(val)) {
      return val.map(sortObject);
    }
    const keys = Object.keys(val as Record<string, unknown>).sort();
    const sorted: Record<string, unknown> = {};
    for (const k of keys) {
      sorted[k] = sortObject((val as Record<string, unknown>)[k]);
    }
    return sorted;
  }

  return JSON.stringify(sortObject(parsed));
}

/**
 * Computes a deterministic SHA-256 request hash for an HTTP mutation.
 */
export function computeRequestHash(method: string, path: string, body?: unknown): string {
  const normalizedBody = canonicalizeJson(body);
  const payload = `${method.toUpperCase()}:${path}:${normalizedBody}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function mapRowToRecord(row: any): IdempotencyRecord {
  return {
    id: row.key_id,
    tenantId: row.tenant_id || null,
    key: row.idempotency_key,
    operation: row.operation,
    requestHash: row.request_hash,
    status: row.status,
    responseCode: row.response_code != null ? Number(row.response_code) : null,
    responseBody: typeof row.response_body === "string" ? JSON.parse(row.response_body) : row.response_body,
    responseHeaders:
      typeof row.response_headers === "string" ? JSON.parse(row.response_headers) : row.response_headers,
    resourceId: row.resource_id || null,
    lockedAt: new Date(row.locked_at),
    leaseExpiresAt: new Date(row.lease_expires_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    expiresAt: new Date(row.expires_at),
  };
}

/**
 * PostgreSQL-backed durable idempotency store.
 * 
 * Correctness Invariants:
 * 1. Database-level uniqueness on (COALESCE(tenant_id, NULL_SENTINEL), operation, idempotency_key).
 * 2. Atomic INSERT ... ON CONFLICT DO NOTHING guarantees exactly one authoritative claimant across instances.
 * 3. Lease safety: Time alone NEVER replaces an active in-progress owner. Lease expiration alone does NOT
 *    prove that the original business operation failed. A key in IN_PROGRESS continues to reject concurrent
 *    or retry claims with 409 conflict, preventing duplicate business execution.
 * 4. Only confirmed FAILED keys (or records exceeding total retention TTL) are safely re-acquirable.
 * 5. Deterministic replay returns original status, body, and headers without re-execution.
 */
export class PostgresIdempotencyStore implements IdempotencyStore {
  private defaultTtlHours = 24;
  private defaultLeaseSeconds = 120; // 2 minute processing lease

  constructor(ttlHours?: number, leaseSeconds?: number) {
    if (ttlHours) this.defaultTtlHours = ttlHours;
    if (leaseSeconds) this.defaultLeaseSeconds = leaseSeconds;
    if (process.env.IDEMPOTENCY_EXPIRATION_HOURS) {
      const parsed = parseInt(process.env.IDEMPOTENCY_EXPIRATION_HOURS, 10);
      if (!isNaN(parsed) && parsed > 0) {
        this.defaultTtlHours = parsed;
      }
    }
  }

  async claim(params: {
    tenantId?: string | null;
    key: string;
    operation?: string;
    requestHash: string;
    ttlHours?: number;
    leaseSeconds?: number;
  }): Promise<ClaimResult> {
    const tenantId = params.tenantId || null;
    const operation = params.operation || "DEFAULT";
    const ttlHours = params.ttlHours || this.defaultTtlHours;
    const leaseSeconds = params.leaseSeconds || this.defaultLeaseSeconds;

    if (!tenantId) {
      return await withPlatformScope((tx) =>
        this.executeClaim(tx, params, null, operation, ttlHours, leaseSeconds)
      );
    }

    const sql = getDbClient();
    return this.executeClaim(sql, params, tenantId, operation, ttlHours, leaseSeconds);
  }

  private async executeClaim(
    sql: any,
    params: { key: string; requestHash: string },
    tenantId: string | null,
    operation: string,
    ttlHours: number,
    leaseSeconds: number
  ): Promise<ClaimResult> {
    // 1. Attempt atomic initial acquisition
    const insertedRows = await sql`
      INSERT INTO idempotency_keys (
        tenant_id,
        operation,
        idempotency_key,
        request_hash,
        status,
        locked_at,
        lease_expires_at,
        expires_at,
        created_at,
        updated_at
      ) VALUES (
        ${tenantId},
        ${operation},
        ${params.key},
        ${params.requestHash},
        'IN_PROGRESS',
        NOW(),
        NOW() + (${leaseSeconds} || ' seconds')::interval,
        NOW() + (${ttlHours} || ' hours')::interval,
        NOW(),
        NOW()
      )
      ON CONFLICT (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), operation, idempotency_key)
      DO NOTHING
      RETURNING *;
    `;

    if (insertedRows.length > 0) {
      return {
        status: "ACQUIRED",
        record: mapRowToRecord(insertedRows[0]),
      };
    }

    // 2. Conflict occurred: fetch authoritative existing row strictly partitioned by tenant
    const existingRows = tenantId
      ? await sql`
          SELECT * FROM idempotency_keys
          WHERE tenant_id = ${tenantId}
            AND operation = ${operation}
            AND idempotency_key = ${params.key}
          LIMIT 1;
        `
      : await sql`
          SELECT * FROM idempotency_keys
          WHERE tenant_id IS NULL
            AND operation = ${operation}
            AND idempotency_key = ${params.key}
          LIMIT 1;
        `;

    if (existingRows.length === 0) {
      // Rare edge case: concurrent delete/cleanup occurred right after conflict
      return this.claim({ ...params, tenantId, operation, ttlHours, leaseSeconds });
    }

    const existing = mapRowToRecord(existingRows[0]);
    const now = Date.now();

    // 3. Check overall retention expiration
    if (existing.expiresAt.getTime() < now) {
      // Record has exceeded total retention TTL; safely overwrite and claim
      const overwrittenRows = await sql`
        UPDATE idempotency_keys
        SET
          request_hash = ${params.requestHash},
          status = 'IN_PROGRESS',
          response_code = NULL,
          response_body = NULL,
          response_headers = NULL,
          resource_id = NULL,
          locked_at = NOW(),
          lease_expires_at = NOW() + (${leaseSeconds} || ' seconds')::interval,
          expires_at = NOW() + (${ttlHours} || ' hours')::interval,
          updated_at = NOW()
        WHERE key_id = ${existing.id}
          AND expires_at < NOW()
        RETURNING *;
      `;

      if (overwrittenRows.length > 0) {
        return {
          status: "ACQUIRED",
          record: mapRowToRecord(overwrittenRows[0]),
        };
      }
      return this.claim({ ...params, tenantId, operation, ttlHours, leaseSeconds });
    }

    // 4. Request Hash verification (Security Invariant: Authoritative hash is immutable)
    if (existing.requestHash !== params.requestHash) {
      return {
        status: "MISMATCH",
        record: existing,
      };
    }

    // 5. Existing record is COMPLETED -> Replay cached response
    if (existing.status === "COMPLETED") {
      return {
        status: "COMPLETED",
        record: existing,
        cachedResponse: {
          code: existing.responseCode || 200,
          body: existing.responseBody,
          headers: existing.responseHeaders || undefined,
        },
      };
    }

    // 6. Existing record is IN_PROGRESS:
    // SAFETY RULE: Time alone NEVER replaces an active in-progress owner.
    // Even if lease_expires_at has elapsed, the original operation may still be running.
    // Returning IN_PROGRESS prevents a concurrent retry from executing duplicate business mutations.
    if (existing.status === "IN_PROGRESS") {
      return {
        status: "IN_PROGRESS",
        record: existing,
      };
    }

    // 7. Confirmed FAILED record -> Safely retryable
    if (existing.status === "FAILED") {
      const reclaimedRows = await sql`
        UPDATE idempotency_keys
        SET
          status = 'IN_PROGRESS',
          locked_at = NOW(),
          lease_expires_at = NOW() + (${leaseSeconds} || ' seconds')::interval,
          updated_at = NOW()
        WHERE key_id = ${existing.id}
          AND status = 'FAILED'
        RETURNING *;
      `;

      if (reclaimedRows.length > 0) {
        return {
          status: "ACQUIRED",
          record: mapRowToRecord(reclaimedRows[0]),
        };
      }
    }

    // Default to in-progress conflict to prevent any duplicate mutation
    return {
      status: "IN_PROGRESS",
      record: existing,
    };
  }

  async get(params: {
    tenantId?: string | null;
    key: string;
    operation?: string;
  }): Promise<IdempotencyRecord | null> {
    const tenantId = params.tenantId || null;
    const operation = params.operation || "DEFAULT";

    if (!tenantId) {
      return await withPlatformScope(async (tx) => {
        const rows = await tx`
          SELECT * FROM idempotency_keys
          WHERE tenant_id IS NULL
            AND operation = ${operation}
            AND idempotency_key = ${params.key}
          LIMIT 1;
        `;
        if (rows.length === 0) return null;
        return mapRowToRecord(rows[0]);
      });
    }

    const sql = getDbClient();
    const rows = await sql`
      SELECT * FROM idempotency_keys
      WHERE tenant_id = ${tenantId}
        AND operation = ${operation}
        AND idempotency_key = ${params.key}
      LIMIT 1;
    `;

    if (rows.length === 0) return null;
    return mapRowToRecord(rows[0]);
  }

  async complete(params: {
    tenantId?: string | null;
    key: string;
    operation?: string;
    responseCode: number;
    responseBody: unknown;
    responseHeaders?: Record<string, string>;
    resourceId?: string;
  }): Promise<void> {
    const tenantId = params.tenantId || null;
    const operation = params.operation || "DEFAULT";

    if (!tenantId) {
      await withPlatformScope(async (tx) => {
        await tx`
          UPDATE idempotency_keys
          SET
            status = 'COMPLETED',
            response_code = ${params.responseCode},
            response_body = ${JSON.stringify(params.responseBody)},
            response_headers = ${params.responseHeaders ? JSON.stringify(params.responseHeaders) : null},
            resource_id = ${params.resourceId || null},
            updated_at = NOW()
          WHERE tenant_id IS NULL
            AND operation = ${operation}
            AND idempotency_key = ${params.key};
        `;
      });
      return;
    }

    const sql = getDbClient();
    await sql`
      UPDATE idempotency_keys
      SET
        status = 'COMPLETED',
        response_code = ${params.responseCode},
        response_body = ${JSON.stringify(params.responseBody)},
        response_headers = ${params.responseHeaders ? JSON.stringify(params.responseHeaders) : null},
        resource_id = ${params.resourceId || null},
        updated_at = NOW()
      WHERE tenant_id = ${tenantId}
        AND operation = ${operation}
        AND idempotency_key = ${params.key};
    `;
  }

  async fail(params: {
    tenantId?: string | null;
    key: string;
    operation?: string;
    reason?: string;
  }): Promise<void> {
    const tenantId = params.tenantId || null;
    const operation = params.operation || "DEFAULT";

    if (!tenantId) {
      await withPlatformScope(async (tx) => {
        await tx`
          UPDATE idempotency_keys
          SET
            status = 'FAILED',
            updated_at = NOW()
          WHERE tenant_id IS NULL
            AND operation = ${operation}
            AND idempotency_key = ${params.key};
        `;
      });
      return;
    }

    const sql = getDbClient();
    await sql`
      UPDATE idempotency_keys
      SET
        status = 'FAILED',
        updated_at = NOW()
      WHERE tenant_id = ${tenantId}
        AND operation = ${operation}
        AND idempotency_key = ${params.key};
    `;
  }

  async cleanup(params?: {
    olderThanSeconds?: number;
    limit?: number;
  }): Promise<{ deletedCount: number }> {
    const limit = params?.limit || 1000;
    return await withPlatformScope(async (tx) => {
      const result = await tx`
        WITH expired AS (
          SELECT key_id FROM idempotency_keys
          WHERE expires_at < NOW()
          LIMIT ${limit}
        )
        DELETE FROM idempotency_keys
        WHERE key_id IN (SELECT key_id FROM expired)
        RETURNING key_id;
      `;
      return { deletedCount: result.length };
    });
  }

  async clear(tenantId?: string): Promise<void> {
    const sql = getDbClient();
    if (tenantId) {
      await sql`DELETE FROM idempotency_keys WHERE tenant_id = ${tenantId}`;
    } else {
      await withPlatformScope(async (tx) => {
        await tx`DELETE FROM idempotency_keys`;
      });
    }
  }
}

// Global store singleton instance (PostgresIdempotencyStore by default)
let currentStore: IdempotencyStore = new PostgresIdempotencyStore();

export function getIdempotencyStore(): IdempotencyStore {
  return currentStore;
}

export function setIdempotencyStore(store: IdempotencyStore): void {
  currentStore = store;
}

// --------------------------------------------------------------------------
// Public API Facade (Backward-Compatible with All Existing ASSO API Routes)
// --------------------------------------------------------------------------

/**
 * Checks an idempotency key before mutation execution.
 * 
 * - If new: Claims the key (status: IN_PROGRESS) and returns `{ acquired: true }`.
 * - If completed with matching hash: Returns `{ acquired: false, cachedResponse }`.
 * - If completed or in-progress with mismatched hash: Throws 409 IdempotencyConflictError.
 * - If currently in-progress: Throws 409 IdempotencyConflictError (mutation in progress).
 * - If failed: Atomically re-claims key for safe retry and returns `{ acquired: true }`.
 */
export async function checkOrAcquireIdempotencyKey(
  tenantId: string | null,
  key: string,
  requestHash: string,
  ttlHours = 24,
  operation = "DEFAULT"
): Promise<{ acquired: boolean; cachedResponse?: { code: number; body: unknown } }> {
  const store = getIdempotencyStore();
  const result = await store.claim({
    tenantId,
    key,
    operation,
    requestHash,
    ttlHours,
  });

  if (result.status === "ACQUIRED") {
    return { acquired: true };
  }

  if (result.status === "COMPLETED") {
    return {
      acquired: false,
      cachedResponse: result.cachedResponse,
    };
  }

  if (result.status === "IN_PROGRESS") {
    throw new IdempotencyConflictError("A mutation with this Idempotency-Key is currently in progress.");
  }

  if (result.status === "MISMATCH") {
    throw new IdempotencyConflictError("Idempotency key reused with mismatched request parameters.");
  }

  throw new IdempotencyConflictError("Idempotency conflict detected.");
}

/**
 * Persists an authoritative response for an idempotent mutation upon successful transaction commit.
 */
export async function saveIdempotentResponse(
  tenantId: string | null,
  key: string,
  responseCode: number,
  responseBody: unknown,
  operation = "DEFAULT",
  resourceId?: string
): Promise<void> {
  const store = getIdempotencyStore();
  await store.complete({
    tenantId,
    key,
    operation,
    responseCode,
    responseBody,
    resourceId,
  });
}

/**
 * Releases or marks an idempotency key as failed when an operation fails before completion.
 */
export async function releaseIdempotencyKey(
  tenantId: string | null,
  key: string,
  operation = "DEFAULT",
  reason?: string
): Promise<void> {
  const store = getIdempotencyStore();
  await store.fail({
    tenantId,
    key,
    operation,
    reason,
  });
}

/**
 * Clears idempotency records (used primarily in test fixtures).
 */
export async function clearIdempotencyStore(tenantId?: string): Promise<void> {
  const store = getIdempotencyStore();
  await store.clear(tenantId);
}

/**
 * Atomically executes a business operation and its idempotency lifecycle within the SAME PostgreSQL transaction.
 * 
 * Guarantees:
 * 1. If the business mutation commits, the idempotency record is atomically marked COMPLETED with the response.
 * 2. If the operation fails or crashes before commit, PostgreSQL rolls back BOTH the business mutation and the idempotency claim.
 * 3. Zero window where a business record exists without idempotency completion.
 */
export async function runIdempotentTransaction<T>(
  params: {
    tenantId: string | null;
    key: string;
    operation?: string;
    requestHash: string;
    ttlHours?: number;
  },
  work: (tx: any) => Promise<{ statusCode: number; responsePayload: T; resourceId?: string }>
): Promise<{ statusCode: number; responsePayload: T; isIdempotentReplay: boolean }> {
  const tenantId = params.tenantId || null;
  const operation = params.operation || "DEFAULT";
  const ttlHours = params.ttlHours || 24;

  const runWithScope = async (tx: any) => {
    // 1. Check or acquire row with lock inside transaction
    const existing = tenantId
      ? await tx`
          SELECT * FROM idempotency_keys
          WHERE tenant_id = ${tenantId} AND operation = ${operation} AND idempotency_key = ${params.key}
          FOR UPDATE;
        `
      : await tx`
          SELECT * FROM idempotency_keys
          WHERE tenant_id IS NULL AND operation = ${operation} AND idempotency_key = ${params.key}
          FOR UPDATE;
        `;

    if (existing.length > 0) {
      const record = existing[0];
      if (record.request_hash !== params.requestHash) {
        throw new IdempotencyConflictError("Idempotency key reused with mismatched request parameters.");
      }
      if (record.status === "COMPLETED") {
        const body =
          typeof record.response_body === "string" ? JSON.parse(record.response_body) : record.response_body;
        return {
          statusCode: record.response_code || 200,
          responsePayload: body as T,
          isIdempotentReplay: true,
        };
      }
      if (record.status === "IN_PROGRESS") {
        throw new IdempotencyConflictError("A mutation with this Idempotency-Key is currently in progress.");
      }
      // If FAILED: allow retry by resetting status to IN_PROGRESS
      await tx`
        UPDATE idempotency_keys
        SET status = 'IN_PROGRESS', locked_at = NOW(), updated_at = NOW()
        WHERE key_id = ${record.key_id};
      `;
    } else {
      // Insert in-progress record
      await tx`
        INSERT INTO idempotency_keys (
          tenant_id, operation, idempotency_key, request_hash, status,
          locked_at, lease_expires_at, expires_at, created_at, updated_at
        ) VALUES (
          ${tenantId}, ${operation}, ${params.key}, ${params.requestHash}, 'IN_PROGRESS',
          NOW(), NOW() + interval '120 seconds', NOW() + (${ttlHours} || ' hours')::interval, NOW(), NOW()
        );
      `;
    }

    // 2. Execute authoritative business operation with the transaction client
    const result = await work(tx);

    // 3. Mark idempotency COMPLETED inside the SAME transaction
    if (tenantId) {
      await tx`
        UPDATE idempotency_keys
        SET
          status = 'COMPLETED',
          response_code = ${result.statusCode},
          response_body = ${JSON.stringify(result.responsePayload)},
          resource_id = ${result.resourceId || null},
          updated_at = NOW()
        WHERE tenant_id = ${tenantId} AND operation = ${operation} AND idempotency_key = ${params.key};
      `;
    } else {
      await tx`
        UPDATE idempotency_keys
        SET
          status = 'COMPLETED',
          response_code = ${result.statusCode},
          response_body = ${JSON.stringify(result.responsePayload)},
          resource_id = ${result.resourceId || null},
          updated_at = NOW()
        WHERE tenant_id IS NULL AND operation = ${operation} AND idempotency_key = ${params.key};
      `;
    }

    return {
      statusCode: result.statusCode,
      responsePayload: result.responsePayload,
      isIdempotentReplay: false,
    };
  };

  if (!tenantId) {
    return await withPlatformScope(runWithScope);
  }

  return await withTenantScope({ tenantId }, runWithScope);
}
