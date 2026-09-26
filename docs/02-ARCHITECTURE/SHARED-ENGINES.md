# ASSO — Shared Engines

**Phase**: 2 — Master Architecture  
**Status**: Approved for Phase 2  
**Last Updated**: 2026-09-26

This document defines the architectural boundary, responsibilities, and interface for each shared domain engine in ASSO.

---

## Engine Index

| # | Engine | Code Module |
|---|---|---|
| 1 | Identity & Authentication | `platform/identity` |
| 2 | Multi-Tenancy | `platform/tenancy` |
| 3 | Customer Engine | `engines/customer` |
| 4 | Staff Engine | `platform/staff` |
| 5 | RBAC Engine | `platform/rbac` |
| 6 | Policy Engine | `platform/policies` |
| 7 | Module Entitlement Engine | `platform/modules` |
| 8 | Configuration Engine | `platform/config` |
| 9 | Audit Engine | `platform/audit` |
| 10 | QR Engine | `engines/qr` |
| 11 | Context / Business Context Engine | `engines/context` |
| 12 | Session Engine | `engines/session` |
| 13 | Catalog Engine | `engines/catalog` |
| 14 | Ordering Engine | `engines/ordering` |
| 15 | Fulfillment Engine | `engines/fulfillment` |
| 16 | Service Request Engine | `engines/service-requests` |
| 17 | Conversation Engine | `engines/conversations` |
| 18 | Notification Engine | `platform/notifications` |
| 19 | POS Engine | `engines/pos` |
| 20 | Billing Engine | `engines/billing` |
| 21 | Payment Engine | `engines/payments` |
| 22 | Inventory Engine | `engines/inventory` |
| 23 | Procurement Engine | `engines/procurement` |
| 24 | Expense Engine | `engines/expenses` |
| 25 | Cash Management Engine | `engines/cash` |
| 26 | Reporting Engine | `engines/reporting` |
| 27 | File Engine | `engines/files` |
| 28 | Domain Event Bus | `platform/events` |

---

## 1. Identity & Authentication Engine

**Module**: `platform/identity`

**Purpose**: Manage user accounts, authentication flows, and secure sessions for staff and platform admins.

**Responsibilities**:
- Create, update, and deactivate user accounts
- Authenticate users via email/password (and future providers: OAuth, SSO)
- Issue and validate session tokens
- Manage password resets and account recovery
- Enforce account lockout after failed attempts

**Owns**: `users`, `auth_sessions`, `password_reset_tokens`

**Does Not Own**: Customer sessions (owned by Session Engine), RBAC permissions (owned by RBAC Engine)

**Main Entities**:
- `User` — staff account, admin account, or owner account
- `AuthSession` — authenticated session with expiry

**Events Published**:
- `UserCreated`, `UserDeactivated`, `LoginSucceeded`, `LoginFailed`, `PasswordChanged`

**Security Considerations**:
- Passwords stored as bcrypt hashes (never plaintext)
- Session tokens are cryptographically signed
- Rate limiting on authentication endpoints
- Account lockout after N failed attempts
- All authentication events are audit-logged

---

## 2. Multi-Tenancy Engine

**Module**: `platform/tenancy`

**Purpose**: Manage the organization/property/outlet hierarchy and enforce tenant boundaries.

**Responsibilities**:
- Manage organization (tenant) records
- Manage property and outlet records
- Provide tenant context resolution for all requests
- Enforce organization ownership of properties and outlets

**Owns**: `organizations`, `properties`, `outlets`

**Does Not Own**: Business Context (owned by Context Engine), Module Entitlements (owned by Module Engine)

**Main Entities**:
- `Organization` — root tenant entity
- `Property` — physical business location
- `Outlet` — operating unit within a property

**Events Published**:
- `OrganizationCreated`, `PropertyCreated`, `OutletCreated`, `OutletStatusChanged`

**Security Considerations**:
- All cross-tenant access checks route through this engine
- Tenant ID is never trusted from client input; always derived from authenticated session

---

## 3. Customer Engine

**Module**: `engines/customer`

**Purpose**: Manage customer/guest records, identification, and cross-visit history.

**Responsibilities**:
- Create and manage customer records
- Link sessions to identified customers (when customer provides contact info)
- Maintain customer history within a tenant

**Owns**: `customers`, `customer_profiles`

**Does Not Own**: Customer sessions (owned by Session Engine), orders (owned by Ordering Engine)

**Main Entities**:
- `Customer` — A person who has interacted with a business via ASSO
  - Identified by phone, email, or loyalty identifier (where applicable)
  - May be anonymous initially

**Security Considerations**:
- Customer records are tenant-scoped — a customer at Restaurant A is not the same record as a customer at Hotel B (unless cross-tenant customer sharing is explicitly approved — `OPEN DECISION`)
- Customer PII requires appropriate protection and retention policies

---

## 4. Staff Engine

**Module**: `platform/staff`

**Purpose**: Manage staff profiles, outlet assignments, and employment records within a tenant.

**Responsibilities**:
- Create and manage staff profiles linked to user accounts
- Assign staff to outlets
- Manage staff status (active, inactive, on leave)

**Owns**: `staff_profiles`, `staff_outlet_assignments`

**Does Not Own**: User accounts (owned by Identity Engine), Roles/Permissions (owned by RBAC Engine)

---

## 5. RBAC Engine

**Module**: `platform/rbac`

**Purpose**: Manage roles, permissions, and role assignments. Answer the question: "Can this user perform this action?"

**Responsibilities**:
- Define platform-level permission constants
- Define roles and their permission sets
- Assign roles to staff within outlet scope
- Resolve the effective permission set for a user in a given outlet context

**Owns**: `roles`, `permissions`, `role_permissions`, `staff_role_assignments`

**Does Not Own**: Module entitlements (owned by Module Engine), Policies (owned by Policy Engine)

**Key Concepts**:
- A **Permission** is an atomic action: `orders:create`, `inventory:adjust`, `expenses:approve`
- A **Role** is a named set of permissions: `Manager`, `Cashier`, `Kitchen Staff`
- **Role Templates** are pre-built role configurations per vertical (Hotel Manager, Restaurant Captain)
- Role assignments are scoped to an outlet (a staff member can have different roles at different outlets)

**Security Considerations**:
- Permission checks occur server-side on every request
- The permission set is derived at session creation and cached for the session duration
- Any role or permission change takes effect on next login (or session refresh)

**Vertical Extension Points**:
- Vertical-specific role templates defined in each vertical module and registered with RBAC Engine at startup
- Custom roles can be created by tenant admins within the bounds of available permissions

---

## 6. Policy Engine

**Module**: `platform/policies`

**Purpose**: Evaluate business rules and approval conditions that go beyond simple permission checks. Answer the question: "Under what conditions may this action proceed?"

**Responsibilities**:
- Define business policy rules (thresholds, conditions, approval requirements)
- Evaluate whether a specific operation meets policy conditions
- Orchestrate approval workflows

**Owns**: `policies`, `policy_rules`, `approval_requests`, `approval_decisions`

**Does Not Own**: Permissions (owned by RBAC Engine)

**Example Policies**:
- Refunds over ₹500 require manager approval
- Expenses over ₹2,000 require manager approval
- Inventory adjustments require supervisor authorization
- Late checkout requires manager approval

**Policy Evaluation**:
```text
Policy.canProceed({
  operation: 'refund:create',
  context: {tenantId, outletId, userId, amount: 750},
})
→ { allowed: false, requiresApproval: true, approvalRuleId: 'refund-approval-rule-1' }
```

**Events Published**: `ApprovalRequested`, `ApprovalGranted`, `ApprovalRejected`

---

## 7. Module Entitlement Engine

**Module**: `platform/modules`

**Purpose**: Manage the module catalog and track which modules each tenant/outlet has access to. Answer the question: "Does this business have this capability?"

**Responsibilities**:
- Maintain the module registry (all available modules and their metadata)
- Manage module dependencies (which modules require other modules)
- Track entitlements (which modules are enabled for each outlet)
- Expose the entitlement map used by middleware for fast checks

**Owns**: `modules`, `module_dependencies`, `plans`, `plan_modules`, `tenant_entitlements`

**Does Not Own**: Permissions (owned by RBAC Engine)

**Module Check**:
```text
ModuleEntitlement.isEnabled({tenantId, outletId, module: 'inventory'})
→ true | false
```

See [MODULE-ENTITLEMENTS.md](./MODULE-ENTITLEMENTS.md) for the complete module architecture.

---

## 8. Configuration Engine

**Module**: `platform/config`

**Purpose**: Manage business-level and outlet-level configuration settings.

**Responsibilities**:
- Store and retrieve configuration per organization, property, and outlet
- Provide default configurations per business type
- Support vertical-specific configuration extensions

**Owns**: `configurations` (tenant-scoped key-value or structured config)

**Does Not Own**: Module entitlements, policies, business data

---

## 9. Audit Engine

**Module**: `platform/audit`

**Purpose**: Record an immutable trail of important operations for compliance, investigation, and accountability.

**Responsibilities**:
- Record audit events from all other engines
- Provide audit log queries for operators and platform admins
- Ensure audit records are never modified or deleted

**Owns**: `audit_events`

**Audit Event Structure**:
```text
{
  event_id
  tenant_id
  outlet_id
  actor_id        — user_id or 'system' or 'customer:[session_id]'
  actor_type      — STAFF | SUPER_ADMIN | SYSTEM | CUSTOMER
  event_type      — e.g. ORDER_CREATED, REFUND_APPROVED, STOCK_ADJUSTED
  resource_type   — e.g. Order, Expense, StockMovement
  resource_id
  before_state    — JSON snapshot (optional, for edit operations)
  after_state     — JSON snapshot (optional)
  metadata        — Additional context
  created_at      — Immutable timestamp
}
```

**Audit Requirements**: Audit events are written as append-only records. No UPDATE or DELETE on the audit table. Audit records are retained per defined retention policy (to be defined in Phase 5).

---

## 10. QR Engine

**Module**: `engines/qr`

**Purpose**: Generate, manage, and resolve QR codes that serve as the entry point for the customer experience.

**Responsibilities**:
- Generate QR codes with opaque identifiers (no sensitive data embedded)
- Maintain the mapping: `opaque_token → tenant + outlet + context`
- Validate and resolve incoming QR tokens
- Manage QR lifecycle (active, disabled, rotated)
- Rate-limit QR resolution to protect against abuse

**Owns**: `qr_codes`

**Does Not Own**: Customer sessions (created by Session Engine after QR resolution)

**QR Record**:
```text
{
  qr_id
  token           — Opaque, cryptographically random identifier
  tenant_id
  outlet_id
  context_id      — Room, Table, or Seat ID
  context_type    — ROOM | TABLE | SEAT | SCREEN_AREA
  status          — ACTIVE | DISABLED | ROTATED
  created_at
  rotated_at
}
```

**Security Considerations**:
- QR tokens are opaque — they reveal nothing about the underlying structure
- Destination URL is determined server-side after validation
- Rate limiting on `/api/qr/resolve` endpoint
- Photographed/shared QR: acceptable risk for restaurant/cinema (session is context-bound); hotel rooms are more sensitive and may benefit from session validation at check-in
- QR can be disabled (e.g., room under maintenance) without reprinting

**Events Published**: `QRResolved`, `QRDisabled`, `QRRotated`

---

## 11. Business Context Engine

**Module**: `engines/context`

**Purpose**: Abstract the physical customer interaction context (Room / Table / Seat) into a unified model shared by all engines.

**Responsibilities**:
- Manage context records (rooms, tables, seats) in a unified schema
- Track context status (available, occupied, maintenance)
- Provide context resolution for all operations that need it

**Owns**: `business_contexts` (with vertical-specific extension tables)

**Does Not Own**: QR codes (owned by QR Engine), Sessions (owned by Session Engine)

**Main Entities**:
- `BusinessContext` — base entity (id, outlet_id, context_type, display_name, status, qr_id)
- `HotelRoom` — extends BusinessContext (room type, floor, rate)
- `RestaurantTable` — extends BusinessContext (section, capacity, position)
- `CinemaSeat` — extends BusinessContext (screen, row, seat number, seat type)

---

## 12. Session Engine

**Module**: `engines/session`

**Purpose**: Manage customer session lifecycle — creation, validation, expiry, and invalidation.

**Responsibilities**:
- Create a customer session when a QR is successfully resolved
- Validate session tokens on every customer API request
- Expire sessions based on time limits
- Invalidate sessions on context lifecycle events

**Owns**: `customer_sessions`

**Session Lifecycle**:
```text
QR Resolved → Session Created (ACTIVE)
      ↓
Requests made with session token
      ↓
Time limit exceeded → Session EXPIRED (automatic)
      ↓ (or)
Context lifecycle event → Session INVALIDATED
  (Guest checkout → Room sessions invalidated)
  (Table cleared → Table sessions invalidated)
  (Show ended → Seat/screen sessions invalidated)
```

**Events Consumed**: `GuestCheckedOut`, `TableCleared`, `ShowEnded`

**Events Published**: `CustomerSessionCreated`, `CustomerSessionExpired`, `CustomerSessionInvalidated`

---

## 13. Catalog Engine

**Module**: `engines/catalog`

**Purpose**: Manage items available for ordering — the menu or catalog for each outlet.

**Responsibilities**:
- Manage catalog items (name, description, price, category, images, availability)
- Support configurable categories per vertical (food, beverage, supplies, services)
- Control item availability by time, context, or other conditions
- Serve the appropriate catalog for a given tenant + outlet + context

**Owns**: `catalog_items`, `catalog_categories`, `catalog_item_options`, `catalog_availability_rules`

**Does Not Own**: Orders (owned by Ordering Engine), Inventory items (owned by Inventory Engine)

**Vertical Extension Points**:
- Item categories are configurable per vertical (food/beverage for restaurant, room amenities for hotel service, concession items for cinema)
- Catalog items may have modifiers/options (size, customization) — configurable

---

## 14. Ordering Engine

**Module**: `engines/ordering`

**Purpose**: Manage the complete lifecycle of an order from creation to closure.

**Responsibilities**:
- Create orders (customer-initiated or staff-initiated via POS)
- Validate order items against catalog and context
- Track order status through its lifecycle
- Support order modification and cancellation per business rules
- Maintain order history

**Owns**: `orders`, `order_items`, `order_status_history`

**Does Not Own**: Billing/charges (owned by Billing Engine), Fulfillment (owned by Fulfillment Engine), Payments (owned by Payment Engine)

**Order Entity**:
```text
{
  order_id
  tenant_id, outlet_id
  context_id, context_type    — Room | Table | Seat
  order_type                  — CUSTOMER | STAFF_POS | STAFF_CONSOLE
  status                      — PENDING → CONFIRMED → PREPARING → READY → DELIVERED → CLOSED | CANCELLED
  items[]                     — {catalogItemId, quantity, unitPrice, modifiers[], notes}
  notes
  created_by                  — customer session ID or staff user ID
  created_at
  idempotency_key             — Required for POS-initiated orders
}
```

**Idempotency**: Order creation requires an idempotency key to prevent duplicate orders on network retry.

**Events Published**: `OrderCreated`, `OrderConfirmed`, `OrderModified`, `OrderCancelled`, `OrderDelivered`, `OrderClosed`

**Events Consumed**: None (events are consumed by Billing, Fulfillment, Inventory)

---

## 15. Fulfillment Engine

**Module**: `engines/fulfillment`

**Purpose**: Route orders to the appropriate fulfillment station and track preparation/delivery status.

**Responsibilities**:
- Receive orders from the Ordering Engine (via domain event)
- Route to appropriate fulfillment channel (kitchen, room service team, concession counter)
- Manage KDS display state
- Track item-level preparation and delivery status
- Notify relevant staff of new orders

**Owns**: `fulfillment_tasks`, `kds_display_state`

**Does Not Own**: Orders (owned by Ordering Engine)

**Vertical Configuration**:
- **Hotel**: Room service team receives and delivers to room
- **Restaurant**: Kitchen KDS receives orders; waitstaff delivers
- **Cinema**: Concession counter fulfills; delivery or pickup based on configuration

**Events Published**: `FulfillmentStarted`, `ItemReady`, `OrderReadyForDelivery`, `OrderDelivered`

**Events Consumed**: `OrderConfirmed`

---

## 16. Service Request Engine

**Module**: `engines/service-requests`

**Purpose**: Manage service requests from customers or staff — from creation through resolution.

**Responsibilities**:
- Create and categorize service requests
- Assign to appropriate staff/department
- Track status through resolution
- Notify assignees
- Support conversation linkage

**Owns**: `service_requests`, `service_request_categories`, `service_request_status_history`

**Does Not Own**: Conversations (owned by Conversation Engine), Billing (if chargeable — owned by Billing Engine)

**Request Entity**:
```text
{
  request_id
  tenant_id, outlet_id, context_id
  category_id             — Configurable per vertical
  title, description
  priority                — LOW | MEDIUM | HIGH | URGENT
  status                  — SUBMITTED → ASSIGNED → IN_PROGRESS → RESOLVED | CANCELLED
  assigned_to             — Staff user ID
  department              — Housekeeping | Maintenance | Service | etc.
  created_by              — customer session or staff
  created_at
  resolved_at
  requires_approval       — boolean (policy-driven)
  conversation_id         — Optional linked conversation
}
```

**Events Published**: `ServiceRequestCreated`, `ServiceRequestAssigned`, `ServiceRequestCompleted`, `ServiceRequestCancelled`

**Vertical Extension Points**: Categories are configurable per vertical. Different request types may have different state machine variations registered per vertical.

---

## 17. Conversation Engine

**Module**: `engines/conversations`

**Purpose**: Manage real-time chat conversations between customers and staff.

**Responsibilities**:
- Create conversations linked to a context, order, service request, or standalone
- Manage messages, participants, and read state
- Track assignment of conversations to staff
- Support conversation status (open, closed, archived)

**Owns**: `conversations`, `conversation_messages`, `conversation_participants`

**Does Not Own**: Service requests (owned by Service Request Engine), Notifications (owned by Notification Engine)

**Conversation Entity**:
```text
{
  conversation_id
  tenant_id, outlet_id
  subject_type            — CUSTOMER_CONTEXT | ORDER | SERVICE_REQUEST | GENERAL
  subject_id              — Reference to the linked entity
  status                  — OPEN | CLOSED | ARCHIVED
  assigned_to             — Staff user ID
  participants[]          — {participantType: CUSTOMER|STAFF, participantId}
  created_at, closed_at
}
```

**Security Considerations**:
- Conversations are tenant-scoped
- A customer can only read their own conversations (scoped by session)
- Message content is not encrypted at rest initially (`OPEN DECISION` — if encrypted messaging is required)
- Moderation: staff can close conversations

**Events Published**: `MessageSent`, `ConversationAssigned`, `ConversationClosed`

---

## 18. Notification Engine

**Module**: `platform/notifications`

**Purpose**: Deliver notifications to staff, customers, and kitchen staff via appropriate channels.

**Responsibilities**:
- Receive notification triggers from domain events
- Determine delivery channel (in-app, push, email, SMS)
- Queue and dispatch notifications via the appropriate provider
- Track delivery status

**Owns**: `notifications`, `notification_preferences`

**Does Not Own**: Email/SMS providers (abstracted via adapter)

**Delivery Channels**:
- **In-App**: Displayed in the Business Console (polling or SSE)
- **Push**: Browser push notifications (customer app and KDS)
- **Email**: Receipts, approval notifications, low-stock alerts
- **SMS**: Customer order status, service request updates (where configured)

**Events Consumed**: `OrderCreated`, `OrderConfirmed`, `OrderReadyForDelivery`, `ServiceRequestCreated`, `ServiceRequestAssigned`, `ExpenseApprovalRequired`, `LowStockAlert`, `PaymentCompleted`

---

## 19. POS Engine

**Module**: `engines/pos`

**Purpose**: Power staff-initiated point-of-sale transactions across counter, quick-service, and cashier workflows.

**Operational Model (ADR-012)**:
- **Online-First with Network Resilience**: POS operates as an online-first system. Active cart lines and calculations are maintained in client memory so brief connection hiccups do not interrupt staff. Automatic retries with client-generated idempotency keys prevent duplicate orders or transactions.
- Offline synchronization is deferred to future enterprise phases; architecture remains forward-compatible via client-generated UUIDs and ledger movements.

**Responsibilities**:
- Create POS transactions (may or may not be tied to a pre-existing context order)
- Add line items, apply authorized discounts, and record service charges
- Process payment through the Payment Engine
- Generate printable receipts (native browser 80mm thermal format)
- Record cash transactions directly in Cash Management

**Owns**: `pos_sessions`, `pos_transactions`, `pos_transaction_items`

**Does Not Own**: Payments (settled via Payment Engine), Cash drawers (owned by Cash Engine), Orders (POS delegates item preparation to Ordering Engine)

**Events Published**: `POSTransactionCompleted`, `POSTransactionVoided`

---

## 20. Billing Engine

**Module**: `engines/billing`

**Purpose**: Accumulate charges against a business context, calculate taxes and discounts, and generate authoritative bills/folios for settlement.

**Responsibilities**:
- Post charges to the active bill for a context (order charges, service charges, room tariff, etc.)
- Accumulate charges across a session (table/seat) or multi-day stay (hotel folio)
- Calculate taxes (GST/VAT), service charges, and authorized discounts
- Generate immutable bill summaries on request
- Support voids and adjustments via explicit negative/reversal entries (with manager approval via Policy Engine)
- Maintain the underlying ledger mechanics for both short-lived bills and Hotel Guest Folios

**Owns**: `bills`, `bill_items`, `bill_adjustments`, `guest_folios`, `folio_entries`

**Does Not Own**: Payments (settled via Payment Engine), Order operations (owned by Ordering Engine), Room stay lifecycles (owned by Hotel Vertical)

**Billing vs Folio Clarification**:
- **Bills (`bills`, `bill_items`)**: Short-duration operational statements bound to an immediate dining session or concession order. Settled prior to table clearance or concession pickup.
- **Guest Folios (`guest_folios`, `folio_entries`)**: Multi-day stay-level ledgers bound to a Hotel `GuestStay`. The Hotel vertical orchestrates the lifecycle (opened upon check-in, closed upon check-out), while the Billing Engine provides the immutable calculation, charge-posting, and adjustment ledger rules.

**Financial Integrity Rules (ADR-005)**:
- All charges and folio entries are immutable once posted.
- Corrections are made strictly via adjustment/reversal entries referencing the original entry.
- Every financial mutation creates an append-only audit record.

**Events Published**: `ChargePosted`, `BillGenerated`, `AdjustmentApplied`, `BillSettled`

**Events Consumed**: `OrderDelivered`, `ServiceRequestCompleted` (if chargeable)

---

## 21. Payment Engine

**Module**: `engines/payments`

**Purpose**: Process financial settlements, handle refunds, and maintain the immutable payment transaction ledger.

**Adapter Pattern (ADR-011)**:
- Payment Engine domain logic is **100% provider-agnostic**.
- External payment gateways integrate through the `PaymentGatewayAdapter` interface.
- **Provider implementation is deferred**: No commercial gateway (such as Razorpay or Stripe) SDK, API integration, webhooks, or credentials will be implemented now. The domain model remains completely neutral.
- Development / Preview / CI environments strictly utilize **`MockPaymentAdapter`** for deterministic sandbox testing without external banking dependencies.

**Responsibilities**:
- Accept payment requests across multiple payment methods (UPI, Card, Cash, NetBanking)
- Dispatch transactions via the active `PaymentGatewayAdapter`
- Validate and process inbound payment webhooks idempotently
- Issue refunds (subject to Policy Engine thresholds and manager approval)
- Maintain the immutable payment transaction ledger

**Owns**: `payment_transactions`, `refund_transactions`, `payment_methods`, `payment_idempotency`

**Does Not Own**: Bills or Folios (owned by Billing Engine), Cash register sessions (owned by Cash Management)

**Idempotency & Security**:
- Every payment request mandates a client-generated `Idempotency-Key` (UUIDv4) stored in `payment_idempotency`.
- Webhook HMAC signatures are verified before payload execution.
- Payment amounts are strictly verified server-side against bill/folio totals; client input is never trusted for amounts.

**Payment States**:
```text
PENDING → PROCESSING → COMPLETED | FAILED | EXPIRED
```

**Refund States**:
```text
PENDING → PROCESSING → COMPLETED | FAILED
```

**Events Published**: `PaymentInitiated`, `PaymentCompleted`, `PaymentFailed`, `RefundInitiated`, `RefundCompleted`

---

## 22. Inventory Engine

**Module**: `engines/inventory`

**Purpose**: Manage stock across all inventory locations using a ledger-based approach.

**Responsibilities**:
- Manage inventory items (name, category, unit, reorder point)
- Manage inventory locations (storeroom, kitchen, bar, central)
- Track stock levels via an immutable movement ledger
- Support stock movements: receiving, consumption, transfer, adjustment, wastage
- Alert on low-stock thresholds

**Owns**: `inventory_items`, `inventory_categories`, `inventory_locations`, `stock_movements`, `inventory_alerts`

**Does Not Own**: Purchase orders (owned by Procurement Engine), Expenses related to procurement (owned by Expense Engine)

**Ledger Principle**:
```text
Current Stock = Sum of all movements for an item at a location
             = Opening balance
             + Goods received
             + Transfers in
             − Consumption
             − Wastage / damage
             − Transfers out
             ± Manual adjustments
```

Historical stock movements are never modified. Corrections use new adjustment entries.

**Movement Types**:
`OPENING_BALANCE`, `PURCHASE_RECEIPT`, `TRANSFER_IN`, `TRANSFER_OUT`, `CONSUMPTION`, `WASTAGE`, `DAMAGE`, `EXPIRY`, `ADJUSTMENT_INCREASE`, `ADJUSTMENT_DECREASE`, `RETURN_TO_SUPPLIER`

**Events Published**: `StockReceived`, `StockConsumed`, `StockTransferred`, `StockAdjusted`, `LowStockAlert`

**Events Consumed**: `GoodsReceived` (from Procurement Engine), `OrderDelivered` (for manual consumption recording)

**Security Considerations**:
- Stock adjustments require authorized role (supervisor or manager)
- All adjustments create audit records with reason
- Inter-outlet transfers require authorization at both outlets

---

## 23. Procurement Engine

**Module**: `engines/procurement`

**Purpose**: Manage the procurement lifecycle from purchase request through goods receipt.

**Responsibilities**:
- Manage supplier records
- Create and manage purchase orders
- Route purchase orders through approval workflows
- Record goods receipt and update inventory
- Track procurement financial records

**Owns**: `suppliers`, `purchase_orders`, `purchase_order_items`, `goods_receipts`, `goods_receipt_items`

**Does Not Own**: Inventory stock movements (the Inventory Engine records the stock movement triggered by goods receipt); Expenses (linked financial record created in Expense Engine)

**PO Lifecycle**:
```text
DRAFT → PENDING_APPROVAL → APPROVED → SENT → PARTIALLY_RECEIVED → RECEIVED → CLOSED
                                                                          ↘ CANCELLED
```

**Partial Receipt**: Supported. A goods receipt records the quantities actually received. Remaining quantities stay open on the PO.

**Events Published**: `PurchaseOrderCreated`, `PurchaseOrderApproved`, `GoodsReceived`, `PurchaseOrderClosed`

---

## 24. Expense Engine

**Module**: `engines/expenses`

**Purpose**: Record and manage daily operating expenses.

**Responsibilities**:
- Record expenses (amount, category, vendor, payment source, date, notes)
- Manage expense categories (standard + custom)
- Handle approval workflows for expenses above thresholds
- Support expense attachments (receipt images)
- Update cash management for cash-paid expenses

**Owns**: `expenses`, `expense_categories`, `expense_attachments`, `expense_approvals`

**Does Not Own**: Cash Management (owned by Cash Engine); inventory purchases are a conceptually separate flow

**Expense Record**:
```text
{
  expense_id
  tenant_id, outlet_id
  date
  amount
  currency
  category_id
  vendor_name
  payment_source      — CASH | BANK_TRANSFER | UPI | CARD | OTHER
  notes
  status              — DRAFT | SUBMITTED | PENDING_APPROVAL | APPROVED | REJECTED
  submitted_by
  approved_by
  attachments[]
}
```

**Events Published**: `ExpenseSubmitted`, `ExpenseApproved`, `ExpenseRejected`, `ExpensePaid`

---

## 25. Cash Management Engine

**Module**: `engines/cash`

**Purpose**: Track cash position, reconcile daily cash, and record discrepancies.

**Responsibilities**:
- Open cash register sessions (opening balance)
- Record cash inflows (POS sales, cash expenses)
- Record cash outflows (expenses, vendor payments)
- Close and reconcile cash sessions
- Track discrepancies (physical count vs system count)

**Owns**: `cash_sessions`, `cash_transactions`, `cash_reconciliations`

**Events Consumed**: `POSTransactionCompleted` (cash payment), `ExpensePaid` (cash expense)

**Events Published**: `CashSessionOpened`, `CashSessionClosed`, `CashDiscrepancyRecorded`

---

## 26. Reporting Engine

**Module**: `engines/reporting`

**Purpose**: Generate operational and business metrics with consistent, centrally defined calculations.

**Responsibilities**:
- Compute metrics from operational data
- Generate reports on-demand or on schedule
- Export reports in supported formats

**Owns**: `report_definitions`, `report_executions`

**Principle**: All metric calculations are performed server-side with centrally defined formulas. Dashboards consume metrics; they do not independently calculate them.

**Report Categories**:
- Sales: Revenue, order counts, average order value, payment method breakdown
- Inventory: Stock levels, movement summary, wastage, low-stock
- Expenses: Expense summary, category breakdown, vendor analysis
- Operations: Service request metrics, fulfillment times
- Staff: Activity metrics

**Future Path**: If reporting queries cause noticeable performance impact on the primary database, read replicas or a materialized view layer is introduced before considering a separate analytical database.

---

## 27. File Engine

**Module**: `engines/files`

**Purpose**: Manage secure file uploads and retrieval for attachments across the platform.

**Responsibilities**:
- Generate signed upload URLs for direct-to-storage uploads
- Record file metadata (name, type, size, uploader, tenant scope)
- Generate signed download URLs
- Enforce file type and size restrictions

**Owns**: `files` (metadata records; actual files in object storage)

**Security Considerations**:
- Upload URLs are short-lived (5 minutes)
- Download URLs are signed and tenant-scoped
- File type validation (MIME type + extension must match)
- File size limits per use case (e.g., 10MB for expense receipts, 5MB for catalog images)

---

## 28. Domain Event Bus

**Module**: `platform/events`

**Purpose**: Provide in-process, synchronous pub/sub for domain events within the modular monolith.

**Responsibilities**:
- Allow engines to publish domain events without direct coupling to consumers
- Route events to registered handlers
- Ensure event handling does not silently fail

**Design**: In-process event emitter (not a distributed message broker). Events are processed in the same request/transaction context or dispatched to the background job queue for asynchronous handling.

**Transactional Guarantee**:
```text
Domain operation completes (within DB transaction)
      ↓
Job enqueued in DB (within same transaction)
      ↓
Transaction commits
      ↓
Background worker picks up job → processes event → marks done
```

This ensures no events are lost if the process crashes after the transaction commits.

**Redis / Message Broker**: Not introduced until justified by a documented operational requirement (e.g., need to fan out events to many isolated consumers at high volume).
