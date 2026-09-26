import { describe, it, expect, beforeEach } from "vitest";
import { realtimeHub, SseClient } from "@/lib/realtime/sse";

describe("Realtime SSE Hub & Multi-Tenant Event Scoping Audit", () => {
  const tenantA = "11111111-1111-1111-1111-111111111111";
  const tenantB = "22222222-2222-2222-2222-222222222222";

  let tenantAMessages: string[] = [];
  let tenantBMessages: string[] = [];

  const clientA: SseClient = {
    id: "client_a_1",
    tenantId: tenantA,
    send: (data: Uint8Array) => {
      tenantAMessages.push(new TextDecoder().decode(data));
    },
    close: () => {},
  };

  const clientB: SseClient = {
    id: "client_b_1",
    tenantId: tenantB,
    send: (data: Uint8Array) => {
      tenantBMessages.push(new TextDecoder().decode(data));
    },
    close: () => {},
  };

  beforeEach(() => {
    realtimeHub.clearAllClients();
    tenantAMessages = [];
    tenantBMessages = [];
  });

  it("1. Connects clients and tracks total active connections correctly", () => {
    realtimeHub.registerClient(clientA);
    realtimeHub.registerClient(clientB);
    expect(realtimeHub.getClientCount()).toBe(2);
  });

  it("2. Broadcasts events strictly to target tenant; zero leakage to other tenants", async () => {
    realtimeHub.registerClient(clientA);
    realtimeHub.registerClient(clientB);

    // Broadcast to Tenant A only
    const deliveredCount = await realtimeHub.broadcastToTenant(tenantA, "order.placed", {
      orderId: "ord_100",
      amount: 450,
    });

    expect(deliveredCount).toBe(1);
    expect(tenantAMessages).toHaveLength(1);
    expect(tenantAMessages[0]).toContain("event: order.placed");
    expect(tenantAMessages[0]).toContain('"orderId":"ord_100"');

    // Tenant B client must receive ZERO messages (strict cross-tenant isolation)
    expect(tenantBMessages).toHaveLength(0);
  });

  it("3. Broadcasts events to Tenant B without leaking to Tenant A", async () => {
    realtimeHub.registerClient(clientA);
    realtimeHub.registerClient(clientB);

    // Broadcast to Tenant B only
    const deliveredCount = await realtimeHub.broadcastToTenant(tenantB, "table.updated", {
      tableNumber: "T5",
      status: "OCCUPIED",
    });

    expect(deliveredCount).toBe(1);
    expect(tenantBMessages).toHaveLength(1);
    expect(tenantBMessages[0]).toContain("event: table.updated");
    expect(tenantBMessages[0]).toContain('"tableNumber":"T5"');

    // Tenant A client must receive ZERO messages
    expect(tenantAMessages).toHaveLength(0);
  });

  it("4. Automatically unregisters disconnected client and decrements active count", () => {
    realtimeHub.registerClient(clientA);
    realtimeHub.registerClient(clientB);
    expect(realtimeHub.getClientCount()).toBe(2);

    realtimeHub.unregisterClient(clientA.id);
    expect(realtimeHub.getClientCount()).toBe(1);

    realtimeHub.unregisterClient(clientB.id);
    expect(realtimeHub.getClientCount()).toBe(0);
  });
});
