# ASSO

**A scalable multi-tenant SaaS platform for hospitality and entertainment businesses.**

---

## Overview

ASSO is a unified platform serving three initial business verticals:

- **Hotel**
- **Restaurant**
- **Cinema Hall**

These are **equal sibling verticals** — not a hierarchy. ASSO is one platform, not three separate applications.

---

## Architecture Philosophy

ASSO follows a shared-engine architecture. Common business capabilities are built once and configured per vertical, while vertical-specific workflows and UI live in their own modules.

```text
ASSO PLATFORM
      │
      ▼
SHARED PLATFORM CORE
      │
      ▼
SHARED DOMAIN ENGINES
      │
      ▼
VERTICAL CONFIGURATION
      │
      ▼
VERTICAL-SPECIFIC WORKFLOWS
      │
      ▼
VERTICAL-SPECIFIC UI
```

### Shared Engines — Not Duplicated Systems

Capabilities like ordering, inventory, expenses, POS, and payments are shared engines that serve all verticals through configuration and context:

```text
ORDER ENGINE                    INVENTORY ENGINE
    ├── Hotel  → Room               ├── Hotel
    ├── Restaurant → Table          ├── Restaurant
    └── Cinema → Seat               └── Cinema

EXPENSE ENGINE                  POS ENGINE
    ├── Hotel                       ├── Hotel
    ├── Restaurant                  ├── Restaurant
    └── Cinema                      └── Cinema
```

Vertical-specific functionality (e.g., hotel stays, restaurant table management, cinema screen scheduling) lives inside its respective vertical module.

---

## Current Status

> **Documentation & Foundation Phase**
>
> Application development has not started.

The project is currently in its documentation and governance foundation phase. The immediate objective is to properly define the product, architecture, database principles, security model, UX strategy, development process, and operational model **before feature coding begins**.

### Development Phases

```text
Phase 0 — Repository & Project Governance    ← CURRENT
Phase 1 — Product Definition
Phase 2 — Master Architecture
Phase 3 — Database, API & Security
Phase 4 — UX & Design System
Phase 5 — Engineering & Operations
Phase 6 — Foundation Audit & Approval
         ↓
Application Development
```

No feature implementation will begin before Phase 6 foundation approval.

---

## Source of Truth

```text
GitHub Repository
       ↓
ASSO Documentation
       ↓
Architecture / Contracts
       ↓
Implementation
```

- **GitHub** is the single source of truth for the repository.
- **Documentation** is the source of truth for product and architecture decisions.
- All AI agents and human developers work against the **same repository**.

---

## Current Development Team

- **One primary human developer** (Product Owner & Lead Developer)
- **Antigravity** as the primary AI engineering agent

All work is committed to the shared GitHub repository. Future human developers and AI agents may be introduced as the platform evolves. The repository architecture and documentation define ownership boundaries — not the specific tool or individual.

---

## Key Principles

- **One platform**, shared engines, vertical-specific workflows
- **Multi-tenant** — supports multiple businesses, properties, and outlets per customer
- **Documentation-first** — decisions are documented before they are implemented
- **Security by design** — tenant isolation, RBAC, module entitlements, server-side authorization
- **Progressive delivery** — vertical-slice development, isolated preview validation, staging before production
- **Strict environment isolation** — local, preview, staging, and production tiers with completely separated credentials and databases
- **Infrastructure-on-demand** — simplest production-capable architecture; technology directions evaluated by requirement (Vercel web preview, PostgreSQL/Supabase transactional data, Redis requirement-driven)
- **Auditability** — important operations maintain history and audit trails
- **No premature architecture** — decisions are made when there is sufficient context

---

## Repository Structure

```text
ASSO/
├── README.md
├── AGENTS.md
├── CONTRIBUTING.md
├── .gitignore
├── .editorconfig
│
├── docs/
│   ├── 00-PROJECT/
│   ├── 01-PRODUCT/
│   ├── 02-ARCHITECTURE/
│   ├── 03-TECHNOLOGY/
│   ├── 04-DATABASE/
│   ├── 05-API/
│   ├── 06-AUTHORIZATION/
│   ├── 07-UX/
│   ├── 08-DEVELOPMENT/
│   ├── 09-OPERATIONS/
│   └── 10-DECISIONS/
│
└── .github/
    ├── pull_request_template.md
    └── ISSUE_TEMPLATE/
```

No application source code exists yet. This is intentional.

---

## License

`TO BE DECIDED`
