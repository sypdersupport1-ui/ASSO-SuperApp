# ASSO — Phase 7 Hotel Vertical: Slice 3 Architecture & Verification Report

## Check-in, Stays, Occupancy & Check-out

**Document Status**: Approved / Complete  
**Date**: September 27, 2026  
**Vertical**: Hotel (First Production Vertical)  
**Parent Platform**: ASSO SuperApp Architecture  
**Database**: Dedicated Supabase PostgreSQL (`jtixaywlxkfgtgclgcka.supabase.co`)  
**Git Branch**: `feature/phase7-hotel-slice3`  
**Dependencies**: Phase 0–6 Platform Foundation, Phase 7 Slice 1 (`7c9045d`), Phase 7 Slice 2 (`46e7080`)

---

## 1. Domain Overview & Scope Boundary

Hotel Slice 3 connects the existing planned Reservation and physical Room domains to the authoritative hotel occupancy lifecycle:

```text
Reservation (Planned)
        ↓  (Eligible check-in validation)
     Check-in (Atomic transaction)
        ↓
    Hotel Stay (Active occupancy ledger)
        ↓
   Room OCCUPIED (Physical state)
        ↓
    Check-out (Atomic transaction)
        ↓
   Stay COMPLETED (Checked-out ledger)
        ↓
   Room AVAILABLE + Housekeeping DIRTY (Occupancy released)
```

### Strict Scope Boundaries
* **In Scope**: Check-in, Stays, Occupancy, Check-out, single active stay invariants, room rack occupant display, front office stays ledger, native concurrency locking.
* **Deferred to Later Slices (Out of Scope)**:
  * Folio settlement, invoices, and split billing (Slice 4)
  * Payment gateways / refunds / Razorpay integration
  * Housekeeping shift assignment & cleaning inspection workflows
  * Maintenance work orders
  * Room service / in-room dining
  * Cross-vertical charging (Restaurant / Cinema)

---

## 2. Distinction: Reservation vs Stay vs Room Status

ASSO strictly segregates planned bookings, operational room states, and in-house stays:

| Concept | Domain Entity | Primary Responsibility | Example States |
| :--- | :--- | :--- | :--- |
| **Reservation** | `hotel_reservations` | Future booking agreement and rate guarantee | `PENDING`, `CONFIRMED`, `CHECKED_IN`, `COMPLETED`, `CANCELLED`, `NO_SHOW` |
| **Stay** | `hotel_stays` | Authoritative in-house physical occupancy | `ACTIVE`, `CHECKED_OUT` |
| **Operational Room Status** | `hotel_rooms.operational_status` | Physical availability for occupation | `AVAILABLE`, `OCCUPIED`, `RESERVED`, `OUT_OF_SERVICE`, `OUT_OF_ORDER` |
| **Housekeeping Status** | `hotel_rooms.housekeeping_status` | Room cleanliness and readiness | `CLEAN`, `DIRTY`, `INSPECTED`, `CLEANING`, `MAINTENANCE` |

> [!IMPORTANT]
> **Hard Architectural Invariant**: A Reservation alone **never** marks a room as `OCCUPIED`. Only a committed `executeCheckIn` transaction creating an `ACTIVE` `hotel_stays` record transitions a room to `OCCUPIED`.

---

## 3. Database Schema & Migration (`0005_military_human_fly.sql`)

### 3.1 `hotel_stays` Table
```sql
CREATE TABLE IF NOT EXISTS hotel_stays (
  stay_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
  outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
  reservation_id UUID NOT NULL REFERENCES hotel_reservations(reservation_id) ON DELETE RESTRICT,
  guest_id UUID NOT NULL REFERENCES hotel_guests(guest_id) ON DELETE RESTRICT,
  room_id UUID NOT NULL REFERENCES hotel_rooms(room_id) ON DELETE RESTRICT,
  stay_number VARCHAR(32) NOT NULL,
  check_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_check_out_at TIMESTAMPTZ NOT NULL,
  actual_check_out_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  adult_count INT NOT NULL DEFAULT 1,
  children_count INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.2 Database-Enforced Invariants
1. **Single Active Stay per Room**:
   ```sql
   CREATE UNIQUE INDEX uq_hotel_stays_active_room 
   ON hotel_stays (room_id) 
   WHERE status = 'ACTIVE';
   ```
2. **Single Active Stay per Reservation**:
   ```sql
   CREATE UNIQUE INDEX uq_hotel_stays_active_reservation 
   ON hotel_stays (reservation_id) 
   WHERE status = 'ACTIVE';
   ```
3. **Status Check Constraint**:
   ```sql
   ALTER TABLE hotel_stays ADD CONSTRAINT chk_stay_status 
   CHECK (status IN ('ACTIVE', 'CHECKED_OUT'));
   ```
4. **Capacity Check Constraint**:
   ```sql
   ALTER TABLE hotel_stays ADD CONSTRAINT chk_stay_guest_counts 
   CHECK (adult_count >= 1 AND children_count >= 0);
   ```

### 3.3 Native Supabase PostgreSQL RLS
Native PostgreSQL RLS is enabled and forced with 4 tenant-isolation policies on `hotel_stays`:
* `hotel_stays_tenant_isolation_select`
* `hotel_stays_tenant_isolation_insert`
* `hotel_stays_tenant_isolation_update`
* `hotel_stays_tenant_isolation_delete`
Enforced using: `tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::UUID`.

---

## 4. Workflows & State Machines

### 4.1 Check-In Transaction Flow (`executeCheckIn`)
```text
BEGIN TRANSACTION
  1. Lock reservation row FOR UPDATE (enforces single check-in attempt)
  2. Validate reservation state === 'CONFIRMED'
  3. Validate no active stay exists for reservation
  4. Lock physical room row FOR UPDATE
  5. Validate room active, matching room type, AVAILABLE/RESERVED, not occupied
  6. Validate no active stay exists for room
  7. Insert hotel_stays (status: 'ACTIVE')
  8. Update hotel_rooms (operational_status = 'OCCUPIED', is_occupied = true)
  9. Update business_contexts (is_occupied = true)
  10. Update hotel_reservations (status = 'CHECKED_IN')
  11. Write audit event 'hotel.checkin'
COMMIT
  12. Broadcast realtime events 'stay.checked_in' and 'room.occupied'
```

### 4.2 Check-Out Transaction Flow (`executeCheckOut`)
```text
BEGIN TRANSACTION
  1. Lock stay row FOR UPDATE
  2. Validate stay status === 'ACTIVE'
  3. Lock room and reservation rows FOR UPDATE
  4. Update hotel_stays (status = 'CHECKED_OUT', actual_check_out_at = NOW())
  5. Update hotel_rooms:
       operational_status = 'AVAILABLE'
       is_occupied = false
       housekeeping_status = 'DIRTY' (segregated from cleanliness state)
  6. Update business_contexts (is_occupied = false)
  7. Update hotel_reservations (status = 'COMPLETED')
  8. Write audit event 'hotel.checkout'
COMMIT
  9. Broadcast realtime events 'stay.checked_out' and 'room.released'
```

---

## 5. Security & 5-Layer Authorization Pipeline

Every request passes through the canonical pipeline:
1. **Authentication**: JWT token verification.
2. **Tenant Context**: Request headers and JWT tenant isolation.
3. **Module Entitlement**: Verifies tenant possesses active `HOTEL` capability.
4. **RBAC**: Enforces `hotel.stays.manage` for check-in / check-out mutations and `hotel.stays.read` for viewing ledgers.
5. **Operation**: Validates state machine and row locking inside PostgreSQL transaction.

---

## 6. API Endpoints

| Method | Endpoint | Description | Idempotency |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/hotel/reservations/[id]/check-in` | Executes check-in, creates stay, marks room occupied | Supported via `Idempotency-Key` |
| `POST` | `/api/v1/hotel/stays/[id]/check-out` | Executes check-out, completes stay, releases room | Supported via `Idempotency-Key` |
| `GET` | `/api/v1/hotel/stays` | Lists active/checked-out stays with pagination & filters | N/A |
| `GET` | `/api/v1/hotel/stays/[id]` | Retrieves stay detail with guest and room info | N/A |

---

## 7. Frontend Operations UI

1. **Front Office Stays Ledger (`/hotel/stays`)**:
   - Live table of in-house stays and departed records.
   - Filter by status (`ACTIVE`, `CHECKED_OUT`).
   - Search by guest name or room number.
   - Stay Detail dialog displaying room, guest, timestamps, and notes.
   - Direct [Check Out] modal with departure verification.
2. **Reservations Ledger Integration (`/hotel/reservations`)**:
   - `CHECKED_IN` and `COMPLETED` badges.
   - Direct [Check In] action modal with physical room selector and availability validation.
3. **Room Rack Integration (`/hotel/rooms`)**:
   - Occupied room cards display in-house guest name and expected departure date.
   - Room modal displays direct [Check Out Guest Now] shortcut.
4. **Operations Dashboard (`/hotel`)**:
   - Front Office metrics: `Active In-House Stays`, `Today's Check-Ins`, `Today's Check-Outs`.
   - Direct navigation links to the Stays Ledger.

---

## 8. Automated Test Coverage & Verification

All automated tests run sequentially (`fileParallelism: false`) against the live Supabase PostgreSQL database:

* **Unit Test Suites**:
  - `tests/unit/hotel-stay-state-machines.test.ts`: Validates `ACTIVE -> CHECKED_OUT`, terminal state enforcement, and type guards.
  - `tests/unit/hotel-reservation-state-machines.test.ts`: Validates `CONFIRMED -> CHECKED_IN -> COMPLETED`.
* **Integration Test Suite**:
  - `tests/integration/hotel-slice3-checkin-stay-checkout.test.ts`:
    - 14 tests covering invariant enforcement, check-in, check-out, RLS, RBAC, idempotency replay, and native concurrency race conditions.
* **Regression Test Verification**:
  - `tests/integration/hotel-slice1.test.ts` (11/11 passed)
  - `tests/integration/hotel-slice2-guests-reservations.test.ts` (13/13 passed)
  - `scripts/verify-supabase-native-rls.ts` (11/11 passed)
* **Total Automated Suite**: **14 test files passed, 102 tests passed, 0 failures**.

---

## 9. Known Limitations & Deferred Decisions

1. **Folio & Invoicing**: Stay records are architected to cleanly attach to upcoming Folio ledgers in Slice 4. No fake financial records are introduced.
2. **Housekeeping Shifts**: Room checkout marks rooms as `DIRTY`. Cleaning schedules and inspection approvals belong to the housekeeping slice.
3. **External Payment Providers**: Razorpay / credit card payments remain deferred as per platform roadmap.
