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

    let heartbeatTimer: NodeJS.Timeout | null = null;
    let isClosed = false;

    const cleanup = () => {
      if (isClosed) return;
      isClosed = true;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      realtimeHub.unregisterClient(clientId);
    };

    const stream = new ReadableStream({
      start(controller) {
        // Register client with realtimeHub
        realtimeHub.registerClient({
          id: clientId,
          tenantId,
          outletId: ctx.outletId,
          send: (data: Uint8Array) => {
            if (!isClosed) {
              controller.enqueue(data);
            }
          },
          close: () => {
            cleanup();
            try {
              controller.close();
            } catch {
              // Ignore if already closed
            }
          },
        });

        // Send initial connection handshake event
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
          if (!isClosed) {
            try {
              controller.enqueue(encoder.encode(": ping\n\n"));
            } catch {
              cleanup();
            }
          }
        }, 15000);
      },
      cancel() {
        cleanup();
      },
    });

    // Also register abort listener on the request signal
    req.signal.addEventListener("abort", () => {
      cleanup();
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Encoding": "none",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
