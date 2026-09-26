# ADR-013: Vertical Implementation Order

**Status**: Accepted / Resolved  
**Date**: 2026-09-26  
**Deciders**: Human Product Owner, Antigravity  
**Resolves**: Open Decision #14 (Vertical implementation order in Phase 3/4)

---

## Context

ASSO unites three business verticals: **Hotel**, **Restaurant**, and **Cinema**. Each vertical is an equal sibling in the product architecture, backed by 28 shared engines.

When transitioning from Architecture (Phase 2) to Data Design (Phase 3) and Vertical Slice Implementation (Phase 4), a concrete sequence of vertical execution must be established. The sequence significantly influences:
- Architectural coverage and depth of shared engine validation.
- Early detection of architectural bottlenecks or flawed abstractions.
- Delivery risk and incremental customer value.

Two primary sequencing options exist:
1. **Sequence A**: Restaurant → Hotel → Cinema
2. **Sequence B**: Hotel → Restaurant → Cinema

---

## Evaluation of Candidates

### Candidate A: Restaurant → Hotel → Cinema
- **Arguments in Favor**:
  - High transaction frequency: Exercises POS, ordering, table QR, and KDS under fast operational turnover.
  - Faster initial customer feedback on order lifecycle and instant table bill payments.
- **Architectural Drawbacks**:
  - Narrow architectural coverage: Restaurant orders are short-lived (1–2 hours). It does not exercise multi-day stay lifecycles, long-duration folio billing, room status workflows, or property-level multi-outlet hierarchies.
  - Risk of under-engineering shared engines: If the Billing Engine is shaped solely around restaurant table bills, retrofitting it later to accommodate complex Hotel Guest Folios (with deposits, night-audit room rates, multi-day adjustments) often causes major architectural revisions.

### Candidate B: Hotel → Restaurant → Cinema (Recommended Architectural Direction)
- **Arguments in Favor**:
  - **Maximum Architectural Coverage**: Hotel exercises 18+ shared engines, the deepest domain model, and the most complex workflows:
    - Context: Room context (`context_type = ROOM`), floors, room types.
    - Lifecycle: Extended multi-day `GuestStay` (check-in → active stay → check-out).
    - Commerce / Billing: The **Guest Folio** is the most comprehensive financial accumulator in ASSO (room tariffs, in-room dining charges, laundry/amenities, advances/deposits, tax splits, checkout settlement).
    - Operations: Deepest Service Request hierarchy (housekeeping, room amenities, maintenance).
    - Fulfillment: In-room dining delivery workflow.
    - Multi-Tenancy / Multi-Outlet: Hotels inherently model the full tenant hierarchy (Property → Hotel Outlet + Restaurant/Bar Outlets), proving multi-outlet capabilities from Day 1.
  - **Architectural De-Risking**: Designing and proving the shared engines against Hotel ensures they are robust enough for any hospitality vertical.
  - **Downstream Simplicity**:
    - When Restaurant is implemented second, its table bills and dining areas are simply a streamlined subset of the proven folio and context engines.
    - Cinema is implemented third as the simplest vertical (screens, seats, shows, concession orders), completing the initial suite.

---

## Decision

The Human Product Owner has explicitly approved **Sequence B**:

```text
Stage 1: Shared Core Platform & Infrastructure Baseline
Stage 2: Hotel Vertical (Deepest architectural validation)
Stage 3: Restaurant Vertical (High-throughput validation, KDS, Tables)
Stage 4: Cinema Vertical (Auditoriums, Seats, Shows, Concessions)
```

### Important Architectural Boundaries
This decision establishes the **implementation sequence only**. It does **NOT** mean:
- Hotel is the parent vertical.
- Restaurant depends on Hotel.
- Cinema depends on Restaurant.
- Shared engines belong to Hotel.

Hotel, Restaurant, and Cinema remain **equal sibling verticals** configured on top of shared ASSO domain engines. Shared engines belong exclusively to the platform. No vertical has structural hierarchy or dependency over another.

---

## Consequences

**Positive**:
- Validates the most complex domain abstractions first, preventing expensive rewrites of Billing, Context, and Session engines.
- Naturally validates multi-outlet tenancy on the first vertical.
- Clear, disciplined progression from highest domain complexity to lowest.

**Trade-offs & Mitigations**:
- *Trade-off*: Hotel vertical has more initial domain entities than Restaurant.
  *Mitigation*: Phase 3 establishes the database schema for all three verticals concurrently; Phase 4 vertical slices implement Hotel workflows first.

---

## Review Trigger

Product Owner sign-off at Phase 2 milestone gate.
