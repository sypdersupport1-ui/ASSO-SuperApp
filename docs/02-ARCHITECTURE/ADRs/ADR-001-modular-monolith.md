# ADR-001: Modular Monolith Architecture

**Status**: Accepted  
**Date**: 2026-09-26  
**Deciders**: Human Product Owner, Antigravity

---

## Context

ASSO is a multi-tenant SaaS platform supporting three business verticals. A fundamental architectural decision is required: should ASSO be built as a distributed system (microservices) or as a modular monolith?

The team currently consists of one human primary developer and one AI engineering agent.

---

## Decision

ASSO is architected as a **production-grade modular monolith**.

---

## Rationale

1. **Team size**: A distributed system requires significant operational overhead (service discovery, distributed tracing, inter-service authentication, deployment coordination) that a two-person team cannot productively absorb at this stage.

2. **Strong boundaries without microservices**: ASSO's engine/module boundaries (Platform Core → Shared Engines → Vertical Modules) provide strong internal isolation. These boundaries do not require separate deployment units.

3. **Data integrity**: Financial, inventory, and billing operations benefit from same-database transactions. Cross-service transactions (2-phase commit or sagas) add significant complexity and failure surface.

4. **Operational simplicity**: One deployment unit is easier to monitor, debug, and operate.

5. **Future extraction is viable**: Because the module boundaries are explicit and documented, extracting a module to a service later (if justified by scale or operational requirements) is a refactoring exercise, not a redesign.

6. **Not premature**: Microservices are an optimization for specific operational problems (team autonomy at scale, independent deployability, polyglot services). None of these problems exist today.

---

## Consequences

**Positive**:
- Lower operational complexity
- Same-process transactions for financial operations
- Simpler debugging and tracing
- Lower infrastructure cost

**Negative / Trade-offs**:
- All modules share the same deployment unit — a crash affects all modules
- Scaling granularity is at the application level, not module level
- Technology choices are shared across modules (e.g., runtime language)

**Mitigations**:
- Stateless design enables horizontal scaling of the full application
- Module boundaries are enforced in code structure — preventing accidental coupling that would make future extraction difficult
- Background workers can be separated from the API server without a full microservice split

---

## Review Trigger

This decision should be revisited if:
- A specific module has significantly different scaling requirements than others
- Team size grows to the point where independent deployability becomes a productivity concern
- A genuinely external service need emerges (e.g., a real-time engine with different technology requirements)
