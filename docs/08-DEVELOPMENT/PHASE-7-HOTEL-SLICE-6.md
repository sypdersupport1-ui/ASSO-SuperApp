# ASSO — PHASE 7 HOTEL VERTICAL: SLICE 6 — MAINTENANCE & SERVICE REQUESTS

> **Status:** APPROVED & VERIFIED  
> **Phase:** 7 (Hotel Vertical Integration)  
> **Slice:** 6 (Maintenance & Service Requests)  
> **Branch:** `feature/phase7-hotel-slice6`  
> **Database:** Dedicated Supabase PostgreSQL (`jtixaywlxkfgtgclgcka.supabase.co`)  
> **RLS:** Native PostgreSQL Row-Level Security Enabled and Forced  
> **Verification Status:** 100% Tests Passing (154/154 automated tests, 11/11 native RLS tests, production build passing)

---

## 1. Domain Ownership & Architectural Boundaries

In strict compliance with the **ASSO AI Agent Operating Rules**, Hotel Slice 6 leverages the shared platform service-request engine without duplicating ticketing or workflow infrastructure.

```text
Shared Service Request Engine (operations.ts)
    └── service_requests (table)
            ├── id, tenant_id, outlet_id (property scope)
            ├── business_context_id (FK to business_contexts / hotel_rooms)
            ├── request_type = 'MAINTENANCE'
            ├── category (PLUMBING, ELECTRICAL, HVAC, APPLIANCE, FURNITURE, STRUCTURAL, OTHER)
            ├── priority (LOW, NORMAL, HIGH, URGENT)
            ├── status (OPEN, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED)
            ├── assigned_to_user_id (FK to users / staff)
            ├── operational_impact (NONE, OUT_OF_SERVICE, OUT_OF_ORDER)
            ├── resolution_notes, resolved_at, closed_at, reopened_at
            └── created_by_user_id (FK to users)

Hotel Domain Layer (hotel/)
    ├── hotel_rooms (Physical room units & operational status)
    ├── hotel_housekeeping_tasks (Housekeeping tasks & readiness certification)
    └── Front Office Attention Queue & Room Rack
```

### Prohibited & Avoided Duplications:
- **NO** redundant `hotel_service_requests` or `maintenance_tickets` table created.
- **NO** duplicate room, staff, or customer tables.
- **NO** inventory depletion or parts procurement mechanisms introduced prematurely.
- **NO** Folio, billing, invoices, or payments code.
- **NO** customer-facing QR or guest-facing request creation (strictly deferred to Slice 7).
- **NO** Room Service / F&B code (deferred to Slice 8).

---

## 2. Maintenance Vocabulary & Classification

### 2.1 Maintenance Categories
Supported maintenance issue types:
* `PLUMBING`: Water supply, drainage, leaks, faucet/shower fixtures, toilet repairs.
* `ELECTRICAL`: Power failure, lighting, wiring, switches, outlets, circuit breakers.
* `HVAC`: Air conditioning, heating, thermostat malfunction, ventilation.
* `APPLIANCE`: Television, minibar fridge, kettle, safe, hair dryer.
* `FURNITURE`: Bed frame, desk, chairs, wardrobe, door locks/hinges, blinds/curtains.
* `STRUCTURAL`: Wall, ceiling, flooring, window glass, water ingress, paint damage.
* `OTHER`: Miscellaneous operational or maintenance tasks.

### 2.2 Priority Levels
Aligned with the canonical priority model:
* `LOW`: Non-urgent aesthetic issue; does not impact guest stay or room readiness.
* `NORMAL`: Standard work request; routine repair during standard maintenance hours.
* `HIGH`: Degraded comfort or equipment failure; requires same-day resolution.
* `URGENT`: Critical breakdown or safety risk (e.g. water leak, no power/AC in occupied room, door lock malfunction).

---

## 3. Server-Side Finite State Machine

The maintenance lifecycle is strictly governed by a server-side state machine implemented in [`src/lib/hotel/maintenance-state-machines.ts`](file:///Users/apple/Downloads/asso%20super%20app/src/lib/hotel/maintenance-state-machines.ts):

```text
               ┌───────────┐
               │   OPEN    │◄─────────────────────────────┐
               └─────┬─────┘                              │
                     │                                    │
                     ▼                                    │
               ┌───────────┐                              │
       ┌──────►│ ASSIGNED  │                              │
       │       └─────┬─────┘                              │
       │             │                                    │
       │             ▼                                    │
       │       ┌───────────┐                              │
       │       │IN_PROGRESS│                              │
       │       └─────┬─────┘                              │
       │             │                                    │
       │             ▼                                    │
       │       ┌───────────┐                              │
       │       │ RESOLVED  │                              │
       │       └─────┬─────┘                              │
       │             │                                    │
       │             ▼                                    │
       │       ┌───────────┐                              │
       │       │  CLOSED   │──────────────────────────────┘
       │       └───────────┘       reopenMaintenanceRequest()
       │
       └─ unassign / reassign allowed in OPEN or ASSIGNED
```

### Transition Rules:
| Current Status | Target Status | Allowed Action | Requirements / Guardrails |
|---|---|---|---|
| `OPEN` | `ASSIGNED` | `assign` | Valid assigned staff ID provided. |
| `OPEN` | `IN_PROGRESS` | `start` | Automatically sets work in progress. |
| `ASSIGNED` | `OPEN` | `unassign` | Nullifies assigned staff member. |
| `ASSIGNED` | `ASSIGNED` | `reassign` | Assigns to a different staff member. |
| `ASSIGNED` | `IN_PROGRESS` | `start` | Initiates repair work. |
| `IN_PROGRESS` | `RESOLVED` | `resolve` | Mandatory resolution notes string required. |
| `RESOLVED` | `CLOSED` | `close` | Final operational sign-off. |
| `RESOLVED` | `IN_PROGRESS` | `rework` | Incomplete repair requiring further work. |
| `CLOSED` | `OPEN` | `reopen` | Recurring or unsatisfactory repair. Records `reopenedAt`. |

---

## 4. Room Operational Impact & Housekeeping Separation

Maintenance workflows directly interact with room operational states while strictly preserving separation from housekeeping readiness and guest occupancy:

### 4.1 Operational Status vs Housekeeping Readiness
- **Operational Status (`operationalStatus`)**: `AVAILABLE`, `OCCUPIED`, `OUT_OF_SERVICE` (cosmetic/minor issue), `OUT_OF_ORDER` (severe breakdown, uninhabitable).
- **Housekeeping Status (`housekeepingStatus`)**: `DIRTY`, `CLEAN`, `INSPECTED`.

### 4.2 Room Impact on Creation
When creating a maintenance request, staff select an `operationalImpact`:
1. `OUT_OF_ORDER`: Immediately sets the room's `operationalStatus` to `OUT_OF_ORDER`. **Blocked if room is currently `OCCUPIED`** unless verified through authorized hotel room relocation/policy.
2. `OUT_OF_SERVICE`: Sets the room's `operationalStatus` to `OUT_OF_SERVICE`.
3. `NONE`: Leaves the room's operational status untouched.

### 4.3 Safe Room Restoration on Resolution
When resolving a maintenance request where the room was taken `OUT_OF_ORDER` or `OUT_OF_SERVICE`:
- The staff can indicate `restoreRoomOperationalStatus: true`.
- If no other unresolved maintenance requests exist for this room, the room's `operationalStatus` is safely restored to `AVAILABLE`.
- **CRITICAL SAFEGUARD**: The room's `housekeepingStatus` is **NEVER** modified by maintenance completion. If the room was `DIRTY`, it **remains `DIRTY`** and must go through housekeeping inspection before being sale-ready.

---

## 5. Security Pipeline & Native RLS

Every maintenance interaction is verified through the strict multi-tier security pipeline:

```text
Incoming HTTP Request
    │
    ▼
1. Authentication (JWT verified; valid user identity extracted)
    │
    ▼
2. Tenant Isolation (x-tenant-id verified against user organization memberships)
    │
    ▼
3. Module Entitlement (Verifies tenant has 'HOTEL' module enabled)
    │
    ▼
4. RBAC & Granular Permissions:
       • hotel.maintenance.read   (view maintenance requests & summary)
       • hotel.maintenance.manage (create, start, resolve, close, reopen)
       • hotel.maintenance.assign (assign staff members to requests)
    │
    ▼
5. Property Scope (Validates property outletId belongs strictly to tenant)
    │
    ▼
6. Business Rule & State Machine Validation
    │
    ▼
7. Native PostgreSQL Execution with RLS Enforced
```

### Native PostgreSQL RLS Policy:
```sql
ALTER TABLE "service_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_requests" FORCE ROW LEVEL SECURITY;

CREATE POLICY "service_requests_tenant_isolation_policy"
  ON "service_requests"
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
```

---

## 6. Realtime & Audit Trail

### 6.1 Audit Events Recorded
All maintenance operations record immutable audit entries in the audit ledger:
- `maintenance.request_created`: Request initialized with priority, category, and operational impact.
- `maintenance.request_assigned`: Staff assigned/reassigned to work item.
- `maintenance.request_started`: Maintenance technician begins repair.
- `maintenance.request_resolved`: Work resolved with resolution notes.
- `maintenance.request_closed`: Request formally closed.
- `maintenance.request_reopened`: Closed request reopened for additional work.
- `room.maintenance_state_changed`: Room operational status modified due to maintenance issue or resolution.

### 6.2 Realtime SSE Broadcasts
Events are broadcast over Server-Sent Events (SSE) scoped exclusively to the active tenant:
- `maintenance:created`
- `maintenance:assigned`
- `maintenance:started`
- `maintenance:resolved`
- `maintenance:closed`
- `maintenance:reopened`

---

## 7. Front Office & Room Rack Integration

- **Front Office Workspace (`/hotel/front-office`)**:
  - The Front Office summary API query now includes active maintenance counts (`openMaintenanceRequests`) alongside arrivals, departures, and dirty rooms.
  - Active maintenance issues requiring front office attention are surfaced directly in the attention queue.
- **Room Rack**:
  - Rooms impacted by maintenance display distinct status badges (`OUT_OF_ORDER`, `OUT_OF_SERVICE`) preventing accidental check-ins into malfunctioning rooms.

---

## 8. Automated Test & Verification Evidence

All 19 test suites and 154 automated tests pass against the live Supabase PostgreSQL development database:

```text
Test Files  19 passed (19)
     Tests  154 passed (154)
  Duration  77.35s

Included Suites:
  ✓ tests/integration/hotel-slice6-maintenance.test.ts (13 tests)
  ✓ tests/unit/hotel-maintenance-state-machines.test.ts (8 tests)
  ✓ tests/integration/hotel-slice5-housekeeping.test.ts (15 tests)
  ✓ tests/unit/hotel-housekeeping-state-machines.test.ts (8 tests)
  ✓ tests/integration/hotel-slice4-front-office.test.ts (15 tests)
  ✓ tests/integration/hotel-slice3-checkin-stay-checkout.test.ts (14 tests)
  ✓ tests/integration/hotel-slice2-reservations.test.ts (13 tests)
  ✓ tests/integration/hotel-slice1-property-rooms.test.ts (11 tests)
  ✓ tests/security/tenant-isolation.test.ts (6 tests)
  ✓ tests/security/auth-and-rbac.test.ts (6 tests)
  ✓ tests/security/idempotency.test.ts (5 tests)
  ✓ tests/security/storage-idor.test.ts (4 tests)
  ✓ tests/unit/policy-and-entitlements.test.ts (5 tests)
  ✓ tests/unit/realtime-tenant-scoping.test.ts (4 tests)
  ✓ tests/unit/canonical-ledgers.test.ts (5 tests)
  ✓ tests/unit/hotel-state-machines.test.ts (9 tests)
  ✓ tests/unit/hotel-reservation-state-machines.test.ts (9 tests)
  ✓ tests/unit/hotel-stay-state-machines.test.ts (5 tests)
  ✓ tests/integration/api-endpoints.test.ts (6 tests)
```

### Native RLS Verification
- `npm run db:verify:rls`: 11/11 tests passed (100% tenant isolation, fail-closed behavior, role bypass verification).

### TypeScript & Production Build
- `npm run typecheck`: 0 errors.
- `npm run build`: 18/18 static/dynamic routes compiled successfully.
