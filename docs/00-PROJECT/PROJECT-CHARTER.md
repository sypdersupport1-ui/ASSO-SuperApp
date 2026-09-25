# ASSO — Project Charter

---

## 1. Project Purpose

ASSO is a multi-tenant SaaS platform that enables physical-business operators to manage their daily operations through a unified, modern software system.

Rather than building separate products for each business type, ASSO provides a single platform with shared engines and vertical-specific workflows — reducing duplication, improving consistency, and enabling faster capability expansion.

---

## 2. Vision

> Enable any physical-business operator — hotel, restaurant, or cinema — to run their business efficiently through one intelligent, connected platform.

ASSO should feel like one product to the business operator, while respecting the unique operational realities of each business vertical.

---

## 3. Scope

### In Scope — Initial Release

- **Three business verticals**: Hotel, Restaurant, Cinema Hall (equal siblings)
- **Shared platform core**: Identity, multi-tenancy, RBAC, module entitlements, configuration, audit
- **Shared domain engines**: Customer, ordering, POS, billing, payments, inventory, procurement, expenses, cash management, service requests, chat, notifications, reporting
- **Vertical-specific workflows and modules** for each of the three verticals
- **Customer-facing experience** via QR-based entry and digital interaction
- **Business console** for operational management
- **Super Admin** for platform administration

### Out of Scope — Initial Release

- Accounting ERP functionality
- Full hotel property management system (PMS) replacement
- Cinema ticketing / seat reservation (marked as `FUTURE`)
- Mobile native applications (web-first)
- Third-party marketplace / integrations beyond essential payment providers
- AI-powered features (infrastructure should be AI-ready, but AI features are `FUTURE`)

### Non-Goals

- ASSO is not three separate products sharing a login screen
- ASSO is not a generic business-process automation tool
- ASSO is not competing with full-scale enterprise ERP systems
- ASSO does not aim to replace dedicated property management systems in its initial scope

---

## 4. Initial Verticals

| Vertical | Description |
|---|---|
| **Hotel** | Guest stays, room operations, front desk, housekeeping, guest services, food/beverage ordering, billing |
| **Restaurant** | Dining operations, table management, QR ordering, kitchen fulfillment, POS, billing |
| **Cinema Hall** | Venue operations, screen/seat context, concession ordering, POS, billing; ticketing is `FUTURE` |

These are equal sibling verticals. No vertical is treated as the "primary" product.

---

## 5. Major Outcomes

Phase 1 (this phase) establishes:

1. A clear product definition that distinguishes shared, configurable, vertical-specific, and future capabilities
2. Business flow documentation for all three verticals
3. A feature matrix classifying every major capability
4. Customer experience models for each vertical
5. A product roadmap establishing sequencing
6. Governance documents for team principles and quality standards

Subsequent phases will establish architecture, database design, API contracts, UX/design system, and engineering/operational processes before application development begins.

---

## 6. Product Principles

1. **One platform** — shared engines, not duplicated systems
2. **Equal verticals** — Hotel, Restaurant, Cinema are siblings, not parent/child
3. **Documentation-first** — decisions are documented before implemented
4. **Security by design** — tenant isolation, RBAC, entitlements, server-side authority
5. **Modularity** — capabilities are modular and entitlement-controlled
6. **Configurability** — shared engines adapt through configuration, not code duplication
7. **Auditability** — important operations maintain history
8. **Simplicity** — do not over-engineer for scenarios that do not yet exist

---

## 7. Current Phase

```text
Phase 0 — Repository & Project Governance        ✓ COMPLETE
Phase 1 — Product Definition                      ← CURRENT
Phase 2 — Master Architecture
Phase 3 — Database, API & Security
Phase 4 — UX & Design System
Phase 5 — Engineering & Operations
Phase 6 — Foundation Audit & Approval
           ↓
     Application Development
```

---

## 8. Governance

This charter establishes the product direction. Detailed architecture, database, API, and implementation decisions are made in subsequent phases and documented in their respective locations under `docs/`.

The source-of-truth hierarchy is:

```text
GitHub Repository
       ↓
ASSO Documentation
       ↓
Architecture / Contracts
       ↓
Implementation
```

Major decisions require human approval. See `docs/00-PROJECT/governance.md` for full governance rules.
