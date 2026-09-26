import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/config/env";
import * as schema from "./schema";
import { logger } from "@/lib/logger";

let client: postgres.Sql | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDbClient() {
  if (!client) {
    client = postgres(env.DATABASE_URL, {
      max: env.NODE_ENV === "production" ? 20 : 5,
      idle_timeout: 20,
      connect_timeout: 5,
      onnotice: () => {}, // Suppress notices in output
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

export async function checkDatabaseHealth(): Promise<{ status: "connected" | "disconnected"; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const sql = getDbClient();
    await sql`SELECT 1 as health_check`;
    return {
      status: "connected",
      latencyMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn({ message: "Database health check failed (operating in fallback/offline mode)", details: { error: errorMsg } });
    return {
      status: "disconnected",
      latencyMs: Date.now() - start,
      error: errorMsg,
    };
  }
}
