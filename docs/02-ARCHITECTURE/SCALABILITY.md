# ASSO — Scalability Architecture

**Phase**: 2 — Master Architecture  
**Status**: Approved for Phase 2  
**Last Updated**: 2026-09-26

---

## 1. Scalability Principle

```text
Scalability = Clear Architecture + Correct Data Design + Clear Boundaries + Measured Infrastructure
```

ASSO is not designed to handle millions of simultaneous users on day one. It is designed so that the path to scaling is clear and does not require architectural redesign.

The modular monolith architecture provides:
- **Good boundaries**: Extraction to services is possible if justified
- **Stateless application design**: Horizontal scaling is viable from the start
- **Correct data design**: Indexed, normalized, ledger-oriented
- **Incremental infrastructure**: Add infrastructure when measured requirements justify it

---

## 2. Stateless Application Design

The API server is stateless:
- No per-request server-side state stored in application memory (except in-process cache)
- Sessions are stored in the database (not in-process)
- Background jobs are stored in the database queue
- File storage uses external object storage

This means multiple application instances can run behind a load balancer without sticky sessions:

```text
Load Balancer
    ↓
Application Instance 1
Application Instance 2  → PostgreSQL (shared)
Application Instance 3
```

Scaling the application tier is achieved by deploying additional instances.

---

## 3. Database Scalability Path

### Phase 1: Single Primary Instance

Current design. Suitable for the initial deployment with a few hundred tenants and moderate transaction volumes.

```text
Application → Primary PostgreSQL
```

### Phase 2: Connection Pooling

PostgreSQL has a limited number of concurrent connections. As the application scales horizontally:

- Use **PgBouncer** (built into Supabase) or equivalent connection pooler
- Application connects to the pooler, not directly to PostgreSQL
- Reduces connection overhead significantly

### Phase 3: Read Replicas

When reporting queries and analytics read queries start impacting write performance:

```text
Application (writes) → Primary PostgreSQL
Application (reads)  → Read Replica
Background Workers   → Read Replica (for report generation)
```

Implemented at the repository layer — read operations route to the replica, write operations to the primary.

### Phase 4: Table Partitioning

For high-volume append-only tables (`stock_movements`, `audit_events`, `order_status_history`):
- Partition by `created_at` (monthly or quarterly ranges)
- Old partitions can be archived or moved to cold storage
- Query performance for recent data remains fast

### Phase 5: Analytical Separation

When reporting queries become too expensive even with replicas:
- Introduce a lightweight analytical store (e.g., materialized views or a small analytical database)
- Replicate relevant aggregates asynchronously
- Operational database remains the source of truth

This is a **future concern**, not a current one.

---

## 4. Indexing Strategy

Indexes are designed around the most frequent query patterns. Primary patterns:

| Table | Common Query Filters | Required Indexes |
|---|---|---|
| `orders` | `tenant_id + outlet_id + status + created_at` | Composite index |
| `stock_movements` | `tenant_id + item_id + location_id + created_at` | Composite index |
| `audit_events` | `tenant_id + event_type + created_at` | Composite index |
| `service_requests` | `tenant_id + outlet_id + status + assigned_to` | Composite index |
| `customer_sessions` | `token` (lookup), `context_id + status` | Both |
| `qr_codes` | `token` (lookup) | Unique index |
| `folio_entries` | `folio_id + created_at` | Composite index |
| `expenses` | `tenant_id + outlet_id + status + date` | Composite index |

> Exact index definitions belong to Phase 3 (database schema design).

---

## 5. Caching Strategy

### In-Process Cache (Current)

Data that is read frequently but changes rarely is cached in-process with a short TTL:

| Data | TTL | Invalidation Trigger |
|---|---|---|
| Module entitlements per outlet | 5 minutes | Module enabled/disabled |
| RBAC permission map per role | 10 minutes | Role permissions updated |
| Catalog items per outlet | 2 minutes | Catalog item updated |
| Tenant configuration | 5 minutes | Configuration changed |
| Business type per outlet | 10 minutes | Outlet configuration changed |

In-process caching is per-application-instance. In a single-instance deployment, this works perfectly. In a multi-instance deployment, each instance has its own cache, leading to brief inconsistency (up to the TTL). For the data types above, this is acceptable.

### Distributed Cache (When Justified)

If a specific cache invalidation inconsistency becomes an operational problem with multiple instances, Redis is introduced for that specific data type. The requirement must be documented before Redis is added.

Not introduced speculatively.

---

## 6. Background Processing Scalability

The background job queue (pg-boss or equivalent) scales as follows:

### Initial: Jobs processed by the primary application process

Works for low-to-medium job volumes. Simple to operate.

### When job processing becomes a bottleneck:

- Separate worker processes that connect to the same database queue
- Workers can be scaled independently from the API server
- No separate infrastructure required (workers are the same application code, launched in worker mode)

```text
API Servers (handle HTTP requests)
     ↓ (enqueue jobs)
Job Queue (PostgreSQL)
     ↑ (dequeue jobs)
Worker Processes (process background jobs)
```

---

## 7. File Storage Scalability

Files (expense receipts, catalog images, QR assets) are stored in object storage from day one:
- Supabase Storage / S3-compatible
- Unlimited capacity
- CDN delivery for public assets (catalog images)
- Scales independently from the application and database

---

## 8. Real-Time Communication Scalability

### Server-Sent Events (SSE) for order status, KDS

SSE maintains an open HTTP connection per client. On a single-instance deployment, the server holds all connections in memory. This is acceptable for small-to-medium tenants.

When scaling to multiple instances:
- SSE connections from a specific client land on a specific server instance (needs sticky sessions at load balancer level, or)
- Use a shared pub/sub channel (database LISTEN/NOTIFY or Redis pub/sub) to broadcast events to all instances

> `OPEN DECISION` — Real-time scaling strategy for multi-instance deployment. This becomes relevant only when horizontal scaling is required.

### WebSocket for Chat

Same challenge as SSE. The same solutions apply.

---

## 9. Per-Tenant Scalability

Some tenants may be significantly larger than others (a hotel chain with many properties vs a single-outlet restaurant):

- All queries are already indexed by `tenant_id` — large tenants do not degrade queries for small tenants
- Report generation for large tenants can be offloaded to the background job queue
- There is no single-tenant deployment model currently — all tenants share infrastructure

If a specific enterprise tenant requires dedicated infrastructure, this would be a separate business and architectural decision outside current scope.

---

## 10. Identified Bottlenecks and Escape Paths

| Bottleneck | When It Appears | Escape Path |
|---|---|---|
| Database connection limits | >50 concurrent app instances | PgBouncer connection pooling |
| Reporting query slowness | Large transaction volumes | Read replicas + query optimization |
| Large append-only tables | >10M rows per table | Table partitioning |
| Notification delivery lag | High event volumes | Dedicated notification worker pool |
| KDS/real-time update lag | High concurrent connections | Shared pub/sub (database NOTIFY or Redis) |
| Inventory query slowness | Large product catalogs | Specific index optimization |
| Background job queue saturation | High job volumes | Separate worker process pool |

None of these bottlenecks are expected in the early phases of ASSO. They are documented so that when they appear (with measurement), the path forward is clear and does not require architectural redesign.

---

## 11. What Scalability Does NOT Require

The following are not required for ASSO to scale to a significant tenant base:

| Not Required | Reason |
|---|---|
| Microservices | Strong internal boundaries + stateless design provide sufficient flexibility |
| Kubernetes | Vercel (or equivalent) handles horizontal scaling without K8s |
| Kafka / RabbitMQ | In-process events + pg-boss job queue handles ASSO's event volumes |
| ElasticSearch | PostgreSQL full-text search is sufficient for operational search needs |
| Multiple databases | Single PostgreSQL instance with read replicas is sufficient |
| CDN for API | Application is stateless; CDN is used for static assets only |
| Redis | In-process caching handles ASSO's cache requirements initially |

These may be revisited with documented evidence as ASSO grows.

---

## 12. Durable, Horizontally Scalable Idempotency (Scale Foundation S2)

### 12.1 Defect in Process-Local Memory
The initial local development prototype used an in-memory Node.js `Map<string, IdempotencyRecord>` within `src/lib/api/idempotency.ts`. In horizontally scaled production environments (such as Vercel serverless functions or multiple Node container instances), separate processes maintain disjoint memory spaces. Two concurrent requests with the identical idempotency key arriving at separate instances could both proceed, resulting in double-processing, duplicate orders, and inconsistent financial transactions.

### 12.2 Durable PostgreSQL Storage Design
To resolve this defect without introducing external operational dependencies prematurely, idempotency persistence is backed by PostgreSQL via the `idempotency_keys` table:

```sql
CREATE TABLE "idempotency_keys" (
  "key_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid REFERENCES organizations(organization_id),
  "operation" varchar(100) DEFAULT 'DEFAULT' NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "status" varchar(20) DEFAULT 'IN_PROGRESS' NOT NULL,
  "response_code" integer,
  "response_body" jsonb,
  "response_headers" jsonb,
  "resource_id" varchar(128),
  "locked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_expires_at" timestamp with time zone DEFAULT (now() + interval '120 seconds') NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
```

### 12.3 Concurrency & Safe Ownership Model (S2 Correction)
Concurrency control relies on database-level uniqueness across `(COALESCE(tenant_id, NULL_SENTINEL), operation, idempotency_key)`:

1. **Initial Acquisition**: An atomic `INSERT ... ON CONFLICT DO NOTHING RETURNING *` attempts to insert the key with `status = 'IN_PROGRESS'` and a processing lease (`lease_expires_at = now() + 120s`).
2. **Conflict Resolution**: If the insert returns 0 rows, the instance queries the authoritative existing record:
   - **Mismatched Request Hash**: Rejects immediately with HTTP 409 `IdempotencyConflictError` ("Idempotency key reused with mismatched request parameters"). Authoritative hash is immutable.
   - **Completed Mutation**: Returns cached response code, body, and headers without re-executing domain transactions.
   - **Active In-Flight Ownership**: If `status == 'IN_PROGRESS'`, returns in-flight status. The generic store **never** permits time-based lease expiration alone to replace an active owner, because a business transaction taking longer than the lease duration may still be executing. Replacing an active owner on time alone would cause double processing. Incoming retries while in-flight receive HTTP 409 Conflict.
   - **Failed / Confirmed Crash Recovery**: Only records with `status == 'FAILED'` or records past their authoritative retention TTL (`expires_at <= now()`) are eligible for atomic re-acquisition via conditional update:
     ```sql
     UPDATE idempotency_keys
     SET status = 'IN_PROGRESS', locked_at = now(), lease_expires_at = now() + interval '120 seconds', updated_at = now()
     WHERE key_id = $id AND (status = 'FAILED' OR expires_at <= now())
     RETURNING *;
     ```
     Only one retry instance can win this update; the other receives an in-flight conflict.

### 12.4 Response Replay & Decimal Integrity
For completed idempotent requests, `response_code`, `response_body`, and `response_headers` are retrieved. Replay returns identical resource identifiers and exact financial values (GST tax, platform fees, subtotals, totals) without recalculation or redundant side-effects.

### 12.5 Request Hash Normalization
Hashing uses `canonicalizeJson()` which recursively sorts all object keys alphabetically prior to SHA-256 computation (`METHOD:PATH:CANONICAL_BODY`). Unstable JSON serialization or property ordering differences between clients produce identical hashes.

### 12.6 Multi-Tenant & Platform Security Model (RLS Architecture)
Every idempotency record is partitioned by `tenant_id` at both the database unique index level and PostgreSQL Row Level Security (RLS).
- **Tenant-Scoped Sessions**: Ordinary tenant sessions authenticate with `SET LOCAL ROLE authenticated` and `SET LOCAL app.current_tenant_id = '...'`. RLS strictly restricts SELECT, INSERT, UPDATE, and DELETE to rows where `tenant_id IS NOT NULL AND tenant_id = app.current_tenant_id`.
- **Platform-Wide / System Records (`tenant_id IS NULL`)**: System records are **never** accessible to ordinary tenant sessions. They are strictly gated behind `(tenant_id IS NULL AND current_user NOT IN ('authenticated', 'anon') AND asso_is_platform_context())` (Migration 0016).
- **Authoritative Trust Architecture**:
  1. **Primary Trust Anchor (Cryptographic Secret Authentication)**: Access to platform rows requires an authoritative 256-bit platform authentication token (`app.platform_context_token`) matching `asso_private.platform_secret`, stored in a private database schema with `REVOKE ALL FROM PUBLIC, authenticated, anon`. Ordinary tenant sessions cannot read or discover this secret (`permission denied for schema asso_private`).
  2. **Tenant Session Disqualification**: `asso_is_platform_context()` strictly requires that `app.current_tenant_id` is empty/absent. Any request with active tenant scope is immediately disqualified.
  3. **Invoker Role Exclusion at RLS Level**: Inside a `SECURITY DEFINER` function, PostgreSQL semantics switch `current_user` to the function owner (`postgres`). Therefore, caller role exclusion (`current_user NOT IN ('authenticated', 'anon')`) is authoritatively enforced directly at the RLS policy evaluation level outside the function, where `current_user` reflects the invoker's active session role (`authenticated`).
  4. **Trusted Server-Side Execution**: Platform operations execute via `withPlatformScope()` in `src/db/rls.ts`, which injects the token exclusively from trusted server configuration (`process.env.PLATFORM_CONTEXT_SECRET`). The token is never accepted from browser input or client payloads, never logged, and never exposed in responses.
- **Security Invariants**: An ordinary tenant cannot discover whether a platform key exists, read its response body, update it, delete it, or cause a cross-tenant replay. Direct manipulation of session GUCs (`set_config('app.is_platform_context', ...)`, token guessing, or clearing tenant context) is strictly blocked by PostgreSQL RLS and schema privilege enforcement.

### 12.7 Exactly-Once vs At-Least-Once Guarantees & Atomic Transaction Coupling
- **What Generic HTTP Idempotency Guarantees**: Prevents concurrent duplicate processing across API workers, safely caches and replays deterministic responses for identical requests, and prevents hash mismatches.
- **Why Lease Expiry Alone is Not Proof of Failure**: Network latency, database connection waits, or downstream API calls can cause an operation to exceed its nominal lease duration. If the worker is still alive and commits its transaction, reclaiming the key purely based on time would execute the operation a second time. Therefore, time expiration alone is not treated as failure.
- **Atomic Transaction Coupling (`runIdempotentTransaction`)**: When business operations can run in the same PostgreSQL transaction, the idempotency completion (`UPDATE idempotency_keys SET status = 'COMPLETED'`) is committed atomically with the domain state mutation.
- **Domain-Level Uniqueness Defense**: For multi-step or distributed workflows where HTTP idempotency cannot be atomically coupled in a single transaction, the authoritative business layer (e.g. `orders.idempotency_key` unique constraint in Restaurant R3.2) provides the ultimate source of truth, ensuring zero duplicate authoritative records.

### 12.8 Expiration & Bounded Cleanup
Idempotency records maintain an `expires_at` timestamp (default: 24 hours, configured via `IDEMPOTENCY_EXPIRATION_HOURS`). Cleanup operates via bounded batch deletion:
```sql
WITH expired AS (
  SELECT key_id FROM idempotency_keys WHERE expires_at < NOW() LIMIT $limit
)
DELETE FROM idempotency_keys WHERE key_id IN (SELECT key_id FROM expired);
```
Expired records past their retention window are also eligible for atomic in-place re-acquisition upon new incoming claims.

### 12.9 Storage Abstraction & Future Redis Migration
All idempotency operations are mediated through the `IdempotencyStore` interface (`claim`, `get`, `complete`, `fail`, `cleanup`). The application and domain logic are completely decoupled from PostgreSQL:
- **Current State**: `PostgresIdempotencyStore` provides ACID durability and zero additional infrastructure.
- **Future Redis Trigger**: If API mutation load exceeds 5,000 req/sec sustained hot-path write IOPS on PostgreSQL, a `RedisIdempotencyStore` can be dropped in behind the `IdempotencyStore` interface using atomic Redis transactions (`SET NX PX` or Lua scripts).

---

## 13. Edge/API Rate Limiting & Abuse Protection (Scale Foundation S3)

### 13.1 Edge-First Architecture & Tiered Defense
ASSO enforces a strictly tiered defense architecture designed to protect application instances, connection pools, and PostgreSQL from distributed traffic spikes and abusive denial-of-service floods:

```text
Internet Client
     ↓
[TIER 1: CDN / Next.js Edge Middleware] (src/middleware.ts)
     │ • Coarse IP ceilings & public flood protection
     │ • Distributed Edge Limiter (Upstash Redis REST via atomic pipeline)
     │ • Rejection: HTTP 429 directly at edge (Zero Node API route execution, Zero DB connections)
     ↓
[TIER 2: ASSO API Route Handlers]
     │ • In-memory stateless JWT signature & claims verification
     │ • Granular Distributed Rate Limiting (assertRateLimit: Tenant + User + Operation quotas)
     │ • Evaluated BEFORE database queries, catalog lookups, or idempotency locks
     ↓
[TIER 3: Durable Idempotency & Domain Engines]
     │ • Idempotency lease acquisition & replay protection (PostgresIdempotencyStore)
     │ • Domain rule validation (business context, active stay, catalog availability)
     ↓
[TIER 4: PostgreSQL Transaction & Native RLS]
     │ • ACID business transaction, append-only ledgers, KDS task creation, outbox events
```

### 13.2 Distributed Storage Engine & Provider Hierarchy
The system decouples edge middleware, route handlers, and domain logic from the underlying storage mechanism via the vendor-neutral `RateLimiter` interface:
```typescript
export interface RateLimiter {
  check(key: string, policy: RateLimitPolicy): Promise<RateLimitResult>;
  reset?(key: string): Promise<void>;
  cleanupExpired?(limit?: number): Promise<number>;
}
```

#### Provider Hierarchy:
1. **`UpstashRedisRateLimiter` (Primary Production & Edge Provider)**:
   - Primary abuse shield for all public, customer, and internet-facing endpoints.
   - Built on pure Web `fetch` using Upstash Redis REST API (`/pipeline`).
   - Executes atomic pipeline commands in a single network roundtrip:
     ```json
     [
       ["INCR", "ratelimit:<cat>:<key>"],
       ["EXPIRE", "ratelimit:<cat>:<key>", "<windowSeconds>", "NX"],
       ["TTL", "ratelimit:<cat>:<key>"]
     ]
     ```
   - Operates entirely outside process-local memory and outside PostgreSQL, enabling horizontal consistency across unbounded Vercel serverless containers and edge regions.
2. **`PostgresRateLimiter` (Secondary / Internal Fallback & Test Provider)**:
   - **NOT** the primary public edge rate limiter.
   - Reserved strictly for:
     a) Offline unit and integration test environments where cloud credentials are not provisioned (`RATE_LIMITER_PROVIDER="postgres"`).
     b) Private internal server-side workloads where connection pooling is already bounded.
   - **Outage Invariant**: During an external Redis provider outage, public high-risk endpoints do **NOT** fail over to PostgreSQL. A live failover under DDoS would trigger a catastrophic database write storm, defeating database protection. Critical endpoints fail-closed cleanly at the edge layer.

### 13.3 Responsibilities by Layer
- **EDGE (Middleware)**: Coarse IP-based global ceilings, unauthenticated route flood protection, rapid HTTP 429 rejection before Next.js server code is loaded.
- **API (Route Handlers)**: Fine-grained tenant/user quotas, operation-specific limits, business-context limits (e.g. per-table QR token).
- **DATABASE (PostgreSQL)**: Authoritative business authorization, transaction correctness, Row-Level Security, append-only financial ledgers.

### 13.4 Layered Keying Model & Token Rotation Resistance
To prevent attackers from bypassing IP ceilings by rotating QR tokens, session IDs, or endpoints, ASSO employs a **two-tier layered keying model**:

1. **Layer 1: Coarse Edge / Global IP Ceiling (`ipKey`)**:
   - Format: `ip:<client_ip>:cat:<category>`
   - Evaluated first. An attacker generating 1,000 distinct QR tokens from the same IP will exhaust the IP ceiling on request N, halting further requests immediately.
2. **Layer 2: Target / Context / Tenant Quota (`primaryKey`)**:
   - Format: `customer:ctx:<hash(token)>` or `fin:t:<tenantId>:u:<hash(userId)>:op:<op>`
   - Protects a specific table, room, or victim account from being overwhelmed even if an attacker distributes requests across a proxy botnet.
3. **Zero-Knowledge Key Pseudonymization**:
   - All secret tokens, customer phone numbers, emails, and internal user UUIDs are hashed with SHA-256 (`hashIdentifier(...)`) before key construction. Raw PII or secrets are never transmitted to Redis or written to logs.

### 13.5 Endpoint Categories & Conservative Policies

| Category | Endpoints Protected | Limit / Window | Edge IP Ceiling | Fail-Safe Behavior | Primary Key Strategy |
|---|---|---|---|---|---|
| **`AUTH`** | Login, demo-token, session creation | 10 req / 60s | 20 req / 60s | **Fail-Closed** | `auth:<op>:target:<hash(id)>` |
| **`CUSTOMER_PUBLIC`** | QR resolution, menu view, customer identify | 60 req / 10s | 100 req / 10s | **Fail-Open** | `customer:ctx:<hash(token)>` |
| **`FINANCIAL_MUTATION`**| Order creation, folio payments, refunds | 30 req / 10s | 40 req / 10s | **Fail-Closed** | `fin:t:<tenant>:u:<hash(id)>:op:<op>` |
| **`ADMIN`** | Configuration, staff/table management | 120 req / 60s | 200 req / 60s | **Fail-Open** | `admin:t:<tenant>:u:<hash(id)>` |
| **`WEBHOOK`** | Inbound payment callbacks, external webhooks | 120 req / 60s | 200 req / 60s | **Fail-Closed** | `webhook:provider:<prov>` |
| **`GENERAL`** | Standard platform API read/write operations | 60 req / 60s | 120 req / 60s | **Fail-Open** | `gen:t:<tenant>:u:<hash(id)>` |

### 13.6 Fail-Safe vs. Fail-Closed Decisions
- **Critical Fail-Closed Categories (`AUTH`, `FINANCIAL_MUTATION`, `WEBHOOK`)**:
  If the distributed rate-limit provider becomes unavailable, these endpoints reject with HTTP 429 (`retryAfterSeconds: 5`) and log a critical alert. This prevents brute-force credential attacks, payment flooding, and database overload without causing a database write storm.
- **Non-Critical Fail-Open Categories (`CUSTOMER_PUBLIC`, `ADMIN`, `GENERAL`)**:
  Low-risk read operations proceed with structured warnings, preventing full service outage for restaurant guests reading menus.

### 13.7 HTTP 429 Semantics & Observability Preparation
When a rate limit threshold is exceeded:
- **Status Code**: `429 Too Many Requests`.
- **Response Headers**:
  - `Retry-After`: Exact integer seconds remaining until window expiration.
  - `X-RateLimit-Limit`: Maximum requests permitted in window.
  - `X-RateLimit-Remaining`: `0`.
  - `X-RateLimit-Reset`: UTC epoch timestamp in seconds.
- **Response Body**: Standard ASSO error envelope with code `RATE_LIMIT_EXCEEDED` without revealing internal quota details or cross-tenant activity.
- **Structured Telemetry**: Every decision emits structured logs (`logger.warn` or `logger.error`) capturing `category`, `allowed`, `keyClass`, `limit`, `remaining`, `retryAfterSeconds`, and `requestId`.

### 13.8 Interaction with Durable Idempotency & Order Domain
When customer order creation (`POST /api/v1/restaurant/orders`) is rate limited:
1. Rate limit is evaluated **before** `checkOrAcquireIdempotencyKey`.
2. No idempotency row is inserted or claimed.
3. No order record is created in `orders`.
4. No KDS ticket is created in `kds_tickets`.
5. No financial ledger snapshot or taxes are computed.
6. No transactional outbox event is emitted.
7. Once the rate-limit window resets, the customer retries with the **same** `Idempotency-Key` and the order processes cleanly and duplicate-safely.

### 13.9 Webhook Multi-Layer Defense
Inbound external webhooks implement four strict verification layers (`protectAndVerifyWebhook`):
1. **Layer 1 (Rate Limiting)**: Gated behind distributed `WEBHOOK` policy before reading large payloads.
2. **Layer 2 (Timestamp Tolerance)**: Reject requests with timestamp drift exceeding 300 seconds to prevent clock-skew replays.
3. **Layer 3 (Cryptographic HMAC Verification)**: Constant-time `crypto.timingSafeEqual` SHA-256 signature verification.
4. **Layer 4 (Durable Idempotency Replay Protection)**: Webhook event IDs are recorded in `idempotency_keys` with a 48-hour retention window. Duplicate deliveries return cached processing status or 409 conflict.

