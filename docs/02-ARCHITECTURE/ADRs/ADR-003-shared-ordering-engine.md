# ADR-003: Shared Ordering Engine

**Status**: Accepted  
**Date**: 2026-09-26  
**Deciders**: Human Product Owner, Antigravity

---

## Context

ASSO serves three verticals — Hotel, Restaurant, and Cinema — all of which involve ordering (room service, dining orders, concession orders). The question is whether to build separate ordering systems per vertical or a shared engine.

---

## Decision

ASSO uses a **single shared Ordering Engine** that serves all three verticals through configuration.

---

## Rationale

1. **The core ordering capability is identical across verticals**: Create → Confirm → Fulfill → Close is the same lifecycle regardless of vertical. What differs is the context (Room/Table/Seat), the catalog, the fulfillment routing, and the billing model.

2. **Avoiding duplication**: Three separate ordering systems would mean three codebases for fundamentally the same logic, with divergent bugs, independent test coverage, and triple the maintenance burden.

3. **Consistent behavior**: Financial calculations, state machine logic, idempotency handling, and audit records are consistent across all verticals.

4. **Configurable per vertical**: The context type, catalog source, fulfillment routing, and billing model are parameters — not separate implementations.

---

## What Is Shared

```text
orders table (tenant_id, outlet_id, context_id, context_type, ...)
order_items table
order_status_history table
Order lifecycle state machine (PENDING → ... → CLOSED)
Idempotency enforcement
Audit trail
```

## What Is Configured Per Vertical

```text
context_type: ROOM | TABLE | SEAT
Catalog: Which catalog serves this context
Fulfillment routing: Which fulfillment channel handles this outlet
Billing integration: Post to folio (Hotel) vs table bill (Restaurant) vs per-order (Cinema)
Cancellation rules: May differ per vertical or policy
```

---

## Consequences

**Positive**:
- Single implementation to maintain, test, and secure
- Consistent behavior across verticals
- New verticals benefit from the shared engine without re-implementing ordering

**Negative / Trade-offs**:
- The Ordering Engine must be designed flexibly enough for all verticals from the start
- Some vertical-specific edge cases may require vertical-aware configuration options in the engine

---

## Review Trigger

Revisit if a vertical has ordering requirements so fundamentally different that they cannot be expressed through engine configuration without severely compromising the shared design.
