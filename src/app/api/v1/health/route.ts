import { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/api/response";
import { checkDatabaseHealth } from "@/db/client";
import { realtimeHub } from "@/lib/realtime/sse";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const dbHealth = await checkDatabaseHealth();

  // If database is configured as a live dependency but is unreachable, report degraded
  const platformStatus =
    dbHealth.status === "disconnected" || dbHealth.status === "error"
      ? "degraded"
      : "healthy";

  return apiSuccess(
    {
      status: platformStatus,
      service: "ASSO Platform Core",
      version: "0.1.0",
      environment: process.env.NODE_ENV || "development",
      uptimeSeconds: Math.floor(process.uptime()),
      database: dbHealth,
      realtime: {
        status: "operational",
        activeClients: realtimeHub.getClientCount(),
        heartbeatIntervalMs: 15000,
      },
      testDatabase: {
        engine: "pg-mem",
        scope: "Automated Vitest Suite Only",
        status: "verified_in_tests",
      },
      timestamp: new Date().toISOString(),
    },
    req.headers.get("x-request-id") || "req_health",
    200
  );
}
