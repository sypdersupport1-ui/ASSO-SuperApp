# ASSO — Project Governance

This document defines the governance rules for the ASSO project.

---

## 1. Git Branch Model

```text
main
  ↑
develop
  ↑
feature/*
```

### Branch Rules

| Rule | Description |
|---|---|
| No direct pushes to `main` | All changes to `main` must come through reviewed pull requests |
| Feature branches | All work is done in feature branches (e.g., `feature/phase-1-product-definition`) |
| Pull requests required | Changes are proposed through pull requests and reviewed before merging |
| CI protection | CI should eventually protect `main` — builds and tests must pass before merge |
| Production deployment | Production deployment must require appropriate human review |
| Database migrations | All schema changes must use migration files |

### Branch Naming

```text
feature/    — new features or documentation phases
fix/        — bug fixes
refactor/   — refactoring without behavior change
docs/       — documentation-only changes
chore/      — tooling, CI, or maintenance
```

### Required GitHub Settings (Manual Configuration)

The following branch protection rules should be configured manually on GitHub:

**`main` branch:**

- [ ] Require pull request reviews before merging
- [ ] Require at least 1 approving review
- [ ] Require status checks to pass before merging (once CI is set up)
- [ ] Do not allow force pushes
- [ ] Do not allow deletions

**`develop` branch:**

- [ ] Require pull request reviews before merging
- [ ] Require status checks to pass before merging (once CI is set up)

> These settings cannot be configured from the local development environment.
> A repository administrator must configure these on GitHub.

---

## 2. Team Model

### Current Active Model

```text
Human Primary Developer / Product Owner
                 │
  Antigravity (Primary AI Engineering Agent)
                 │
        ASSO GitHub Repository (Source of Truth)
```

The current team setup comprises:
- **One Primary Human Developer / Product Owner**
- **Antigravity as the Primary AI Engineering Agent**
- **Single Shared GitHub Repository**

### Future Scalability

The project is structured to scale smoothly to:

```text
Multiple Developers
         +
Multiple AI Agents
         ↓
Same Shared GitHub Repository
```

### Key Principles

- **Single Source of Truth**: All contributors — human and AI — work from the **same GitHub repository**.
- **Boundaries Defined by Documentation**: The **repository architecture and documentation** define ownership boundaries — not the specific tool or individual.
- **End-to-End Delivery**: The current model enables cohesive end-to-end feature delivery without artificial silos.
- **Agent Operating Rules**: AI agents follow the rules established in `AGENTS.md`.
- **Human Authority**: The human developer/owner maintains final authority on all major architecture, database, security, and financial decisions.
- **Pull Requests and Review**: All non-trivial changes follow feature branching, pull request proposals, and explicit review before merge into `develop`.

---

## 3. Development Phases

```text
Phase 0 — Repository & Project Governance     ✓ COMPLETE
Phase 1 — Product Definition                  ✓ COMPLETE
Phase 2 — Master Architecture                 ← NEXT
Phase 3 — Database, API & Security
Phase 4 — UX & Design System
Phase 5 — Engineering & Operations
Phase 6 — Foundation Audit & Approval
           ↓
     Application Development
```

### Phase Rules

- **No feature implementation before Phase 6 foundation approval.**
- Each phase must be explicitly completed and reviewed before proceeding.
- Do not automatically advance to the next phase.
- The existence of empty directories or placeholder files does not imply that a phase has started.

### Phase Completion

At the end of every phase, a completion report must be produced containing:

- Documents created
- Documents modified
- Decisions made
- Open decisions
- Assumptions
- Potential contradictions
- Items requiring human review

---

## 4. Source of Truth

```text
GitHub Repository
       ↓
ASSO Documentation
       ↓
Architecture / Contracts
       ↓
Implementation
```

- Documentation is not optional.
- An AI agent's assumption is not an architectural decision.
- When something has not been decided, it must be marked as `OPEN DECISION` or `TO BE VALIDATED`.
- Do not silently invent major product or architecture decisions.

---

## 5. Decision Authority

### AI Agents May

- Implement well-defined features within established patterns
- Propose changes and improvements
- Document uncertainties and open questions
- Make minor implementation decisions within established boundaries

### Humans Must Approve

- Major architecture changes
- Database structure changes
- Security model changes
- Tenant isolation changes
- Authorization model changes
- Financial logic
- Inventory logic
- Technology stack changes
- Production system changes
- Advancing to the next development phase

---

## 6. Review Process

1. Contributor creates a feature branch
2. Work is completed with appropriate tests
3. Documentation is updated if needed
4. Pull request is created using the PR template
5. At least one reviewer reviews the changes
6. Architecture, security, and database impacts are evaluated
7. PR is approved and merged
8. Branch is cleaned up after merge

---

## 7. Security Governance

- Secrets must never be committed to the repository
- Production credentials must never be used in development or preview environments
- Environment-specific configuration uses `.env` files (which are git-ignored)
- Security-sensitive changes require explicit human review
- Tenant isolation must be maintained in all operations
- Server-side authorization is the authority — never the frontend alone

---

## 8. Progressive Delivery & Environment Model

### 8.1 Progressive Delivery Principle

> ASSO should be developed as a continuously testable and visually verifiable system. Meaningful implementation slices should be deployable to isolated preview environments during development rather than waiting until an entire vertical is complete.

The preferred delivery cycle is:

```text
Feature / Vertical Slice
        ↓
Frontend + Backend + Database + Authorization + Tests
        ↓
Preview Deployment
        ↓
Functional Validation
        ↓
Visual / UX Validation
        ↓
Review
        ↓
Staging
        ↓
Production
```

This cycle catches issues early in business logic, backend integration, database behavior, authorization, tenant isolation, module entitlement, responsive UI, customer experience, and workflow behavior.

### 8.2 Vertical-Slice Development

When application development begins, features should be developed end-to-end where practical:

```text
Product Behavior → Frontend → API / Server Logic → Database → Authorization → Module Entitlement → Validation → Testing → Documentation → Preview
```

No artificial long-term split (e.g. backend team vs frontend team) is required. The current developer works across the full stack with Antigravity without compromising ASSO's modular architecture.

### 8.3 Environment Model & Strict Isolation

```text
LOCAL  →  PREVIEW  →  STAGING  →  PRODUCTION
```

| Environment | Purpose | Infrastructure & Credentials |
|---|---|---|
| **LOCAL** | Active day-to-day development | Local/development services, mock or sandbox credentials |
| **PREVIEW** | Feature/branch testing, visual UX verification, functional validation | Isolated preview services, test/sandbox credentials |
| **STAGING** | Integrated pre-production validation approximating production | Staging services, test/sandbox or controlled staging credentials |
| **PRODUCTION** | Live customer/business data and production services | Dedicated production infrastructure, production credentials |

> **Security Rule**: Preview and development deployments must not use production databases or production credentials by default.

Databases, credentials, secrets, file storage buckets, authentication configurations, and third-party/payment service credentials must remain strictly isolated across tiers. Never expose production payment or API secrets to development or preview environments.

### 8.4 Preview Validation

Preview environments are used for active verification prior to merge:
- Functional correctness and API contracts
- Database operations and transactional consistency
- Server-side authorization, RBAC, and tenant isolation
- Module entitlement enforcement
- Responsive mobile and desktop UX behaviors
- Customer-facing flows, loading states, and error handling
- Browser-based visual verification

### 8.5 Database Migration Strategy

```text
Schema Change → Migration File → Review → Dev/Preview Validation → Staging → Production
```

- All schema changes must be codified in reviewed migration files.
- Undocumented or manual schema modifications are strictly prohibited.
- Schema changes are validated in preview/staging before application to production.

### 8.6 Production Safeguards

Production deployments require:
- Human approval for all production releases
- Validated database migrations
- Passing automated test suites and builds
- Security checks and tenant isolation verification
- Environment-specific credential injection
- Active monitoring and health checks
- Backup and recovery readiness with rollback planning

AI agents must never independently make destructive or irreversible production changes.

---

## 9. Infrastructure Strategy Principles

### 9.1 Infrastructure-on-Demand Principle

> ASSO should use the simplest production-capable architecture that satisfies current requirements. Additional infrastructure should be introduced only when functional, performance, reliability, scale, or operational requirements justify it.

```text
Scalability = Clear Architecture + Correct Data Design + Clear Boundaries + Measured Infrastructure
```

Do not equate scalability with adding many infrastructure products prematurely.

### 9.2 Technology Directions to Evaluate

These represent **preferred strategic directions to evaluate**, not irrevocably finalized infrastructure or current commitments:

- **Vercel**: Preferred web deployment and preview platform direction to evaluate for ASSO. (No resources provisioned during foundation phases).
- **PostgreSQL / Supabase**: Preferred transactional data platform direction to evaluate as system of record. (No database or tables provisioned during foundation phases).
- **Redis (Optional & Requirement-Driven)**: Redis is optional infrastructure and should be introduced only when a documented requirement justifies it (e.g. caching, rate limiting, ephemeral state, distributed locking, background job queues). The decision flow must be:
  ```text
  Identified Requirement → Architecture Evaluation → Documented Decision → Implementation
  ```

This same principle applies to future infrastructure components (message brokers, search engines, specialized workers, analytics databases).

### 9.3 Observability Direction

Progressive delivery requires planned future support for application logging, error tracking, metrics, health check endpoints, deployment visibility, database monitoring, and security event audit. (Not implemented in the foundation phase).
