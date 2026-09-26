# ASSO — PHASE 7 HOTEL VERTICAL: SLICE 1 SPECIFICATION & RUNBOOK

## Executive Summary

Phase 7 establishes the first production business vertical on top of the approved ASSO foundation: **HOTEL**.
In accordance with the Master Architecture (Phase 2), Database Schema (Phase 3), and UX Design System (Phase 4), Hotel is built as a modular vertical capability sharing the core platform engines (Multi-Tenancy, Organizations/Outlets, Business Contexts, Auditing, Idempotency, and Module Entitlements) rather than a siloed application.

**Slice 1 Scope:**
1. **Property / Hotel Setup**: Multi-property tenant model (`outlets` with `vertical_type = 'HOTEL'`).
2. **Room Types**: Real domain categories with occupancy limits and baseline pricing (`hotel_room_types`).
3. **Rooms**: Physical room inventory (`hotel_rooms`) bound 1:1 to canonical `business_contexts` (`context_type = 'HOTEL_ROOM'`).
4. **Segregated Room Status Model**: Separate operational status (`AVAILABLE`, `OCCUPIED`, `RESERVED`, `OUT_OF_SERVICE`, `OUT_OF_ORDER`) and housekeeping status (`CLEAN`, `DIRTY`, `INSPECTED`, `CLEANING`, `MAINTENANCE`) governed by server-side finite state machines.
5. **Hotel Operations Dashboard & Room Rack**: Real-time operational views computed directly from native Supabase PostgreSQL.
6. **Native PostgreSQL RLS**: Tenant isolation with `FORCE ROW LEVEL SECURITY` across all operations.
7. **5-Layer Security Pipeline**: Module entitlement (`HOTEL`), RBAC (`hotel.read`, `hotel.manage`, `hotel.rooms.manage`), and audit logging.

---

## 1. Domain Model & Entities

```text
Organization (Tenant Root)
   │
   ├── Outlets (Hotel Properties: vertical_type = 'HOTEL')
   │      │
   │      ├── Hotel Room Types (hotel_room_types)
   │      │      ├── code, name, description
   │      │      ├── base_occupancy, max_occupancy
   │      │      └── base_rate
   │      │
   │      └── Hotel Rooms (hotel_rooms)
   │             ├── room_number, floor_number
   │             ├── operational_status (State Machine)
   │             ├── housekeeping_status (State Machine)
   │             ├── is_occupied
   │             └── context_id ──► Business Context (business_contexts)
   │                                   ├── context_type: 'HOTEL_ROOM'
   │                                   └── identifier: room_number
```

### Architectural Invariant: 1:1 Business Context Mapping
Hotel rooms are not isolated inventory records. When a hotel room is created, an associated `business_contexts` record is atomically created with `context_type = 'HOTEL_ROOM'`. This allows future vertical slices (QR room context, guest service requests, room service ordering, and guest folios) to seamlessly attach without architectural rework.

---

## 2. Information Architecture & Navigation

The Hotel navigation integrates directly into the unified ASSO application shell:

```text
Hotel Experience
├── Dashboard (/hotel)
│     └── Operational KPIs, Occupancy %, Housekeeping Breakdown, Room Type Inventory
├── Rooms & Room Rack (/hotel/rooms)
│     └── Visual Room Rack, Floor/Status Filtering, Room Status Transition Controls, Add Room Dialog
├── Room Types (/hotel/room-types)
│     └── Category Listing, Occupancy Rules, Base Rates, Add Room Type Dialog
└── Hotel Settings (/hotel/settings)
      └── Property Roster, Multi-Property Tenant Context, Timezone & Currency Configuration
```

*Note: Navigation items for subsequent slices (Front Office arrivals/departures, Reservations, Guest Folio, Housekeeping task management, Room Service) are deferred until those vertical slices are implemented.*

---

## 3. Database Schema & Migrations

### Tables Added in Migration `0003_neat_sersi.sql`:

1. `hotel_room_types`
   - `room_type_id`: UUID PK default gen_random_uuid()
   - `tenant_id`: UUID FK -> organizations(organization_id)
   - `outlet_id`: UUID FK -> outlets(outlet_id)
   - `code`: VARCHAR(50) NOT NULL
   - `name`: VARCHAR(100) NOT NULL
   - `description`: TEXT
   - `base_occupancy`: INT NOT NULL DEFAULT 2
   - `max_occupancy`: INT NOT NULL DEFAULT 3
   - `base_rate`: NUMERIC(14, 4) NOT NULL
   - `is_active`: BOOLEAN NOT NULL DEFAULT true
   - `created_at`, `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
   - CONSTRAINT: UNIQUE(outlet_id, code)

2. `hotel_rooms`
   - `room_id`: UUID PK default gen_random_uuid()
   - `tenant_id`: UUID FK -> organizations(organization_id)
   - `outlet_id`: UUID FK -> outlets(outlet_id)
   - `context_id`: UUID FK -> business_contexts(context_id)
   - `room_type_id`: UUID FK -> hotel_room_types(room_type_id)
   - `room_number`: VARCHAR(50) NOT NULL
   - `floor_number`: VARCHAR(20)
   - `operational_status`: VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE'
   - `housekeeping_status`: VARCHAR(50) NOT NULL DEFAULT 'CLEAN'
   - `is_occupied`: BOOLEAN NOT NULL DEFAULT false
   - `is_active`: BOOLEAN NOT NULL DEFAULT true
   - `created_at`, `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
   - CONSTRAINT: UNIQUE(outlet_id, room_number)

### Row Level Security (RLS)
Both tables have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` active with 4 tenant isolation policies:
- `hotel_room_types_tenant_select`, `_insert`, `_update`, `_delete`
- `hotel_rooms_tenant_select`, `_insert`, `_update`, `_delete`
All policies enforce: `"tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid`.

---

## 4. API Endpoints Map

All endpoints conform to `/api/v1` envelope and standard error handling:

| Method | Endpoint | Description | Required Module | Required Permission | Idempotency |
|---|---|---|---|---|---|
| `GET` | `/api/v1/hotel/properties` | List hotel properties | `HOTEL` | `hotel.read` | No |
| `POST` | `/api/v1/hotel/properties` | Create hotel property | `HOTEL` | `hotel.manage` | Yes (`Idempotency-Key`) |
| `GET` | `/api/v1/hotel/room-types` | List room types | `HOTEL` | `hotel.read` | No |
| `POST` | `/api/v1/hotel/room-types` | Create room type | `HOTEL` | `hotel.room_types.manage` | Yes (`Idempotency-Key`) |
| `PATCH` | `/api/v1/hotel/room-types/[id]`| Update room type | `HOTEL` | `hotel.room_types.manage` | No |
| `GET` | `/api/v1/hotel/rooms` | List rooms with filters | `HOTEL` | `hotel.read` | No |
| `POST` | `/api/v1/hotel/rooms` | Create room + context | `HOTEL` | `hotel.rooms.manage` | Yes (`Idempotency-Key`) |
| `PATCH` | `/api/v1/hotel/rooms/[id]` | Update room status | `HOTEL` | `hotel.rooms.manage` | No |
| `GET` | `/api/v1/hotel/dashboard` | Live operational KPIs | `HOTEL` | `hotel.read` | No |
| `POST` | `/api/v1/hotel/seed` | Seed demo hotel data | `HOTEL` | — | No |

---

## 5. State Machine Transition Rules

### Operational Status (`operational_status`)
- `AVAILABLE` -> `OCCUPIED`, `RESERVED`, `OUT_OF_SERVICE`, `OUT_OF_ORDER`
- `OCCUPIED` -> `AVAILABLE`, `OUT_OF_SERVICE`, `OUT_OF_ORDER`
- `RESERVED` -> `OCCUPIED`, `AVAILABLE`
- `OUT_OF_SERVICE` -> `AVAILABLE`, `OUT_OF_ORDER`
- `OUT_OF_ORDER` -> `AVAILABLE`, `OUT_OF_SERVICE`

### Housekeeping Status (`housekeeping_status`)
- `CLEAN` -> `DIRTY`, `INSPECTED`, `CLEANING`
- `DIRTY` -> `CLEANING`, `MAINTENANCE`
- `CLEANING` -> `CLEAN`, `DIRTY`, `MAINTENANCE`
- `INSPECTED` -> `CLEAN`, `DIRTY`
- `MAINTENANCE` -> `CLEANING`, `DIRTY`, `CLEAN`

All state transitions are validated server-side by `src/lib/hotel/state-machines.ts` and audited in `audit_events`.

---

## 6. Seed Data & Reference Fixtures

Development seed data (`src/lib/hotel/seed.ts`):
- **Organization**: `ASSO Hospitality Group` (`11111111-1111-1111-1111-111111111111`)
- **Property**: `ASSO Grand Hotel & Residences` (`AGH-BLR`)
- **Room Types**:
  - `DELUXE`: Deluxe King Room (₹4,500/night, 2-3 guests)
  - `EXEC`: Executive Suite (₹8,500/night, 2-4 guests)
  - `PRES`: Presidential Penthouse (₹22,000/night, 4-6 guests)
- **Rooms (8 Inventory Units across 3 Floors)**:
  - Floor 1: Rooms 101, 102, 103, 104
  - Floor 2: Rooms 201, 202, 203
  - Floor 3: Room 301

---

## 7. Testing Strategy & Verification Results

1. **Automated Test Suite**:
   - `npm test`: 61 automated tests passing across 10 test suites (including 11 Slice 1 integration tests and 9 state machine unit tests).
2. **Native Supabase PostgreSQL RLS Verification**:
   - `npm run db:verify:rls`: 11/11 native RLS tests passing (100%).
   - Verified `hotel_room_types` and `hotel_rooms` have `relrowsecurity: true` and `relforcerowsecurity: true`.
3. **TypeScript Strict Typecheck**:
   - `npm run typecheck`: 0 errors.
4. **Next.js Production Build**:
   - `npm run build`: Compiled successfully with 10 static and dynamic routes.
5. **Runtime Verification**:
   - Live Next.js server operational on port 3000.
   - Live endpoints tested via HTTP curl returning truthful 200 OK.
