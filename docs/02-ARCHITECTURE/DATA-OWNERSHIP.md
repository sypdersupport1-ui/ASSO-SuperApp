# ASSO — Data Ownership

**Phase**: 2 — Master Architecture  
**Status**: Approved for Phase 2  
**Last Updated**: 2026-09-26

Every major domain entity in ASSO has a single owning module. No duplicate sources of truth.

---

## 1. Ownership Principle

```text
One entity → One owner → One source of truth

Other modules READ from the owner.
Only the owner WRITES to the entity.
```

If Module A needs to know about an entity owned by Module B, Module A queries Module B's API or reads via a domain event payload — it does not maintain its own copy of the data.

---

## 2. Entity Ownership Table

| Entity | Owning Module | Description | Historical Record? |
|---|---|---|---|
| `User` | `platform/identity` | Staff/admin accounts | No (deactivation, not deletion) |
| `AuthSession` | `platform/identity` | Active staff sessions | Implicit (expires) |
| `Organization` | `platform/tenancy` | Tenant organization | Yes (status history) |
| `Property` | `platform/tenancy` | Physical business location | No (soft-delete) |
| `Outlet` | `platform/tenancy` | Operating unit | No (soft-delete) |
| `StaffProfile` | `platform/staff` | Staff profile linked to user | No (soft-delete) |
| `Role` | `platform/rbac` | Permission role | No |
| `RoleAssignment` | `platform/rbac` | Staff ↔ Role ↔ Outlet mapping | Yes (assignment history) |
| `Policy` | `platform/policies` | Business approval rules | No |
| `ApprovalRequest` | `platform/policies` | Pending approvals | Yes (full lifecycle) |
| `Module` | `platform/modules` | Module registry entry | No |
| `TenantEntitlement` | `platform/modules` | Which modules are enabled per outlet | Yes (change history) |
| `AuditEvent` | `platform/audit` | Immutable operations log | Yes (never deleted) |
| `Notification` | `platform/notifications` | Notification records | Yes (retention policy) |
| `Configuration` | `platform/config` | Business settings | Yes (previous values) |
| `Customer` | `engines/customer` | Customer/guest record | No (soft-delete) |
| `QRCode` | `engines/qr` | QR token and mapping | Yes (rotation history) |
| `BusinessContext` | `engines/context` | Room / Table / Seat abstraction | No (status tracked) |
| `HotelRoom` | `verticals/hotel/rooms` | Hotel room (extends BusinessContext) | No |
| `RestaurantTable` | `verticals/restaurant/tables` | Table (extends BusinessContext) | No |
| `CinemaSeat` | `verticals/cinema/seats` | Seat (extends BusinessContext) | No |
| `CustomerSession` | `engines/session` | Active customer session | Yes (expiry/invalidation) |
| `CatalogItem` | `engines/catalog` | Menu / catalog entry | No (soft-delete, version history is OPEN DECISION) |
| `Order` | `engines/ordering` | Order lifecycle | Yes (status history) |
| `OrderItem` | `engines/ordering` | Individual order line | Yes (status history) |
| `FulfillmentTask` | `engines/fulfillment` | Fulfillment routing and state | Yes (state history) |
| `ServiceRequest` | `engines/service-requests` | Customer/staff request | Yes (full lifecycle) |
| `Conversation` | `engines/conversations` | Chat conversation | Yes (messages) |
| `ConversationMessage` | `engines/conversations` | Individual message | Yes (never deleted, can be moderated) |
| `Bill` | `engines/billing` | Active charge accumulation | Yes (all entries) |
| `BillItem` | `engines/billing` | Charge line on a bill | Yes (never modified after posting) |
| `GuestFolio` | `engines/billing` (Hotel) | Hotel folio (stay-level bill) | Yes (all entries) |
| `FolioEntry` | `engines/billing` (Hotel) | Folio line item | Yes (immutable after posting) |
| `PaymentTransaction` | `engines/payments` | Payment record | Yes (never modified) |
| `RefundTransaction` | `engines/payments` | Refund record | Yes (never modified) |
| `InventoryItem` | `engines/inventory` | Item master | No (soft-delete) |
| `InventoryLocation` | `engines/inventory` | Storage location | No (soft-delete) |
| `StockMovement` | `engines/inventory` | Ledger entry (stock change) | Yes (never modified) |
| `Supplier` | `engines/procurement` | Supplier/vendor master | No (soft-delete) |
| `PurchaseOrder` | `engines/procurement` | PO lifecycle | Yes (full lifecycle) |
| `GoodsReceipt` | `engines/procurement` | Receiving record | Yes (never modified) |
| `Expense` | `engines/expenses` | Expense record | Yes (approval lifecycle) |
| `ExpenseCategory` | `engines/expenses` | Category master | No |
| `CashSession` | `engines/cash` | Daily cash session | Yes (reconciliation) |
| `CashTransaction` | `engines/cash` | Cash inflow/outflow | Yes (never modified) |
| `ReportDefinition` | `engines/reporting` | Report template | No |
| `ReportExecution` | `engines/reporting` | Generated report instance | Yes (for re-access) |
| `File` | `engines/files` | File metadata | No (soft-delete, storage lifecycle) |
| `Reservation` | `verticals/hotel` | Hotel reservation | Yes (status history) |
| `GuestStay` | `verticals/hotel` | Hotel stay lifecycle | Yes (full lifecycle) |
| `HousekeepingTask` | `verticals/hotel` | Housekeeping work item | Yes (status history) |
| `QueueEntry` | `verticals/restaurant` | Waitlist entry | Yes (lifecycle) |
| `TableReservation` | `verticals/restaurant` | Restaurant table booking | Yes (lifecycle) |
| `Show` | `verticals/cinema` | Cinema screening | Yes (status history) |

---

## 3. Current State vs Historical Record

### 3.1 Current State Entities

These entities represent the current state of the system. They are updated in-place:

| Entity | Current State Field |
|---|---|
| `BusinessContext` (Room/Table/Seat) | `status` |
| `GuestStay` | `status` |
| `Order` | `status` |
| `ServiceRequest` | `status` |
| `PurchaseOrder` | `status` |
| `Expense` | `status` |
| `CashSession` | `status` |
| `HousekeepingTask` | `status` |

### 3.2 Historical Record Tables

These tables must never have rows updated or deleted (append-only):

| Table | What It Records |
|---|---|
| `stock_movements` | Every stock change (inventory ledger) |
| `order_status_history` | Every order state transition |
| `folio_entries` | Every charge/payment on a hotel folio |
| `bill_items` | Every charge on a bill |
| `payment_transactions` | All payment records |
| `refund_transactions` | All refund records |
| `cash_transactions` | All cash inflows/outflows |
| `audit_events` | Platform-wide audit log |
| `goods_receipts` | All goods receiving records |
| `approval_decisions` | All approval actions |
| `role_assignment_history` | All role change history |
| `tenant_entitlement_history` | All module enable/disable history |

### 3.3 Correction Strategy

When a historically recorded transaction needs correction:

```text
Original Transaction (immutable)
      +
Correction Transaction (new record, references original)
      =
Net correct position
```

Examples:
- Folio charge posted incorrectly → Post a negative adjustment entry (do not modify original)
- Payment recorded incorrectly → Issue a refund or reversal transaction (do not modify original)
- Stock movement error → Post a correcting adjustment movement (do not modify original)

---

## 4. Soft Delete Policy

For entities that should not be permanently deleted:

| Entity | Delete Policy | Reason |
|---|---|---|
| `CatalogItem` | Soft-delete (`is_active = false`) | Historical orders reference it |
| `Supplier` | Soft-delete | Historical POs reference it |
| `InventoryItem` | Soft-delete | Historical movements reference it |
| `Staff` | Deactivate (not delete) | Historical orders, assignments reference it |
| `Customer` | Soft-delete + data retention policy | Historical orders reference it |
| `Organization` | Suspend/archive (not delete) | Regulatory, billing history |
| `Property` / `Outlet` | Archive | Historical records |
| `ExpenseCategory` | Soft-delete | Historical expenses reference it |

**Hard delete** is permitted only for:
- Draft records that have never been submitted (expense drafts, PO drafts)
- Temporary/test data in non-production environments
- GDPR/data-subject-deletion requests (handled with special process)

---

## 5. Data Isolation and Cross-Module Read Access

A module may need to read data owned by another module. The rules:

| Scenario | Correct Approach |
|---|---|
| Ordering Engine needs outlet's business type | Query the Tenancy Engine (via internal service call or shared DB with tenant-scoped query) |
| Billing Engine needs order details to post a charge | Ordering Engine passes essential data via the domain event payload |
| Reporting Engine needs order totals | Reporting Engine queries the orders table directly (it is a cross-cutting read concern) |
| Notification Engine needs customer details | Notification handler queries the Customer Engine with customerId from event payload |

**Forbidden**: Maintaining a copy of another module's data to avoid a query. This creates two sources of truth and synchronization problems.

---

## 6. Archival and Data Retention

> `OPEN DECISION` — Formal data retention and archival policies to be defined in Phase 5 (Engineering & Operations).

Preliminary principles:
- Financial records (payments, folio entries, expenses): Retain for minimum 7 years (regulatory requirement TBD)
- Audit events: Retain for minimum 2 years
- Operational records (orders, service requests): Retain for minimum 1 year, archive after
- Customer session data: Expire within 30 days of last activity
- Conversation messages: Retain per tenant configuration (default 1 year)

Archival strategy: Move aged records to cold storage (separate table partition or separate storage) rather than deleting. Queries against archived data are available but not in real-time dashboards.
