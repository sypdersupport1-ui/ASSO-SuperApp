# Contributing to ASSO

This document establishes the contribution workflow and standards for ASSO.

---

## 1. Collaboration & Workflow Model

### Current Active Model

Development is currently driven by:
- **One Primary Human Developer / Product Owner**
- **Antigravity as the Primary AI Engineering Agent**
- **Single Shared GitHub Repository**

In this setup, features are implemented **end-to-end** as cohesive vertical slices:

```text
Product Behavior
   ↓
Frontend
   ↓
API / Server Logic
   ↓
Database
   ↓
Authorization & Entitlements
   ↓
Validation & Tests
   ↓
Documentation
   ↓
Preview Deployment (isolated environment)
   ↓
Functional & Visual Review
   ↓
Staging
   ↓
Production
```

### Progressive Delivery & Environment Isolation

- **Preview Deployments**: Meaningful implementation slices are deployed to isolated preview environments for visual, functional, responsive, and UX verification rather than waiting for an entire vertical.
- **Strict Environment Isolation**: Local, Preview, Staging, and Production are completely isolated. Preview and development environments must never use production databases or production credentials. External payment and service integrations must use test/sandbox credentials in non-production tiers.

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

- **All schema changes must include migration files.** Do not make manual or undocumented schema changes.
- **Migration lifecycle**: `Schema Change → Migration File → Review → Dev/Preview Validation → Staging → Production`.
- **Production database changes require human review and approval** before execution.
- Clearly describe the migration and its reversibility in your pull request.

---

## Testing

- **Test your changes** before submitting a pull request.
- Ensure critical paths work correctly — especially authorization, tenant isolation, payments, inventory, and financial operations.
- Do not submit changes that you know to be broken.

---

## Security

- **Never commit secrets** — API keys, database credentials, tokens, passwords, private keys.
- **Never use production credentials or production databases** in development or preview environments.
- **External service environments**: Use test/sandbox credentials in Local, Preview, and Staging. Production keys are strictly isolated to Production.
- **Never commit `.env` files** or other environment-specific configuration.
- If your change has security implications, flag them explicitly in the pull request.

---

## Code Quality

- Follow the project's established patterns and conventions.
- Prefer reusing shared engines over creating vertical-specific duplicates.
- **Infrastructure-on-demand**: Write code that runs against simple, measured infrastructure rather than adding speculative dependencies.
- Write clear, maintainable code.
- Include meaningful comments where the intent is not obvious from the code itself.

---

## What Requires Human Approval

The following types of changes require explicit human review and approval:

- Architecture changes
- Database structure changes and production migrations
- Security model and tenant isolation changes
- Authorization model and module entitlement changes
- Financial and inventory logic
- Technology stack and infrastructure changes
- Production system changes and releases
- Destructive or irreversible production operations (AI agents must never perform independently)

---

## Current Phase

ASSO is currently in its documentation and foundation phase. During Phases 0–6, documentation and architecture work takes precedence over feature implementation.

Do not create application features, install application dependencies, or set up application infrastructure until the project has been explicitly authorized to enter the Application Development phase.
