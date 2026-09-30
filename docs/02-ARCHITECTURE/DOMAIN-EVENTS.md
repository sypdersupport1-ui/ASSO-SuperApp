# ASSO — Domain Events

**Phase**: 2 — Master Architecture  
**Status**: Approved for Phase 2  
**Last Updated**: 2026-09-26

---

## 1. Domain Event Principle

ASSO uses **in-process domain events** to maintain clean boundaries between modules without coupling them at the code level.

```text
Ordering Engine does not call Inventory Engine directly.
Instead: Ordering Engine publishes OrderDelivered → Inventory Engine handles the event.
```

This keeps module dependencies one-directional and allows modules to be independently tested.

**Implementation**: In-process pub/sub (not a distributed message broker). Events are processed:
- **Synchronously** (in the same request): for events where the side effect must complete before the response (e.g., billing charge must post before returning "order confirmed")
- **Asynchronously** (via background job queue): for events where the side effect can be deferred (e.g., sending a notification after an order is placed)

---

## 2. Transactional Safety

Events that trigger database writes use the "outbox" pattern:

```text
1. Domain operation starts DB transaction
2. Insert domain record (e.g., Order)
3. Insert job into job queue table (same transaction)
4. Transaction commits
5. Background worker picks up job → processes → marks done
```

If the application crashes after step 4, the job remains in the queue and will be retried. No events are lost.

---

## 3. Event Catalog

### 3.1 Authentication & Identity Events

| Event | Producer | Consumers | Processing |
|---|---|---|---|
| `UserCreated` | Identity Engine | Notification Engine, Audit | Async |
| `UserDeactivated` | Identity Engine | Auth session invalidation, Audit | Sync |
| `LoginSucceeded` | Identity Engine | Audit | Async |
| `LoginFailed` | Identity Engine | Audit, Rate Limiter | Async |
| `PasswordChanged` | Identity Engine | Notification Engine, Audit | Async |

---

### 3.2 Tenant & Organization Events

| Event | Producer | Consumers | Processing |
|---|---|---|---|
| `OrganizationCreated` | Tenancy Engine | Notification Engine (welcome), Audit | Async |
| `OutletCreated` | Tenancy Engine | Config Engine (set defaults), Audit | Sync |
| `OutletStatusChanged` | Tenancy Engine | Module Engine (suspend if needed), Audit | Async |
| `ModuleEnabled` | Module Engine | Config Engine, Audit, Cache Bust | Sync |
| `ModuleDisabled` | Module Engine | Audit, Cache Bust | Sync |

---

### 3.3 Customer & Session Events

| Event | Producer | Consumers | Processing |
|---|---|---|---|
| `QRResolved` | QR Engine | Session Engine (create session), Audit | Sync |
| `CustomerSessionCreated` | Session Engine | Audit | Async |
| `CustomerSessionExpired` | Session Engine | Audit | Async |
| `CustomerSessionInvalidated` | Session Engine | Audit, Customer Engine (update last-seen) | Async |

---

### 3.4 Order Events

| Event | Producer | Consumers | Processing |
|---|---|---|---|
| `OrderCreated` | Ordering Engine | Fulfillment (route), Billing (post charge), Audit, Notification | Sync (billing) / Async (notification) |
| `OrderConfirmed` | Ordering Engine | Fulfillment Engine, Notification Engine | Async |
| `OrderModified` | Ordering Engine | Fulfillment (update), Billing (adjust), Audit | Sync |
| `OrderCancelled` | Ordering Engine | Fulfillment (cancel), Billing (void charge), Audit, Notification | Sync (billing) / Async (notification) |
| `OrderReadyForDelivery` | Fulfillment Engine | Notification Engine (customer + staff), Audit | Async |
| `OrderDelivered` | Fulfillment Engine | Ordering Engine (close), Billing (finalize), Audit | Sync |
| `OrderClosed` | Ordering Engine | Reporting Engine, Audit | Async |

**Payload** (OrderCreated):
```json
{
  "eventType": "OrderCreated",
  "eventId": "evt_abc",
  "tenantId": "org_xyz",
  "outletId": "outlet_abc",
  "orderId": "order_123",
  "contextId": "table_7",
  "contextType": "TABLE",
  "createdBy": { "type": "CUSTOMER", "sessionId": "sess_abc" },
  "totalAmount": 450,
  "currency": "INR",
  "itemCount": 3,
  "occurredAt": "2026-09-26T08:30:00Z"
}
```

---

### 3.5 Payment Events

| Event | Producer | Consumers | Processing |
|---|---|---|---|
| `PaymentInitiated` | Payment Engine | Audit | Async |
| `PaymentCompleted` | Payment Engine | Billing Engine (settle charges), Cash Management, Audit, Notification | Sync (billing) / Async (rest) |
| `PaymentFailed` | Payment Engine | Notification Engine, Audit | Async |
| `PaymentWebhookReceived` | Payment Engine | Payment Engine (internal handler) | Async (background job) |
| `RefundInitiated` | Payment Engine | Audit | Async |
| `RefundCompleted` | Payment Engine | Billing Engine (credit entry), Notification, Audit | Sync (billing) / Async (rest) |

---

### 3.6 Service Request Events

| Event | Producer | Consumers | Processing |
|---|---|---|---|
| `ServiceRequestCreated` | SR Engine | Notification Engine (staff), Audit | Async |
| `ServiceRequestAssigned` | SR Engine | Notification Engine (assignee), Audit | Async |
| `ServiceRequestCompleted` | SR Engine | Billing Engine (if chargeable), Notification (customer), Audit | Async |
| `ServiceRequestCancelled` | SR Engine | Notification Engine, Audit | Async |

---

### 3.7 Inventory Events

| Event | Producer | Consumers | Processing |
|---|---|---|---|
| `StockReceived` | Inventory Engine | Reporting Engine, Audit | Async |
| `StockConsumed` | Inventory Engine | Reporting Engine, Audit | Async |
| `StockTransferred` | Inventory Engine | Reporting Engine, Audit | Async |
| `StockAdjusted` | Inventory Engine | Audit (always), Reporting | Async |
| `LowStockAlert` | Inventory Engine | Notification Engine (manager), Audit | Async |
| `GoodsReceived` | Procurement Engine | Inventory Engine (create stock-in movement), Audit, Reporting | Sync (inventory) / Async (rest) |

---

### 3.8 Procurement Events

| Event | Producer | Consumers | Processing |
|---|---|---|---|
| `PurchaseOrderCreated` | Procurement Engine | Notification (if approval required), Audit | Async |
| `PurchaseOrderApproved` | Procurement Engine | Notification Engine, Audit | Async |
| `PurchaseOrderRejected` | Procurement Engine | Notification Engine, Audit | Async |
| `GoodsReceived` | Procurement Engine | Inventory Engine, Expense Engine (create payable record), Audit | Sync (inventory) |
| `PurchaseOrderClosed` | Procurement Engine | Audit, Reporting | Async |

---

### 3.9 Expense Events

| Event | Producer | Consumers | Processing |
|---|---|---|---|
| `ExpenseSubmitted` | Expense Engine | Notification Engine (if approval needed), Audit | Async |
| `ExpenseApproved` | Expense Engine | Cash Management (if cash), Reporting, Notification, Audit | Sync (cash) / Async (rest) |
| `ExpenseRejected` | Expense Engine | Notification Engine, Audit | Async |

---

### 3.10 Hotel-Specific Events

| Event | Producer | Consumers | Processing |
|---|---|---|---|
| `GuestCheckedIn` | Hotel — Stays | Session Engine (create), Folio Engine (open folio), QR Engine (activate), Notification, Audit | Sync (session, folio) |
| `GuestCheckedOut` | Hotel — Stays | Session Engine (invalidate), Folio Engine (finalize), Housekeeping (create task), Room Engine (update status), Notification, Audit | Sync (session, folio) |
| `HousekeepingTaskCreated` | Hotel — Housekeeping | Notification Engine (assigned staff), Audit | Async |
| `HousekeepingTaskCompleted` | Hotel — Housekeeping | Room Engine (update status), Audit | Sync |
| `FolioChargePosted` | Hotel — Folio | Billing Engine (record), Audit | Sync |

---

### 3.11 Restaurant-Specific Events

| Event | Producer | Consumers | Processing |
|---|---|---|---|
| `TableOccupied` | Restaurant — Tables | Session Engine (activate sessions), Audit | Sync |
| `TableCleared` | Restaurant — Tables | Session Engine (invalidate sessions), Audit | Sync |
| `TableReservationCreated` | Restaurant — Reservations | Notification Engine, Audit | Async |

---

### 3.12 Cinema-Specific Events

| Event | Producer | Consumers | Processing |
|---|---|---|---|
| `ShowStarted` | Cinema — Shows | Audit | Async |
| `ShowEnded` | Cinema — Shows | Session Engine (invalidate seat sessions), Audit | Sync |

---

## 4. Event Idempotency

Every event handler must be idempotent. If the same event is delivered twice (due to retry), the handler must not produce double-effects:

- Check if the event has already been processed using `eventId`
- If already processed, return success without re-executing side effects
- Store processing state in the `processed_events` table

```text
processed_events = {
  event_id    — the event's unique ID
  event_type
  processed_at
  handler     — which module handled it
  result      — SUCCESS | FAILED | SKIPPED
}
```

---

## 5. Event Payload Guidelines

All domain events include:
- `eventType` — machine-readable event name
- `eventId` — unique identifier for this event occurrence
- `tenantId` — always tenant-scoped
- `outletId` — always outlet-scoped
- `occurredAt` — timestamp of when the business event occurred (not when the event was enqueued)
- Entity-specific identifiers needed by consumers
- Minimal payload — consumers should query additional data if needed, not receive the full entity

Events must not contain sensitive data (e.g., full payment card numbers, passwords).

---

## 6. Phase 8 Slice 1: Transactional Outbox & Communication Architecture

In Phase 8 Slice 1, ASSO implemented the durable PostgreSQL Transactional Outbox pattern and unified Communication Engine:

```text
Business Transaction
    ↓
Authoritative Server Validation
    ↓
Atomic Database Commit (BEGIN ... business mutation + outbox row ... COMMIT)
    ↓
Trusted Domain Event (domain_outbox_events)
    ↓
Communication Processing Engine
    ├── In-App Adapter (Active & Durable: in_app_notifications)
    ├── SMS / TRAI DLT Adapter (Architecture-Ready Stub)
    └── WhatsApp Cloud API Adapter (Architecture-Ready Stub)
```

### Key Properties:
- **Core Security Rule**: Client → fake success event → notification is blocked. Only authoritative server commits create trusted outbox rows.
- **Deduplication**: `domain_outbox_events` enforces a unique constraint on `(tenant_id, idempotency_key)`.
- **Channel Decoupling**: Business modules never call external SMS/WhatsApp providers directly.
- **Secure Receipt URLs**: HMAC-SHA256 signed verification URLs (`/api/v1/bills/receipt?token=...`) protect internal IDs.
- **Adapter-Ready**: In-app notifications are live; TRAI DLT SMS and Meta WhatsApp Cloud API adapters are structured for plug-and-play credentials injection without modifying business logic.

