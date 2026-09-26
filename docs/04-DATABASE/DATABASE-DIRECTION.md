# ASSO — Database Architecture Direction

**Phase**: 2 — Master Architecture  
**Status**: Approved for Phase 2  
**Last Updated**: 2026-09-26

> This document defines the database architecture direction for Phase 2. The detailed canonical database schema (tables, columns, constraints, indexes, migrations) is the deliverable of **Phase 3**.

---

## 1. Database Direction

**Primary database**: PostgreSQL via Supabase (evaluated direction — see ADR-002)  
**Approach**: Shared schema with Row-Level Security (RLS) — see ADR-006  
**Schema changes**: Migration files only (never manual changes)

---

## 2. Multi-Tenancy in the Database

Every tenant-scoped table carries a `tenant_id` column:

```sql
-- Common pattern for all tenant-scoped tables
CREATE TABLE orders (
  order_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES organizations(organization_id),
  outlet_id     UUID NOT NULL REFERENCES outlets(outlet_id),
  -- ... other columns ...
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite index: tenant_id always the leading key
CREATE INDEX idx_orders_tenant_outlet ON orders (tenant_id, outlet_id, created_at DESC);

-- RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

---

## 3. Major Table Groupings

### 3.1 Platform Core

```text
organizations           — Tenant root (organization_id is the primary tenant key)
properties              — Physical business locations (property_id, organization_id)
outlets                 — Operating units (outlet_id, property_id, organization_id, business_type)
users                   — Staff and admin user accounts
auth_sessions           — Active staff sessions
staff_profiles          — Staff profiles linked to users
staff_outlet_assignments— Staff → outlet assignment
roles                   — Role definitions (platform templates + tenant custom)
permissions             — Permission constants
role_permissions        — Role → permission mapping
staff_role_assignments  — Staff → role → outlet mapping
modules                 — Module registry
module_dependencies     — Module dependency graph
plans                   — Subscription plans
plan_modules            — Plan → module mapping
tenant_entitlements     — Which modules are enabled per outlet
policies                — Business policy rules
approval_requests       — Pending approvals
configurations          — Tenant/outlet-level settings
audit_events            — Immutable audit log
notifications           — Notification records
```

### 3.2 Customer & Context

```text
customers               — Customer/guest records
business_contexts       — Abstracted context (context_id, context_type, outlet_id, status)
hotel_rooms             — Hotel room extension (room_id = context_id, room_type, floor, ...)
restaurant_tables       — Restaurant table extension (table_id = context_id, area_id, capacity, ...)
cinema_seats            — Cinema seat extension (seat_id = context_id, screen_id, row, seat_number, ...)
qr_codes                — QR token → context mapping
customer_sessions       — Active customer sessions
```

### 3.3 Operations

```text
catalog_categories      — Catalog item categories
catalog_items           — Menu / catalog items
catalog_availability    — Availability rules (time-based, context-based)
orders                  — Order lifecycle
order_items             — Order line items
order_status_history    — Immutable order state transitions
fulfillment_tasks       — Fulfillment routing and state
service_requests        — Service request lifecycle
service_request_categories — Configurable request categories
service_request_history — State history
conversations           — Chat conversations
conversation_messages   — Individual messages
```

### 3.4 Commerce

```text
pos_sessions            — POS working sessions
pos_transactions        — POS transaction records
bills                   — Table/context bill accumulation
bill_items              — Bill line items (immutable after posting)
guest_folios            — Hotel guest folio
folio_entries           — Folio line items (immutable after posting)
payment_transactions    — All payment records (immutable)
refund_transactions     — All refund records (immutable)
payment_idempotency     — Idempotency key registry for payments
```

### 3.5 Inventory & Procurement

```text
inventory_categories    — Configurable item categories
inventory_items         — Item master
inventory_locations     — Storage locations
stock_movements         — Immutable stock movement ledger
suppliers               — Supplier master
purchase_orders         — PO lifecycle
purchase_order_items    — PO line items
goods_receipts          — Goods receiving records
goods_receipt_items     — Receipt line items
```

### 3.6 Finance Operations

```text
expense_categories      — Standard + custom categories
expenses                — Expense records
expense_attachments     — Expense receipt references
cash_sessions           — Daily cash sessions
cash_transactions       — Cash inflow/outflow records (immutable)
```

### 3.7 Hotel Vertical

```text
room_types              — Room type configuration
reservations            — Hotel reservations
guest_stays             — Active stay records
housekeeping_tasks      — Housekeeping work items
housekeeping_history    — Task status history
```

### 3.8 Restaurant Vertical

```text
dining_areas            — Dining area configuration
queue_entries           — Walk-in queue records
table_reservations      — Table booking records
```

### 3.9 Cinema Vertical

```text
cinema_screens          — Screen configuration
cinema_shows            — Show scheduling
```

### 3.10 Platform Services

```text
files                   — File metadata
background_jobs         — Job queue (managed by pg-boss)
processed_events        — Idempotency registry for domain events
report_definitions      — Report templates
report_executions       — Generated report instances
```

---

## 4. Indexing Direction

All tenant-scoped tables will have:
- `(tenant_id, [relevant_columns])` as the primary query pattern
- Foreign key columns indexed
- Status columns indexed where used in frequent filters
- Created_at indexed for time-range queries
- Idempotency keys with unique constraints

Specific indexes are defined in Phase 3 (migration files).

---

## 5. Historical Tables (Append-Only)

The following tables are **append-only** — no UPDATE or DELETE after creation:

- `order_status_history`
- `folio_entries`
- `bill_items`
- `payment_transactions`
- `refund_transactions`
- `cash_transactions`
- `stock_movements`
- `audit_events`
- `goods_receipts`
- `approval_decisions`

These may be enforced via:
1. Application-layer convention (code review)
2. PostgreSQL triggers that reject UPDATE/DELETE (for highest-risk tables)
3. A separate database role for the application that only has INSERT on these tables

---

## 6. Soft Delete Strategy

Entities that must not be hard-deleted use:
- `is_active BOOLEAN DEFAULT TRUE` — soft-delete flag
- `deleted_at TIMESTAMPTZ` — timestamp of soft-deletion
- `deleted_by UUID` — actor who deleted

Queries filter by `is_active = TRUE` by default. Reporting and admin views may include soft-deleted records.

---

## 7. Transactional Boundaries

Key operations that must complete in a single database transaction:

| Operation | Tables Involved |
|---|---|
| Guest check-in | guest_stays + guest_folios + rooms (status) + customer_sessions + qr_codes |
| Guest check-out | guest_stays (close) + guest_folios (settle) + folio_entries (payment) + customer_sessions (invalidate) + rooms (status) |
| Order creation | orders + order_items + background_jobs |
| Payment completion | payment_transactions + folio_entries (or bill_items) + cash_transactions (if cash) |
| Stock transfer | stock_movements (two entries) |
| Goods receipt | goods_receipts + goods_receipt_items + stock_movements + background_jobs |

---

## 8. Migration Philosophy

- All schema changes via versioned migration files (e.g., using Drizzle Migrate, Prisma Migrate, or Flyway)
- No manual schema changes on any environment
- Migrations are reviewed in PRs before deployment
- Migrations are tested in local/preview before applying to staging/production
- Migrations are designed to be backward-compatible where possible (column additions before removals)

---

## 9. Connection Management

- Application connects via PgBouncer (Supabase connection pooler) in transaction mode
- `SET LOCAL app.current_tenant_id = ...` is set per-transaction for RLS
- Connection pool sizing to be determined in Phase 3 based on expected concurrency

---

## 10. Phase 3 Deliverable

The Phase 3 database deliverable includes:
- Complete canonical schema for all tables
- All migration files
- Index definitions
- RLS policy definitions for all tables
- Constraint definitions (foreign keys, unique constraints, check constraints)
- Seeding scripts for development (role templates, default modules, platform configuration)
