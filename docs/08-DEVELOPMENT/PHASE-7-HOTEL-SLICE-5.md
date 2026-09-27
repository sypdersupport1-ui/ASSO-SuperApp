# ASSO — Phase 7 Hotel Vertical: Slice 5 Architecture & Verification Report

## Housekeeping Operations

**Document Status**: Approved / Complete  
**Date**: September 27, 2026  
**Vertical**: Hotel (First Production Vertical)  
**Parent Platform**: ASSO SuperApp Architecture  
**Database**: Dedicated Supabase PostgreSQL (`jtixaywlxkfgtgclgcka.supabase.co`)  
**Starting Commit**: `fec2bae`  
**Final Commit**: `7dbd748`  
**Branch**: `feature/phase7-hotel-slice5`  
**Target Branch**: `develop`  
**Remote**: `origin/develop`  
**Working Tree**: Clean  
**Dependencies**: Phase 0–6 Platform Foundation, Phase 7 Slice 1 (`7c9045d`), Phase 7 Slice 2 (`46e7080`), Phase 7 Slice 3 (`ef1a935`), Phase 7 Slice 4 (`fec2bae`)

---

## 1. Executive Summary & Purpose

Hotel Slice 5 delivers the first authoritative **Housekeeping operational domain** for the ASSO platform.

Prior slices established physical hotel rooms (`hotel_rooms`) with independent operational (`AVAILABLE`, `OCCUPIED`, `OUT_OF_SERVICE`) and housekeeping (`CLEAN`, `DIRTY`, `CLEANING`, `INSPECTED`) statuses. Slice 5 transforms the housekeeping status from static room attributes into an active, transactional operational workflow with task management, staff assignment, cleaning lifecycle tracking, inspection verification, room readiness determination, and automated turnover creation upon guest checkout.

### Core Housekeeping Responsibilities
1. **Housekeeping Task Lifecycle**: Explicit finite state machine: `PENDING` → `ASSIGNED` → `IN_PROGRESS` → `CLEANED` → `INSPECTED` (with rejection/re-cleaning loop back to `DIRTY`/`PENDING`).
2. **Staff Assignment**: Scoped task assignment leveraging the shared Staff/RBAC domain without duplicating employee models.
3. **Room Readiness Determination**: Authoritative transition of physical rooms to `INSPECTED` (or `CLEAN`), establishing true readiness for guest arrival.
4. **Checkout Auto-Turnover**: Checkout in Slice 3 automatically provisions a `DEPARTURE_TURNOVER` housekeeping task and marks the room `DIRTY`.
5. **Occupied Room Protection & Concurrency**: PostgreSQL row-level locks prevent race conditions, duplicate assignments, or accidental readiness overrides.
6. **Operational Workspace**: High-density `/hotel/housekeeping` console with real-time SSE updates, summary KPIs, "My Tasks" filter, and inspection modals.

---

## 2. Hard Scope & Boundary Controls

### In Scope
- **Housekeeping Task Domain**: `hotel_housekeeping_tasks` table scoped by tenant, property, room, task type, priority, and staff assignment.
- **Workflow State Machine**: Server-side transition validation for tasks and rooms.
- **Explicit Inspection Workflow**: Authorized pass/fail inspection actions with rejection/re-cleaning loops.
- **Checkout Auto-Turnover Integration**: Triggered during `executeCheckOut` within the existing checkout transaction.
- **Operational UI**: `/hotel/housekeeping` responsive dashboard with KPIs, task table, assignment dialogs, and inspection modals.
- **Security & Authorization**: Tenant isolation, Native PostgreSQL RLS, Hotel module entitlement, granular Housekeeping RBAC (`hotel.housekeeping.read`, `hotel.housekeeping.manage`, `hotel.housekeeping.assign`, `hotel.housekeeping.inspect`).
- **Audit & Realtime**: Tenant-scoped audit events and SSE broadcasts.

### Strictly Out of Scope (Deferred to Future Slices)
- **Maintenance Work Orders**: Explicitly allocated to **Hotel Slice 6 (Maintenance & Service Requests)**. Zero maintenance tickets or equipment maintenance logic exist in Slice 5.
- **Guest-Facing Housekeeping Requests & QR**: Allocated to **Hotel Slice 7 (QR & Customer Experience)**.
- **Room Service / Food & Beverage Ordering**: Allocated to **Hotel Slice 8 (Room Service & Ordering)**.
- **Folio, Invoicing & Billing**: Allocated to **Hotel Slice 9 (Folio & Billing)**. Zero billing/payment logic exists in Slice 5.
- **Housekeeping Inventory Depletion**: Automatic chemical/linen depletion deferred; only clean extension points preserved.

---

## 3. Data Model & Architecture

### Table: `hotel_housekeeping_tasks` (Migration `0006_fluffy_housekeeping.sql`)

```sql
CREATE TABLE IF NOT EXISTS "hotel_housekeeping_tasks" (
    "task_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
    "outlet_id" uuid NOT NULL REFERENCES "outlets"("id") ON DELETE RESTRICT,
    "room_id" uuid NOT NULL REFERENCES "hotel_rooms"("room_id") ON DELETE RESTRICT,
    "stay_id" uuid REFERENCES "hotel_stays"("stay_id") ON DELETE SET NULL,
    "reservation_id" uuid REFERENCES "hotel_reservations"("reservation_id") ON DELETE SET NULL,
    "task_type" text DEFAULT 'ROUTINE_CLEANING' NOT NULL,
    "status" text DEFAULT 'PENDING' NOT NULL,
    "priority" text DEFAULT 'NORMAL' NOT NULL,
    "assigned_staff_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "trigger_source" text DEFAULT 'MANUAL' NOT NULL,
    "notes" text,
    "inspection_notes" text,
    "inspected_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "estimated_minutes" integer DEFAULT 30 NOT NULL,
    "scheduled_date" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "inspected_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "hotel_hk_task_type_check" CHECK (task_type IN ('DEPARTURE_TURNOVER', 'ROUTINE_CLEANING', 'DEEP_CLEANING', 'INSPECTION_ONLY', 'TOUCH_UP')),
    CONSTRAINT "hotel_hk_task_status_check" CHECK (status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'CLEANED', 'INSPECTED', 'CANCELLED')),
    CONSTRAINT "hotel_hk_task_priority_check" CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    CONSTRAINT "hotel_hk_task_trigger_check" CHECK (trigger_source IN ('CHECKOUT', 'SCHEDULED', 'FRONT_DESK', 'MANUAL', 'INSPECTION_FAILED'))
);
```

### Native PostgreSQL Row-Level Security
RLS is natively enforced on `hotel_housekeeping_tasks`:
```sql
ALTER TABLE "hotel_housekeeping_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hotel_housekeeping_tasks" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_hotel_housekeeping_tasks"
    ON "hotel_housekeeping_tasks"
    AS RESTRICTIVE
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID);
```

---

## 4. State Machines & Room Synchronization

Housekeeping Task state and physical Room Housekeeping status operate as distinct, coordinated state machines:

```text
Housekeeping Task Lifecycle:
   PENDING ──(assign)──> ASSIGNED ──(start)──> IN_PROGRESS ──(complete)──> CLEANED ──(inspect: pass)──> INSPECTED (terminal)
      ▲                     │                     │                           │
      │                     │                     │                           ▼ (inspect: fail)
      └─────────────────────┴─────────────────────┴────────────────── PENDING (re-cleaning)

Physical Room Housekeeping Status:
   DIRTY ───────────────────────────────(start)──> CLEANING ─────────────(complete)──> CLEAN ──(inspect: pass)──> INSPECTED
     ▲                                                                                                               │
     └─────────────────────────────── (inspect: fail / send back) ───────────────────────────────────────────────────┘
```

### Transition Synchronization Rules
1. **Task Start (`startHousekeepingTask`)**:
   - Task: `PENDING` or `ASSIGNED` → `IN_PROGRESS`
   - Room: `DIRTY` → `CLEANING`
   - Invariant: Room operational status (`AVAILABLE`, `OCCUPIED`, `OUT_OF_SERVICE`) is strictly preserved.
2. **Task Completion (`completeHousekeepingTask`)**:
   - Task: `IN_PROGRESS` → `CLEANED`
   - Room: `CLEANING` → `CLEAN`
   - Invariant: Cleaned rooms awaiting inspection are not marked `INSPECTED` prematurely.
3. **Task Inspection (`inspectHousekeepingTask`)**:
   - **Outcome: Pass**: Task → `INSPECTED`, Room → `INSPECTED`. Room is now certified ready for occupancy.
   - **Outcome: Fail**: Task → `PENDING` (`trigger_source = INSPECTION_FAILED`), Room → `DIRTY`. Room is routed back to cleaning queue.
4. **Checkout Integration (`stay-service.ts`)**:
   - Upon guest checkout: Stay → `COMPLETED`, Room operational status → `AVAILABLE`, Room housekeeping status → `DIRTY`.
   - Automatically invokes `createTurnoverTaskForRoom`, creating a `DEPARTURE_TURNOVER` task with `URGENT`/`HIGH` priority and `CHECKOUT` trigger source.

### 4.1 Housekeeping Readiness Policy & Certification Hierarchy

To prevent operational ambiguity between physical room availability and guest readiness, the platform defines the following authoritative readiness policy based on current implementation:

1. **Readiness Determination**:
   - A room is determined to be ready for guest assignment (`readyForOccupancy`) when:
     $$\text{operationalStatus} = \text{'AVAILABLE'} \quad \text{AND} \quad \text{housekeepingStatus} \in \{\text{'CLEAN'}, \text{'INSPECTED'}\}$$
   - Operational availability alone never implies readiness: an `AVAILABLE + DIRTY` room cannot receive an arriving guest.
2. **Certification Hierarchy (`CLEAN` vs. `INSPECTED`)**:
   - **`CLEAN`**: Indicates that cleaning staff have completed physical turnover/cleaning procedures. In routine daily refreshes or touch-ups, `CLEAN` is acceptable for operational workflows.
   - **`INSPECTED`**: Represents the highest, authoritative certification state. It confirms that an authorized supervisor or quality inspector (`hotel.housekeeping.inspect`) has verified cleanliness, linen quality, and amenity standards.
3. **Mandatory Inspection for Departure Turnovers**:
   - For `DEPARTURE_TURNOVER` tasks generated after guest check-out, the operational standard requires the room to pass inspection (`INSPECTED`) before it is released for new guest occupancy.
4. **Inspection Failure & Revocation Policy**:
   - If an inspection fails (`passed: false`):
     - The physical room status is immediately revoked from `CLEAN` and reset to `DIRTY`.
     - The task status is reopened to `PENDING` with `trigger_source = 'INSPECTION_FAILED'`.
     - Detailed inspection notes documenting defects are recorded in `inspection_notes`.
     - The room is completely excluded from `readyForOccupancy` until re-cleaned and successfully re-inspected.

---


## 5. API Endpoints Specification

All housekeeping endpoints are nested under `/api/v1/hotel/housekeeping/`:

| Method | Endpoint | Description | Permissions Required |
|---|---|---|---|
| `GET` | `/api/v1/hotel/housekeeping/tasks` | Filtered list of tasks (by outlet, status, room, assignee) | `hotel.housekeeping.read` or `hotel.read` |
| `POST` | `/api/v1/hotel/housekeeping/tasks` | Create manual housekeeping task | `hotel.housekeeping.manage` |
| `GET` | `/api/v1/hotel/housekeeping/tasks/[id]` | Get task detail with room and stay context | `hotel.housekeeping.read` or `hotel.read` |
| `POST` | `/api/v1/hotel/housekeeping/tasks/[id]/assign` | Assign staff member to task | `hotel.housekeeping.assign` or `hotel.housekeeping.manage` |
| `POST` | `/api/v1/hotel/housekeeping/tasks/[id]/start` | Start cleaning (locks room & sets `CLEANING`) | `hotel.housekeeping.manage` or `hotel.housekeeping.read` |
| `POST` | `/api/v1/hotel/housekeeping/tasks/[id]/complete` | Complete cleaning (sets `CLEAN`) | `hotel.housekeeping.manage` or `hotel.housekeeping.read` |
| `POST` | `/api/v1/hotel/housekeeping/tasks/[id]/inspect` | Inspect task (`passed: true/false`, pass → `INSPECTED`, fail → `DIRTY`) | `hotel.housekeeping.inspect` or `hotel.housekeeping.manage` |
| `GET` | `/api/v1/hotel/housekeeping/summary` | Aggregated KPIs (task counts & room readiness) | `hotel.housekeeping.read` or `hotel.read` |

---

## 6. Concurrency & Protection Controls

### PostgreSQL Row-Level Locking
All critical state-changing actions execute inside PostgreSQL transactions with explicit `SELECT ... FOR UPDATE` locks:
1. **Task Lock**: `hotel_housekeeping_tasks` row is locked to prevent concurrent status mutations.
2. **Room Lock**: `hotel_rooms` row is locked to ensure physical room status and housekeeping status remain atomically synchronized.
3. **Duplicate Start Prevention**: If two staff members attempt to start the same task simultaneously, the first acquires the lock and transitions to `IN_PROGRESS`. The second unblocks, detects `task.status === "IN_PROGRESS"`, and receives a `422 BUSINESS_RULE_VIOLATION`.
4. **Occupied Room Protection**: Operational status (`OCCUPIED`, `OUT_OF_SERVICE`) is never overwritten by housekeeping actions. Housekeeping only updates `housekeeping_status`.

---

## 7. Realtime & Audit Architecture

### Audit Logging
Every state mutation emits an audit event with sanitized payload:
- `housekeeping.task_created`
- `housekeeping.task_assigned`
- `housekeeping.task_started`
- `housekeeping.task_completed`
- `housekeeping.task_inspected`

### Realtime Broadcasts (SSE)
Upon transaction commit, events are broadcast strictly to the tenant's active SSE connections:
- `housekeeping.task_created`
- `housekeeping.task_assigned`
- `housekeeping.task_started`
- `housekeeping.task_completed`
- `housekeeping.task_inspected`
- `room.housekeeping_changed`

---

## 8. Housekeeping UI (`/hotel/housekeeping`)

- **KPI Cards**: Real-time counters for Rooms Dirty, Rooms Cleaning, Tasks Assigned, In Progress, Inspection Required, and Rooms Ready.
- **View Tabs**: "All Tasks", "My Tasks" (filtered by logged-in staff user ID), and "Room Readiness" matrix.
- **Task Management**: Filters by status, priority, and task type with search by room number.
- **Interactive Modals**:
  - New Task Creation modal with room picker, task type, priority, and notes.
  - Inspection Modal with explicit Pass / Mark Ready or Fail / Send Back for Re-cleaning buttons and notes.
- **Design System**: Fully integrated with the ASSO Phase 4 dark theme, 44px touch targets, responsive breakpoints (<640px mobile, 640-1024px tablet, >1024px desktop), and accessible color badges.

---

## 9. Verification & Test Coverage

### Test Suites Executed Against Live Supabase PostgreSQL
1. **Unit Tests (`tests/unit/hotel-housekeeping-state-machines.test.ts`)**: 8 tests passing.
   - Forward lifecycle transitions (`PENDING` → `ASSIGNED` → `IN_PROGRESS` → `CLEANED` → `INSPECTED`).
   - Direct start without prior assignment (`PENDING` → `IN_PROGRESS`).
   - Inspection failure re-cleaning loop (`CLEANED` → `PENDING`).
   - Terminal state protections (`INSPECTED`, `CANCELLED`).
   - Type guards and validation schemas.
2. **Integration Tests (`tests/integration/hotel-slice5-housekeeping.test.ts`)**: 15 tests passing.
   - Authentication (401), Entitlement (403), RBAC (403), Property Scoping (404).
   - Task creation, assignment, start, completion, inspection rejection, and inspection pass.
   - Checkout integration: automated turnover task generation and dirty room status upon checkout.
   - Aggregate summary KPI accuracy.
   - Concurrency protection: concurrent start race condition safely rejected with `422`.
3. **Full Regression Suite**:
   - `npm test`: 17 test files, 133 tests passed (100%).
   - `npm run db:verify:rls`: 11 native Supabase RLS tests passed (100%).
   - `npm run typecheck`: 0 TypeScript errors.
   - `npm run build`: Production Next.js build compiled successfully (including all housekeeping routes).

---

## 10. Summary of Changes

- **Schema**: Added `hotel_housekeeping_tasks` table and foreign keys to `src/db/schema/hotel.ts`.
- **Migrations**: Added `0006_fluffy_housekeeping.sql` with check constraints and Native RLS.
- **State Machines**: Added `src/lib/hotel/housekeeping-state-machines.ts`.
- **Service**: Added `src/lib/hotel/housekeeping-service.ts` with transactional workflow logic and checkout hook.
- **APIs**: Created 7 REST endpoints under `src/app/api/v1/hotel/housekeeping/`.
- **Frontend**: Created `/hotel/housekeeping` console and integrated navigation in `hotel-nav.tsx`.
- **Checkout Hook**: Updated `src/lib/hotel/stay-service.ts` to trigger turnover tasks on checkout.
