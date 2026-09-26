# ASSO — Feature Matrix

This matrix classifies every major ASSO capability using the following categories:

| Classification | Meaning |
|---|---|
| **Shared Engine** | One underlying ASSO capability serves multiple verticals |
| **Configurable** | The underlying capability is shared, but terminology, rules, workflow, defaults, categories, or UI vary per vertical |
| **Vertical-Specific** | The capability belongs to one business vertical only |
| **Future** | Intentionally planned but not part of the initial implementation scope |

For each vertical, the marker indicates:

- **✓** — Applicable and included
- **C** — Applicable with vertical-specific configuration
- **—** — Not applicable to this vertical
- **F** — Future / not in initial scope

---

## Platform Core

| Domain | Capability | Classification | Hotel | Restaurant | Cinema | Notes |
|---|---|---|---|---|---|---|
| Identity | Authentication | Shared Engine | ✓ | ✓ | ✓ | |
| Identity | User accounts | Shared Engine | ✓ | ✓ | ✓ | |
| Tenancy | Multi-tenancy | Shared Engine | ✓ | ✓ | ✓ | |
| Tenancy | Organizations | Shared Engine | ✓ | ✓ | ✓ | |
| Tenancy | Properties | Shared Engine | ✓ | ✓ | ✓ | |
| Tenancy | Outlets / Locations | Shared Engine | ✓ | ✓ | ✓ | |
| Staff | Staff management | Shared Engine | ✓ | ✓ | ✓ | |
| Access | Roles | Shared Engine | ✓ | ✓ | ✓ | |
| Access | Permissions (RBAC) | Shared Engine | ✓ | ✓ | ✓ | |
| Modules | Module catalog | Shared Engine | ✓ | ✓ | ✓ | |
| Modules | Module entitlements | Shared Engine | ✓ | ✓ | ✓ | |
| Modules | Module dependencies | Shared Engine | ✓ | ✓ | ✓ | |
| Config | Configuration | Shared Engine | ✓ | ✓ | ✓ | |
| Policy | Business policies | Shared Engine | ✓ | ✓ | ✓ | Configurable thresholds and rules |
| Policy | Approval rules | Shared Engine | ✓ | ✓ | ✓ | |
| Audit | Audit logging | Shared Engine | ✓ | ✓ | ✓ | |
| Comms | Notifications | Shared Engine | ✓ | ✓ | ✓ | |

---

## Customer & Context

| Domain | Capability | Classification | Hotel | Restaurant | Cinema | Notes |
|---|---|---|---|---|---|---|
| Customer | Customer records | Shared Engine | ✓ | ✓ | ✓ | |
| Context | Business Context | Shared Engine | C | C | C | Room / Table / Seat-Screen |
| QR | QR generation & resolution | Shared Engine | ✓ | ✓ | ✓ | |
| Session | Customer sessions | Shared Engine | C | C | C | Stay-scoped / dining-scoped / show-scoped |

---

## Operations

| Domain | Capability | Classification | Hotel | Restaurant | Cinema | Notes |
|---|---|---|---|---|---|---|
| Catalog | Catalog / Menu | Configurable | C | C | C | Room service menu / dining menu / concession menu |
| Ordering | Order creation & management | Shared Engine | ✓ | ✓ | ✓ | Context differs per vertical |
| Fulfillment | Order fulfillment | Configurable | C | C | C | Room delivery / kitchen / concession counter |
| Fulfillment | Kitchen Display (KDS) | Configurable | C | C | C | Applicable where food preparation exists |
| Operations | Service requests | Configurable | C | C | C | Request categories differ per vertical |
| Comms | Chat / Conversations | Shared Engine | ✓ | ✓ | ✓ | |

---

## Commerce

| Domain | Capability | Classification | Hotel | Restaurant | Cinema | Notes |
|---|---|---|---|---|---|---|
| POS | Point of sale | Shared Engine | ✓ | ✓ | ✓ | |
| Billing | Charge & bill management | Configurable | C | C | C | Folio-based / table-based / seat-based (cross-outlet folio charging is PROPOSED / OPEN DECISION) |
| Payments | Payment processing | Shared Engine | ✓ | ✓ | ✓ | |
| Payments | Refunds | Shared Engine | ✓ | ✓ | ✓ | |
| Billing | Receipts / Invoices | Shared Engine | ✓ | ✓ | ✓ | |

---

## Inventory & Procurement

| Domain | Capability | Classification | Hotel | Restaurant | Cinema | Notes |
|---|---|---|---|---|---|---|
| Inventory | Inventory items | Shared Engine | ✓ | ✓ | ✓ | |
| Inventory | Inventory categories | Configurable | C | C | C | Categories differ per vertical |
| Inventory | Inventory locations | Shared Engine | ✓ | ✓ | ✓ | |
| Inventory | Units of measure | Shared Engine | ✓ | ✓ | ✓ | |
| Inventory | Stock tracking | Shared Engine | ✓ | ✓ | ✓ | Current + history |
| Inventory | Stock movements / ledger | Shared Engine | ✓ | ✓ | ✓ | |
| Inventory | Stock transfers | Shared Engine | ✓ | ✓ | ✓ | Supports inter-location/outlet transfers; rules defined in Phase 2 |
| Inventory | Stock adjustments | Shared Engine | ✓ | ✓ | ✓ | |
| Inventory | Wastage tracking | Shared Engine | ✓ | ✓ | ✓ | |
| Inventory | Consumption tracking | Shared Engine | ✓ | ✓ | ✓ | |
| Inventory | Low-stock / reorder | Shared Engine | ✓ | ✓ | ✓ | |
| Inventory | Recipe / auto-consumption | Future | F | F | F | Design should not prevent it |
| Procurement | Suppliers | Shared Engine | ✓ | ✓ | ✓ | |
| Procurement | Purchase orders | Shared Engine | ✓ | ✓ | ✓ | |
| Procurement | Goods receiving | Shared Engine | ✓ | ✓ | ✓ | |

---

## Finance Operations

| Domain | Capability | Classification | Hotel | Restaurant | Cinema | Notes |
|---|---|---|---|---|---|---|
| Expenses | Daily expenses | Shared Engine | ✓ | ✓ | ✓ | |
| Expenses | Expense categories | Configurable | C | C | C | Default + custom categories |
| Expenses | Vendors / payees | Shared Engine | ✓ | ✓ | ✓ | |
| Expenses | Expense approval | Shared Engine | ✓ | ✓ | ✓ | |
| Expenses | Payment sources | Shared Engine | ✓ | ✓ | ✓ | Cash, bank, UPI, card, other |
| Expenses | Expense attachments | Shared Engine | ✓ | ✓ | ✓ | |
| Expenses | Expense reporting | Shared Engine | ✓ | ✓ | ✓ | |
| Cash | Cash management | Shared Engine | ✓ | ✓ | ✓ | Opening, closing, reconciliation |

---

## Platform Services

| Domain | Capability | Classification | Hotel | Restaurant | Cinema | Notes |
|---|---|---|---|---|---|---|
| Reporting | Metrics / Reporting | Shared Engine | C | C | C | Vertical-specific metrics, shared layer |
| Events | Domain events | Shared Engine | ✓ | ✓ | ✓ | |
| Storage | File storage | Shared Engine | ✓ | ✓ | ✓ | |
| Ops | Observability | Shared Engine | ✓ | ✓ | ✓ | |

---

## Hotel-Specific

| Domain | Capability | Classification | Hotel | Restaurant | Cinema | Notes |
|---|---|---|---|---|---|---|
| Rooms | Room types & rooms | Vertical-Specific | ✓ | — | — | |
| Stays | Guest stays | Vertical-Specific | ✓ | — | — | Check-in / check-out lifecycle |
| Stays | Reservations | Vertical-Specific | ✓ | — | — | |
| Front Desk | Front desk operations | Vertical-Specific | ✓ | — | — | |
| Housekeeping | Housekeeping management | Vertical-Specific | ✓ | — | — | |
| Guest | Guest folio | Vertical-Specific | ✓ | — | — | Accumulated charges across a stay |
| Maintenance | Hotel maintenance | Vertical-Specific | ✓ | — | — | `OPEN DECISION` — scope and depth |

---

## Restaurant-Specific

| Domain | Capability | Classification | Hotel | Restaurant | Cinema | Notes |
|---|---|---|---|---|---|---|
| Dining | Dining areas | Vertical-Specific | — | ✓ | — | |
| Tables | Table management | Vertical-Specific | — | ✓ | — | Status, capacity, assignment |
| Tables | Table operations | Vertical-Specific | — | ✓ | — | Open, occupy, clear, turn over |
| Queue | Q / waitlist | Vertical-Specific | — | ✓ | — | `OPEN DECISION` — initial scope |
| Reservations | Table reservations | Vertical-Specific | — | ✓ | — | `OPEN DECISION` — initial scope |

---

## Cinema-Specific

| Domain | Capability | Classification | Hotel | Restaurant | Cinema | Notes |
|---|---|---|---|---|---|---|
| Venue | Screens / auditoriums | Vertical-Specific | — | — | ✓ | |
| Venue | Seats / seat maps | Vertical-Specific | — | — | ✓ | |
| Shows | Show / screening management | Vertical-Specific | — | — | ✓ | |
| Ticketing | Ticket sales | Future | — | — | F | Planned future capability |
| Ticketing | Seat reservation | Future | — | — | F | Planned future capability |
| Ticketing | Ticket inventory | Future | — | — | F | Planned future capability |

---

## Super Admin

| Domain | Capability | Classification | Hotel | Restaurant | Cinema | Notes |
|---|---|---|---|---|---|---|
| Admin | Organization onboarding | Shared Engine | ✓ | ✓ | ✓ | |
| Admin | Tenant management | Shared Engine | ✓ | ✓ | ✓ | |
| Admin | Plan & entitlement management | Shared Engine | ✓ | ✓ | ✓ | |
| Admin | Module catalog management | Shared Engine | ✓ | ✓ | ✓ | |
| Admin | System monitoring | Shared Engine | ✓ | ✓ | ✓ | |
| Admin | Platform configuration | Shared Engine | ✓ | ✓ | ✓ | |
