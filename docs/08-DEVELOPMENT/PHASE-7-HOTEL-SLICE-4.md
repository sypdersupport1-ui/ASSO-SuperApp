# ASSO — Phase 7 Hotel Vertical: Slice 4 Architecture & Verification Report

## Front Office Operations

**Document Status**: Approved / Complete  
**Date**: September 27, 2026  
**Vertical**: Hotel (First Production Vertical)  
**Parent Platform**: ASSO SuperApp Architecture  
**Database**: Dedicated Supabase PostgreSQL (`jtixaywlxkfgtgclgcka.supabase.co`)  
**Git Branch**: `feature/phase7-hotel-slice4`  
**Dependencies**: Phase 0–6 Platform Foundation, Phase 7 Slice 1 (`7c9045d`), Phase 7 Slice 2 (`46e7080`), Phase 7 Slice 3 (`ef1a935`)

---

## 1. Executive Summary & Purpose

Hotel Slice 4 delivers the daily operational front-desk console for hotel personnel. Prior slices established independent domain entities:
- **Slice 1**: Properties, Room Types, Rooms, and Rack Overview
- **Slice 2**: Hotel Guests and Reservations
- **Slice 3**: Check-In, Active Stays, Physical Occupancy, and Check-Out

Front Office Operations (`/hotel/front-office` and `/api/v1/hotel/front-office`) serves as the daily command center that brings these domains together into an integrated, actionable workspace.

### Core Questions Immediately Answered
Front Desk staff opening the console can immediately answer:
1. **Who is arriving today?** Confirmed reservations scheduled for arrival today, with room allocation status and one-click Check-In.
2. **Who is departing today?** Active stays scheduled for departure today, with overdue departure highlighting and one-click Check-Out.
3. **Who is currently in-house?** Comprehensive active stay roster searchable across guest name, room number, and stay number.
4. **Which rooms are ready vs. not ready?** Live matrix of available clean, available dirty, cleaning, inspected, occupied, and out-of-service rooms.
5. **What requires immediate Front Desk attention?** Prioritized operational exception queue for unassigned arrivals, occupied rooms assigned to arriving guests, dirty rooms needing turnover, and overdue departures.

---

## 2. Hard Scope & Boundary Controls

### In Scope
- **Front Office Landing/Dashboard**: `/hotel/front-office` responsive console with high-density operational cards, data grids, and filters.
- **Today's Arrivals Workspace**: Confirmed reservations with assigned/unassigned room indicators and direct execution of Slice 3 Check-In.
- **Today's Departures Workspace**: Active stays departing today with departure time tracking and direct execution of Slice 3 Check-Out.
- **In-House Guest Roster**: Authoritative active stays with guest details, VIP badges, room numbers, and fast indexed search.
- **Room Readiness Context**: Real-time breakdown of operational status (`AVAILABLE`, `OCCUPIED`, `OUT_OF_SERVICE`) combined with housekeeping readiness (`CLEAN`, `DIRTY`, `CLEANING`, `INSPECTED`).
- **Attention Queue**: Server-calculated exceptions requiring front desk intervention.
- **Property Scope Enforcement**: Server-side filtering by property outlet ID to guarantee multi-property safety.
- **Realtime Integration**: Live UI refreshes via existing Server-Sent Events (SSE).

### Strictly Out of Scope (Deferred to Future Slices)
- **Folio, Invoicing & Billing**: Explicitly allocated to **Hotel Slice 9 (Folio & Billing)**. Zero folio or invoice tables or logic exist in Slice 4.
- **Housekeeping Shift Management & Task Assignment**: Allocated to **Hotel Slice 5 (Housekeeping)**.
- **Maintenance Work Orders**: Allocated to **Hotel Slice 6 (Maintenance & Service Requests)**.
- **Room Service / Food & Beverage Ordering**: Allocated to **Hotel Slice 8 (Room Service & Ordering)**.
- **Cross-Vertical Logic**: Restaurant / Cinema charging and ticketing.

---

## 3. Architecture & Data Ownership Model

Front Office is strictly an **orchestration and view layer**. It introduces **zero duplicate database tables** and does not create redundant copies of reservations, stays, or rooms:

```text
               ┌────────────────────────────────────────────────────────┐
               │         Front Office Aggregate Service                 │
               │       (src/lib/hotel/front-office-service.ts)          │
               └───────────────────────┬────────────────────────────────┘
                                       │
            ┌──────────────────────────┼─────────────────────────┐
            ▼                          ▼                         ▼
   ┌─────────────────┐       ┌──────────────────┐      ┌──────────────────┐
   │  Reservations   │       │   Active Stays   │      │ Physical Rooms   │
   │ (Slice 2 Table) │       │ (Slice 3 Table)  │      │ (Slice 1 Table)  │
   └─────────────────┘       └──────────────────┘      └──────────────────┘
            │                          │                         │
            ▼                          ▼                         ▼
   hotel_reservations             hotel_stays               hotel_rooms
```

### Authoritative State Machine Preservation
- **Check-in Action**: Front Office triggers the authoritative endpoint `POST /api/v1/hotel/reservations/[id]/check-in`. It does not modify stay records directly.
- **Check-out Action**: Front Office triggers the authoritative endpoint `POST /api/v1/hotel/stays/[id]/check-out`. It does not release rooms directly.
- **Occupancy Invariant**: Active stays in `hotel_stays` remain the sole source of truth for physical room occupancy.

---

## 4. Single-Query Operational API Design

To eliminate N+1 latency, the Front Office workspace communicates through a single aggregated endpoint:

```http
GET /api/v1/hotel/front-office?outletId={outletId}&search={optionalSearchTerm}
```

### Security Pipeline
1. **Authentication**: Validates Bearer JWT with staff session type (`401 UNAUTHORIZED` if missing).
2. **Tenant Isolation**: Resolves tenant ID directly from verified JWT claims; cross-tenant query leakage is mathematically impossible.
3. **Module Entitlement**: Validates that the tenant is entitled to `HOTEL` (`403 MODULE_NOT_ENTITLED` if missing).
4. **RBAC Permission**: Requires `hotel.read` (`403 PERMISSION_DENIED` if absent).
5. **Property Scoping**: Verifies that `outletId` belongs to the requesting tenant (`404 RESOURCE_NOT_FOUND` if mismatched or nonexistent).

### Response Schema Structure
```json
{
  "success": true,
  "data": {
    "kpis": {
      "todayArrivalsCount": 3,
      "todayDeparturesCount": 2,
      "activeStaysCount": 5,
      "totalRoomsCount": 24,
      "availableCleanRoomsCount": 14,
      "availableDirtyRoomsCount": 3,
      "occupiedRoomsCount": 5,
      "outOfServiceRoomsCount": 2,
      "occupancyRatePct": 21,
      "attentionItemsCount": 2
    },
    "arrivals": [...],
    "departures": [...],
    "inHouse": [...],
    "attentionItems": [
      {
        "id": "att-unassigned-res-123",
        "type": "UNASSIGNED_ARRIVAL",
        "severity": "warning",
        "title": "Unassigned Room for Jane Doe",
        "description": "Arrival RES-2026-0042 (Deluxe Suite) requires a room allocation before check-in.",
        "targetId": "res-123",
        "actionLabel": "Assign Room",
        "actionHref": "/hotel/reservations"
      }
    ],
    "roomReadiness": {
      "cleanAvailable": 14,
      "dirtyAvailable": 3,
      "occupied": 5,
      "outOfService": 2,
      "cleaning": 0,
      "inspected": 2
    }
  },
  "meta": {
    "requestId": "req_a1b2c3d4e5f6",
    "timestamp": "2026-09-27T13:45:00.000Z",
    "outletId": "outlet-456"
  }
}
```

---

## 5. UI/UX Implementation & Accessibility

The Front Office console is built in `src/app/hotel/front-office/page.tsx` adhering to the Phase 4 ASSO design system:

1. **KPI Overview Grid**: 4 primary KPI cards (Today's Arrivals, Today's Departures, Active In-House, Available Clean Rooms) with secondary badges for dirty/occupied/out-of-service rooms.
2. **Attention Queue Alert**: Dismissible/actionable priority panel that surfaces real operational friction points directly to the front desk.
3. **Workspace Tab Navigation**: Accessible tabbed interface switching smoothly between:
   - **Arrivals**: Reservation cards with guest details, stay duration, room allocation badges, and Check-In dialog launcher.
   - **Departures**: Departure tracking with scheduled departure time, overdue warnings, and Check-Out dialog launcher.
   - **In-House Stays**: Active roster with searchable filters, floor numbers, guest counts, and direct links.
   - **Room Readiness Matrix**: Visual inventory rack showing each room's combined operational status and housekeeping readiness state.
4. **Integrated Operational Dialogs**:
   - Direct modal Check-in with room selection from clean available inventory.
   - Direct modal Check-out with departure notes and room release confirmation.
5. **Responsive Breakdown**:
   - Desktop (>= 1024px): Multi-column KPI grid and dense operational tables.
   - Tablet (640px–1024px): 2-column KPI grid and responsive card layout.
   - Mobile (< 640px): Single-column stack, minimum 44px touch targets, and collapsible metadata.

---

## 6. Realtime Architecture

Front Office listens to the platform's tenant-scoped Server-Sent Events (SSE) stream at `/api/v1/realtime`. When any of the following authoritative domain events are emitted:
- `reservation.created` / `reservation.updated`
- `hotel.checkin` (emitted on Slice 3 check-in)
- `hotel.checkout` (emitted on Slice 3 check-out)
- `room.status_changed` / `room.housekeeping_changed`

The Front Office console automatically triggers an optimistic, debounced re-fetch of the aggregate summary, keeping all front-desk workstations in sync without full page reloads.

---

## 7. Verification & Automated Test Coverage

### Automated Test Suites
- **Unit & Integration Suite**: `tests/integration/hotel-slice4-front-office.test.ts` (8 dedicated integration tests).
- **Security & Authorization**:
  - `401 UNAUTHORIZED` on missing Bearer token.
  - `403 MODULE_NOT_ENTITLED` on tenant lacking `HOTEL` entitlement.
  - `403 PERMISSION_DENIED` on user missing `hotel.read`.
  - `404 RESOURCE_NOT_FOUND` on invalid or cross-tenant property outlet ID.
- **Operational Lifecycle**:
  - Verified confirmed reservation appears in today's arrivals.
  - Check-in moves reservation out of arrivals into active in-house stays and transitions physical room status to `OCCUPIED`.
  - Check-out completes stay, removes it from in-house stays, and releases room to `AVAILABLE` + `DIRTY`.
- **Full Regression**:
  - Re-verified all Slice 1, Slice 2, Slice 3, foundation security, and state machine suites against live Supabase PostgreSQL (`jtixaywlxkfgtgclgcka.supabase.co`).
  - Total test count across repository: **15 test files, 110 passed tests, 0 failures**.

---

## 8. Summary of Approved Roadmap Alignment

| Slice | Name | Status |
| :--- | :--- | :--- |
| **Slice 1** | Property + Room Types + Rooms | ✅ Complete (`7c9045d`) |
| **Slice 2** | Guests + Reservations | ✅ Complete (`46e7080`) |
| **Slice 3** | Check-in + Stay + Occupancy + Check-out | ✅ Complete (`ef1a935`) |
| **Slice 4** | Front Office Operations | ✅ Complete (`feature/phase7-hotel-slice4`) |
| **Slice 5** | Housekeeping | ⏳ Next |
| **Slice 6** | Maintenance + Service Requests | ⏳ Future |
| **Slice 7** | QR + Customer Experience | ⏳ Future |
| **Slice 8** | Room Service + Ordering | ⏳ Future |
| **Slice 9** | Hotel Folio + Billing | ⏳ Future |
