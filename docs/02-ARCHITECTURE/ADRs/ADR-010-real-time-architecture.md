# ADR-010: Real-Time Architecture

**Status**: Accepted  
**Date**: 2026-09-26  
**Deciders**: Human Product Owner, Antigravity  
**Resolves**: Open Decision #4 (Real-time technology selection)

---

## Context

Several key ASSO capabilities require or benefit from timely data delivery:
1. **Kitchen / Fulfillment Display (KDS)**: Urgent order arrivals, preparation status updates, cancellations (push required, latency < 2s).
2. **Service Requests**: Immediate notification when requests are created or assigned to staff.
3. **Customer Order Status**: Visual progress tracker as order moves from Pending → Preparing → Ready → Delivered.
4. **Staff / Customer Chat**: Two-way conversation between customer and property staff.
5. **Business Console Live Dashboard**: Operational metrics and table/room turnover status.

Historically, teams introduce full duplex WebSockets (Socket.IO, custom WebSocket clusters) universally, introducing stateful connection management, custom auth handshakes, complex sticky-session load balancing, and high operational fragility on serverless platforms (such as Vercel).

An architectural decision is required to define the simplest, most resilient real-time architecture that satisfies ASSO's requirements without unnecessary complexity.

---

## Decision

ASSO adopts a **Hybrid Real-Time Architecture**:
1. **Downstream Push (Server-to-Client)**: **Server-Sent Events (SSE)** via standard HTTP streaming (`GET /api/v1/realtime/stream`) or **Supabase Realtime Broadcast Channels** (when running on Supabase).
2. **Upstream Actions (Client-to-Server)**: **Standard HTTP Requests (POST / PATCH)** passing through the full 5-stage middleware pipeline (Authentication, Tenant Context, Module Entitlements, RBAC, Policy).
3. **Resilience Fallback**: **Exponential Backoff Short-Polling** (5s for KDS, 10s for active customer orders, 15s for console dashboards) activated automatically if the push stream is interrupted.

Dedicated bidirectional WebSocket servers are **explicitly rejected** for initial phases as an unnecessary operational burden.

---

## Technical Architecture

```text
Client Application (KDS / Console / Customer App)
       │                                     ▲
       │ 1. Upstream Actions                 │ 2. Downstream Events
       │    (POST /api/v1/...)               │    (SSE GET /api/v1/realtime/stream)
       ▼                                     │
API Server & Middleware Stack                │
       │ (Auth, Tenant, RBAC, Policy)        │
       ▼                                     │
Domain Operation Executes                    │
       │                                     │
       ├─► DB Transaction Commits            │
       │                                     │
       └─► Publish to In-Process Bus / DB ───┘
```

### 1. Upstream Mutation Flow (Client to Server)
- All user actions (e.g. `submitOrder()`, `updateKdsStatus()`, `sendChatMessage()`, `assignServiceRequest()`) are standard HTTP `POST`/`PATCH` endpoints.
- Benefits:
  - Full request-level authentication and tenant scoping.
  - Zero custom socket authorization protocol.
  - Consistent schema validation via Zod.
  - Standard HTTP status codes, error payloads, and idempotency key support.

### 2. Downstream Push Flow (Server to Client via SSE)
- Endpoint: `GET /api/v1/realtime/stream`
- Connection Handshake:
  - Authenticated via session cookie or Authorization header.
  - Scoped to `tenant_id`, `outlet_id`, and `context_id` (for customer sessions).
  - Client sends `Last-Event-ID` header upon reconnection.
- Delivery Model:
  - Stream events are JSON formatted with standard envelope:
    ```json
    {
      "id": "evt_01J8...",
      "type": "ORDER_STATUS_CHANGED",
      "tenantId": "org_123",
      "outletId": "out_456",
      "contextId": "table_7",
      "payload": { "orderId": "ord_999", "status": "READY" },
      "timestamp": "2026-09-26T14:30:00Z"
    }
    ```

### 3. Reconnect, Ordering, and Delivery Guarantees
- **At-least-once delivery**: Every domain event receives a monotonically increasing or time-sortable ULID/UUID (`event_id`).
- **Resumption**: On network blips, the browser's native `EventSource` automatically reconnects and passes `Last-Event-ID`. The server replays missed events from the database outbox or processed events log.
- **Deduplication**: Frontend state stores handle events idempotently by ignoring `event_id`s already processed.

### 4. Tenant and Outlet Isolation
- The SSE handler validates tenant context at handshake.
- The stream subscription filter strictly enforces:
  - Staff: receives events for their assigned `tenant_id` and active `outlet_id`.
  - Customer: receives events strictly matching their session's `tenant_id`, `outlet_id`, and `context_id`.
- Zero cross-tenant or cross-context event leakage is permitted.

### 5. Chat Architecture in this Model
- Customer sends message: `POST /api/v1/conversations/:id/messages` (standard HTTP).
- Server persists message, verifies participants, and publishes `MessageSent` domain event.
- Staff and customer receive message: Delivered instantaneously via their open SSE streams.
- Result: Full chat functionality with zero WebSocket infrastructure.

---

## Consequences

**Positive**:
- Runs over standard HTTP/2 (multiplexed, no custom ports or firewalls).
- Native browser reconnect handling (`EventSource`).
- Works seamlessly on Vercel serverless / Supabase infrastructure.
- Zero stateful socket cluster to deploy, monitor, or patch.
- Every mutation goes through complete server-side authorization and audit logging.

**Trade-offs & Mitigations**:
- *Limitation*: SSE is unidirectional (server to client).
  *Mitigation*: Solved completely by using HTTP POST/PATCH for all client actions, which is superior for validation, idempotency, and security.
- *Limitation*: Mobile browser background throttling.
  *Mitigation*: When mobile browser resumes from background, client triggers a lightweight reconciliation fetch (`GET /api/v1/.../summary?since=...`).

---

## Review Trigger

Revisit if concurrent active connections exceed 50,000 simultaneous streams requiring dedicated edge pub/sub infrastructure (e.g. Centrifugo or AWS IoT Core).
