/**
 * ASSO Observability — Correlation ID & Request Context
 * Scale Foundation S5
 *
 * Provides:
 *   - Cryptographically random correlation IDs (hex, 24 chars)
 *   - Safe reuse of caller-supplied IDs (validated length/format)
 *   - AsyncLocalStorage for zero-argument context propagation
 *   - Sanitised tenant/actor context that never contains secrets or PII
 *
 * Security invariants:
 *   - Correlation IDs are NEVER used for authorization.
 *   - Platform context tokens are NEVER included.
 *   - Phone numbers and raw customer data are NEVER stored.
 */

import crypto from "crypto";
import { AsyncLocalStorage } from "async_hooks";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RequestCorrelationContext {
  /** Primary correlation/request ID propagated to all downstream spans */
  requestId: string;
  /** Caller-supplied external trace/correlation ID (validated; trusted for logging only) */
  correlationId?: string;
  /** Operational tenant context (never contains secrets) */
  tenantId?: string;
  /** Outlet scope if applicable */
  outletId?: string;
  /** Hashed/opaque actor reference (never raw sub for security logs) */
  actorRef?: string;
  /** HTTP route pattern e.g. /api/v1/restaurant/orders */
  route?: string;
  /** HTTP method */
  method?: string;
  /** Business operation label e.g. "create_order" */
  operation?: string;
  /** Service name (api | worker) */
  service: "api" | "worker";
  /** Millisecond wall-clock when the request/task started */
  startedAt: number;
}

// ─── AsyncLocalStorage store ──────────────────────────────────────────────────

const store = new AsyncLocalStorage<RequestCorrelationContext>();

/** Run fn inside a correlation context (request or worker task scope). */
export function runWithCorrelationContext<T>(
  ctx: RequestCorrelationContext,
  fn: () => Promise<T>
): Promise<T> {
  return store.run(ctx, fn);
}

/** Retrieve the active correlation context (undefined outside a store run). */
export function getCorrelationContext(): RequestCorrelationContext | undefined {
  return store.getStore();
}

/** Retrieve the active request/correlation ID, falling back to "unknown". */
export function getCorrelationId(): string {
  return store.getStore()?.requestId ?? "unknown";
}

// ─── ID generation & validation ──────────────────────────────────────────────

/** Hex alphabet regex for correlation ID format validation */
const VALID_ID_PATTERN = /^[a-zA-Z0-9_\-]{8,64}$/;

/**
 * Generates a fresh 24-character lowercase hex correlation ID.
 * Uses crypto.randomBytes for adequate entropy.
 */
export function generateCorrelationId(): string {
  return crypto.randomBytes(12).toString("hex"); // 12 bytes → 24 hex chars
}

/**
 * Validates a caller-supplied correlation ID.
 * - Must be 8–64 printable alphanumeric/dash/underscore characters.
 * - Oversized or malformed IDs are replaced with a fresh ID.
 * - NEVER trusts the ID for authorization.
 *
 * @returns { id, reused } — reused=true when the caller's ID was accepted.
 */
export function resolveCorrelationId(
  incomingId: string | null | undefined
): { id: string; reused: boolean } {
  if (!incomingId) {
    return { id: generateCorrelationId(), reused: false };
  }

  const trimmed = incomingId.trim();
  if (VALID_ID_PATTERN.test(trimmed)) {
    return { id: trimmed, reused: true };
  }

  // Malformed or oversized — replace silently (security: prevent log injection)
  return { id: generateCorrelationId(), reused: false };
}

// ─── Worker task correlation ──────────────────────────────────────────────────

export interface WorkerTaskContext {
  requestId: string;
  workerId: string;
  outboxId: string;
  eventId: string;
  eventType: string;
  tenantId: string;
  attemptCount: number;
  /** Propagated correlation ID from the originating API request (if stored in event payload) */
  originatingCorrelationId?: string;
}

/**
 * Constructs a correlation context for an outbox worker task.
 * Links the worker span to the originating API request via originatingCorrelationId.
 */
export function buildWorkerTaskContext(
  workerId: string,
  params: {
    outboxId: string;
    eventId: string;
    eventType: string;
    tenantId: string;
    attemptCount: number;
    /** Optional: correlation ID embedded in outbox event payload at API time */
    originatingCorrelationId?: string;
  }
): WorkerTaskContext {
  return {
    requestId: generateCorrelationId(),
    workerId,
    outboxId: params.outboxId,
    eventId: params.eventId,
    eventType: params.eventType,
    tenantId: params.tenantId,
    attemptCount: params.attemptCount,
    originatingCorrelationId: params.originatingCorrelationId,
  };
}
