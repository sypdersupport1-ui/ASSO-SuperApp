import { withPlatformScope } from "@/db/rls";
import { OutboxEvent, WorkerConfig } from "./types";
import { logger } from "@/lib/logger";

export interface ClaimOptions {
  workerId: string;
  batchSize: number;
  leaseSeconds: number;
  maxAttempts: number;
  tenantId?: string;
}

/**
 * Maps raw SQL row to OutboxEvent type
 */
function mapRowToOutboxEvent(row: any): OutboxEvent {
  return {
    outboxId: row.outbox_id,
    eventId: row.event_id,
    tenantId: row.tenant_id,
    outletId: row.outlet_id,
    vertical: row.vertical,
    eventType: row.event_type,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    idempotencyKey: row.idempotency_key,
    payload: row.payload,
    status: row.status,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    providerRef: row.provider_ref,
    claimedBy: row.claimed_by,
    claimExpiresAt: row.claim_expires_at ? new Date(row.claim_expires_at) : null,
    lastAttemptedAt: row.last_attempted_at ? new Date(row.last_attempted_at) : null,
    createdAt: new Date(row.created_at),
    processedAt: row.processed_at ? new Date(row.processed_at) : null,
    nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : null,
  };
}

/**
 * Atomically claims up to batchSize eligible outbox events using
 * SELECT ... FOR UPDATE SKIP LOCKED.
 * 
 * Eligible events:
 * 1. PENDING events
 * 2. Abandoned PROCESSING events with expired leases (claim_expires_at <= NOW())
 * 3. RETRY_WAITING or FAILED events where next_retry_at <= NOW() and attempt_count < maxAttempts
 * 
 * Guarantees:
 * - Worker A and Worker B never double-claim the same event.
 * - Leases automatically expire, making crashed workers' jobs recoverable.
 * - Single atomic SQL query.
 */
export async function claimEligibleEvents(options: ClaimOptions): Promise<OutboxEvent[]> {
  return await withPlatformScope(async (tx) => {
    const rows = options.tenantId
      ? await tx`
          WITH claimable AS (
            SELECT outbox_id
            FROM domain_outbox_events
            WHERE (
              status = 'PENDING'
              OR (status = 'PROCESSING' AND claim_expires_at <= NOW())
              OR (status IN ('RETRY_WAITING', 'FAILED') AND (next_retry_at IS NULL OR next_retry_at <= NOW()) AND attempt_count < ${options.maxAttempts})
            )
            AND tenant_id = ${options.tenantId}::uuid
            ORDER BY created_at ASC
            LIMIT ${options.batchSize}
            FOR UPDATE SKIP LOCKED
          )
          UPDATE domain_outbox_events
          SET status = 'PROCESSING',
              claimed_by = ${options.workerId},
              claim_expires_at = NOW() + (${options.leaseSeconds} || ' seconds')::interval,
              attempt_count = domain_outbox_events.attempt_count + 1,
              last_attempted_at = NOW()
          FROM claimable
          WHERE domain_outbox_events.outbox_id = claimable.outbox_id
          RETURNING domain_outbox_events.*;
        `
      : await tx`
          WITH claimable AS (
            SELECT outbox_id
            FROM domain_outbox_events
            WHERE (
              status = 'PENDING'
              OR (status = 'PROCESSING' AND claim_expires_at <= NOW())
              OR (status IN ('RETRY_WAITING', 'FAILED') AND (next_retry_at IS NULL OR next_retry_at <= NOW()) AND attempt_count < ${options.maxAttempts})
            )
            ORDER BY created_at ASC
            LIMIT ${options.batchSize}
            FOR UPDATE SKIP LOCKED
          )
          UPDATE domain_outbox_events
          SET status = 'PROCESSING',
              claimed_by = ${options.workerId},
              claim_expires_at = NOW() + (${options.leaseSeconds} || ' seconds')::interval,
              attempt_count = domain_outbox_events.attempt_count + 1,
              last_attempted_at = NOW()
          FROM claimable
          WHERE domain_outbox_events.outbox_id = claimable.outbox_id
          RETURNING domain_outbox_events.*;
        `;

    return rows.map(mapRowToOutboxEvent);
  });
}

/**
 * Transitions event to terminal COMPLETED state.
 * Releases worker lease.
 */
export async function completeOutboxEvent(
  outboxId: string,
  providerRef?: string
): Promise<void> {
  await withPlatformScope(async (tx) => {
    await tx`
      UPDATE domain_outbox_events
      SET status = 'COMPLETED',
          processed_at = NOW(),
          claimed_by = NULL,
          claim_expires_at = NULL,
          last_error = NULL,
          provider_ref = COALESCE(${providerRef || null}, provider_ref)
      WHERE outbox_id = ${outboxId};
    `;
  });
}

/**
 * Handles failed event processing:
 * - If retryable and attemptCount < maxAttempts: transitions to RETRY_WAITING with exponential backoff.
 * - If non-retryable or attemptCount >= maxAttempts: transitions to terminal DEAD_LETTER.
 */
export async function failOutboxEvent(
  outboxId: string,
  error: string,
  retryable: boolean,
  attemptCount: number,
  config: Pick<WorkerConfig, "maxAttempts" | "baseBackoffSeconds" | "maxBackoffSeconds">
): Promise<{ status: "RETRY_WAITING" | "DEAD_LETTER"; nextRetryAt: Date | null }> {
  const isDeadLetter = !retryable || attemptCount >= config.maxAttempts;

  return await withPlatformScope(async (tx) => {
    if (isDeadLetter) {
      await tx`
        UPDATE domain_outbox_events
        SET status = 'DEAD_LETTER',
            last_error = ${error},
            next_retry_at = NULL,
            claimed_by = NULL,
            claim_expires_at = NULL
        WHERE outbox_id = ${outboxId};
      `;

      logger.error({
        message: "Outbox event transitioned to DEAD_LETTER (poison / max attempts breached)",
        module: "OUTBOX_WORKER",
        details: { outboxId, attemptCount, error },
      });

      return { status: "DEAD_LETTER", nextRetryAt: null };
    } else {
      const backoffSec = Math.min(
        config.maxBackoffSeconds,
        config.baseBackoffSeconds * Math.pow(2, Math.max(0, attemptCount - 1))
      );

      const [row] = await tx`
        UPDATE domain_outbox_events
        SET status = 'RETRY_WAITING',
            last_error = ${error},
            next_retry_at = NOW() + (${backoffSec} || ' seconds')::interval,
            claimed_by = NULL,
            claim_expires_at = NULL
        WHERE outbox_id = ${outboxId}
        RETURNING next_retry_at;
      `;

      const nextRetryAt = row?.next_retry_at ? new Date(row.next_retry_at) : null;

      logger.warn({
        message: "Outbox event failed retryably; scheduled for retry",
        module: "OUTBOX_WORKER",
        details: { outboxId, attemptCount, error, backoffSec, nextRetryAt },
      });

      return { status: "RETRY_WAITING", nextRetryAt };
    }
  });
}
