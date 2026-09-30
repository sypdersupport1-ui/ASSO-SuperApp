# ASSO — Restaurant Vertical / Slice 1: Restaurant Foundation & Table Management

**Vertical**: Restaurant (Equal First-Class Sibling to Hotel and Cinema)  
**Slice**: R1 — Restaurant Foundation + Table Management  
**Status**: Completed & Verified  
**Date**: 2026-10-01  
**Branch**: `feature/restaurant-r1-foundation-tables`  

---

## 1. Overview & Objective

Restaurant Slice 1 (R1) establishes the foundational core for the Restaurant vertical within ASSO. 

Restaurant is a **first-class vertical** and an equal sibling alongside Hotel and Cinema. R1 delivers a complete, standalone dining room management solution:
- Physical Restaurant Outlets & Tables
- Controlled Server-Authoritative Table Statuses (`AVAILABLE`, `OCCUPIED`, `RESERVED`, `CLEANING`, `OUT_OF_SERVICE`)
- Table Dining Sessions Foundation (with strict DB-level prevention of duplicate active sessions)
- High-Entropy Cryptographic Table QR Codes (with generation, rotation, and revocation lifecycle)
- Public Customer Table QR Context Resolution (with customer name and phone collection)
- Dedicated Restaurant Operations Dashboard (`/restaurant`) and Table Directory (`/restaurant/tables`)

### Core Physical & Domain Model
```text
Organization (Tenant)
    ↓
Restaurant Outlet (verticalType = 'RESTAURANT')
    ↓
Restaurant Table (1:1 with BusinessContext where contextType = 'TABLE')
    ↓
Table Dining Session (status = 'ACTIVE' | 'COMPLETED' | 'CANCELLED')
    ↓
[Future R2: Digital Menu / R3: Orders / R4: KDS / R5: POS / R6: Billing]
```

### Standalone Architectural Invariant
A standalone restaurant does **NOT** require:
- Hotel Property
- Hotel Room
- Hotel Stay / Guest Check-in
- Hotel Folio

No room or stay assumptions exist in any Restaurant code. Hotel Restaurant integration (e.g. charging a dine-in check to a hotel guest's room folio) is reserved for a future dedicated slice.

---

## 2. Shared Engine Reuse

Per ASSO architecture rules, R1 strictly reuses existing shared platform engines rather than duplicating vertical-specific variants:

| Shared Engine | ASSO Reused Implementation | Custom Restaurant Fork Avoided |
|---|---|---|
| **Multi-Tenancy** | PostgreSQL Native RLS + Server-side Tenant Scoping | No `restaurant_tenancy` |
| **Authentication** | Cryptographic JWT with session types | No `restaurant_auth` |
| **RBAC** | `hasPermission(user, "restaurant.*")` and granular permissions | No `restaurant_rbac` |
| **Module Entitlements** | `isModuleEntitled(tenantId, "RESTAURANT")` | No `restaurant_entitlements` |
| **Context & QR Engine** | `businessContexts` (`contextType = "TABLE"`), `qrTokens`, `customerSessions` | No `restaurant_qr_engine` |
| **Audit Engine** | `recordAuditEvent` with append-only logging | No `restaurant_audit` |
| **Realtime Engine** | SSE Realtime Hub (`realtimeHub.broadcastToTenant`) | No WebSockets / Redis overhead |
| **Database & Migrations** | Drizzle ORM + PostgreSQL migration journal | No ad-hoc schema patches |
| **Design System** | Tailored dark/light palette, Radix UI primitives, Lucide icons | No divergent design language |

---

## 3. Database Schema & Migration

**Migration File**: `src/db/migrations/0009_restaurant_foundation_tables.sql` (Journal index 9)

### Tables Added

#### 1. `restaurant_tables`
Physical table entity mapped 1:1 to canonical `business_contexts`.
- `table_id` (UUID, Primary Key, default `gen_random_uuid()`)
- `tenant_id` (UUID, Foreign Key -> `organizations.organization_id`)
- `outlet_id` (UUID, Foreign Key -> `outlets.outlet_id`)
- `context_id` (UUID, Foreign Key -> `business_contexts.context_id`)
- `table_number` (VARCHAR(50), Scoped unique per outlet)
- `display_label` (VARCHAR(100), e.g. "Table 4 - Window Booth")
- `capacity` (INTEGER, Default `4`, min `1`)
- `section` (VARCHAR(100), Default `'Main Dining'`, e.g. "Terrace", "PDR")
- `status` (VARCHAR(50), Default `'AVAILABLE'`)
- `is_active` (BOOLEAN, Default `true`)
- `created_at` / `updated_at` (TIMESTAMPTZ, Default `now()`)
- **Constraints & Indexes**:
  - `uq_restaurant_tables_outlet_number`: Unique constraint on `(outlet_id, table_number)`
  - `idx_restaurant_tables_tenant_outlet`: Composite index on `(tenant_id, outlet_id)`
  - `idx_restaurant_tables_context_id`: Index on `(context_id)`
  - `idx_restaurant_tables_status`: Index on `(tenant_id, status)`
- **RLS**: Row Level Security enabled and forced with tenant SELECT, INSERT, UPDATE, DELETE policies.

#### 2. `restaurant_table_sessions`
Dining occupancy lifecycle entity representing an active or historical party dining at a physical table.
- `session_id` (UUID, Primary Key, default `gen_random_uuid()`)
- `tenant_id` (UUID, Foreign Key -> `organizations.organization_id`)
- `outlet_id` (UUID, Foreign Key -> `outlets.outlet_id`)
- `table_id` (UUID, Foreign Key -> `restaurant_tables.table_id`)
- `session_number` (VARCHAR(50), Human-readable identifier, e.g. `TS-20261001-4921`)
- `status` (VARCHAR(50), Default `'ACTIVE'`)
- `guest_count` (INTEGER, Default `1`)
- `customer_name` (VARCHAR(100), Nullable)
- `customer_phone` (VARCHAR(50), Nullable)
- `opened_at` (TIMESTAMPTZ, Default `now()`)
- `closed_at` (TIMESTAMPTZ, Nullable)
- `opened_by_user_id` (UUID, Nullable, Foreign Key -> `users.user_id`)
- `notes` (TEXT, Nullable)
- `created_at` / `updated_at` (TIMESTAMPTZ, Default `now()`)
- **Constraints & Indexes**:
  - `uq_active_session_per_table`: **Partial Unique Index** on `(table_id)` where `"status" = 'ACTIVE'`. Guarantees at database level that no physical table can ever have more than one concurrent active dining session.
  - `uq_restaurant_table_sessions_number`: Unique constraint on `(tenant_id, session_number)`
  - `idx_restaurant_table_sessions_tenant_table`: Composite index on `(tenant_id, table_id)`
  - `idx_restaurant_table_sessions_status`: Index on `(tenant_id, status)`
- **RLS**: Row Level Security enabled and forced with tenant SELECT, INSERT, UPDATE, DELETE policies.

---

## 4. Table Status State Machine

Status display on the frontend is **never** the authority. All transitions are verified server-side through `assertTableStatusTransition`:

```text
                       ┌──────────────┐
         ┌────────────►│  AVAILABLE   │◄──────────────┐
         │             └──────┬───────┘               │
         │                    │                       │
         │           ┌────────┴────────┐              │
         │           ▼                 ▼              │
         │    ┌──────────────┐  ┌──────────────┐      │
         │    │   OCCUPIED   │  │   RESERVED   │      │
         │    └──────┬───────┘  └──────┬───────┘      │
         │           │                 │              │
         │           ▼                 │              │
         │    ┌──────────────┐         │              │
         └────┤   CLEANING   │◄────────┘              │
              └──────┬───────┘                        │
                     │                                │
                     ▼                                │
              ┌──────────────┐                        │
              │OUT_OF_SERVICE├────────────────────────┘
              └──────────────┘
```

### Transition Rules Matrix
- `AVAILABLE` -> `OCCUPIED`, `RESERVED`, `CLEANING`, `OUT_OF_SERVICE`
- `OCCUPIED` -> `CLEANING`, `AVAILABLE` (Impossible transitions such as `OCCUPIED` -> `OUT_OF_SERVICE` or `OCCUPIED` -> `RESERVED` without clearing are strictly rejected with `INVALID_STATE_TRANSITION`).
- `RESERVED` -> `OCCUPIED`, `AVAILABLE`, `OUT_OF_SERVICE`
- `CLEANING` -> `AVAILABLE`, `OUT_OF_SERVICE`
- `OUT_OF_SERVICE` -> `AVAILABLE`, `CLEANING`

---

## 5. Table QR Code Lifecycle & Public Customer Context

1. **High-Entropy Token**: 256 bits of cryptographic entropy generated via `crypto.randomBytes(32).toString("base64url")`.
2. **Opaque Resolution**: Physical table QR codes encode **no** sensitive customer data and **no** raw database identifiers.
3. **Multi-Customer Longevity**: A table's physical QR is printed and remains attached to the table across multiple customers and days.
4. **Lifecycle Operations**:
   - `generateOrGetTableQr`: Automatically generates or retrieves active QR.
   - `rotateTableQr`: Atomically marks previous token `REVOKED`, invalidates associated customer sessions, and provisions a new token.
   - `revokeTableQr`: Deactivates QR with mandatory audit reason.
5. **Customer Landing URL**: `/restaurant/table?token=[opaqueToken]`
   - Public endpoint `/api/v1/customer/qr/[token]` resolves `context.contextType === 'TABLE'`, returning table context, section, capacity, and restaurant name without querying hotel rooms or stays.
   - Customer UI collects customer name and phone (Requirement 13) and activates the customer dining session.

---

## 6. RBAC & Module Entitlements

Module Entitlements and RBAC permissions are separate concerns and both are strictly verified server-side:

```text
Module Entitlement Check:
  Does this business tenant have RESTAURANT capability enabled?
  → assertModuleEntitlement(tenantId, "RESTAURANT")

RBAC Permission Check:
  Can this authenticated staff user perform this specific action?
  → assertPermission(user, permission)
```

### Granular Restaurant Permissions
- `restaurant.tables.view`: View tables, sections, and operational dashboard summary.
- `restaurant.tables.manage`: Create and edit tables, modify capacities/sections, toggle active status.
- `restaurant.tables.status`: Execute state machine transitions on tables.
- `restaurant.qr.manage`: Generate, rotate, and revoke table QR codes.
- `restaurant.sessions.manage`: Open and close dining sessions.

---

## 7. Operational Experience & Navigation Architecture

### Operations Dashboard (`/restaurant`)
- Focused entirely on restaurant operations (zero hotel concepts).
- 6 Key Performance Metric Cards: Total Tables, Available (Green), Occupied (Indigo), Reserved (Amber), Cleaning / Bussing (Rose), Out of Service (Slate), plus total seating capacity.
- Interactive Floor Plan Table Grid: Section filtering ("Main Dining", "Terrace Garden", "Private Dining"), status filtering, and quick one-click actions ("Seat Walk-in", "Vacate & Clear", "Mark Ready", "Table QR").
- Realtime EventSource integration: Updates instantly when table status or session changes without page reloads.

### Table Management (`/restaurant/tables`)
- Scannable table directory with search by table number/label/section.
- Create Table modal with outlet uniqueness validation.
- Edit Table modal (capacity, label, section, circulation status).
- Server-validated status transition selector.
- QR Management modal with SVG data URI preview, customer portal test link, QR rotation, and QR revocation with reason tracking.

### Navigation Architecture (`RestaurantNav`)
- Vertical Culinary Branding: Amber/Orange theme, `UtensilsCrossed` icon, outlet name and code badge.
- Active navigation: Dashboard (`/restaurant`), Tables & Floor (`/restaurant/tables`).
- Preserved architecture for upcoming slices with clear badges:
  - Digital Menu (`R2`)
  - Orders (`R3`)
  - Kitchen KDS (`R4`)
  - POS (`R5`)
  - Billing (`R6`)
  - Staff (`R1 Cap`)
  - Analytics (`R8`)
  - Inventory (`Shared`)

---

## 8. Verification Results

All 6 quality and regression gates passed:

```bash
# 1. Full Integration & Unit Regression Suite
npm test
# Result: 30 test files passed (100%), 289 tests passed (100%), 0 failed.
# (Hotel Slices 1–9, Phase 8 Communication Foundation, and Restaurant R1 all passed)

# 2. Restaurant R1 Integration Test Suite
npm test tests/integration/restaurant-r1-table-management.test.ts
# Result: 26 tests passed (100%), 0 failed.

# 3. Security Suite
npm run test:security
# Result: 7 test files passed (100%), 42 tests passed (100%), 0 failed.

# 4. Supabase Native PostgreSQL & RLS Verification
npm run db:verify:rls
# Result: 11 tests passed (100%), 0 failed.

# 5. Typecheck
npm run typecheck
# Result: 0 TypeScript errors.

# 6. Production Build
npm run build
# Result: Compiled successfully; /restaurant, /restaurant/tables, /restaurant/table and all API routes generated cleanly.
```
