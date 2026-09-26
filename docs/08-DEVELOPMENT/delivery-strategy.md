# ASSO — Progressive Delivery & Environment Strategy

This document defines the delivery lifecycle, vertical-slice engineering model, and environment isolation strategy for the ASSO platform.

---

## 1. Progressive Delivery Principle

> **ASSO should be developed as a continuously testable and visually verifiable system. Meaningful implementation slices should be deployable to isolated preview environments during development rather than waiting until an entire vertical is complete.**

Rather than monolithic releases where an entire vertical is coded before deployment, ASSO uses progressive delivery to catch defects early across:
- Business logic correctness
- Backend integration and API contracts
- Database behavior and transactional integrity
- Server-side authorization and RBAC
- Multi-tenant data isolation
- Module entitlement enforcement
- Responsive mobile and desktop UX
- Customer-facing journey flows
- Workflow edge cases, loading states, and error handling

---

## 2. Delivery Cycle

The preferred delivery cycle for any capability is:

```text
Feature / Vertical Slice
           ↓
Frontend + Backend + Database + Authorization + Tests
           ↓
Preview Deployment (Isolated Environment)
           ↓
Functional Validation
           ↓
Visual / UX Validation (Browser-based verification)
           ↓
Code & Architectural Review (PR)
           ↓
Staging Deployment (Integrated validation)
           ↓
Production Deployment (Human approved)
```

---

## 3. Vertical-Slice Development

When application development begins, features should be developed end-to-end as cohesive vertical slices where practical:

```text
Product Behavior
       ↓
Frontend UI / State
       ↓
API / Server Logic
       ↓
Database & Schema
       ↓
Authorization (RBAC)
       ↓
Module Entitlement Check
       ↓
Validation & Error Handling
       ↓
Automated Tests
       ↓
Documentation Updates
       ↓
Preview Deployment
```

There is **no artificial split** between a "frontend team" and a "backend team". The current developer works across the full stack with Antigravity to deliver complete, functioning slices while strictly respecting ASSO's modular architecture and shared domain boundaries.

---

## 4. Environment Model

ASSO defines four distinct environment tiers:

```text
LOCAL  →  PREVIEW  →  STAGING  →  PRODUCTION
```

| Environment | Purpose | Target Workload | Data & Services |
|---|---|---|---|
| **LOCAL** | Active day-to-day feature development | Local workstations / dev containers | Local/mock services, sandbox credentials |
| **PREVIEW** | Feature/branch validation, visual UX verification, functional review | Ephemeral or branch-bound preview instances | Isolated preview services, sandbox credentials |
| **STAGING** | Pre-release integration testing, release candidate verification | Stable pre-production environment | Staging services approximating production; synthetic/scrubbed data |
| **PRODUCTION** | Live business operations across customer properties | Dedicated production infrastructure | Real customer and business data; production credentials |

---

## 5. Strict Environment Isolation

> **Security Rule**: Preview and development deployments must not use production databases or production credentials by default.

Each environment tier maintains strict physical or logical separation:

```text
Local       → Local / Development services
Preview     → Preview / Isolated services
Staging     → Staging services
Production  → Production services
```

The following must be kept strictly separated across tiers:
- Databases and connection strings
- Credentials and service tokens
- Application secrets and encryption keys
- File storage buckets and media stores
- Authentication configurations and tenant directories
- Third-party service accounts and webhooks

---

## 6. External Service & Payment Environments

Third-party integrations (payment gateways, SMS/email notifications, POS hardware bridges) must strictly honor environment boundaries:

```text
Development  → Test / Sandbox credentials
Preview      → Test / Sandbox credentials
Staging      → Test / Sandbox or controlled staging credentials
Production   → Production credentials
```

**Never expose production payment keys or API credentials to development or preview environments.**

---

## 7. Preview Validation Checklist

Preview deployments provide actual functional and visual verification before merge:
- [ ] **Functional Verification**: Business logic matches documented flows.
- [ ] **API Contracts**: Request/response contracts, headers, and validations match specifications.
- [ ] **Database Integrity**: Queries, constraints, and transactions perform safely.
- [ ] **Authorization & RBAC**: Roles and permissions are strictly enforced server-side.
- [ ] **Tenant Isolation**: No data leakage across tenants or properties.
- [ ] **Module Entitlements**: Unentitled capabilities are blocked server-side.
- [ ] **Responsive UX**: Mobile, tablet, and desktop layouts render cleanly.
- [ ] **Customer Experience**: QR entry, cart, catalog, and status screens function smoothly.
- [ ] **States**: Loading indicators, empty states, and error handling display gracefully.
- [ ] **Visual Validation**: Browser-based visual verification of key user flows.

---

## 8. Database Migration Strategy

```text
Schema Change → Migration File → PR Review → Dev/Preview Validation → Staging → Production
```

- All schema mutations must be committed as versioned migration files.
- Manual or undocumented schema modifications on any environment are strictly prohibited.
- Migrations are tested in local/preview first, validated in staging, and executed in production under human approval.

---

## 9. Staging Integration

Staging provides the final verification step before production:
- Approximates production architecture and configuration.
- Validates cross-module interactions and domain events in an integrated setting.
- Never exposes real customer production data unnecessarily.
- Confirms deployment scripts and migration execution without operational disruption.
