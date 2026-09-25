# ASSO — AI Agent Operating Rules

This document establishes the operating rules for all AI coding agents working on ASSO.

Both **Antigravity** and **OpenCode** must follow these rules.

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

---

## Prohibited Actions

- Do not access or modify production systems without explicit human authorization.
- Do not commit secrets, credentials, or environment-specific configuration.
- Do not silently rewrite historical financial transactions.
- Do not bypass tenant isolation for convenience.
- Do not invent business requirements — document uncertainty instead.

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

All agents work from the same GitHub repository. The repository architecture and documentation define ownership boundaries — not the AI tool being used.

```text
              ASSO
                │
             GitHub
                │
     ┌──────────┴──────────┐
     │                      │
Developer A            Developer B
     │                      │
Antigravity              OpenCode
     │                      │
     └──────────┬───────────┘
                │
          Same repository
```
