/**
 * ASSO STANDALONE TRANSACTIONAL OUTBOX WORKER
 * Scale Foundation S4
 * 
 * Dedicated long-running Node.js process decoupled from Next.js request lifecycle.
 * Continuously polls domain_outbox_events using SELECT ... FOR UPDATE SKIP LOCKED,
 * dispatches side effects (SMS, WhatsApp, KDS) with bounded concurrency,
 * and maintains durable auditability and recovery.
 */

// 1. Establish worker runtime environment before initializing connection pools
process.env.RUNTIME_ENV = "worker";

import { OutboxWorker } from "@/lib/outbox";
import { logger } from "@/lib/logger";

async function main() {
  const worker = new OutboxWorker();

  logger.info({
    message: "Starting ASSO Standalone Transactional Outbox Worker...",
    module: "OUTBOX_WORKER_CLI",
    details: {
      workerId: worker.config.workerId,
      concurrency: worker.config.concurrency,
      batchSize: worker.config.batchSize,
      pollIntervalMs: worker.config.pollIntervalMs,
      nodeVersion: process.version,
      pid: process.pid,
    },
  });

  // Graceful shutdown handlers
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({
      message: `Received ${signal}, initiating graceful shutdown...`,
      module: "OUTBOX_WORKER_CLI",
      details: { signal, workerId: worker.config.workerId },
    });

    try {
      await worker.stop();
      logger.info({
        message: "Worker shutdown complete. Exiting cleanly.",
        module: "OUTBOX_WORKER_CLI",
      });
      process.exit(0);
    } catch (err) {
      logger.error({
        message: "Error during worker shutdown",
        module: "OUTBOX_WORKER_CLI",
        details: { error: String(err) },
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
    details: { error: String(err) },
  });
  process.exit(1);
});
