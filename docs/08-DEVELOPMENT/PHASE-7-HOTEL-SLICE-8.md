# ASSO — Phase 7 Hotel Vertical: Slice 8 (Room Service & F&B Ordering)

## 1. Executive Summary

Hotel Slice 8 delivers the end-to-end Food & Beverage (F&B) In-Room Dining workflow for ASSO, extending the shared ordering and catalog architectures rather than creating a hotel-specific silo.

The lifecycle bridges the authenticated room customer experience to the staff kitchen fulfillment console:
```text
Room QR Code / Customer Session
              ↓
   Hotel Room Context & Active Stay
              ↓
      Hotel F&B Catalog
              ↓
  Menu Item Availability (86 Controls)
              ↓
  Customer Cart (Room-Session Bound)
              ↓
Room Service Order (Price Snapshotting + 5% GST)
              ↓
 Staff Order Acceptance & Kitchen Prep
              ↓
       Tray Packing & Dispatch
              ↓
 Delivered (Customer Realtime SSE Status)
```

---

## 2. Architectural Boundaries & Domain Ownership

Per ASSO architecture rules, domain ownership is strictly partitioned across shared core engines and vertical adaptations:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ SHARED CATALOG ENGINE                                                       │
│ • Catalog definitions, hierarchical categories, menu items, 86 availability  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│ SHARED ORDERING & FULFILLMENT ENGINE                                        │
│ • Orders, order items, status state machine, price snapshots, tax records   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────────┐
│ HOTEL VERTICAL (SLICE 8)                                                    │
│ • Room context resolution (hotel_rooms -> business_contexts)                │
│ • Active Stay validation (hotel_stays.status = 'ACTIVE')                    │
│ • Room service menu taxonomy & default item configurations                  │
│ • Staff kitchen console (/hotel/room-service)                               │
│ • Customer mobile ordering portal (/hotel/guest/room-service)               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Strict Boundaries:
1. **Payment Boundary**: No payment collection, card charges, UPI gateways, or payment processing are implemented in Slice 8. Order totals and tax amounts are calculated for financial snapshot integrity, but settlement belongs to Slice 9.
2. **Folio Boundary**: No financial ledger postings or room folio charges are recorded in Slice 8. Context metadata (`stayId`, `roomId`) is stored to support automatic folio posting in Slice 9.
3. **Inventory Boundary**: Automatic Recipe/BOM stock depletion is intentionally deferred per platform decision. Manual catalog item availability toggles (86-ing) provide operational availability control without speculative stock deductions.
4. **Vertical Boundary**: No Restaurant dining tables, Restaurant KDS, or Cinema concession workflows are included.

---

## 3. Order Lifecycle State Machine

ASSO implements a server-enforced state machine in `src/lib/ordering/order-state-machines.ts`:

```text
               ┌──────────┐
               │  PLACED  │ ◄── (Customer Cart Submitted)
               └────┬─────┘
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
   ┌──────────┐          ┌───────────┐
   │ ACCEPTED │          │ CANCELLED │ ◄── (Customer or Staff Cancellation)
   └────┬─────┘          └───────────┘
        ▼
  ┌───────────┐
  │ PREPARING │ ◄── (Kitchen Prep Begun — Customer Cancellation Blocked)
  └─────┬─────┘
        ▼
    ┌───────┐
    │ READY │ ◄── (Plated on Tray)
    └───┬───┘
        ▼
┌──────────────────┐
│ OUT_FOR_DELIVERY │ ◄── (En Route to Room)
└───────┬──────────┘
        ▼
  ┌───────────┐
  │ DELIVERED │ ◄── (Delivered to Guest Room)
  └───────────┘
```

### Status Terminology Mapping:

| Internal Core Status | Customer Display Status | Staff Console Display | Allowed Next Transitions |
| :--- | :--- | :--- | :--- |
| `PLACED` | Received | New Order | `ACCEPTED`, `CANCELLED` |
| `ACCEPTED` | Preparing | Accepted | `PREPARING`, `CANCELLED` |
| `PREPARING` | Preparing | Cooking / In Kitchen | `READY`, `CANCELLED` |
| `READY` | Ready | Ready for Dispatch | `OUT_FOR_DELIVERY` |
| `OUT_FOR_DELIVERY` | On the way | En Route to Room | `DELIVERED` |
| `DELIVERED` | Delivered | Delivered | *(Terminal state)* |
| `CANCELLED` | Cancelled | Cancelled | *(Terminal state)* |

---

## 4. Financial Snapshotting & Integrity

To guarantee financial correctness, catalog prices are **never** queried to reconstruct historical orders:
1. When an order is submitted, the server queries active catalog item rows and computes line subtotal, 5% standard GST tax, and total amounts.
2. The item's exact unit price at that exact second is snapshotted into `order_items.unit_price`.
3. If an item's catalog base price is modified in the future, all existing orders retain their original historical snapshotted amounts.
4. The client cannot supply custom prices, discounts, or tax overrides.

---

## 5. Security & Isolation Pipeline

### Staff Operations:
```text
Staff JWT Token
  ↓
Tenant Context Validation (DEMO_TENANT_ID)
  ↓
Hotel Module Entitlement Check ("HOTEL")
  ↓
RBAC Check ("hotel.read", "hotel.rooms.manage")
  ↓
Property / Outlet Scope Enforcement
  ↓
Fulfillment Mutation / 86 Item Toggle
```

### Customer Operations:
```text
Customer Session Token (from Room QR Resolution)
  ↓
Tenant Isolation (customer_sessions.tenant_id)
  ↓
Property & Room Context Check (customer_sessions.context_id)
  ↓
Active In-House Stay Verification (hotel_stays.status = 'ACTIVE')
  ↓
IDOR Shield (Room A customer cannot access or mutate Room B orders)
  ↓
Idempotency Check (same key + payload → safe replay; different payload → 409 conflict)
```

---

## 6. API Surface Summary

| Route | Method | Target Persona | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/v1/customer/room-service/menu` | `GET` | Customer | Retrieve in-room dining catalog filtered for active/available items |
| `/api/v1/customer/room-service/orders` | `GET` | Customer | List historical and active orders for authenticated room |
| `/api/v1/customer/room-service/orders` | `POST` | Customer | Submit room service order with price snapshotting and idempotency |
| `/api/v1/customer/room-service/orders/[id]` | `GET` | Customer | View detailed order breakdown with lines and status history |
| `/api/v1/customer/room-service/orders/[id]/cancel` | `POST` | Customer | Cancel order (allowed only before preparation begins) |
| `/api/v1/hotel/room-service/menu` | `GET` | Staff | Retrieve full F&B catalog including unavailable/86 items |
| `/api/v1/hotel/room-service/menu/[id]/availability` | `PATCH` | Staff | Toggle 86 / Sold Out availability status on any menu item |
| `/api/v1/hotel/room-service/orders` | `GET` | Staff | List property-scoped room service orders |
| `/api/v1/hotel/room-service/orders/[id]` | `GET` | Staff | View order detail for kitchen and tray packing |
| `/api/v1/hotel/room-service/orders/[id]/status` | `POST` | Staff | Advance order fulfillment status (`ACCEPTED` $\rightarrow$ `DELIVERED`) |

---

## 7. Realtime SSE Broadcast Architecture

Event streams are strictly context-isolated using `RealtimeHub`:
- **Customer Updates**: Emitted to specific room context (`broadcastToContext(tenantId, contextId, "order.updated", ...)`). No room receives status events from another room.
- **Staff Console Updates**: Emitted to property tenant stream (`broadcastToTenant(tenantId, "hotel.room_service.order_updated", ...)`).
- **Zero External Broker**: SSE streams run over standard HTTP with connection lifecycle management and dead socket cleanup.

---

## 8. Verification & Test Evidence

| Test Suite | Test Count | Pass Rate | Scope |
| :--- | :--- | :--- | :--- |
| `tests/unit/hotel-order-state-machines.test.ts` | 16 tests | 100% PASS | State machine transitions, cancellation windows, display mappings |
| `tests/integration/hotel-slice8-room-service.test.ts` | 9 tests | 100% PASS | Catalog retrieval, 86 availability, price snapshotting, idempotency, staff fulfillment, cancellation |
| `tests/security/room-service-security.test.ts` | 5 tests | 100% PASS | Customer token blocked on staff APIs, cross-room IDOR shield, active stay requirement |
| `scripts/verify-supabase-native-rls.ts` | 11 tests | 100% PASS | Live Supabase native PostgreSQL RLS verification across tenants |

- `npm run typecheck`: **0 errors (Clean)**
- `npm run build`: **Compiled successfully (21/21 static & dynamic routes)**
