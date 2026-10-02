/**
 * ASSO STANDALONE TRANSACTIONAL OUTBOX WORKER
 * Scale Foundation S4 + S5 Observability
 *
 * Dedicated long-running Node.js process decoupled from Next.js request lifecycle.
 * Continuously polls domain_outbox_events using SELECT ... FOR UPDATE SKIP LOCKED,
 * dispatches side effects (SMS, WhatsApp, KDS) with bounded concurrency,
 * and maintains durable auditability and recovery.
 *
 * S5 Additions:
 * - OpenTelemetry SDK initialised before any module imports
 * - WorkerHealthServer for container liveness/readiness probes
 * - Graceful OTel SDK flush on shutdown
 * - Full structured logging on all lifecycle events
 */

// 1. Establish worker runtime environment BEFORE any module imports
process.env.RUNTIME_ENV = "worker";
process.env.LOGGER_SERVICE = "worker";

// 2. Initialise OpenTelemetry SDK FIRST (must precede business module imports)
import { initTelemetry, shutdownTelemetry } from "@/lib/observability/tracing";
initTelemetry("asso-outbox-worker");

import { OutboxWorker } from "@/lib/outbox";
import { WorkerHealthServer } from "@/lib/observability/worker-health";
import { logger } from "@/lib/logger";

async function main() {
  const worker = new OutboxWorker();
  const healthServer = new WorkerHealthServer(worker.config.workerId);

  logger.info({
    message: "Starting ASSO Standalone Transactional Outbox Worker...",
    module: "OUTBOX_WORKER_CLI",
    workerId: worker.config.workerId,
    details: {
      concurrency: worker.config.concurrency,
      batchSize: worker.config.batchSize,
      pollIntervalMs: worker.config.pollIntervalMs,
      nodeVersion: process.version,
      pid: process.pid,
    },
  });

  // Start health server (non-blocking)
  healthServer.start();

  // Graceful shutdown handlers
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({
      message: `Received ${signal}, initiating graceful shutdown...`,
      module: "OUTBOX_WORKER_CLI",
      workerId: worker.config.workerId,
      details: { signal },
    });

    try {
      await worker.stop();
      healthServer.stop();

      // Flush OTel spans and metrics before exiting
      await shutdownTelemetry();

      logger.info({
        message: "Worker shutdown complete. Exiting cleanly.",
        module: "OUTBOX_WORKER_CLI",
        workerId: worker.config.workerId,
      });
      process.exit(0);
    } catch (err) {
      logger.error({
        message: "Error during worker shutdown",
        module: "OUTBOX_WORKER_CLI",
        workerId: worker.config.workerId,
        error: err,
      });
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Start long-running worker
  await worker.start();
}

main().catch((err) => {
  logger.error({
    message: "Fatal error in outbox worker main process",
    module: "OUTBOX_WORKER_CLI",
    error: err,
  });
  process.exit(1);
});
