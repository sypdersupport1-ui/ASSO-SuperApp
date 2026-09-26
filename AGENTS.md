# ASSO — AI Agent Operating Rules

The primary AI engineering agent is **Antigravity**. These operating rules apply to Antigravity and any future AI coding agents or human contributors working on ASSO.

---

## Current Phase

> **During Phases 0–6, documentation and architecture work takes precedence over feature implementation.**

Do not build application features unless the project has entered the Application Development phase and you have been explicitly instructed to do so.

---

## Before Making Changes

Before making any significant change, you must:

1. **Read relevant documentation** in `docs/` before modifying or creating anything.
2. **Inspect existing code** before creating new abstractions — something similar may already exist.
3. **Identify the owning module** — every domain object has a clear owner (see documentation).
4. **Check shared engines first** — prefer reuse over duplication.
5. **Check dependencies** — understand what your change depends on and what depends on it.
6. **Check tenant implications** — will this work correctly in a multi-tenant context?
7. **Check security implications** — authorization, data isolation, input validation.
8. **Check entitlement/RBAC implications** — module entitlements and user permissions are separate concerns; both must be respected.

---

## Product Architecture

- **One ASSO platform**: ASSO is a unified platform, not separate products.
- **Equal verticals**: Hotel, Restaurant, Cinema are equal sibling verticals (no hierarchy).
- **Shared engines**: Common business capabilities are shared.
- **Vertical-specific modules**: Verticals contain only vertical-specific workflows and UI.
- **Implementation principle**: Shared engine → vertical configuration → workflow → UI.

## Core Platform

ASSO's core platform must support:
- Multi-tenancy
- Organizations / Properties / Outlets
- RBAC
- Module Entitlements
- Module Dependencies
- Policies / Approval Rules
- Audit

## Shared Capabilities

ASSO uses shared domain engines for the following capabilities:
- Customer
- Business Context
- QR
- Ordering
- POS
- Billing
- Payments
- Inventory
- Procurement
- Expenses
- Cash Management
- Service Requests
- Chat / Conversations
- Notifications
- Reporting
- Domain Events
- Observability

## Important Architecture Rules

- **Business Context abstraction**: Contexts like Hotel Room, Restaurant Table, or Cinema Seat should be abstracted appropriately.
- **Workflow / state machines**: Important domain entities must use controlled workflows and state machines.
- **Domain events**: Use internal domain events for clean module boundaries (e.g. Order Completed triggers Inventory, Financial, etc.).
- **Data ownership**: Every major domain object must have a clear owning module. No duplicate sources of truth.
- **Current state vs historical records**: For important domains, distinguish current state from historical record (e.g. current inventory + stock movement history).
- **Idempotency**: Critical operations (payments, inventory movements, etc.) must be designed for duplicate-request safety.
- **Modular monolith initially**: Do not introduce microservices prematurely.
- **No premature microservices**: Stick to the modular monolith architecture initially.

## Security

Security is a core architectural concern. ASSO must implement:
- Tenant isolation
- RLS where appropriate
- Server-side authorization (frontend is never the authority)
- RBAC
- Module entitlement enforcement
- Policy enforcement
- Input validation
- Rate limiting
- Secure sessions
- QR security (opaque tokens, context-aware)
- File security
- Payment verification
- Audit logging
- Secrets management
- Backups/recovery

---

## Core Rules

### Shared Engines Over Duplication

ASSO uses shared engines (ordering, inventory, expenses, POS, payments, etc.) that serve all verticals. Do not create vertical-specific copies of shared functionality.

```text
✗  Hotel Inventory, Restaurant Inventory, Cinema Inventory
✓  Inventory Engine → configured per vertical
```

### No Silent Architecture Decisions

Do not silently invent or alter major product, architecture, database, or security decisions. If something has not been decided, mark it explicitly:

```text
OPEN DECISION — [description of what needs to be decided]
```

or:

```text
TO BE VALIDATED — [description of assumption]
```

### Tenant Isolation

Every data access and mutation must respect tenant boundaries. Never allow cross-tenant data leakage. Tenant isolation is enforced server-side, not by frontend navigation.

### Server-Side Authority

The frontend is never the authority for:

- Authorization decisions
- Tenant isolation
- Inventory calculations
- Financial calculations
- Payment validation

### RBAC and Module Entitlements

These are distinct concerns:

```text
Module Entitlement = Does this business have this capability?
RBAC Permission    = Can this specific user perform this action?
```

Both must be checked. Do not rely on frontend navigation hiding as a security mechanism.

### Database Changes

- All schema changes must use migration files.
- Never modify production databases without explicit human authorization.
- Financial and inventory data must maintain transactional integrity.

### Testing

- Test changes appropriately before submitting.
- Critical paths (payments, inventory, authorization) require thorough testing.

### Documentation

- Update documentation when architecture, contracts, or APIs change.
- If your change introduces a new pattern or deviates from an existing one, document why.

### Progressive Delivery & Vertical Slices

- When application development begins, features should be developed as cohesive **vertical slices** where practical:
  ```text
  Product Behavior → Frontend → API/Server Logic → Database → Authorization → Module Entitlement → Validation → Tests → Documentation → Preview
  ```
- Validate frontend, backend, database behavior, and authorization together rather than in disconnected silos.
- Isolated **preview deployments** are expected during implementation for continuous visual and functional verification.

### Strict Environment Isolation

- **Preview and development environments must never use production databases or production credentials by default.**
- Environment tiers are strictly isolated:
  - **LOCAL**: Active development against local/dev services and sandbox credentials.
  - **PREVIEW**: Feature branch testing, UX/visual review, and functional validation against isolated preview services.
  - **STAGING**: Integrated pre-production validation approximating production without exposing customer data.
  - **PRODUCTION**: Live customer and business data with strict operational controls.
- Keep databases, credentials, API secrets, file storage, auth configurations, and payment sandbox/live keys strictly separated across tiers.

### Infrastructure-on-Demand & Technology Direction

- **Infrastructure-on-demand**: Use the simplest production-capable architecture satisfying current requirements. Do not add infrastructure speculatively.
  ```text
  Scalability = Clear Architecture + Correct Data Design + Clear Boundaries + Measured Infrastructure
  ```
- **Vercel** is the preferred web deployment and preview platform direction to evaluate (not irrevocably finalized; not provisioned now).
- **PostgreSQL / Supabase** is the preferred transactional data platform direction to evaluate as system of record (not finalized; not provisioned now).
- **Redis is optional infrastructure** and must only be introduced when a documented requirement justifies it (e.g., caching, rate limiting, ephemeral coordination). The decision flow must be:
  ```text
  Identified Requirement → Architecture Evaluation → Documented Decision → Implementation
  ```

---

## Prohibited Actions

- Do not access or modify production systems without explicit human authorization.
- Do not perform destructive or irreversible production operations independently.
- Do not use production databases or credentials in preview or development environments.
- Do not commit secrets, credentials, or environment-specific configuration.
- Do not add infrastructure products speculatively without documented requirement justification.
- Do not silently rewrite historical financial transactions.
- Do not bypass tenant isolation for convenience.
- Do not invent business requirements — document uncertainty instead.
- **No feature coding before foundation approval**.

---

## Human Approval Required

The following require human review and approval before merging:

- Major architecture changes
- Database structure changes
- Security model changes
- Tenant isolation changes
- Authorization model changes
- Financial logic
- Inventory logic
- Production system changes
- Technology stack changes

AI agents may **propose**. Humans **approve** major decisions.

---

## Completion Standards

A change is not complete merely because the UI works. Consider:

- Business flow correctness
- Module ownership
- API contracts
- Database integrity
- Authorization and tenant isolation
- Entitlement checks
- Backend validation
- Error handling
- Idempotency (where applicable)
- Audit trail (where applicable)
- Tests
- Documentation updates

---

## Working Model

```text
Human Primary Developer / Product Owner
                 │
  Antigravity (Primary AI Engineering Agent)
                 │
        ASSO GitHub Repository (Source of Truth)
```

The current active development model consists of:
- **One human primary developer / Product Owner**
- **Antigravity as the primary AI engineering agent**
- **GitHub as the single source of truth**

Additional human developers and AI agents may be introduced later. Regardless of team composition, all contributors work against the same shared GitHub repository. The repository architecture, documentation, and module boundaries define ownership — not the tool or individual.

All agents must continue to follow:
- Architecture documentation and API contracts
- Strict module boundaries and data ownership
- Security rules, tenant isolation, and RLS
- Server-side authorization, RBAC, and module entitlements
- Policy enforcement and approval workflows
- Migration-based database changes
- Testing and idempotency on critical paths
- Documentation updates
- Human approval requirements for major decisions
