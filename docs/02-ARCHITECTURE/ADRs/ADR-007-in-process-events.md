# ADR-007: In-Process Domain Events over Distributed Message Broker

**Status**: Accepted  
**Date**: 2026-09-26  
**Deciders**: Human Product Owner, Antigravity

---

## Context

ASSO's modular design requires communication between engines without tight coupling. For example, when an order is delivered, the Billing Engine must post a charge, the Inventory Engine must record consumption, and notifications must be dispatched. How should this inter-module communication work?

Options:
1. Direct service calls (tight coupling)
2. In-process pub/sub (domain event bus)
3. Distributed message broker (Kafka, RabbitMQ, Redis pub/sub)

---

## Decision

ASSO uses **in-process domain events** for inter-module communication within the modular monolith.

For asynchronous processing, events are persisted as background jobs in PostgreSQL via pg-boss or equivalent — **no external message broker**.

---

## Rationale

1. **Team complexity**: A distributed message broker (Kafka, RabbitMQ) introduces significant operational overhead: deployment, monitoring, dead-letter queues, consumer group management, exactly-once semantics. A two-person team cannot absorb this productively.

2. **Single deployment unit**: Since all modules are in the same process, in-process events work natively. No network serialization, no broker configuration.

3. **Transactional safety**: By persisting background jobs in the same database transaction as the domain operation (outbox pattern), we guarantee that no jobs are lost if the process crashes.

4. **Simpler debugging**: All event handling is visible in the same codebase and logs. No need to trace events across broker topics and consumer groups.

5. **Viable at scale**: The expected event volume for ASSO's initial deployment is well within what PostgreSQL-backed job queues can handle.

---

## Implementation

```text
Domain operation → DB transaction:
  1. INSERT domain record
  2. INSERT job into job_queue table (pg-boss)
  → Transaction commits

Background worker:
  → Polls job_queue
  → Processes job (handles domain event)
  → Marks job done
```

---

## Escalation Path

If a specific use case requires:
- Fan-out to many independent consumers at high volume
- Event replay from historical offset
- Cross-service event streaming

...then a message broker is introduced for that specific use case with a documented decision. Not speculatively.

---

## Consequences

**Positive**:
- No broker infrastructure to manage
- Transactional safety via outbox pattern
- Simple to debug and reason about

**Negative / Trade-offs**:
- Job queue is coupled to the primary database (mitigated by PgBouncer and connection management)
- Very high event volumes may require scaling the job worker pool (not the database itself)

---

## Review Trigger

Revisit if:
- Event volume causes measurable performance impact on the primary database
- A specific module needs to consume events independently from a separate deployment
- Cross-service event streaming becomes a requirement
