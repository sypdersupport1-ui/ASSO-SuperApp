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
- Production credentials must never be used in development
- Environment-specific configuration uses `.env` files (which are git-ignored)
- Security-sensitive changes require explicit human review
- Tenant isolation must be maintained in all operations
- Server-side authorization is the authority — never the frontend alone
