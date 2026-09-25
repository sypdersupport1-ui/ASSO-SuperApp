# ASSO — Product Requirements Document (PRD)

---

## 1. Product Problem

Physical-business operators — hotels, restaurants, and cinema halls — typically rely on fragmented, vertical-specific software tools. Each tool solves one problem (POS, inventory, ordering) without connecting to the broader business operation. This leads to:

- Duplicated data entry across disconnected systems
- No unified view of business operations
- Inconsistent customer experience
- Difficulty managing multiple locations or business types
- High total cost of ownership across multiple vendors

ASSO addresses this by providing **one connected platform** that supports multiple business verticals through shared engines and vertical-specific workflows.

---

## 2. Target Customers

ASSO serves **physical-business operators** who manage daily operations in:

- **Hotels** — from small boutique hotels to mid-scale properties
- **Restaurants** — from single-outlet to multi-location restaurant businesses
- **Cinema Halls** — single or multi-screen cinema operations

A single ASSO customer (organization) may operate:
- Multiple properties (e.g., a hotel chain)
- Multiple outlets per property (e.g., a hotel with a restaurant and a café)
- Mixed business types (e.g., a hotel company that also operates restaurants)

---

## 3. Business Verticals

| Vertical | Business Context | Core Operations |
|---|---|---|
| **Hotel** | Room | Guest stays, front desk, room service, housekeeping, guest services, billing |
| **Restaurant** | Table | Dining, ordering, kitchen fulfillment, POS, table management |
| **Cinema Hall** | Seat / Screen | Show operations, concession ordering, seat-area services |

These are **equal sibling verticals**. Each uses shared platform engines and has its own vertical-specific workflows.

---

## 4. Core Value Proposition

> One platform. Shared engines. Vertical-specific workflows. Connected operations.

- **For the business operator**: A single system to manage orders, inventory, expenses, staff, customers, and reporting across all locations and business types.
- **For the customer/guest**: A consistent, frictionless digital experience — scan a QR code, see the menu, place an order, request service, pay.
- **For the platform**: A scalable multi-tenant architecture where each new vertical or capability benefits from the shared foundation.

---

## 5. User Types

| User Type | Description | Access |
|---|---|---|
| **Customer / Guest** | End-user who interacts with the business through QR / digital interface | Customer-facing experience per vertical |
| **Staff** | Operational employee who fulfills orders, handles requests, manages daily tasks | Business console — operational views |
| **Manager** | Business manager who oversees operations, approves actions, views reports | Business console — management views |
| **Owner / Admin** | Business owner or administrator who manages configuration, staff, modules | Business console — admin views |
| **Super Admin** | ASSO platform administrator who manages tenants, plans, system health | Super Admin console |

---

## 6. Major Capabilities

### 6.1 Platform Core

| Capability | Description |
|---|---|
| Identity & Authentication | User accounts, login, secure sessions |
| Multi-tenancy | Complete tenant isolation — one platform, many businesses |
| Organizations | Customer organizations that may own multiple properties |
| Properties & Outlets | Physical locations and business units within an organization |
| Staff Management | Staff accounts, profiles, assignments |
| RBAC | Role-based access control — what can each user do? |
| Module Entitlements | What capabilities does each business have access to? |
| Module Dependencies | Which modules require other modules? |
| Configuration | Business-level and outlet-level settings |
| Business Policies | Approval rules, thresholds, operational policies |
| Audit | Tracking of important operations and changes |
| Notifications | System, operational, and customer notifications |

### 6.2 Customer & Context

| Capability | Description |
|---|---|
| Customer Engine | Customer records, identification, history |
| Business Context | Abstraction for room / table / seat — the context of interaction |
| QR Engine | QR code generation, resolution, context mapping |
| Customer Sessions | Session creation, management, lifecycle, revocation |

### 6.3 Operations

| Capability | Description |
|---|---|
| Catalog / Menu | Items available for ordering — products, services, food, beverages |
| Ordering | Order creation, modification, status tracking |
| Fulfillment | Order preparation and delivery — kitchen, service, concessions |
| Service Requests | Customer and operational service requests |
| Chat / Conversations | Real-time communication between customers and staff |

### 6.4 Commerce

| Capability | Description |
|---|---|
| POS | Point of sale — staff-initiated transactions |
| Billing | Charge accumulation, bill generation |
| Payments | Payment acceptance, processing, verification |
| Refunds | Controlled refund processing |
| Receipts / Invoices | Transaction documentation |

### 6.5 Inventory & Procurement

| Capability | Description |
|---|---|
| Inventory | Item management, stock tracking, movement history |
| Inventory Locations | Storage locations within a property/outlet |
| Units of Measure | Unit definitions and conversions |
| Suppliers | Supplier/vendor records |
| Procurement | Purchase planning and ordering |
| Purchase Orders | Formal purchase order management |
| Goods Receiving | Receiving and verifying incoming goods |
| Stock Ledger | Complete stock movement history |
| Stock Transfers | Movement between inventory locations |
| Stock Adjustments | Controlled adjustments to stock levels |
| Wastage | Recording and tracking of waste |
| Consumption | Recording item usage/consumption |
| Low-Stock / Reorder | Alerts and reorder point management |

### 6.6 Finance Operations

| Capability | Description |
|---|---|
| Expenses | Daily expense recording and management |
| Expense Categories | Standard and custom categorization |
| Expense Approval | Approval workflows for expenses |
| Payment Sources | Cash, bank, UPI, card, other |
| Cash Management | Cash tracking, opening/closing, reconciliation |
| Expense Attachments | Receipt/document upload for expenses |
| Expense Reporting | Expense summaries and analysis |

### 6.7 Platform Services

| Capability | Description |
|---|---|
| Reporting / Metrics | Operational and business metrics with consistent definitions |
| Domain Events | Internal event system for module communication |
| File Storage | Secure file upload and storage |
| Observability | System health monitoring and diagnostics |

---

## 7. Customer Experience

See [CUSTOMER-EXPERIENCE.md](./CUSTOMER-EXPERIENCE.md) for the detailed customer experience model.

Summary: Customers interact with ASSO through QR-based entry that resolves to a business context. The experience varies by vertical but uses the same shared capabilities (ordering, chat, service requests, billing).

---

## 8. Business Operations

See [BUSINESS-FLOWS.md](./BUSINESS-FLOWS.md) for detailed business flows.

Business operators interact with ASSO through a business console that provides:
- Operational views (orders, requests, real-time activity)
- Management views (inventory, procurement, expenses, staff)
- Reporting views (metrics, summaries, exports)
- Configuration views (settings, modules, policies)

---

## 9. Super Admin

The ASSO Super Admin manages the platform itself:

| Capability | Description |
|---|---|
| Organization Onboarding | Create and configure new customer organizations |
| Tenant Management | Manage tenant settings, status, data |
| Property & Outlet Management | Configure business properties and outlets |
| Plans & Entitlements | Define module plans and assign entitlements |
| Module Catalog | Manage the catalog of available modules |
| Support & Administration | Platform-level support and administrative functions |
| System Monitoring | Health checks, usage metrics, system status |
| Configuration | Platform-wide default settings |

---

## 10. Module Model

ASSO uses a module-based capability model:

```text
Business Type
      ↓
Available Modules (what the platform offers for this business type)
      ↓
Plan / Entitlement (what this specific business has access to)
      ↓
Enabled Modules (what is turned on)
      ↓
Staff Permissions (who can use what within enabled modules)
```

Module entitlement and RBAC are **separate concerns**:

```text
Module Entitlement = Does this business have this capability?
RBAC Permission    = Can this specific user perform this action?
```

Both must be checked on every request.

---

## 11. Inventory

Inventory is a shared ASSO engine serving all three verticals. See the Inventory section in [BUSINESS-FLOWS.md](./BUSINESS-FLOWS.md) and the Inventory product model in [ASSO-MASTER-BLUEPRINT.md](../00-PROJECT/ASSO-MASTER-BLUEPRINT.md).

Key points:
- Shared engine, configured per vertical
- Tracks current stock AND movement history
- Supports categories, units, locations, suppliers, procurement
- All calculations are server-side

---

## 12. Expenses

Expenses are a shared ASSO engine serving all three verticals. See the Expense section in [BUSINESS-FLOWS.md](./BUSINESS-FLOWS.md).

Key points:
- Shared engine, configured per vertical
- Supports categories, vendors, payment sources, approval, attachments
- Distinct from inventory purchases (conceptually)
- Cash management is a related but distinct capability

---

## 13. Reporting

Reporting is a shared ASSO capability:

```text
Operational Data → Metrics / Reporting Layer → Dashboards / Reports / Exports
```

- Metrics have clear ownership and consistent definitions
- Different verticals may have different relevant metrics
- Dashboards and reports consume shared metric definitions
- No dashboard should independently calculate a metric that should be centrally defined

---

## 14. Product Principles

1. **One platform** — not three separate products
2. **Shared engines** — common capabilities are built once
3. **Equal verticals** — Hotel, Restaurant, Cinema are siblings
4. **Multi-tenant** — every business is isolated
5. **Module-based** — capabilities are modular and entitlement-controlled
6. **Documentation-first** — document, then build
7. **Security by design** — not an afterthought
8. **Configurable** — businesses customize through configuration, not code
9. **Auditable** — important operations maintain history
10. **AI-ready** — the platform should support future AI capabilities through controlled interfaces

---

## 15. Scope Boundaries

### Included in Initial Scope

- Three verticals: Hotel, Restaurant, Cinema
- All shared engines listed in Section 6
- QR-based customer experience
- Business console for operators
- Super Admin for platform management

### Excluded from Initial Scope

- Cinema ticketing / seat reservation (`FUTURE`)
- Native mobile applications (`FUTURE`)
- AI-powered features (`FUTURE`)
- Third-party integration marketplace (`FUTURE`)
- Complete accounting / ERP functionality
- Advanced reservation systems
- Guest loyalty / rewards programs

---

## 16. Open Questions

| # | Question | Status |
|---|---|---|
| 1 | Vertical implementation order (Hotel → Restaurant → Cinema?) | `OPEN DECISION` |
| 2 | Offline POS capability requirements | `OPEN DECISION` |
| 3 | Multi-currency support | `OPEN DECISION` |
| 4 | Multi-language / i18n scope | `OPEN DECISION` |
| 5 | Cross-tenant customer data sharing | `OPEN DECISION` |
| 6 | QR code static vs dynamic model | `OPEN DECISION` |
| 7 | Multiple-device session handling at same table | `OPEN DECISION` |
| 8 | Concession delivery model for cinema | `OPEN DECISION` |
| 9 | Pricing / plan structure for module entitlements | `OPEN DECISION` |
| 10 | Payment provider integrations | `OPEN DECISION` |
| 11 | Printing requirements (POS receipts, KDS tickets, etc.) | `OPEN DECISION` |
| 12 | Recipe / ingredient-based automated consumption | `FUTURE` — design should not prevent it |
