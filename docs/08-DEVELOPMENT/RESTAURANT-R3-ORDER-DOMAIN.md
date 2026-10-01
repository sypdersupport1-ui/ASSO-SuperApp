# ASSO — RESTAURANT R3.1: ORDER DOMAIN + DATABASE FOUNDATION
**Canonical Architecture & Domain Specification**

---

## 1. Overview & Architectural Principle

ASSO strictly adheres to the **Shared Engines Over Duplication** doctrine outlined in [`AGENTS.md`](file:///Users/apple/Downloads/asso%20super%20app/AGENTS.md). Restaurant ordering does not create a disjointed, siloed order subsystem (e.g. `restaurant_orders` or `restaurant_order_items`). Instead, ASSO reuses and extends the authoritative **Shared Ordering Engine** (`orders` and `order_items` in [`src/db/schema/operations.ts`](file:///Users/apple/Downloads/asso%20super%20app/src/db/schema/operations.ts)).

This slice establishes the authoritative Restaurant order data model on top of the shared Ordering architecture without introducing speculative features or prematurely implementing UI.

```text
Restaurant (Outlet)
       ↓
Restaurant Table
       ↓
Active Table Session
       ↓
Shared Order (dining_context = 'DINE_IN', table_id, table_session_id)
       ├── Order Item 1 (Price snapshot, station = 'KITCHEN')
       ├── Order Item 2 (Price snapshot, station = 'TANDOOR')
       └── Order Item 3 (Price snapshot, station = 'BAR')
```

---

## 2. Order Ownership & Hierarchy

1. **Tenant & Outlet Scoping**: Every order is strictly scoped to a `tenant_id` and `outlet_id`. Cross-tenant order leakage is prohibited at the database level via native PostgreSQL Row-Level Security (RLS).
2. **Physical Context**:
   - `Restaurant Table`: Physical dining table belonging to the outlet.
   - `Restaurant Table Session`: Active dining session established when guests are seated.
   - `Shared Order`: Placed under the active table session.
3. **No Folio / Stay Coupling**: Standalone restaurant orders have **zero coupling** to hotel stays, rooms, or folios (`hotel_stays`, `hotel_rooms`, `folios`). Hotel Restaurant integration will occur in a dedicated later phase; standalone dine-in orders require only the table session context.

---

## 3. Order / Table-Session Relationship

- **1-to-Many Relationship**: One active table session can accumulate **multiple sequential orders**.
  - *Example Dining Flow*:
    - Round 1: Appetizers & Drinks (`Order #RO-20261001-0001`)
    - Round 2: Main Courses & Breads (`Order #RO-20261001-0002`)
    - Round 3: Desserts & Coffee (`Order #RO-20261001-0003`)
- **No 1:1 Constraint**: `table_session_id` in `orders` is indexed (`idx_orders_tenant_table_session`) but intentionally **not** constrained to unique.
- All orders under a session share the same `table_session_id` and `table_id`, allowing kitchen and floor staff to view the holistic dining state and allowing R6 (Billing) to aggregate all session orders into a unified final bill.

---

## 4. Shared Customer Relationship

- Restaurant orders integrate directly with the shared Customer Engine ([`src/db/schema/core.ts`](file:///Users/apple/Downloads/asso%20super%20app/src/db/schema/core.ts)) via `customer_id` referencing `customers.customer_id`.
- ASSO does **not** create a separate `restaurant_customer_id`.
- The customer identity established during R2 (QR scan & identification via name and normalized phone) links seamlessly to the order record. If a guest orders anonymously without identifying, `customer_id` remains `NULL` while retaining the table session linkage.

---

## 5. Order Sources

Orders support multiple ingestion channels across the platform. Stored in `orders.order_source`:
- `CUSTOMER_WEB`: Self-service digital ordering from customer mobile web browser (via QR session).
- `POS`: Direct order entry by floor staff or cashier at a POS terminal (implemented in R5).
- `QR_CUSTOMER`: Customer scan ordering (legacy / hotel room service parity).
- `STAFF_POS`: Direct staff ordering (shared engine parity).
- `DESK_ORDER`: Front desk / reception order placement.

The order source is verified server-side; client payloads cannot unilaterally dictate trust levels.

---

## 6. Service / Dining Context

Stored in `orders.dining_context` (default: `'DINE_IN'`):
- `DINE_IN`: Restaurant table dining with associated `table_id` and `table_session_id`.
- `ROOM_SERVICE`: Hotel in-room dining (requires `context_id` pointing to `business_contexts` of type `HOTEL_ROOM`).
- `TAKEAWAY`: Direct pickup (future commercial workflow).
- `DELIVERY`: Off-premise dispatch (future commercial workflow).

---

## 7. Order Status Lifecycle & FSM

The order lifecycle in [`src/lib/ordering/order-state-machines.ts`](file:///Users/apple/Downloads/asso%20super%20app/src/lib/ordering/order-state-machines.ts) supports the complete dine-in flow:

```text
[ PENDING / PLACED ] 
         ↓
   [ CONFIRMED ] 
         ↓
  [ IN_PREPARATION / PREPARING ] 
         ↓
[ PARTIALLY_READY ] 
         ↓
     [ READY ] 
         ↓
    [ SERVED ] 
         ↓
   [ COMPLETED ]

(Or [ CANCELLED ] prior to preparation)
```

### Cancellation Invariant
- Orders can be cancelled while in `PLACED` or `CONFIRMED` status.
- Once an order enters preparation (`PREPARING` / `IN_PREPARATION`), customer cancellation is strictly blocked to prevent food waste.

---

## 8. Order Item Foundation & KDS Future Compatibility

Each line item is stored in `order_items` with:
- `order_item_id`: Authoritative UUID primary key.
- `order_id`: Parent order reference.
- `item_id`: Reference to `catalog_items.item_id`.
- `item_name`: Immutable historical name at time of order.
- `quantity`: Integer strictly > 0 (`chk_order_items_quantity_positive`).
- `unit_price`: Immutable historical unit price (`numeric(12, 4) >= 0`).
- `subtotal`: Immutable historical line total (`numeric(12, 4) >= 0`).
- `fulfillment_station`: Destination station (`'KITCHEN'`, `'BAR'`, `'TANDOOR'`, `'DESSERT'`).
- `item_status`: Independent preparation status (`'PLACED'`, `'PREPARING'`, `'READY'`, `'SERVED'`).
- `special_notes`: Kitchen notes / modifiers.

### KDS Readiness (R3.3)
Because each item has its own UUID primary key and `fulfillment_station`, R3.3 can decompose an order into discrete station tasks (e.g. Biryani to `KITCHEN`, Garlic Naan to `TANDOOR`, Drinks to `BAR`). KDS updates item preparation status without needing to mutate the parent order header prematurely.

---

## 9. Price Snapshot & Financial Precision

- **Immutable Snapshots**: Catalog item prices fluctuate over time. When an order item is created, its `unit_price`, `item_name`, and calculated `subtotal` are frozen into `order_items`. Future menu price updates will never alter historical orders.
- **Server Calculation**: Client submissions of price, subtotal, tax, or total are never trusted. R3.2 calculates all monetary amounts from server-authoritative catalog records.
- **Precision Conventions**: All monetary fields use PostgreSQL `numeric(12, 4)` and non-negative CHECK constraints.

---

## 10. Separation of Concerns: Order ≠ Bill ≠ Payment

ASSO maintains strict domain boundaries:
```text
ORDER (R3)           ≠           BILL (R6)            ≠         PAYMENT (R6)
Operational food                Fiscal invoice /               Monetary settlement
and beverage request            commercial statement           (Cash, UPI, Card, Folio)
```
- Orders are **not** linked directly to payment records.
- Multiple orders under a table session are consolidated into a bill in R6.
- Financial ledger entries are generated exclusively upon billing and payment events, never on raw order submission.

---

## 11. Hotel Room Service Compatibility

Hotel Room Service orders continue using the identical shared `orders` and `order_items` tables:
- `dining_context`: `'ROOM_SERVICE'`
- `context_id`: UUID of the Hotel Room business context
- `table_id`: `NULL`
- `table_session_id`: `NULL`

All 9 Hotel slices and all existing Hotel integration tests continue to run and pass without modification.

---

## 12. Idempotency Foundation

Order creation is protected against network retries and duplicate submissions:
- `orders.idempotency_key`: Stores client-submitted operation keys (e.g. `idemp-ord-...`).
- Unique Index: `uq_orders_tenant_idempotency` on `(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.
- Duplicate submissions with the identical key within the same tenant are rejected by the database, allowing R3.2 to return cached responses safely.

---

## 13. Security, RLS & Data Integrity Constraints

### Database Constraints (Migration 0011)
- `chk_orders_subtotal_non_negative`: `subtotal_amount >= 0`
- `chk_orders_tax_non_negative`: `tax_amount >= 0`
- `chk_orders_total_non_negative`: `total_amount >= 0`
- `chk_order_items_quantity_positive`: `quantity > 0`
- `chk_order_items_unit_price_non_negative`: `unit_price >= 0`
- `chk_order_items_subtotal_non_negative`: `subtotal >= 0`
- `uq_orders_outlet_order_number`: Unique `(outlet_id, order_number)` index.
- `uq_orders_tenant_idempotency`: Unique `(tenant_id, idempotency_key)` index.

### Native PostgreSQL RLS
- All `orders` and `order_items` queries enforce `tenant_id = current_setting('app.current_tenant_id')`.
- Missing or empty tenant context fails closed (0 rows returned).
- Super Admin inspection requires explicit scoping.

---

## 14. Verification Summary

| Gate | Target | Result | Status |
|---|---|---|---|
| **R3.1 Integration Tests** | 19 tests | 19 passed (100%) | **PASS** |
| **Security Suite** | 7 files / 42 tests | 42 passed (100%) | **PASS** |
| **Native Supabase RLS Audit** | 11 checks | 11 passed (100%) | **PASS** |
| **Hotel Regression (Slices 1–9)** | 10 files / 131 tests | 131 passed (100%) | **PASS** |
| **Pre-Slice-9 Hotel Master QA** | 1 file / 16 tests | 16 passed (100%) | **PASS** |
| **Phase 8 Events & Comm** | 1 file / 11 tests | 11 passed (100%) | **PASS** |
| **Restaurant R1 (Tables)** | 1 file / 26 tests | 26 passed (100%) | **PASS** |
| **Restaurant R2 (Menu/QR)** | 1 file / 28 tests | 28 passed (100%) | **PASS** |
| **TypeScript Typecheck** | Zero errors | `tsc --noEmit` clean | **PASS** |
| **Next.js Production Build** | Zero errors | All static/dynamic routes compiled | **PASS** |

---

## 15. Scope Boundary: What R3.1 Does NOT Include

In strict adherence to the slice definition, the following are deliberately omitted and deferred:
- ❌ Customer Place Order submission UI (deferred to R3.5)
- ❌ Server-authoritative order creation endpoint (deferred to R3.2)
- ❌ KDS task generation & UI (deferred to R3.3)
- ❌ ORDER_CONFIRMED communication triggers (deferred to R3.4)
- ❌ Restaurant billing & payment records (deferred to R6)
- ❌ Inventory depletion / BOM / recipe mapping (deferred to shared inventory phase)
