/**
 * ASSO Worker Health Server
 * Scale Foundation S5
 *
 * Lightweight HTTP server for the standalone outbox worker process.
 * Exposes a minimal /health endpoint for container liveness/readiness probes.
 *
 * Does NOT execute business queries on health check — only reports:
 *   - Worker process state (running / stopped / starting)
 *   - Database connectivity (simple SELECT 1 with configurable timeout)
 *   - Worker configuration metadata
 *
 * Configured via:
 *   WORKER_HEALTH_PORT  — port to bind (default: 9090)
 *
 * Does NOT expose:
 *   - Tenant data
 *   - Internal trace IDs
 *   - Database connection strings
 *   - Environment credentials
 */

import http from "http";
import { logger } from "@/lib/logger";

export interface WorkerHealthState {
  /** "starting" before first successful poll; "running" during operation; "stopped" after shutdown */
  status: "starting" | "running" | "stopped";
  workerId: string;
  startedAt: string;
  lastPollAt?: string;
  lastPollClaimedCount?: number;
  pollCount: number;
  errorCount: number;
}

export class WorkerHealthServer {
  private server: http.Server | null = null;
  private state: WorkerHealthState;
  private readonly port: number;

  constructor(workerId: string) {
    this.port = parseInt(process.env.WORKER_HEALTH_PORT || "9090", 10);
    this.state = {
      status: "starting",
      workerId,
      startedAt: new Date().toISOString(),
      pollCount: 0,
      errorCount: 0,
    };
  }

  /** Called when the worker completes a poll cycle. */
  recordPoll(claimedCount: number): void {
    this.state.status = "running";
    this.state.lastPollAt = new Date().toISOString();
    this.state.lastPollClaimedCount = claimedCount;
    this.state.pollCount++;
  }

  /** Called when the worker encounters an unexpected error. */
  recordError(): void {
    this.state.errorCount++;
  }

  /** Called when the worker is shutting down. */
  markStopped(): void {
    this.state.status = "stopped";
  }

  start(): void {
    this.server = http.createServer(async (req, res) => {
      if (req.url === "/health" || req.url === "/healthz") {
        await this.handleHealth(res);
      } else if (req.url === "/ready" || req.url === "/readiness") {
        await this.handleReadiness(res);
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "not_found" }));
      }
    });

    this.server.listen(this.port, () => {
      logger.info({
        message: `Worker health server listening on port ${this.port}`,
        module: "WORKER_HEALTH",
        workerId: this.state.workerId,
      });
    });

    this.server.on("error", (err) => {
      logger.warn({
        message: "Worker health server error",
        module: "WORKER_HEALTH",
        error: err,
      });
    });
  }

  private async handleHealth(res: http.ServerResponse): Promise<void> {
    const payload = {
      status: this.state.status,
      workerId: this.state.workerId,
      startedAt: this.state.startedAt,
      lastPollAt: this.state.lastPollAt,
      pollCount: this.state.pollCount,
      errorCount: this.state.errorCount,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };

    const statusCode = this.state.status === "stopped" ? 503 : 200;
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  }

  private async handleReadiness(res: http.ServerResponse): Promise<void> {
    // Readiness: verify DB connectivity with a lightweight probe
    let dbStatus: "connected" | "disconnected" = "disconnected";
    let dbLatencyMs = 0;

    try {
      const { getDbClient } = await import("@/db/client");
      const start = Date.now();
      const sql = getDbClient();
      await Promise.race([
        sql`SELECT 1 AS worker_readiness_probe`,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
      ]);
      dbStatus = "connected";
      dbLatencyMs = Date.now() - start;
    } catch {
      dbStatus = "disconnected";
    }

    const isReady = this.state.status === "running" && dbStatus === "connected";

    const payload = {
      ready: isReady,
      workerStatus: this.state.status,
      database: { status: dbStatus, latencyMs: dbLatencyMs },
      timestamp: new Date().toISOString(),
    };

    const statusCode = isReady ? 200 : 503;
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  }

  stop(): void {
    this.markStopped();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
