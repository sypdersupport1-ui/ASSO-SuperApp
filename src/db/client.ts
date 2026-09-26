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

let client: postgres.Sql | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDbClient() {
  if (!client) {
    client = postgres(env.DATABASE_URL, {
      max: env.NODE_ENV === "production" ? 20 : 5,
      idle_timeout: 20,
      connect_timeout: 2, // 2s timeout for health checks
      onnotice: () => {},
    });
  }
  return client;
}

export function getDb() {
  if (!dbInstance) {
    const sqlClient = getDbClient();
    dbInstance = drizzle(sqlClient, { schema });
  }
  return dbInstance;
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
