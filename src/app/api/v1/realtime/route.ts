import { NextRequest } from "next/server";
import { realtimeHub } from "@/lib/realtime/sse";
import { extractRequestContext } from "@/lib/api/context";
import { apiError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, { requireAuth: false });
    const tenantId = ctx.tenantId || "default-tenant";
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const encoder = new TextEncoder();

    let heartbeatTimer: NodeJS.Timeout;

    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection event
        const initialMsg = realtimeHub.formatSseMessage(
          "system.connected",
          {
            clientId,
            tenantId,
            status: "connected",
            timestamp: new Date().toISOString(),
          },
          "evt_0"
        );
        controller.enqueue(encoder.encode(initialMsg));

        // Periodic heartbeat ping every 15 seconds
        heartbeatTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            clearInterval(heartbeatTimer);
          }
        }, 15000);
      },
      cancel() {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        realtimeHub.unregisterClient(clientId);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Encoding": "none",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
