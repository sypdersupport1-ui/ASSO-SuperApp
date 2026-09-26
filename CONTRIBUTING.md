# Contributing to ASSO

This document establishes the contribution workflow and standards for ASSO.

---

## 1. Collaboration & Workflow Model

### Current Active Model

Development is currently driven by:
- **One Primary Human Developer / Product Owner**
- **Antigravity as the Primary AI Engineering Agent**
- **Single Shared GitHub Repository**

In this setup, features are implemented **end-to-end** without artificial frontend/backend developer silos:

```text
Product
   ↓
Architecture
   ↓
Database
   ↓
Backend
   ↓
Frontend
   ↓
Tests
   ↓
Documentation
```

### Future Multi-Contributor Expansion

The workflow is architected to scale smoothly. Additional human developers and AI agents can be onboarded in the future without changing the repository structure or governance rules. All contributors work against the same shared GitHub repository.

---

## 2. Repository & Branch Model

```text
main
  ↑
develop
  ↑
feature/*
```

### Rules

- **Do not push directly to `main`.** All changes to `main` must come through reviewed pull requests.
- **Create feature branches** for focused work (e.g., `feature/phase-2-master-architecture`, `feature/inventory-engine`).
- **Use pull requests** to propose changes for merge into `develop`.
- **Changes must be reviewed** before merging.
- **Keep changes cohesive.** Implement complete vertical or shared engine slices end-to-end while keeping individual PRs focused.

---

## Pull Request Guidelines

Every pull request must clearly describe:

- **What** the change does
- **Why** the change is needed
- **Architecture impact** — does this change affect module boundaries, shared engines, or system design?
- **Database impact** — are there schema changes or migrations?
- **Security impact** — does this affect authorization, tenant isolation, or data access?
- **Tenant isolation impact** — could this affect multi-tenant data boundaries?
- **Module entitlement / RBAC impact** — does this affect who can access what?
- **API / contract impact** — are there changes to API contracts?

Use the pull request template provided in `.github/pull_request_template.md`.

---

## Documentation

- **Update documentation** when your change affects architecture, API contracts, database schemas, authorization, or security.
- Documentation lives in `docs/` and is organized by topic area.
- Documentation is the source of truth. Code should implement what documentation defines.

---

## Database Changes

- **All schema changes must include migration files.** Do not make manual database changes.
- **Production database changes require human review** before execution.
- Clearly describe the migration in your pull request.

---

## Testing

- **Test your changes** before submitting a pull request.
- Ensure critical paths work correctly — especially authorization, tenant isolation, payments, inventory, and financial operations.
- Do not submit changes that you know to be broken.

---

## Security

- **Never commit secrets** — API keys, database credentials, tokens, passwords.
- **Never use production credentials** in development environments.
- **Never commit `.env` files** or other environment-specific configuration.
- If your change has security implications, flag them explicitly in the pull request.

---

## Code Quality

- Follow the project's established patterns and conventions.
- Prefer reusing shared engines over creating vertical-specific duplicates.
- Write clear, maintainable code.
- Include meaningful comments where the intent is not obvious from the code itself.

---

## What Requires Human Approval

The following types of changes require explicit human review and approval:

- Architecture changes
- Database structure changes
- Security model changes
- Tenant isolation changes
- Authorization model changes
- Financial logic
- Inventory logic
- Technology stack changes
- Production system changes

---

## Current Phase

ASSO is currently in its documentation and foundation phase. During Phases 0–6, documentation and architecture work takes precedence over feature implementation.

Do not create application features, install application dependencies, or set up application infrastructure until the project has been explicitly authorized to enter the Application Development phase.
