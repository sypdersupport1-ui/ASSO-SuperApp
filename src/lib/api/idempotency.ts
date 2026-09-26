import crypto from "crypto";
import { IdempotencyConflictError } from "./errors";

export interface IdempotencyRecord {
  tenantId: string;
  key: string;
  requestHash: string;
  status: "IN_PROGRESS" | "COMPLETED";
  responseCode?: number;
  responseBody?: unknown;
  createdAt: number;
  expiresAt: number;
}

// In-memory store for local development and fast testing (mirrors idempotency_keys table)
const idempotencyStore = new Map<string, IdempotencyRecord>();

function storeKey(tenantId: string, key: string): string {
  return `${tenantId}:${key}`;
}

export function computeRequestHash(method: string, path: string, body?: unknown): string {
  const serializedBody = body ? (typeof body === "string" ? body : JSON.stringify(body)) : "";
  const payload = `${method.toUpperCase()}:${path}:${serializedBody}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export async function checkOrAcquireIdempotencyKey(
  tenantId: string,
  key: string,
  requestHash: string,
  ttlHours = 24
): Promise<{ acquired: boolean; cachedResponse?: { code: number; body: unknown } }> {
  const idKey = storeKey(tenantId, key);
  const now = Date.now();
  const existing = idempotencyStore.get(idKey);

  if (existing) {
    // Check if expired
    if (existing.expiresAt < now) {
      idempotencyStore.delete(idKey);
    } else {
      // Key exists and is valid
      if (existing.status === "IN_PROGRESS") {
        throw new IdempotencyConflictError("A mutation with this Idempotency-Key is currently in flight.");
      }

      if (existing.requestHash !== requestHash) {
        throw new IdempotencyConflictError("Idempotency key reused with mismatched request parameters.");
      }

      return {
        acquired: false,
        cachedResponse: {
          code: existing.responseCode || 200,
          body: existing.responseBody,
        },
      };
    }
  }

  // Acquire new key
  idempotencyStore.set(idKey, {
    tenantId,
    key,
    requestHash,
    status: "IN_PROGRESS",
    createdAt: now,
    expiresAt: now + ttlHours * 3600 * 1000,
  });

  return { acquired: true };
}

export async function saveIdempotentResponse(
  tenantId: string,
  key: string,
  responseCode: number,
  responseBody: unknown
): Promise<void> {
  const idKey = storeKey(tenantId, key);
  const record = idempotencyStore.get(idKey);
  if (record) {
    record.status = "COMPLETED";
    record.responseCode = responseCode;
    record.responseBody = responseBody;
  }
}

export function clearIdempotencyStore(): void {
  idempotencyStore.clear();
}
