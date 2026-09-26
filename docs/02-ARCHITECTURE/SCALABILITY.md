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
