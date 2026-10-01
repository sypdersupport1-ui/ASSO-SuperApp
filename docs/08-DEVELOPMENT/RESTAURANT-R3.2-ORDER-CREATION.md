# ASSO — RESTAURANT R3.2: SERVER-AUTHORITATIVE ORDER CREATION
**Canonical Architecture & Implementation Specification**

---

## 1. Architectural Mandate & Principle

> **Core Invariant**:  
> *"The client never determines authoritative order success, price, total, table context, or order status."*

In accordance with the **Server-Side Authority** and **Shared Engines Over Duplication** doctrines outlined in [`AGENTS.md`](file:///Users/apple/Downloads/asso%20super%20app/AGENTS.md), Restaurant Vertical Slice 3.2 implements the first production order-creation transaction for the Restaurant vertical.

The browser is an untrusted presentation surface. All financial calculations, item availability, dining session verification, physical table context mapping, and order status transitions are executed and validated strictly on the server within an atomic PostgreSQL transaction.

```text
Customer Device (Untrusted)
       │ (Submits Place Order request with session token & notes)
       ▼
[ POST /api/v1/restaurant/orders ]
       │ 1. Verify Customer Session Token & RESTAURANT Module Entitlement
       │ 2. Check Idempotency Key (Cache Replay Guard)
       │ 3. Resolve Physical Table from QR Context
       │ 4. Verify Active Dining Session (restaurant_table_sessions)
       │ 5. Read Authoritative Pre-Order Cart (restaurant_cart_items)
       │ 6. Batch Validate Catalog Items (Existence, Availability, Active Menu)
       │ 7. Server-Side Price Snapshot & Tax Calculation (Ignore client pricing)
       │ 8. Generate Human-Readable Order Number (RO-YYYYMMDD-XXXX)
       ▼
Atomic PostgreSQL Transaction (BEGIN ... COMMIT)
       ├── Insert Order Header (orders)
       ├── Insert Line Items with Price Snapshots (order_items)
       ├── Insert Order Status History (order_status_history)
       ├── Atomically Clear Pre-Order Cart (restaurant_cart_items)
       └── Record Trusted ORDER_CONFIRMED Event (domain_outbox_events)
       ▼
Post-Commit Asynchronous Pipeline
       ├── Audit Event Logging (recordAuditEvent)
       ├── Realtime Broadcast via SSE (realtimeHub)
       └── Outbox Batch Dispatch Trigger (processOutboxBatch)
```

---

## 2. Context & Table Session Resolution

Customer ordering does not rely on staff RBAC permissions; it operates under a cryptographic **Customer Session** established when scanning a physical table QR code.

1. **Tenant & Outlet Context**: Derived authoritatively from `customer_sessions.tenantId` and `customer_sessions.outletId`. Client headers attempting to override tenant or outlet context are rejected.
2. **Physical Table Resolution**:
   - `customer_sessions.contextId` maps 1:1 to `business_contexts.contextId`.
   - `restaurant_tables` is queried via `(contextId, tenantId, outletId)`.
   - If the table is not found, inactive, or `OUT_OF_SERVICE`, order placement is immediately rejected.
3. **Active Table Dining Session Verification**:
   - Standalone restaurant dine-in orders require an active dining session.
   - The server queries `restaurant_table_sessions` for `(tableId, tenantId, outletId)` with `status = 'ACTIVE'`.
   - If no active table session exists (e.g., the party has not been seated by staff or the session was closed), the order is rejected with `422 Unprocessable Entity` (`BusinessRuleError`).
   - Multiple sequential orders (Round 1: Drinks/Starters, Round 2: Mains, Round 3: Desserts) can be created under the **same active table session**.

---

## 3. Authoritative Pricing & Total Calculation

The server never accepts or trusts client-submitted monetary values:

1. **Pre-Order Cart Source**: The order lines are read directly from server-side database storage (`restaurant_cart_items` for the customer's `sessionId`).
2. **Re-Validation Against Live Catalog**:
   - The server queries `catalog_items`, joining `catalog_categories` and `catalogs`.
   - Re-checks that every item is active and available (`is_available = true`).
   - If any item in the cart is sold out or belongs to an inactive category, the order is rejected with a structured error, requiring the customer to adjust their cart.
3. **Immutable Historical Price Snapshots**:
   - `unit_price` is copied directly from `catalog_items.base_price` (stored with `numeric(14, 4)` precision).
   - Line subtotal = `unit_price * quantity`.
   - Order subtotal = `sum(line subtotals)`.
   - Order tax = `subtotal * 0.05` (5% GST F&B dining rate).
   - Order total = `subtotal + tax`.
   - Future catalog price changes do not mutate historical order item prices.

---

## 4. Idempotency & Concurrency

To protect against duplicate order submission (e.g. double taps, network timeouts, automated retries):

1. **Client Header**: The client passes an `Idempotency-Key` header (or JSON payload field).
2. **Database Unique Index**: `orders` enforces `uq_orders_tenant_idempotency` on `(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.
3. **Safe Replay**: If a mutation with an existing idempotency key is received, the service fetches the existing committed order and returns the identical response with HTTP 200/201 without creating duplicate orders or firing duplicate side-effects.

---

## 5. Atomicity & Cart Lifecycle

Order creation and cart clearing are executed inside a single PostgreSQL transaction (`db.transaction`):

- **Success**: The order and order items are inserted, order status history is written, the pre-order cart is purged (`DELETE FROM restaurant_cart_items WHERE session_id = ...`), and the outbox event is recorded.
- **Rollback on Error**: If any validation or database constraint fails, PostgreSQL rolls back the transaction. The customer's cart remains intact and recoverable.

---

## 6. Communication & KDS Boundaries

1. **Communication Boundary (Phase 8 Parity)**:
   - Slice 3.2 does **not** directly invoke SMS or WhatsApp providers or in-app notification adapters.
   - It writes an `ORDER_CONFIRMED` event into `domain_outbox_events` within the transaction.
   - Asynchronous batch processing is triggered post-commit.
2. **KDS Task Generation Boundary (R3.3)**:
   - Order items are inserted with `item_status = 'PLACED'`, UUID primary keys (`order_item_id`), and station tags (`fulfillment_station: 'KITCHEN' | 'TANDOOR' | 'BAR'`).
   - In Slice 3.3, the KDS task engine will read these items and spawn station tasks.

---

## 7. Hotel Room Service Compatibility

Hotel Room Service continues to function independently:
- Hotel Room Service uses `dining_context = 'ROOM_SERVICE'`, referencing `hotel_stays` and `hotel_rooms`.
- Restaurant orders use `dining_context = 'DINE_IN'`, referencing `restaurant_tables` and `restaurant_table_sessions`.
- Standalone restaurant orders have **zero dependency** on hotel rooms, hotel folios, or guest check-in.
- All 131 Hotel regression tests remain green.

---

## 8. API Specification

### `POST /api/v1/restaurant/orders`
Creates an authoritative restaurant order from the customer's active session cart.

#### Request Headers
- `Authorization: Bearer <customerSessionToken>` (Required)
- `Idempotency-Key: <unique-key>` (Recommended)
- `Content-Type: application/json`

#### Request Body (Optional)
```json
{
  "guestNotes": "Please make biryani medium spicy",
  "idempotencyKey": "idemp-client-12345"
}
```

#### Response (`201 Created` / `200 OK` on Idempotent Replay)
```json
{
  "success": true,
  "data": {
    "orderId": "c8d0a421-4f1e-4cb3-9110-38827f8a31e8",
    "orderNumber": "RO-20261001-4921",
    "status": "PLACED",
    "displayStatus": "Received",
    "tableNumber": "T1",
    "tableSessionId": "7b82f910-410a-4123-bc92-918230192834",
    "customerId": "81203912-1029-4821-bc10-182930192830",
    "customerName": "Vikramaditya Roy",
    "diningContext": "DINE_IN",
    "orderSource": "CUSTOMER_WEB",
    "subtotalAmount": "890.00",
    "taxAmount": "44.50",
    "discountAmount": "0.00",
    "totalAmount": "934.50",
    "itemCount": 2,
    "items": [
      {
        "orderItemId": "11928301-3829-4102-bc10-192830192830",
        "itemId": "48102930-1928-4821-bc10-192830192831",
        "itemName": "Dum Handi Mutton Biryani",
        "unitPrice": "650.00",
        "quantity": 1,
        "subtotal": "650.00",
        "fulfillmentStation": "KITCHEN",
        "specialNotes": "Medium spicy"
      },
      {
        "orderItemId": "22928301-3829-4102-bc10-192830192832",
        "itemId": "58102930-1928-4821-bc10-192830192833",
        "itemName": "Garlic Butter Naan",
        "unitPrice": "120.00",
        "quantity": 2,
        "subtotal": "240.00",
        "fulfillmentStation": "TANDOOR",
        "specialNotes": "Extra crispy"
      }
    ],
    "guestNotes": "Please make biryani medium spicy",
    "createdAt": "2026-10-01T13:45:00.000Z"
  },
  "meta": {
    "requestId": "req_819203918203",
    "timestamp": "2026-10-01T13:45:00.123Z"
  }
}
```

### `GET /api/v1/restaurant/orders`
Retrieves order history for the active dining session.

---

## 9. Quality & Verification Gates

| Test Suite / Quality Gate | Coverage | Result |
|---|---|---|
| **R3.2 Order Creation Integration Suite** | 31 test scenarios | **31 / 31 passed (100%)** |
| **R3.1 Order Domain Integration Suite** | 19 test scenarios | **19 / 19 passed (100%)** |
| **R2 Digital Menu & QR Integration Suite** | 28 test scenarios | **28 / 28 passed (100%)** |
| **R1 Table Management Integration Suite** | 26 test scenarios | **26 / 26 passed (100%)** |
| **Phase 8 Events & Outbox Suite** | 11 test scenarios | **11 / 11 passed (100%)** |
| **Security & IDOR Suite** | 7 files / 42 tests | **42 / 42 passed (100%)** |
| **Native Supabase PostgreSQL & RLS Audit** | 11 checks | **11 / 11 passed (100%)** |
| **Hotel Room Service & Master QA Suites** | 25 tests | **25 / 25 passed (100%)** |
| **TypeScript Typecheck (`tsc --noEmit`)** | Zero type errors | **Passed Cleanly** |
| **Next.js Production Build (`next build`)** | All routes compiled | **Compiled 100%** |
