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

// Extend NodeJS global type to support HMR singleton
const globalForDb = globalThis as unknown as {
  postgresClient: postgres.Sql | undefined;
  drizzleInstance: ReturnType<typeof drizzle<typeof schema>> | undefined;
};

export function getDbClient() {
  if (!globalForDb.postgresClient) {
    // 1. API runtime (Next.js serverless/edge): Small pool, fast timeout
    // 2. Background worker runtime: Larger pool if needed, explicit ENV config
    // 3. Local/Test runtime: Smallest pool, single connection preferred
    const maxConnections = parseInt(process.env.DB_POOL_SIZE || "0") || (env.NODE_ENV === "production" ? 10 : 5);
    const idleTimeout = parseInt(process.env.DB_IDLE_TIMEOUT || "20");
    const connectTimeout = parseInt(process.env.DB_CONNECT_TIMEOUT || "2");

    globalForDb.postgresClient = postgres(env.DATABASE_URL, {
      max: maxConnections,
      idle_timeout: idleTimeout,
      connect_timeout: connectTimeout,
      onnotice: () => {},
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
