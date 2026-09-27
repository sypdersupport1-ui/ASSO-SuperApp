import { NextRequest } from "next/server";
import { realtimeHub } from "@/lib/realtime/sse";
import { extractRequestContext } from "@/lib/api/context";
import { apiError } from "@/lib/api/response";
import { AuthenticationError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/customer/realtime
 * Room-scoped Server-Sent Events (SSE) connection for customer sessions.
 * Delivers updates strictly for the client's authorized room context and tenant.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, { requireAuth: true });

    if (!ctx.user || ctx.user.sessionType !== "CUSTOMER" || !ctx.user.tenantId || !ctx.user.contextId) {
      throw new AuthenticationError("Valid customer session token required for realtime stream.");
    }

    const tenantId = ctx.user.tenantId;
    const contextId = ctx.user.contextId;
    const clientId = `cust_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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
        // Register customer client with realtimeHub
        realtimeHub.registerClient({
          id: clientId,
          tenantId,
          outletId: ctx.user?.outletId,
          contextId,
          sessionType: "CUSTOMER",
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
          "customer.connected",
          {
            clientId,
            tenantId,
            contextId,
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
