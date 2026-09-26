# ASSO — Master Product Blueprint

This is the canonical, highest-level product blueprint for ASSO. It consolidates the approved product direction into one reference document.

For detailed treatment of specific topics, refer to the linked documents.

---

## 1. ASSO Vision

> Enable any physical-business operator — hotel, restaurant, or cinema — to run their business efficiently through one intelligent, connected platform.

ASSO replaces fragmented, vertical-specific tools with a single platform that shares common business capabilities while respecting the unique operational realities of each business type.

---

## 2. Product Definition

ASSO is a **multi-tenant SaaS platform** for physical-business operators. It provides:

- A **shared platform core** for identity, tenancy, access control, and configuration
- **Shared domain engines** for common business operations (ordering, inventory, expenses, POS, billing, payments, and reporting)
- **Vertical-specific modules** for workflows unique to each business type
- A **customer-facing experience** for guests and patrons through QR-based digital interaction
- A **business console** for operators to manage their daily operations
- A **Super Admin console** for platform administration

ASSO is one platform, not three separate products.

---

## 3. Target Business Verticals

| Vertical | Business Context | Description |
|---|---|---|
| **Hotel** | Room | Guest stays, room operations, front desk, housekeeping, room service, guest services |
| **Restaurant** | Table | Dining operations, table management, QR ordering, kitchen fulfillment, POS |
| **Cinema Hall** | Seat / Screen | Venue operations, concession ordering, seat-area services |

These are **equal sibling verticals**. There is no hierarchy between them. Each vertical uses shared engines and adds its own workflows.

---

## 4. Platform Philosophy

```text
One ASSO Platform
       ↓
Shared Platform Core
       ↓
Shared Domain Engines
       ↓
Vertical Configuration
       ↓
Vertical-Specific Workflows
       ↓
Vertical-Specific UI
```

**Implementation Principle**: Shared engine → vertical configuration → workflow → UI.

When a business capability is common across verticals, it is built once as a shared engine and configured per vertical. Only truly unique vertical workflows and UI live in the vertical modules.

```text
✗  Hotel Ordering + Restaurant Ordering + Cinema Ordering
✓  ASSO Ordering Engine → configured per vertical context
```

---

## 5. Core Product Model

### Organizational Hierarchy

```text
ASSO Platform
  ↓
Organization (Customer)
  ↓
Business / Property
  ↓
Outlet / Location
  ↓
Business Context (Room / Table / Seat)
```

- An **Organization** represents a customer of ASSO (a company, business owner, or operating group)
- A **Property** is a physical business (a hotel, a restaurant, a cinema)
- An **Outlet** is a distinct operating unit within a property (a hotel may have a restaurant outlet and a bar outlet)
- A **Business Context** is the specific operational context within an outlet (a room, a table, a seat)

This model supports customers with multiple properties and outlets.

### Module Model

```text
Business Type → Available Modules → Plan/Entitlement → Enabled Modules → Staff Permissions
```

- **Module Entitlement**: Does this business have this capability? (Tenant-level)
- **RBAC Permission**: Can this specific user perform this action? (User-level)

Both are checked on every request. See [Section 14: Module Entitlement Model](#14-module-entitlement-model).

---

## 6. Shared Platform Capabilities

### Platform Core

| Capability | Description |
|---|---|
| Identity & Authentication | User accounts, login, secure sessions |
| Multi-tenancy | Complete tenant isolation |
| Organizations | Customer organizations with multiple properties |
| Properties & Outlets | Physical business locations and operating units |
| Staff Management | Staff accounts, profiles, assignments |
| RBAC | Role-based access control |
| Module Entitlements | Module-level access control per tenant |
| Module Dependencies | Which modules require other modules |
| Configuration | Business and outlet-level settings |
| Business Policies | Approval rules, thresholds, operational constraints |
| Audit | Tracking of important operations |
| Notifications | System, operational, and customer notifications |

### Customer & Context

| Capability | Description |
|---|---|
| Customer Engine | Customer records and identification |
| Business Context | Abstracted context: Room / Table / Seat |
| QR Engine | QR generation, resolution, context mapping |
| Customer Sessions | Scoped, time-bounded, revocable sessions |

### Operations

| Capability | Description |
|---|---|
| Catalog / Menu | Items available for ordering per context |
| Ordering | Order lifecycle management |
| Fulfillment | Order preparation and delivery |
| KDS | Kitchen/preparation display (where food preparation exists) |
| Service Requests | Customer and operational requests |
| Chat / Conversations | Real-time communication |

### Commerce

| Capability | Description |
|---|---|
| POS | Point of sale for staff-initiated transactions |
| Billing | Charge accumulation and bill generation |
| Payments | Payment processing and verification |
| Refunds | Controlled refund processing |
| Receipts / Invoices | Transaction documentation |

### Inventory & Procurement

| Capability | Description |
|---|---|
| Inventory | Item and stock management with movement history |
| Inventory Locations | Storage locations within a property/outlet |
| Units of Measure | Unit definitions and conversions |
| Suppliers | Supplier/vendor management |
| Procurement | Purchase planning |
| Purchase Orders | PO lifecycle management |
| Goods Receiving | Inbound stock verification |
| Stock Ledger | Complete movement history |
| Stock Transfers | Inter-location movement |
| Stock Adjustments | Controlled stock corrections |
| Wastage / Consumption | Usage and waste tracking |
| Low-Stock / Reorder | Threshold alerts and reorder management |

### Finance Operations

| Capability | Description |
|---|---|
| Expenses | Daily expense recording |
| Expense Categories | Standard and custom categories |
| Expense Approval | Approval workflows |
| Payment Sources | Cash, bank, UPI, card, other |
| Cash Management | Cash tracking and reconciliation |
| Expense Attachments | Receipt/document upload |
| Expense Reporting | Expense summaries |

### Platform Services

| Capability | Description |
|---|---|
| Reporting / Metrics | Operational and business metrics |
| Domain Events | Internal event-driven communication |
| File Storage | Secure file management |
| Observability | System monitoring and diagnostics |

---

## 7. Hotel Product Scope

### Business Actors

| Actor | Role |
|---|---|
| Guest | Pays for a stay, uses hotel services |
| Front Desk Staff | Manages check-in/out, reservations, guest requests |
| Housekeeping Staff | Cleans and prepares rooms |
| Room Service Staff | Delivers food and amenities to rooms |
| Manager | Oversees hotel operations |
| Owner / Admin | Manages hotel configuration, staff, modules |

### Hotel-Specific Capabilities

| Capability | Description |
|---|---|
| Room Types & Rooms | Room inventory and configuration |
| Guest Stays | Check-in to check-out lifecycle |
| Reservations | Room booking management |
| Front Desk | Guest-facing operational hub |
| Housekeeping | Room cleaning and maintenance workflows |
| Guest Folio | Accumulated charges across a stay |
| Hotel Maintenance | Property maintenance management |

### Guest Journey

```text
Reservation (optional) → Arrival → Check-In → Stay (orders, services, requests) → Check-Out → Departure
```

### Shared Engines Used by Hotel

Ordering (room service), Catalog (room service menu), Fulfillment, Service Requests, Chat, Billing (folio), Payments, POS, Inventory, Procurement, Expenses, Cash Management, Reporting, QR, Customer Sessions, Notifications

### Open Decisions — Hotel

- Online booking integration scope — `OPEN DECISION`
- Reservation deposit/prepayment model — `OPEN DECISION`
- Hotel maintenance depth — `OPEN DECISION`
- Minibar management model — `OPEN DECISION`

---

## 8. Restaurant Product Scope

### Business Actors

| Actor | Role |
|---|---|
| Diner / Customer | Eats at the restaurant, places orders |
| Host | Manages seating, waitlist, reservations |
| Server | Takes orders, serves food, manages tables |
| Kitchen Staff | Prepares food |
| Cashier | Handles payments |
| Manager | Oversees restaurant operations |
| Owner / Admin | Manages configuration, staff, modules |

### Restaurant-Specific Capabilities

| Capability | Description |
|---|---|
| Dining Areas | Defined areas within the restaurant (indoor, outdoor, bar, private dining) |
| Table Management | Table configuration, status, assignment |
| Table Operations | Open, occupy, clear, turn over |
| Q / Waitlist | Walk-in customer queue management |
| Table Reservations | Table booking management |

### Customer Journey

```text
Arrival → Seating (or Queue) → QR Scan → Browse Menu → Order → Eat → Request Bill → Pay → Depart
```

### Shared Engines Used by Restaurant

Ordering, Catalog (menu), Fulfillment, KDS, Service Requests, Chat, Billing, Payments, POS, Inventory, Procurement, Expenses, Cash Management, Reporting, QR, Customer Sessions, Notifications

### Open Decisions — Restaurant

- Q/waitlist initial scope — `OPEN DECISION`
- Table reservation depth — `OPEN DECISION`
- Multi-device table session — `OPEN DECISION`
- Course management / meal pacing — `OPEN DECISION`

---

## 9. Cinema Product Scope

### Business Actors

| Actor | Role |
|---|---|
| Patron / Customer | Attends a screening, orders concessions |
| Concession Staff | Prepares and serves food/beverages |
| Usher / Floor Staff | Manages screens, assists patrons |
| Projection / Tech Staff | Manages show schedule and equipment |
| Manager | Oversees cinema operations |
| Owner / Admin | Manages configuration, staff, modules |

### Cinema-Specific Capabilities

| Capability | Description |
|---|---|
| Screens / Auditoriums | Screen configuration and management |
| Seats / Seat Maps | Seat layout per screen |
| Shows / Screenings | Show scheduling and management |
| Ticketing | `FUTURE` — ticket sales and seat reservation |

### Customer Journey (Current Scope)

```text
Arrive → Enter Screen → QR Scan (seat/screen area) → Order Concessions → Watch Show → Depart
```

### Customer Journey (Future — with Ticketing)

```text
Browse Shows → Select Seats → Purchase Ticket → Arrive → Enter Screen → Order Concessions → Watch Show → Depart
```

### Shared Engines Used by Cinema

Ordering (concessions), Catalog (concession menu), Fulfillment, Service Requests, Chat, Billing, Payments, POS, Inventory, Procurement, Expenses, Cash Management, Reporting, QR, Customer Sessions, Notifications

### Open Decisions — Cinema

- Concession delivery model (seat delivery vs counter pickup) — `OPEN DECISION`
- Cinema ticketing scope and timeline — `FUTURE`
- Seat reservation model — `FUTURE`

---

## 10. Shared vs Configurable vs Vertical-Specific vs Future

| Classification | Definition | Example |
|---|---|---|
| **Shared Engine** | One underlying capability serves all verticals | Ordering, Inventory, Payments |
| **Configurable** | Shared engine with vertical-specific terminology, rules, defaults, or UI | Catalog (menu types differ), Service Request categories, Billing (folio vs tab) |
| **Vertical-Specific** | Capability belongs to one vertical only | Hotel rooms/stays, Restaurant tables, Cinema screens/shows |
| **Future** | Planned but not in initial scope | Cinema ticketing, AI features, mobile apps |

See [FEATURE-MATRIX.md](../01-PRODUCT/FEATURE-MATRIX.md) for the complete classification of every capability.

---

## 11. Customer Experience Model

Customers interact with ASSO through a common entry pattern:

```text
QR / Customer Entry
        ↓
Resolve Business (Tenant → Property → Outlet)
        ↓
Resolve Business Context (Room / Table / Seat)
        ↓
Customer Session (scoped, time-bounded, revocable)
        ↓
Vertical-Specific Experience
        ↓
Shared Capabilities (ordering, chat, service requests, billing)
```

| Vertical | Session Scope | Typical Duration |
|---|---|---|
| Hotel | Stay (check-in to check-out) | Hours to days |
| Restaurant | Dining session (seated to departure) | Minutes to hours |
| Cinema | Show session (screening duration) | 2–3 hours |

See [CUSTOMER-EXPERIENCE.md](../01-PRODUCT/CUSTOMER-EXPERIENCE.md) for detailed customer journeys.

---

## 12. Business Operations Model

Business operators manage ASSO through a **Business Console** that provides:

| Area | Description |
|---|---|
| **Operations** | Real-time order management, service requests, fulfillment, table/room/screen status |
| **Inventory** | Stock levels, movements, procurement, receiving, transfers, wastage |
| **Expenses** | Daily expenses, categories, approval, payment sources, cash management |
| **Commerce** | POS, billing, payments, refunds, receipts |
| **Staff** | Staff accounts, roles, permissions, assignments |
| **Reporting** | Operational metrics, summaries, exports |
| **Settings** | Business configuration, modules, policies, notifications |

The Business Console adapts to the vertical — a hotel operator sees room/stay operations, a restaurant operator sees table/kitchen operations, a cinema operator sees screen/show operations — but the shared capabilities (inventory, expenses, reporting, notifications, and cash management) are consistent.

---

## 13. Super Admin Product Model

The ASSO Super Admin manages the platform itself:

| Capability | Description |
|---|---|
| Organization Onboarding | Create and configure customer organizations |
| Tenant Management | Manage tenant status, settings, data |
| Property & Outlet Management | Configure business locations |
| Plan Management | Define module plans and pricing |
| Entitlement Management | Assign module access to tenants |
| Module Catalog | Manage available modules |
| Support & Administration | Platform support functions |
| System Monitoring | Health, usage, system status |
| Platform Configuration | Global defaults and settings |

> `OPEN DECISION` — Pricing/plan model (per-module, tiered plans, custom) has not been finalized.

---

## 14. Module Entitlement Model

```text
Business Type
      ↓
Available Modules (platform offers for this type)
      ↓
Plan / Subscription / Entitlement (what this business has)
      ↓
Enabled Modules (what is active)
      ↓
Staff Permissions (who can use what)
```

### Key Distinctions

| Concept | Question It Answers |
|---|---|
| **Module Entitlement** | Does this business have this capability? |
| **RBAC Permission** | Can this user perform this action? |
| **Policy** | Under what conditions may this action occur? |

### Authorization Flow

```text
Authentication
      ↓
Tenant / Property / Outlet Scope
      ↓
Module Entitlement Check
      ↓
RBAC Permission Check
      ↓
Policy Check
      ↓
Business Operation
```

All three layers are enforced server-side. Frontend navigation hiding is never the actual security mechanism.

### Example

```text
Restaurant "Spice Garden"
├── Ordering         → ON
├── POS              → ON
├── Inventory        → ON
├── Expenses         → ON
├── Q / Waitlist     → OFF (not entitled)
├── Reservations     → OFF (not entitled)
└── Advanced Reports → OFF (not entitled)

Staff: "Ravi" (role: Server)
├── Can create orders     → YES (RBAC)
├── Can process payments  → NO (RBAC — cashier role required)
├── Can view inventory    → NO (RBAC — manager role required)
└── Can record expenses   → NO (RBAC — manager role required)
```

---

## 15. Inventory and Procurement Model

Inventory is a **shared ASSO engine** serving all three verticals.

### Structure

```text
Tenant → Property / Outlet → Inventory Location → Inventory Item → Stock
```

### Capabilities

```text
Inventory
├── Items (name, category, unit, reorder point, active status)
├── Categories (configurable per vertical — food, beverage, supplies, and consumables)
├── Units of Measure (with conversions)
├── Inventory Locations (storeroom, kitchen, bar, central warehouse)
├── Stock (current quantities per item per location)
├── Stock Movements / Ledger
│   ├── Opening balance
│   ├── Purchase receipt (goods receiving)
│   ├── Transfer in / out
│   ├── Consumption
│   ├── Wastage / damage / expiry
│   ├── Adjustment
│   └── Return to supplier
├── Suppliers
├── Procurement / Purchase Orders
├── Goods Receiving
├── Stock Transfers
├── Stock Adjustments (authorized)
├── Wastage Tracking
├── Consumption Tracking
└── Low-Stock / Reorder Alerts
```

### Vertical Usage Examples

| Vertical | Typical Inventory Items |
|---|---|
| Hotel | Food, housekeeping supplies, amenities, maintenance materials, minibar items |
| Restaurant | Food ingredients, beverages, packaging, consumables |
| Cinema | Concession food, beverages, snacks, cleaning supplies |

These are **configuration differences**, not separate inventory systems.

### Key Principles

- Current stock = sum of all movements
- Every stock change creates a movement record
- The Inventory Engine supports controlled transfers between inventory locations/outlets, while exact authorization, approval, and operational rules will be defined in Phase 2
- All calculations are server-side
- Adjustments require authorization
- Future recipe/auto-consumption should be accommodatable

---

## 16. Expense and Cash Management Model

Expenses are a **shared ASSO engine** serving all three verticals.

### Expense Structure

```text
Expenses
├── Daily Expenses (date, amount, category, vendor, notes)
├── Categories (standard + custom, configurable per tenant)
├── Vendors / Payees
├── Payment Sources (cash, bank, UPI, card, other)
├── Attachments (receipt uploads)
├── Approval Workflow (policy-controlled thresholds)
└── Expense Reporting
```

### Cash Management

```text
Cash Management
├── Opening Balance
├── Cash Inflows (sales, other receipts)
├── Cash Outflows (expenses, vendor payments)
├── Closing Balance
├── Reconciliation
└── Discrepancy Tracking
```

### Conceptual Distinctions

```text
Inventory Purchase   — procurement of goods for stock (links to Inventory)
Operating Expense    — daily operational costs (utilities, repairs, maintenance, services)
Capital Expense      — FUTURE — asset purchases, not in initial scope
```

ASSO does not aim to be a complete accounting ERP. It covers operational expense management and cash tracking.

---

## 17. POS / Ordering / Billing / Payment Model

These commerce capabilities are **shared engines** that adapt to each vertical's workflow.

### Ordering

```text
Customer/Staff selects items → Order created → Routed to fulfillment → Status tracked → Charges applied
```

- Orders are always scoped to tenant + property + outlet + context
- The catalog, fulfillment workflow, and context differ per vertical

### POS

- Staff-initiated transactions (as opposed to customer-initiated orders)
- May be context-bound ("charge to room 205") or standalone
- Cash and card handling
- Integrated with cash management

### Billing

| Vertical | Billing Model |
|---|---|
| Hotel | Guest folio — charges accumulate across a stay, settled at checkout |
| Restaurant | Table bill — charges accumulate during a dining session, settled before departure |
| Cinema | Per-order or tab — settled at order time or at a counter |
| Mixed Property | PROPOSED / OPEN DECISION — Cross-outlet folio transfer (e.g. restaurant dining or cinema concessions charged to a hotel room folio). While the shared architecture may support this capability, it is not part of the currently approved initial product scope and requires a separate product/business decision. Phase 2 must not implement or assume it unless explicitly approved later. |

### Payments

- Multiple payment methods: cash, card, UPI, other
- Partial payments supported
- Refunds follow controlled workflows with approval where required
- Payment operations must be idempotent

### Financial History

- All financial transactions (charges, payments, refunds, adjustments) are historical records
- Historical records are never silently modified
- Corrections use adjustments, voids, or compensating transactions

> `OPEN DECISION` — Specific payment provider integrations not yet selected.

---

## 18. Service Request / Chat Model

### Service Requests

A **shared engine** with configurable categories per vertical:

| Vertical | Example Request Categories |
|---|---|
| Hotel | Housekeeping, maintenance, amenities, wake-up call, room issue |
| Restaurant | Waiter assistance, special request, complaint, bill request |
| Cinema | Seat issue, temperature, cleanliness, disturbance |

```text
Request → Categorize → Assign → Notify → Act → Resolve → Record
```

- Categories and priority rules are configurable
- Some requests may require approval (policy-controlled)
- History is maintained

### Chat / Conversations

A **shared engine** for real-time communication:

- Customer ↔ Staff conversations
- May be linked to orders, service requests, or general inquiries
- Conversation history is preserved
- Tenant-scoped

---

## 19. Reporting Model

```text
Operational Data → Metrics / Reporting Layer → Dashboards / Reports / Exports
```

- **Metrics** have clear ownership and centrally-defined calculation rules
- **Dashboards** consume metrics — they do not independently calculate them
- Different verticals may have different relevant metrics
- Reports are tenant-scoped

### Typical Report Areas

| Area | Examples |
|---|---|
| Sales | Revenue, orders, average order value, payment breakdown |
| Inventory | Stock levels, movement summary, wastage, low-stock |
| Expenses | Expense summary, category breakdown, vendor analysis |
| Operations | Service request summary, fulfillment time, chat volume |
| Staff | Staff activity, role distribution |

> `OPEN DECISION` — Exact KPI definitions and report specifications will be defined in later phases. The product requirement is that reporting is a first-class shared capability with consistent metric ownership.

---

## 20. Major Cross-Module Relationships

| Source Event | Triggered Effects |
|---|---|
| **Order Completed** | Inventory consumption, billing charge, financial record, notification, reporting |
| **Payment Received** | Cash management update, financial record, receipt, reporting |
| **Expense Recorded** | Cash management update (if cash), financial record, reporting |
| **Goods Received** | Inventory update (stock in), financial record (expense/payable), reporting |
| **Guest Checkout** | Folio settlement, session invalidation, room status change, housekeeping task |
| **Table Turned Over** | Session invalidation, table status update |
| **Show Ended** | Session invalidation for that screen |
| **Low Stock Threshold** | Alert, potential reorder trigger |
| **Approval Required** | Policy engine triggers approval workflow |

These relationships should be implemented through **domain events** to maintain clean module boundaries.

---

## 21. Product Principles

1. **One platform** — shared engines, not duplicated systems
2. **Equal verticals** — Hotel, Restaurant, Cinema are siblings, never parent/child
3. **Shared engine → configuration → workflow → UI** — the implementation sequence
4. **Multi-tenant** — every business is completely isolated
5. **Module-based** — capabilities are modular and entitlement-controlled
6. **Entitlement ≠ Permission ≠ Policy** — three distinct access-control layers
7. **Documentation-first** — document before implementing
8. **Security by design** — tenant isolation, RBAC, server-side authority from day one
9. **Auditable** — important operations maintain history
10. **Financial integrity** — financial records are never silently modified
11. **Idempotent** — critical operations are safe against duplicate requests
12. **AI-ready** — controlled interfaces for future AI capabilities
13. **Configurable** — businesses customize through configuration, not code

---

## 22. Product-Level Open Decisions

| # | Decision | Category |
|---|---|---|
| 1 | Vertical implementation order | Roadmap |
| 2 | QR code model (static/dynamic/configurable) | Customer Experience |
| 3 | Multi-device session behavior | Customer Experience |
| 4 | Offline POS requirements | Commerce |
| 5 | Payment provider integrations | Commerce |
| 6 | Split bill support | Commerce |
| 7 | Tipping model | Commerce |
| 8 | Multi-currency support | Commerce |
| 9 | Multi-language (i18n) scope | Platform |
| 10 | Pricing / plan model for module entitlements | Platform |
| 11 | Cross-tenant customer data sharing | Customer |
| 12 | Hotel online booking integration | Hotel |
| 13 | Hotel reservation deposit model | Hotel |
| 14 | Hotel maintenance depth | Hotel |
| 15 | Hotel minibar management | Hotel |
| 16 | Restaurant Q/waitlist initial scope | Restaurant |
| 17 | Restaurant reservation depth | Restaurant |
| 18 | Restaurant multi-device table session | Restaurant |
| 19 | KDS depth (multi-station, course management) | Restaurant |
| 20 | Cinema concession delivery model | Cinema |
| 21 | Cinema ticketing timeline | Cinema (Future) |
| 22 | Printing requirements (POS receipts, KDS tickets, folios) | Operations |
| 23 | Recipe / auto-consumption timeline | Inventory (Future) |
| 24 | Exact KPI definitions | Reporting |
| 25 | Cross-vertical / cross-outlet folio charging | PROPOSED / OPEN DECISION — capability for mixed properties; not in initial approved scope; requires separate product decision |

These decisions should be resolved through documented decision processes (see the Architecture Decision issue template) as ASSO progresses through subsequent phases.
