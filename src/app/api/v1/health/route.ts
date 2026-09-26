import { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/api/response";
import { checkDatabaseHealth } from "@/db/client";
import { realtimeHub } from "@/lib/realtime/sse";

export async function GET(req: NextRequest) {
  const dbHealth = await checkDatabaseHealth();

  return apiSuccess(
    {
      status: "healthy",
      service: "ASSO Platform Core",
      version: "0.1.0",
      environment: process.env.NODE_ENV || "development",
      uptimeSeconds: Math.floor(process.uptime()),
      database: dbHealth,
      realtime: {
        activeClients: realtimeHub.getClientCount(),
      },
      timestamp: new Date().toISOString(),
    },
    req.headers.get("x-request-id") || "req_health",
    200
  );
}
