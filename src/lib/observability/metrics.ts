/**
 * ASSO Observability — Metrics Instruments
 * Scale Foundation S5
 *
 * Low-cardinality metric labels only — no tenant IDs, user IDs, order IDs, IP addresses,
 * raw phone numbers, or other high-cardinality values in labels.
 *
 * Metric naming follows OpenTelemetry semantic conventions.
 * All instruments are noop-safe when OTel is disabled.
 */

import { getMeter } from "./tracing";

const meter = getMeter("asso.platform", "1.0.0");

// ─── API Metrics ──────────────────────────────────────────────────────────────

/** Total HTTP requests received */
export const httpRequestTotal = meter.createCounter("asso.http.requests.total", {
  description: "Total number of HTTP requests received",
  unit: "requests",
});

/** HTTP request duration histogram (milliseconds) */
export const httpRequestDuration = meter.createHistogram("asso.http.request.duration_ms", {
  description: "HTTP request processing duration in milliseconds",
  unit: "ms",
  advice: {
    explicitBucketBoundaries: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  },
});

/** HTTP 4xx client error counter */
export const httpClientErrors = meter.createCounter("asso.http.client_errors.total", {
  description: "Total number of HTTP 4xx client error responses",
  unit: "responses",
});

/** HTTP 5xx server error counter */
export const httpServerErrors = meter.createCounter("asso.http.server_errors.total", {
  description: "Total number of HTTP 5xx server error responses",
  unit: "responses",
});

// ─── Rate Limit Metrics ──────────────────────────────────────────────────────

/** Rate limit decisions */
export const rateLimitTotal = meter.createCounter("asso.rate_limit.decisions.total", {
  description: "Total rate limit check results by outcome and policy category",
  unit: "checks",
});

// ─── Auth / Security Metrics ─────────────────────────────────────────────────

/** Authentication failure counter */
export const authFailureTotal = meter.createCounter("asso.auth.failures.total", {
  description: "Total authentication failures by failure type",
  unit: "events",
});

/** Authorization / permission denial counter */
export const authzDenialTotal = meter.createCounter("asso.authz.denials.total", {
  description: "Total authorization denials (RBAC/entitlement)",
  unit: "events",
});

/** Webhook signature verification failure counter */
export const webhookSignatureFailureTotal = meter.createCounter("asso.webhook.signature_failures.total", {
  description: "Total webhook signature verification failures",
  unit: "events",
});

/** Idempotency conflict counter (repeated key with different payload) */
export const idempotencyConflictTotal = meter.createCounter("asso.idempotency.conflicts.total", {
  description: "Total idempotency key conflicts detected",
  unit: "events",
});

// ─── Database Metrics ─────────────────────────────────────────────────────────

/** DB query duration histogram */
export const dbQueryDuration = meter.createHistogram("asso.db.query.duration_ms", {
  description: "Database query/transaction duration in milliseconds",
  unit: "ms",
  advice: {
    explicitBucketBoundaries: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  },
});

/** DB query error counter */
export const dbQueryErrors = meter.createCounter("asso.db.errors.total", {
  description: "Total database query errors",
  unit: "errors",
});

/** DB connection error counter */
export const dbConnectionErrors = meter.createCounter("asso.db.connection_errors.total", {
  description: "Total database connection errors",
  unit: "errors",
});

/** Slow transaction warning counter (threshold > 1000ms) */
export const dbSlowTransactions = meter.createCounter("asso.db.slow_transactions.total", {
  description: "Total database transactions exceeding slow-transaction threshold",
  unit: "transactions",
});

// ─── Outbox / Worker Metrics ─────────────────────────────────────────────────

/** Events claimed by worker per batch cycle */
export const outboxEventsClaimed = meter.createCounter("asso.outbox.events.claimed", {
  description: "Total outbox events claimed by worker processes",
  unit: "events",
});

/** Events completed successfully */
export const outboxEventsCompleted = meter.createCounter("asso.outbox.events.completed", {
  description: "Total outbox events processed successfully",
  unit: "events",
});

/** Events failed with retryable error */
export const outboxEventsRetried = meter.createCounter("asso.outbox.events.retried", {
  description: "Total outbox event retryable failures",
  unit: "events",
});

/** Events dead-lettered (terminal failure) */
export const outboxEventsDeadLettered = meter.createCounter("asso.outbox.events.dead_lettered", {
  description: "Total outbox events sent to dead-letter (poison / max-attempts)",
  unit: "events",
});

/** Lease recoveries (previously crashed worker's abandoned events) */
export const outboxLeaseRecoveries = meter.createCounter("asso.outbox.lease_recoveries.total", {
  description: "Total expired outbox leases recovered by healthy workers",
  unit: "recoveries",
});

/** Worker event processing duration */
export const outboxEventDuration = meter.createHistogram("asso.outbox.event.duration_ms", {
  description: "Outbox event end-to-end processing duration per event",
  unit: "ms",
  advice: {
    explicitBucketBoundaries: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
  },
});

/** Worker batch processing duration */
export const outboxBatchDuration = meter.createHistogram("asso.outbox.batch.duration_ms", {
  description: "Outbox worker batch processing duration",
  unit: "ms",
  advice: {
    explicitBucketBoundaries: [10, 50, 100, 500, 1000, 2500, 5000, 10000],
  },
});

/** Worker polling cycle counter */
export const outboxWorkerPolls = meter.createCounter("asso.outbox.worker.polls.total", {
  description: "Total outbox worker poll cycles",
  unit: "polls",
});

// ─── Metric Recording Helpers ─────────────────────────────────────────────────

/**
 * Records a completed HTTP request with all relevant metric instruments.
 * Uses low-cardinality labels only.
 */
export function recordHttpRequest(params: {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  service?: string;
}): void {
  const statusClass = `${Math.floor(params.statusCode / 100)}xx`;
  const attrs = {
    "http.method": params.method.toUpperCase(),
    "http.route": params.route,
    "http.status_class": statusClass,
    "service.name": params.service || "api",
  };

  httpRequestTotal.add(1, attrs);
  httpRequestDuration.record(params.durationMs, attrs);

  if (params.statusCode >= 400 && params.statusCode < 500) {
    httpClientErrors.add(1, { ...attrs, "http.status_code": String(params.statusCode) });
  }
  if (params.statusCode >= 500) {
    httpServerErrors.add(1, { ...attrs, "http.status_code": String(params.statusCode) });
  }
}

/**
 * Records a rate limit decision.
 */
export function recordRateLimitDecision(params: {
  category: string;
  allowed: boolean;
  provider: string;
  keyClass: string;
}): void {
  rateLimitTotal.add(1, {
    "rate_limit.category": params.category,
    "rate_limit.allowed": params.allowed ? "true" : "false",
    "rate_limit.provider": params.provider,
    "rate_limit.key_class": params.keyClass,
  });
}

/**
 * Records an outbox batch processing cycle.
 */
export function recordOutboxBatch(params: {
  workerId: string;
  claimed: number;
  succeeded: number;
  retried: number;
  deadLettered: number;
  durationMs: number;
  leaseRecoveries?: number;
}): void {
  const attrs = { "worker.id": params.workerId.slice(0, 32) }; // cap cardinality

  outboxEventsClaimed.add(params.claimed, attrs);
  outboxEventsCompleted.add(params.succeeded, attrs);
  outboxEventsRetried.add(params.retried, attrs);
  outboxEventsDeadLettered.add(params.deadLettered, attrs);
  outboxWorkerPolls.add(1, attrs);
  outboxBatchDuration.record(params.durationMs, attrs);

  if (params.leaseRecoveries && params.leaseRecoveries > 0) {
    outboxLeaseRecoveries.add(params.leaseRecoveries, attrs);
  }
}
