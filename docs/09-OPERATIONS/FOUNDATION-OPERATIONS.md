# ASSO Platform — Foundation Operations & Architecture Verification

> **Phase**: 5 — Foundation Implementation & Operations  
> **Status**: OPERATIONAL VERIFIED ON LOCALHOST  

---

## 1. Multi-Tenant Row-Level Security (RLS) Operations

ASSO enforces tenant isolation at the database layer via PostgreSQL transactions:
* Every operational query executes inside a transaction initiated with:
  ```sql
  SET LOCAL app.current_tenant_id = '<tenant_uuid>';
  ```
* Because `SET LOCAL` is used, the session variable is automatically cleared when the transaction commits or rolls back, preventing cross-request pollution across pooled database connections.
* If `app.current_tenant_id` is missing or empty, queries evaluate to `NULL` (falsy) in SQL ternary logic, resulting in 0 rows read and an immediate `42501 (insufficient_privilege)` on writes.
* If a malformed UUID is injected, PostgreSQL aborts the transaction immediately with code `22P02`.

---

## 2. Five-Layer Server-Side Authorization Pipeline

Every request arriving at `/api/v1/*` must pass 5 independent server-side evaluation gates:

$$\text{HTTP Request} \longrightarrow \text{1. Auth} \longrightarrow \text{2. Tenant Context} \longrightarrow \text{3. Module Entitlement} \longrightarrow \text{4. RBAC} \longrightarrow \text{5. Policy} \longrightarrow \text{Operation}$$

1. **Authentication Gate**: Validates JWT signature and expiration.
2. **Tenant Context Gate**: Validates organization UUID and sets transaction RLS context.
3. **Module Entitlement Gate**: Verifies tenant has purchased the commercial module (e.g. `INVENTORY`, `POS`). Fails with `403 MODULE_NOT_ENTITLED`.
4. **RBAC Gate**: Evaluates user's role and granular permissions (e.g. `orders.create`, `inventory.adjust`). Fails with `403 PERMISSION_DENIED`.
5. **Policy Gate**: Evaluates transaction parameters (monetary limits). Requires manager approval if threshold is breached.

---

## 3. Idempotency Framework Operations

For all state-mutating requests (`POST`, `PUT`, `DELETE`), clients supply the `Idempotency-Key` header:
* An in-flight lock is acquired with SHA-256 hash of `(method + path + body)`.
* If a duplicate request with the identical hash arrives, the server returns the cached response code and payload with `X-Idempotent-Replay: true`.
* If a request arrives with the same key but different body parameters, the server halts and returns `409 IDEMPOTENCY_CONFLICT`.

---

## 4. Realtime SSE Hub Operations

* Realtime updates stream over HTTP using Server-Sent Events (`/api/v1/realtime`).
* Streams maintain a 15-second heartbeat (`: ping\n\n`) to prevent connection timeouts across firewalls and proxies.
* Initial connection delivers a `system.connected` event with assigned client ID and tenant context.
* Clean disconnects are handled automatically via request abort signals.

---

## 5. Deployment Lifecycle

```text
Feature Branch
    ↓
Automated CI (Lint + Typecheck + 32 Tests + Build)
    ↓
Preview Deployment (Isolated Dev DB)
    ↓
PR Review & Merge to `develop`
    ↓
Staging Deployment (Pre-Production Validation)
    ↓
Human Product Owner Approval Gate
    ↓
Production Deployment (Zero Automatic Migrations)
```

## 6. Runtime Database vs. Test Database Distinction

To ensure complete architectural clarity:
* **Runtime Database**: Target PostgreSQL (Supabase / Managed PostgreSQL) configured via `DATABASE_URL`. In local environments without a live PostgreSQL daemon on port 5432, the database probe accurately reports `status: "disconnected"`, and `/api/v1/health` reports platform status as `"degraded"`.
* **Test Database**: `pg-mem` (PostgreSQL in-memory engine) used exclusively in automated Vitest unit and security tests to verify Drizzle schemas, RLS policies, and tenant isolation in CI/local runs without requiring external daemon infrastructure.
* **No Synthetic Readiness**: The foundation dashboard does not disguise a disconnected PostgreSQL connection as "ready". It transparently shows `DISCONNECTED` with diagnostics.

