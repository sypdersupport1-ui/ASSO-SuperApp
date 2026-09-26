import { logger } from "../logger";

export interface SseClient {
  id: string;
  tenantId: string;
  outletId?: string;
  send: (data: Uint8Array) => void;
  close: () => void;
}

class RealtimeHub {
  private clients = new Map<string, SseClient>();

  registerClient(client: SseClient): void {
    this.clients.set(client.id, client);
    logger.debug({
      message: `SSE client connected: ${client.id}`,
      tenantId: client.tenantId,
      details: { totalClients: this.clients.size },
    });
  }

  unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        client.close();
      } catch {
        // Already closed
      }
      this.clients.delete(clientId);
      logger.debug({
        message: `SSE client disconnected: ${clientId}`,
        details: { remainingClients: this.clients.size },
      });
    }
  }

  async broadcastToTenant(tenantId: string, eventName: string, data: unknown, eventId?: string): Promise<number> {
    const payload = this.formatSseMessage(eventName, data, eventId);
    const encoder = new TextEncoder();
    const encoded = encoder.encode(payload);

    let deliveredCount = 0;
    const deadClients: string[] = [];

    for (const [id, client] of this.clients.entries()) {
      if (client.tenantId === tenantId) {
        try {
          client.send(encoded);
          deliveredCount++;
        } catch {
          deadClients.push(id);
        }
      }
    }

    // Clean up dead sockets
    for (const id of deadClients) {
      this.unregisterClient(id);
    }

    return deliveredCount;
  }

  formatSseMessage(event: string, data: unknown, id?: string): string {
    let msg = "";
    if (id) {
      msg += `id: ${id}\n`;
    }
    msg += `event: ${event}\n`;
    msg += `data: ${JSON.stringify(data)}\n\n`;
    return msg;
  }

  getClientCount(): number {
    return this.clients.size;
  }

  clearAllClients(): void {
    this.clients.clear();
  }
}

export const realtimeHub = new RealtimeHub();
