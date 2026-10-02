import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/config/env";
import * as schema from "./schema";
import { logger } from "@/lib/logger";

export type DbStatus = "connected" | "disconnected" | "not_configured" | "mock" | "error";

export interface DbHealthResult {
  status: DbStatus;
  mode: "live" | "mock" | "unconfigured";
  engine: string;
  latencyMs: number;
  configuredUrl?: string;
  error?: string;
  details?: string;
}

// Extend NodeJS global type to support HMR singleton (Local Development Only)
// NOTE: globalThis prevents duplicate pools *within a single process* during Next.js Hot Module Reloads.
// It DOES NOT prevent connection exhaustion across horizontally scaled production processes.
const globalForDb = globalThis as unknown as {
  postgresClient: postgres.Sql | undefined;
  drizzleInstance: ReturnType<typeof drizzle<typeof schema>> | undefined;
};

export function getDbClient() {
  if (!globalForDb.postgresClient) {
    /**
     * CONNECTION BUDGET MODEL
     * 
     * Aggregate DB Connections = (API Instances × API_POOL_SIZE) + (Worker Instances × WORKER_POOL_SIZE)
     * 
     * Default Budget Assumptions:
     * - Supabase Session Pooler (port 5432): Max 500 connections (typical Supabase Pro tier)
     * - API_POOL_SIZE (default: 10): 20 Vercel serverless functions = 200 connections
     * - WORKER_POOL_SIZE (default: 50): 2 worker processes = 100 connections
     * - Total Peak: 300 connections (safe within 500 limit)
     * 
     * IMPORTANT: This singleton only applies PER PROCESS. Vercel spins up many isolated processes.
     */
    
    // Check if we are running in a dedicated background worker runtime
    const isWorker = process.env.RUNTIME_ENV === "worker";

    let maxConnections = isWorker ? 10 : 5;
    if (env.NODE_ENV === "production") {
      maxConnections = isWorker
        ? parseInt(process.env.WORKER_DB_POOL_SIZE || "50", 10)
        : parseInt(process.env.API_DB_POOL_SIZE || "10", 10);
    } else if (process.env.WORKER_DB_POOL_SIZE && isWorker) {
      maxConnections = parseInt(process.env.WORKER_DB_POOL_SIZE, 10);
    }

    const idleTimeout = isWorker
      ? parseInt(process.env.WORKER_DB_IDLE_TIMEOUT || process.env.DB_IDLE_TIMEOUT || "20", 10)
      : parseInt(process.env.DB_IDLE_TIMEOUT || "20", 10);

    const connectTimeout = isWorker
      ? parseInt(process.env.WORKER_DB_CONNECT_TIMEOUT || process.env.DB_CONNECT_TIMEOUT || "10", 10)
      : parseInt(process.env.DB_CONNECT_TIMEOUT || "10", 10);

    globalForDb.postgresClient = postgres(env.DATABASE_URL, {
      max: maxConnections,
      idle_timeout: idleTimeout,
      connect_timeout: connectTimeout,
      onnotice: () => {}, // Suppress notices
    });
  }
  return globalForDb.postgresClient;
}

export function getDb() {
  if (!globalForDb.drizzleInstance) {
    const sqlClient = getDbClient();
    globalForDb.drizzleInstance = drizzle(sqlClient, { schema });
  }
  return globalForDb.drizzleInstance;
}

export async function checkDatabaseHealth(): Promise<DbHealthResult> {
  const start = Date.now();

  // Check if mock mode is explicitly requested
  if (process.env.ASSO_DB_MODE === "mock") {
    return {
      status: "mock",
      mode: "mock",
      engine: "In-Memory Simulation Adapter",
      latencyMs: 1,
      details: "Application running in explicit local mock mode",
    };
  }

  // Check if DATABASE_URL is not configured
  if (!env.DATABASE_URL || env.DATABASE_URL.trim() === "") {
    return {
      status: "not_configured",
      mode: "unconfigured",
      engine: "None",
      latencyMs: 0,
      details: "DATABASE_URL environment variable is missing or empty",
    };
  }

  try {
    const sql = getDbClient();
    await sql`SELECT 1 as health_check`;
    return {
      status: "connected",
      mode: "live",
      engine: "PostgreSQL 16+ via Drizzle ORM",
      latencyMs: Date.now() - start,
      details: "Successfully connected to configured PostgreSQL database",
    };
  } catch (err: unknown) {
    const latency = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);
    
    // Mask password in DATABASE_URL for diagnostics
    const maskedUrl = env.DATABASE_URL.replace(/:\/\/[^:]+:[^@]+@/, "://***:***@");

    logger.warn({
      message: "Database probe failed to connect to configured PostgreSQL instance",
      details: { configuredUrl: maskedUrl, error: errorMsg, latencyMs: latency },
    });

    return {
      status: "disconnected",
      mode: "live",
      engine: "PostgreSQL (Configured, Unreachable)",
      latencyMs: latency,
      configuredUrl: maskedUrl,
      error: errorMsg.includes("ECONNREFUSED") || errorMsg.includes("Connection refused")
        ? "Connection refused: no PostgreSQL service is running on the target host/port"
        : errorMsg || "Connection failed",
      details: "Database is configured in environment, but the server is unreachable",
    };
  }
}
