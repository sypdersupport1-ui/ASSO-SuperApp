# ASSO — Product Roadmap

This roadmap describes the broad sequencing of ASSO development. It uses phases rather than specific dates.

---

## Sequencing Principle

ASSO is built foundation-first:

```text
Platform Foundation
       ↓
Shared Core
       ↓
Shared Engines
       ↓
First Vertical
       ↓
Second Vertical
       ↓
Third Vertical
       ↓
Advanced / Future Capabilities
```

Each layer depends on the one below it. Shared engines must exist before vertical-specific workflows can use them.

---

## Phase Sequence

### Foundation

| Phase | Focus | Description |
|---|---|---|
| Phase 0 | Repository & Governance | ✓ Complete |
| Phase 1 | Product Definition | ← Current — define what ASSO is |
| Phase 2 | Master Architecture | System design, module boundaries, patterns |
| Phase 3 | Database, API & Security | Schema design, API contracts, security model |
| Phase 4 | UX & Design System | Design language, component system, information architecture |
| Phase 5 | Engineering & Operations | Dev tooling, CI/CD, deployment, monitoring |
| Phase 6 | Foundation Audit | Review and approval before coding begins |

### Application Development

| Stage | Focus | Description |
|---|---|---|
| Core Platform | Identity, auth, multi-tenancy, RBAC, entitlements | The platform every module depends on |
| Shared Engines | Ordering, inventory, POS, billing, payments, expenses, etc. | The business capabilities shared by all verticals |
| Hotel Vertical | Hotel-specific workflows, room operations, stays, front desk | First vertical implementation |
| Restaurant Vertical | Restaurant-specific workflows, table operations, dining | Second vertical implementation |
| Cinema Vertical | Cinema-specific workflows, screen/seat operations | Third vertical implementation |
| Advanced Capabilities | AI features, advanced reporting, integrations | Future enhancements |

---

## Vertical Sequencing

The order of vertical implementation is:

```text
1. Hotel
2. Restaurant
3. Cinema
```

> `OPEN DECISION` — The vertical implementation order has not been formally approved. This is the proposed sequence based on operational complexity (Hotel exercises the most shared engines). The order may be adjusted based on business priorities.

Each vertical builds on top of the shared engines. The first vertical will drive the creation of shared engines; subsequent verticals will primarily configure and extend them.

---

## Future Capabilities

The following are intentionally planned but **not in initial scope**:

| Capability | Notes |
|---|---|
| Cinema ticketing / seat reservation | Requires ticket inventory, seat maps, showtime management |
| Native mobile applications | Web-first initially; mobile may follow |
| AI-powered features | Platform should be AI-ready; AI features come later |
| Third-party integrations marketplace | Beyond essential payment/notification integrations |
| Advanced analytics / BI | Basic reporting first; advanced analytics later |
| Multi-currency support | `OPEN DECISION` — may be needed depending on target markets |
| Multi-language / i18n | `OPEN DECISION` — scope of initial language support not decided |
| Offline-first POS | `OPEN DECISION` — offline capability requirements not finalized |
| Guest loyalty / rewards | Future enhancement |
| Advanced reservation systems | Beyond basic table/room reservation |

---

## Important Notes

- Exact timelines are not prescribed. This roadmap defines **sequence**, not **schedule**.
- Each foundation phase must be completed and reviewed before proceeding.
- Application development does not begin until Phase 6 foundation approval.
- The first vertical implemented will define patterns that subsequent verticals follow.
