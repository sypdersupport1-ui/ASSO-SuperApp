# ASSO — Backend Architecture

**Phase**: 2 — Master Architecture  
**Status**: Approved for Phase 2  
**Last Updated**: 2026-09-26

---

## 1. Backend Principle

ASSO's backend is a **production-grade modular monolith**:

- One deployable application process
- Strong internal domain boundaries (engines and vertical modules are separate code domains)
- Shared data store with tenant-isolated access
- Stateless application design (horizontally scalable)
- Synchronous request handling for the primary API; asynchronous for background work

---

## 2. Application Server Architecture

```mermaid
graph TD
    subgraph "Incoming Requests"
        CU[Customer App]
        BC[Business Console]
        SA[Super Admin]
        WH[External Webhooks]
    end

    subgraph "API Layer"
        MW[Auth Middleware Stack<br/>Session → Tenant → Entitlement → RBAC → Policy]
        ROUTER[API Router<br/>Route handlers by domain]
        VAL[Input Validation<br/>Schema validation on all inputs]
    end

    subgraph "Application Layer"
        SVC[Domain Service Layer<br/>Business logic, orchestration]
        EVT[Domain Event Bus<br/>In-process pub/sub]
    end

    subgraph "Domain Modules"
        CORE[Platform Core<br/>Identity · Tenancy · RBAC · Modules · Policies · Audit]
        ENG[Shared Engines<br/>Ordering · Inventory · Billing · Payments · Expenses · ...]
        VTL[Vertical Modules<br/>Hotel · Restaurant · Cinema]
    end

    subgraph "Data Access Layer"
        REPO[Repository / Query Layer<br/>Typed queries, tenant-scoped]
        DB[(PostgreSQL)]
    end

    subgraph "Background Layer"
        BG[Job Queue<br/>pg-boss / Inngest]
        WORKERS[Job Workers<br/>Notifications · Reports · Reconciliation]
    end

    subgraph "External"
        PAY[Payment Gateways]
        EMAIL[Email]
        SMS[SMS]
        STORE[File Storage]
    end

    CU --> MW
    BC --> MW
    SA --> MW
    WH --> MW

    MW --> ROUTER
    ROUTER --> VAL
    VAL --> SVC
    SVC --> CORE
    SVC --> ENG
    SVC --> VTL
    SVC --> EVT

    CORE --> REPO
    ENG --> REPO
    VTL --> REPO
    REPO --> DB

    EVT --> BG
    BG --> WORKERS
    WORKERS --> PAY
    WORKERS --> EMAIL
    WORKERS --> SMS
    WORKERS --> STORE
```

---

## 3. Module Boundary Model

ASSO's backend is organized into three layers, each with strict boundaries:

### Layer 1: Platform Core

The foundation all other modules depend on. Never depends on domain engines or vertical modules.

```text
platform/
├── identity/       — User accounts, authentication, sessions
├── tenancy/        — Organizations, properties, outlets, business types
├── rbac/           — Roles, permissions, role assignments
├── modules/        — Module registry, entitlements, dependencies
├── policies/       — Business policy rules, approval workflow
├── audit/          — Audit event recording
├── config/         — Business and outlet-level configuration
└── notifications/  — Notification delivery orchestration
```

### Layer 2: Shared Domain Engines

Business capability engines. May depend on Platform Core. Must not depend on Vertical Modules.

```text
engines/
├── customer/       — Customer records, identification
├── qr/             — QR generation, resolution, lifecycle
├── context/        — Business context (room/table/seat abstraction)
├── session/        — Customer session lifecycle
├── catalog/        — Menu/catalog items, availability
├── ordering/       — Order lifecycle
├── fulfillment/    — Order fulfillment and KDS routing
├── service-requests/ — Service request lifecycle
├── conversations/  — Chat/conversation management
├── pos/            — Point of sale
├── billing/        — Charge accumulation, bill generation
├── payments/       — Payment processing, verification, refunds
├── inventory/      — Stock management, movement ledger
├── procurement/    — Purchase orders, goods receiving
├── expenses/       — Expense recording and approval
├── cash/           — Cash management and reconciliation
├── reporting/      — Metrics computation and report generation
└── files/          — File upload, storage, retrieval
```

### Layer 3: Vertical Modules

Industry-specific workflows. May depend on Platform Core and Shared Engines. Must not depend on other vertical modules.

```text
verticals/
├── hotel/
│   ├── rooms/          — Room types, room configuration
│   ├── stays/          — Guest stay lifecycle
│   ├── reservations/   — Hotel reservations
│   ├── front-desk/     — Front desk operations
│   ├── housekeeping/   — Housekeeping task management
│   └── folio/          — Guest folio management
├── restaurant/
│   ├── areas/          — Dining areas
│   ├── tables/         — Table management
│   ├── queue/          — Walk-in queue / waitlist
│   └── reservations/   — Table reservations
└── cinema/
    ├── screens/        — Screen configuration
    ├── seats/          — Seat layout
    └── shows/          — Show scheduling
```

### Dependency Rules

```text
Platform Core     ← Shared Engines depend on it
Shared Engines    ← Vertical Modules use them
Vertical Modules  ← Independent of each other
```

Cross-vertical dependencies do not exist. A vertical must never import code from another vertical.

---

## 4. API Design

### 4.1 API Style

REST with JSON. Resource-oriented endpoints organized by domain:

```text
/api/v1/[domain]/[resource]
```

Examples:
```text
POST   /api/v1/orders
GET    /api/v1/orders/:id
PATCH  /api/v1/orders/:id/status
POST   /api/v1/inventory/movements
GET    /api/v1/reports/sales?from=...&to=...
```

### 4.2 Customer API

Customer-facing API routes are separate and only accept customer session tokens:

```text
/api/customer/context        — Resolve session context
/api/customer/catalog        — Fetch catalog for context
/api/customer/orders         — Create and view orders
/api/customer/requests       — Create service requests
/api/customer/conversations  — Customer chat
/api/customer/bill           — View current bill
/api/customer/payments       — Submit payment
```

### 4.3 Tenant Context

Every staff API request carries tenant context, established by the middleware:

```text
Request → Auth Middleware → Attach {tenantId, outletId, userId, roles, permissions}
              ↓
Domain Handler → Uses context for all queries and mutations
```

Tenant ID is never taken from request body. It is derived from the authenticated session.

### 4.4 Versioning

- API versioning via URL path prefix: `/api/v1/`
- No breaking changes without a new version prefix
- Deprecated endpoints maintained for one version cycle with warnings
- API contracts defined in Phase 3

### 4.5 Error Model

```json
{
  "error": {
    "code": "ORDER_ITEM_UNAVAILABLE",
    "message": "Item 'Margherita Pizza' is currently unavailable",
    "field": "items[1].catalogItemId",
    "requestId": "req_abc123"
  }
}
```

Standard HTTP status codes:
- `400` — Validation error (malformed input)
- `401` — Not authenticated
- `403` — Authenticated but not authorized
- `404` — Resource not found
- `409` — Conflict (idempotency, state conflict)
- `422` — Business rule violation
- `429` — Rate limit exceeded
- `500` — Unexpected server error

### 4.6 Pagination

All list endpoints are paginated:

```text
GET /api/v1/orders?page=1&pageSize=20&sortBy=createdAt&sortOrder=desc

Response:
{
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalCount": 148,
    "totalPages": 8
  }
}
```

Cursor-based pagination considered for high-volume streams (e.g., audit logs, stock movements). Documented in Phase 3.

### 4.7 Idempotency

High-risk operations require an idempotency key:

```text
POST /api/v1/payments
Headers: Idempotency-Key: <client-generated-uuid>
```

The server stores the result of the first request. Duplicate requests with the same key return the stored result without re-executing.

Operations requiring idempotency keys: payment creation, order creation from POS, expense submission, stock movement creation, folio charge posting.

---

## 5. Middleware Stack

Every API request passes through this ordered middleware stack:

```text
1. Request Logger          — Structured log entry per request
2. Rate Limiter            — Per-IP and per-user rate limiting
3. CORS / Security Headers — Appropriate headers for each route group
4. Body Parser             — JSON parsing with size limits
5. Authentication          — Validate session token; reject 401 if invalid
6. Tenant Resolver         — Attach tenant/outlet/user context
7. Module Entitlement      — Check if the tenant has the required module
8. RBAC Check              — Check if the user has the required permission
9. Policy Evaluation       — Check if the operation meets policy conditions
10. Input Validation       — Validate request body against schema
11. Route Handler          — Domain operation executes
12. Audit Logger           — Record important operations
13. Response Formatter     — Consistent response envelope
```

Customer API routes use a lighter stack (no RBAC/policy; instead uses session scope validation).

---

## 6. Background Processing

Background jobs handle asynchronous work that must not block the HTTP response:

| Job Type | Trigger | Examples |
|---|---|---|
| Notification dispatch | Domain event | Order confirmed → notify kitchen; expense approved → notify submitter |
| Email / SMS delivery | Domain event | Guest receipt, low-stock alert, payment confirmation |
| Report generation | Scheduled / on-demand | Nightly sales summary, inventory report |
| Webhook processing | External provider | Payment gateway webhooks |
| Reconciliation | Scheduled | Cash reconciliation reminders, outstanding approvals |
| Low-stock alerts | Inventory movement | Stock falls below reorder point |
| Session expiry cleanup | Scheduled | Expire stale customer sessions |

### Job Queue Design

- Jobs are stored in the primary PostgreSQL database (using pg-boss or equivalent) — **no Redis dependency required initially**
- Jobs have retry limits with exponential backoff
- Failed jobs are recorded with error details for operator review
- Jobs are idempotent — processing the same job twice must not cause double-effects

```text
Domain Operation → Commit transaction → Enqueue job (in same transaction)
                                              ↓
                                    Job Worker picks up → Processes → Marks done
```

Enqueueing the job inside the same transaction as the domain operation prevents orphaned jobs when operations fail.

---

## 7. Webhook Handling

External webhooks (payment gateway callbacks, future integrations):

```text
POST /api/webhooks/[provider]
        ↓
1. Verify webhook signature (HMAC or provider-specific)
2. Reject if signature invalid (401)
3. Parse payload
4. Enqueue job for processing (return 200 immediately)
5. Background worker processes the webhook
```

Webhook processing is idempotent. The same webhook delivered twice must not cause duplicate effects.

---

## 8. Database Access Pattern

All database access goes through a typed repository layer:

```text
Domain Service
      ↓
Repository (typed, tenant-scoped queries)
      ↓
Database Client (e.g., Drizzle ORM or Prisma)
      ↓
PostgreSQL
```

Tenant scoping is applied at the repository level, not in application code. Every query includes `tenant_id` as a filter condition.

Row-Level Security (RLS) in PostgreSQL provides a second layer of tenant isolation. Even if application-level tenant filtering has a bug, RLS prevents cross-tenant data access.

---

## 9. Caching Strategy

Initial approach: **no external cache**. In-process caching for appropriate data:

| Data | Cache Strategy | Rationale |
|---|---|---|
| Module entitlement map per tenant | In-process LRU (TTL: 5 min) | Read on every request; changes infrequently |
| RBAC permission map per role | In-process LRU (TTL: 10 min) | Read on every request; changes rarely |
| Catalog / menu items | In-process LRU (TTL: 2 min) | Read on every customer request; changes occasionally |
| Tenant configuration | In-process LRU (TTL: 5 min) | Read frequently; changes rarely |
| Reporting aggregates | No cache initially | Generated on demand |

Cache invalidation: On mutation (permission change, catalog update, module toggle), publish a cache-bust event that clears the relevant in-process cache entry.

If horizontal scaling requires shared cache, Redis is introduced with a documented decision. See [SCALABILITY.md](./SCALABILITY.md).

---

## 10. Real-Time Considerations

Some ASSO features benefit from real-time updates:

| Feature | Mechanism | Notes |
|---|---|---|
| KDS order updates | Server-Sent Events (SSE) or WebSocket | Kitchen display must update in real-time |
| Customer order status | SSE or polling (60s) | Customer watching order progress |
| Service request assignment | SSE or polling | Staff notified of new requests |
| Chat messages | WebSocket | Bidirectional communication required |

> `OPEN DECISION` — Real-time technology selection (WebSocket vs SSE vs long-polling) to be finalized in Phase 3. SSE is preferred for read-only streams; WebSocket for bidirectional chat. The architecture must support both.

---

## 11. File Handling

Files (expense receipts, menu images, QR assets) are handled via:

```text
Client → API → Generate signed upload URL → Client uploads directly to storage → Client notifies API → API records file reference
```

This avoids routing large files through the application server.

Security:
- Signed upload URLs with short expiry
- File type validation (MIME type + extension)
- File size limits per file type
- Virus scanning on upload (to evaluate in Phase 5)
- Download URLs are pre-signed and tenant-scoped

---

## 12. Health Checks

The application exposes standard health endpoints:

```text
GET /api/health      — Application is running
GET /api/ready       — Application and database are ready to serve traffic
GET /api/version     — Build version and deployment identifier
```

Used by deployment infrastructure (Vercel, load balancers) for routing and restart decisions.
