import crypto from "crypto";
import { eq, and, or, lte, desc, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { domainOutboxEvents, DomainOutboxEvent } from "@/db/schema/communication";
import { DomainEvent, DomainEventType, VerticalType } from "./types";
import { getCommunicationEngine } from "@/lib/communication/engine";
import { scheduleJob } from "@/lib/jobs/queue";
import { logger } from "@/lib/logger";

export interface CreateEventOptions<T = Record<string, unknown>> {
  tenantId: string;
  outletId?: string;
  vertical: VerticalType;
  eventType: DomainEventType;
  aggregateType: string;
  aggregateId: string;
  payload: T;
  idempotencyKey?: string;
}

/**
 * Factory helper to construct a fully qualified DomainEvent
 */
export function createDomainEvent<T = Record<string, unknown>>(
  options: CreateEventOptions<T>
): DomainEvent<T> {
  const eventId = crypto.randomUUID();
  const idempotencyKey =
    options.idempotencyKey ||
    `${options.tenantId}:${options.eventType}:${options.aggregateId}:${eventId}`;

  return {
    eventId,
    eventType: options.eventType,
    tenantId: options.tenantId,
    outletId: options.outletId,
    vertical: options.vertical,
    aggregateType: options.aggregateType,
    aggregateId: options.aggregateId,
    occurredAt: new Date().toISOString(),
    payload: options.payload,
    idempotencyKey,
  };
}

/**
 * Durably records a DomainEvent into the transactional outbox table.
 * Must be executed within the authoritative business database transaction.
 */
export async function recordOutboxEvent(
  tx: any,
  event: DomainEvent<any>
): Promise<DomainOutboxEvent> {
  // Idempotency check: if an event with this idempotencyKey already exists, return it
  const [existing] = await tx
    .select()
    .from(domainOutboxEvents)
    .where(eq(domainOutboxEvents.idempotencyKey, event.idempotencyKey))
    .limit(1);

  if (existing) {
    logger.info({
      message: "Idempotent outbox event already recorded; skipping duplicate insert",
      tenantId: event.tenantId,
      details: {
        idempotencyKey: event.idempotencyKey,
        eventId: existing.eventId,
        status: existing.status,
      },
    });
    return existing;
  }

  const [inserted] = await tx
    .insert(domainOutboxEvents)
    .values({
      eventId: event.eventId,
      tenantId: event.tenantId,
      outletId: event.outletId || null,
      vertical: event.vertical,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      idempotencyKey: event.idempotencyKey,
      payload: event.payload,
      status: "PENDING",
      attemptCount: 0,
    })
    .returning();

  logger.info({
    message: "Trusted domain event recorded to outbox",
    tenantId: event.tenantId,
    details: {
      eventId: event.eventId,
      eventType: event.eventType,
      outboxId: inserted.outboxId,
    },
  });

  return inserted;
}

/**
 * Triggers background processing of pending outbox events.
 * Uses pg-boss if available; falls back smoothly in local test environments.
 */
export async function triggerOutboxProcessing(tenantId?: string): Promise<void> {
  try {
    await scheduleJob("outbox_communication_worker", {
      tenantId,
      requestedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    logger.debug({
      message: "Non-blocking trigger to background queue",
      error: String(err),
    });
  }
}

export interface ProcessBatchResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ outboxId: string; error: string }>;
}

/**
 * Processes a batch of pending or retryable outbox events using the S4 OutboxWorker.
 * Guarantees atomic SKIP LOCKED claiming, lease tracking, and duplicate-safe execution.
 */
export async function processOutboxBatch(options: {
  batchSize?: number;
  tenantId?: string;
  maxAttempts?: number;
} = {}): Promise<ProcessBatchResult> {
  const { OutboxWorker } = await import("@/lib/outbox");
  const worker = new OutboxWorker({
    batchSize: options.batchSize || 20,
    maxAttempts: options.maxAttempts || 3,
  });

  const stats = await worker.processBatch(options.batchSize, options.tenantId);

  return {
    processed: stats.claimed,
    succeeded: stats.succeeded,
    failed: stats.retried + stats.deadLettered,
    errors: stats.errors || [],
  };
}
