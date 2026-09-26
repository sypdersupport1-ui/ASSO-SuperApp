# ASSO Row-Level Security (RLS) Architecture & Specifications

> **Version:** 1.1.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 3 — VERIFIED & AUDITED)  
> **Authority:** Aligned with `AGENTS.md` and Phase 2 Security Architecture (`ADR-005`, `SECURITY-ARCHITECTURE.md`)  

---

## 1. RLS Strategy & Defense-in-Depth Philosophy

In ASSO, multi-tenant security operates via strict defense-in-depth across two completely independent, mandatory layers:
1. **Application-Level Authorization:** Application middleware validates tenant context, user roles, module entitlements, and specific RBAC permissions before dispatching queries.
2. **Database-Level Row-Level Security (RLS):** PostgreSQL enforces row-level isolation inside the database query engine. Even if an application bug, IDOR vulnerability, or developer oversight fails to append a `WHERE tenant_id = ...` clause, the database guarantees that records belonging to other tenants are mathematically invisible and immutable.

Application authorization does **not** replace RLS, and RLS does **not** replace application authorization.

---

## 2. Canonical Tenant Context Semantics & Failure Modes

### 2.1 How `app.current_tenant_id` is Set
Every application database connection acquires a client from the connection pool and, within an isolated transaction, executes:

```sql
-- Executed inside the transaction immediately upon acquiring connection from pool
SET LOCAL app.current_tenant_id = 'c0a80123-4567-89ab-cdef-0123456789ab';
```
Using `SET LOCAL` ensures the variable is scoped strictly to the lifetime of the current transaction and is automatically cleared when the transaction commits, rolls back, or the connection is returned to the pool.

### 2.2 How `app.current_tenant_id` is Read
Policies evaluate the session variable using the canonical, type-safe PostgreSQL expression:

```sql
NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
```

### 2.3 Comprehensive Semantic & Failure Analysis (Fail-Closed)

The behavior of this expression across all possible runtime states is rigorously defined:

| Runtime State | Session Variable Value | `current_setting(..., true)` | `NULLIF(..., '')` | Cast to `::uuid` | SQL Evaluation Result | Security Outcome |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Normal Valid** | `'c0a80123-...'` (Valid UUID) | `'c0a80123-...'` | `'c0a80123-...'` | Typed `UUID` | `tenant_id = 'c0a80123-...'::uuid` | **Matches only current tenant rows** |
| **Context Missing** | Unset / not executed | `NULL` (due to `missing_ok=true`) | `NULL` | `NULL::uuid` | `tenant_id = NULL` → `UNKNOWN` (falsy) | **Fail-Closed: 0 rows read; writes error** |
| **Context Empty** | `''` (Empty string) | `''` | `NULL` | `NULL::uuid` | `tenant_id = NULL` → `UNKNOWN` (falsy) | **Fail-Closed: 0 rows read; writes error** |
| **Context Malformed**| `'not-a-uuid'` / SQL inject | `'not-a-uuid'` | `'not-a-uuid'` | **Throws `22P02` Exception** | Transaction aborts immediately | **Fail-Closed: Query blocked at parser** |
| **Foreign Tenant** | UUID of Tenant B | UUID of Tenant B | UUID of Tenant B | Typed `UUID` | Evaluates to `FALSE` for Tenant A data | **Cross-tenant access blocked** |

### 2.4 Why Absent Context Fails Closed
In PostgreSQL SQL ternary logic (`TRUE`, `FALSE`, `UNKNOWN`):
- In `USING` clauses (for `SELECT`, `UPDATE`, `DELETE`), any row where the condition evaluates to `UNKNOWN` or `FALSE` is excluded. Comparing any value to `NULL` (e.g. `tenant_id = NULL::uuid`) evaluates to `UNKNOWN`. Thus, if the context is absent or empty, **zero rows are returned, updated, or deleted**.
- In `WITH CHECK` clauses (for `INSERT`, `UPDATE`), the condition must evaluate strictly to `TRUE`. An `UNKNOWN` or `FALSE` evaluation immediately triggers PostgreSQL error code `42501 (insufficient_privilege)`.

---

## 3. RLS Request Flow Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client App (Staff / Customer)
    participant API as API Server Middleware
    participant Pool as Database Connection Pool
    participant PG as PostgreSQL Engine (RLS)

    Client->>API: HTTP Request + Bearer Token
    API->>API: Validate JWT / Session & Extract tenant_id
    API->>Pool: Acquire DB Client
    API->>PG: BEGIN;
    API->>PG: SET LOCAL app.current_tenant_id = '<tenant_id>';
    API->>PG: SELECT * FROM orders WHERE status = 'PLACED';
    Note over PG: PostgreSQL applies RLS Policy:<br/>USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    PG-->>API: Filtered Rows (Tenant Data Only)
    API->>PG: COMMIT;
    API->>Pool: Release DB Client
    API-->>Client: 200 OK + Data
```

---

## 4. Standard RLS Policy Templates

### 4.1 Tenant-Owned Operational Tables (Standard Pattern)

For tables such as `orders`, `bills`, `expenses`, `service_requests`, `catalog_items`, `inventory_items`:

```sql
-- Enable and force RLS (prevents table owner bypass in pooled application connections)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

-- 1. SELECT Policy (Strict Tenant Isolation)
CREATE POLICY orders_tenant_select ON orders
    FOR SELECT
    USING (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );

-- 2. INSERT Policy (Ensures tenant_id cannot be forged or mismatch session)
CREATE POLICY orders_tenant_insert ON orders
    FOR INSERT
    WITH CHECK (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );

-- 3. UPDATE Policy (Guarantees rows cannot be hijacked across tenants)
CREATE POLICY orders_tenant_update ON orders
    FOR UPDATE
    USING (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    )
    WITH CHECK (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );

-- 4. DELETE Policy
CREATE POLICY orders_tenant_delete ON orders
    FOR DELETE
    USING (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );
```

### 4.2 Append-Only Financial and Inventory Ledgers

For strictly immutable tables (`inventory_stock_movements`, `hotel_folio_entries`, `cash_movements`, `audit_events`, `security_events`):

```sql
ALTER TABLE inventory_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock_movements FORCE ROW LEVEL SECURITY;

-- Allow SELECT within tenant
CREATE POLICY inv_movements_tenant_select ON inventory_stock_movements
    FOR SELECT
    USING (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );

-- Allow INSERT within tenant
CREATE POLICY inv_movements_tenant_insert ON inventory_stock_movements
    FOR INSERT
    WITH CHECK (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    );

-- Strictly FORBID UPDATE & DELETE by evaluating to FALSE
CREATE POLICY inv_movements_no_update ON inventory_stock_movements
    FOR UPDATE USING (false);

CREATE POLICY inv_movements_no_delete ON inventory_stock_movements
    FOR DELETE USING (false);
```

### 4.3 Child Items Without Direct Tenant ID (Cascade Inheritance)

For normalized detail tables that reference a tenant-scoped parent (e.g., `order_item_modifiers` referencing `order_items`):

```sql
ALTER TABLE order_item_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_modifiers FORCE ROW LEVEL SECURITY;

CREATE POLICY order_item_modifiers_select ON order_item_modifiers
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM order_items oi
            WHERE oi.order_item_id = order_item_modifiers.order_item_id
              AND oi.tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        )
    );
```
*(Note: As defined in `DATABASE-SCHEMA.md`, all high-volume tables include direct `tenant_id` denormalization to maximize RLS query optimization and avoid expensive joins during RLS evaluation).*

---

## 5. Super Admin Access & Role-Based Bypass Architecture

ASSO strictly rejects using in-band session variables (such as `app.is_super_admin = true`) to bypass RLS policies on tenant-scoped tables. Relying on session variables for authorization bypass creates a critical vulnerability: any compromised endpoint or SQL injection flaw could execute `SET LOCAL app.is_super_admin = 'true'` and leak all tenants' data.

Instead, ASSO implements an exact, tamper-proof two-tier model:

### 5.1 Super Admin Tenant Inspection (Scoped Context)
When a platform Super Admin views, audits, or troubleshoots a specific tenant's operational data:
1. The Super Admin authenticates at the application gateway with verified TOTP MFA.
2. The application gateway authorizes the administrative request and acquires an ordinary pooled database client.
3. The transaction explicitly sets the target tenant's context:
   ```sql
   SET LOCAL app.current_tenant_id = '<target_tenant_uuid>';
   ```
4. The Super Admin's query executes strictly within that single tenant's boundary. Cross-tenant queries are prevented by PostgreSQL RLS because the policy only permits rows matching that specific `tenant_id`. Cross-tenant data leakage is structurally impossible.

### 5.2 System Maintenance & Migration Bypass (Separate Database Role)
For operations that genuinely require cross-tenant data access (automated migrations, nightly WAL backups, platform-wide compliance reporting):
1. **Dedicated Database Role:** Operations run under a separate administrative database user (`asso_platform_admin` or Supabase `service_role`).
2. **Native PostgreSQL `BYPASSRLS`:** This dedicated role is granted the native PostgreSQL `BYPASSRLS` attribute at the database cluster level (`ALTER ROLE asso_platform_admin BYPASSRLS;`).
3. **Application Pool Isolation:** The standard web/API application connection pool connects under `asso_app_user`, which:
   - Does **NOT** possess `BYPASSRLS`.
   - Has `FORCE ROW LEVEL SECURITY` active on all tenant-owned tables (preventing table owners from bypassing RLS).
   - Cannot grant itself `BYPASSRLS`.

---

## 6. Security Reviews & Threat Defenses

| Threat Scenario | Attack Vector | RLS Defense Mechanism |
| :--- | :--- | :--- |
| **Missing Tenant Context** | Buggy endpoint fails to execute `SET LOCAL app.current_tenant_id`. | `NULLIF(..., '')` evaluates to `NULL`. Policy evaluates `tenant_id = NULL` → `UNKNOWN`. Returns zero rows; writes fail closed. |
| **Forged Tenant ID in Payload** | Malicious actor passes `{ "tenant_id": "foreign-id" }` in JSON body. | `WITH CHECK (tenant_id = current_setting(...))` rejects the INSERT/UPDATE with PostgreSQL policy violation error `42501`. |
| **Cross-Tenant IDOR via UUID Guessing** | User submits `GET /orders/<uuid-of-other-tenant>`. | Even with direct primary key `WHERE order_id = '...'`, the RLS `USING` filter silently excludes foreign tenant rows, returning `404 Not Found`. |
| **Attempted Session Flag Bypass** | Malicious actor attempts `SET LOCAL app.is_super_admin = 'true'`. | **Ineffective.** Tenant policies contain no session bypass flags. Context remains bound strictly to `app.current_tenant_id`. |
| **SQL Injection Boundary Leak** | Attacker injects `UNION SELECT * FROM organizations`. | Standard application connection role has RLS enabled with `FORCE ROW LEVEL SECURITY`, preventing cross-tenant extraction even through secondary SQL injection vectors. |
