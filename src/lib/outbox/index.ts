import os from "os";
import crypto from "crypto";
import {
  WorkerConfig,
  BatchProcessingStats,
  OutboxEvent,
} from "./types";
import {
  claimEligibleEvents,
  completeOutboxEvent,
  failOutboxEvent,
} from "./repository";
import { OutboxDispatcher, defaultDispatcher } from "./dispatcher";
import { logger } from "@/lib/logger";

export * from "./types";
export * from "./repository";
export * from "./dispatcher";

/**
 * Concurrency Limiter
 * Processes an array of items with a fixed maximum number of concurrent promises.
 */
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let index = 0;

  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      while (index < items.length) {
        const i = index++;
        results[i] = await fn(items[i]);
      }
    }
  );

  await Promise.all(workers);
  return results;
}

/**
 * Default Worker Configuration derived from environment variables
 */
export function getDefaultWorkerConfig(): WorkerConfig {
  const host = typeof os.hostname === "function" ? os.hostname() : "localhost";
  const pid = typeof process.pid === "number" ? process.pid : 1;
  const rand = crypto.randomUUID().slice(0, 8);

  return {
    workerId: process.env.WORKER_INSTANCE_ID || `worker_${host}_${pid}_${rand}`,
    pollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || "1000", 10),
    batchSize: parseInt(process.env.WORKER_BATCH_SIZE || "20", 10),
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || "5", 10),
    leaseSeconds: parseInt(process.env.WORKER_LEASE_SECONDS || "60", 10),
    maxAttempts: parseInt(process.env.WORKER_MAX_ATTEMPTS || "5", 10),
    baseBackoffSeconds: parseInt(process.env.WORKER_BASE_BACKOFF_SECONDS || "30", 10),
    maxBackoffSeconds: parseInt(process.env.WORKER_MAX_BACKOFF_SECONDS || "3600", 10),
    shutdownTimeoutMs: parseInt(process.env.WORKER_SHUTDOWN_TIMEOUT_MS || "10000", 10),
  };
}

/**
 * Standalone Transactional Outbox Worker
 * 
 * Scalability Properties:
 * - Operates independently from Next.js request lifecycle.
 * - Uses SELECT ... FOR UPDATE SKIP LOCKED for distributed, collision-free claiming.
 * - Enforces bounded concurrency without overwhelming database connection pools or external providers.
 * - Short transaction boundaries: does not hold DB transactions during external network I/O.
 * - Automatic lease expiration and recovery for crashed worker instances.
 */
export class OutboxWorker {
  public readonly config: WorkerConfig;
  private dispatcher: OutboxDispatcher;
  private isRunning = false;
  private inFlightPromise: Promise<void> | null = null;
  private resolveInFlight: (() => void) | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    configOverrides: Partial<WorkerConfig> = {},
    dispatcher: OutboxDispatcher = defaultDispatcher
  ) {
    this.config = {
      ...getDefaultWorkerConfig(),
      ...configOverrides,
    };
    this.dispatcher = dispatcher;
  }

  get active(): boolean {
    return this.isRunning;
  }

  /**
   * Processes a single batch of outbox events.
   * Exposed publicly for programmatic polling, manual triggers, and testing.
   */
  async processBatch(batchSizeOverride?: number, tenantId?: string): Promise<BatchProcessingStats> {
    const start = Date.now();
    const batchSize = batchSizeOverride || this.config.batchSize;

    // 1. Claim eligible events in a short atomic transaction
    const events = await claimEligibleEvents({
      workerId: this.config.workerId,
      batchSize,
      leaseSeconds: this.config.leaseSeconds,
      maxAttempts: this.config.maxAttempts,
      tenantId,
    });

    const stats: BatchProcessingStats = {
      claimed: events.length,
      succeeded: 0,
      retried: 0,
      deadLettered: 0,
      durationMs: 0,
      errors: [],
    };

    if (events.length === 0) {
      stats.durationMs = Date.now() - start;
      return stats;
    }

    logger.debug({
      message: "Outbox worker claimed events for processing",
      module: "OUTBOX_WORKER",
      details: {
        workerId: this.config.workerId,
        count: events.length,
        outboxIds: events.map((e) => e.outboxId),
      },
    });

    // 2. Dispatch events with bounded concurrency (external network I/O outside DB tx)
    await mapConcurrent(events, this.config.concurrency, async (event: OutboxEvent) => {
      const eventStart = Date.now();
      try {
        const result = await this.dispatcher.dispatch(event);

        if (result.success) {
          await completeOutboxEvent(event.outboxId, result.providerRef);
          stats.succeeded++;

          logger.info({
            message: "Outbox event processed successfully",
            module: "OUTBOX_WORKER",
            tenantId: event.tenantId,
            details: {
              workerId: this.config.workerId,
              outboxId: event.outboxId,
              eventType: event.eventType,
              attemptCount: event.attemptCount,
              durationMs: Date.now() - eventStart,
            },
          });
        } else {
          const errMsg = result.error || "Unknown handler error";
          stats.errors!.push({ outboxId: event.outboxId, error: errMsg });

          const failResult = await failOutboxEvent(
            event.outboxId,
            errMsg,
            result.retryable ?? true,
            event.attemptCount,
            this.config
          );

          if (failResult.status === "DEAD_LETTER") {
            stats.deadLettered++;
          } else {
            stats.retried++;
          }
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        stats.errors!.push({ outboxId: event.outboxId, error: errorMsg });

        const failResult = await failOutboxEvent(
          event.outboxId,
          errorMsg,
          true,
          event.attemptCount,
          this.config
        );

        if (failResult.status === "DEAD_LETTER") {
          stats.deadLettered++;
        } else {
          stats.retried++;
        }
      }
    });

    stats.durationMs = Date.now() - start;
    return stats;
  }

  /**
   * Starts the long-running worker polling loop.
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info({
      message: "Outbox worker started",
      module: "OUTBOX_WORKER",
      details: {
        workerId: this.config.workerId,
        pollIntervalMs: this.config.pollIntervalMs,
        batchSize: this.config.batchSize,
        concurrency: this.config.concurrency,
        leaseSeconds: this.config.leaseSeconds,
        maxAttempts: this.config.maxAttempts,
      },
    });

    const loop = async () => {
      while (this.isRunning) {
        let inFlight = false;
        try {
          inFlight = true;
          this.inFlightPromise = new Promise((resolve) => {
            this.resolveInFlight = resolve;
          });

          const stats = await this.processBatch();

          // If we claimed a full batch, drain backlog immediately without sleeping
          if (stats.claimed >= this.config.batchSize && this.isRunning) {
            continue;
          }
        } catch (err: unknown) {
          logger.error({
            message: "Unexpected error in outbox worker loop",
            module: "OUTBOX_WORKER",
            details: { workerId: this.config.workerId, error: String(err) },
          });
        } finally {
          if (inFlight && this.resolveInFlight) {
            this.resolveInFlight();
            this.inFlightPromise = null;
            this.resolveInFlight = null;
          }
        }

        // Sleep for pollIntervalMs before checking again
        if (this.isRunning) {
          await new Promise<void>((resolve) => {
            this.timer = setTimeout(resolve, this.config.pollIntervalMs);
          });
        }
      }
    };

    // Run loop in background
    loop().catch((err) => {
      logger.error({
        message: "Fatal outbox worker failure",
        module: "OUTBOX_WORKER",
        details: { error: String(err) },
      });
    });
  }

  /**
   * Gracefully shuts down the worker process:
   * 1. Stops claiming new work.
   * 2. Waits up to shutdownTimeoutMs for active in-flight batch to conclude.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info({
      message: "Initiating graceful outbox worker shutdown...",
      module: "OUTBOX_WORKER",
      details: { workerId: this.config.workerId },
    });

    this.isRunning = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.inFlightPromise) {
      const timeoutPromise = new Promise<void>((resolve) =>
        setTimeout(resolve, this.config.shutdownTimeoutMs)
      );

      await Promise.race([this.inFlightPromise, timeoutPromise]);
    }

    logger.info({
      message: "Outbox worker gracefully stopped.",
      module: "OUTBOX_WORKER",
      details: { workerId: this.config.workerId },
    });
  }
}
