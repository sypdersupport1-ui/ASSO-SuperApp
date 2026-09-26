# ADR-004: Inventory Ledger Approach

**Status**: Accepted  
**Date**: 2026-09-26  
**Deciders**: Human Product Owner, Antigravity

---

## Context

ASSO's Inventory Engine must track stock levels across all verticals. The question is how to model stock — as a mutable quantity or as an immutable ledger.

---

## Decision

ASSO uses a **ledger-oriented inventory model**.

```text
Current Stock = Sum of all movements (opening + receipts + transfers in − consumption − wastage − transfers out ± adjustments)
```

Stock is never stored as a single mutable quantity. Every stock change creates an immutable movement record.

---

## Rationale

1. **Auditability**: Every stock change has a complete record — who did it, when, why, and what changed. This is essential for F&B operations where shrinkage, wastage, and consumption must be traceable.

2. **Correctness**: Silently mutating a quantity field risks data loss if the mutation fails partially. A ledger is append-only, making partial failures recoverable.

3. **Historical analysis**: Businesses need to see not just "how much stock do we have" but "where did the stock go over the past month." A ledger provides this natively.

4. **Idempotency**: Ledger entries can be made idempotent. A duplicate goods receipt with the same idempotency key does not create a duplicate entry.

5. **Correction model**: Mistakes are corrected with new correcting entries, not silent edits. This matches financial accounting principles.

---

## Implementation

```text
stock_movements table (append-only):
  - movement_id (UUID)
  - tenant_id, outlet_id
  - item_id, location_id
  - movement_type (OPENING_BALANCE | PURCHASE_RECEIPT | TRANSFER_IN | TRANSFER_OUT | CONSUMPTION | WASTAGE | ADJUSTMENT_INCREASE | ADJUSTMENT_DECREASE | ...)
  - quantity (positive for in, negative for out)
  - reference_id (order_id, purchase_order_id, etc.)
  - notes
  - created_by
  - created_at
  - idempotency_key

Current stock query:
SELECT SUM(quantity) FROM stock_movements
WHERE item_id = $itemId AND location_id = $locationId
```

A materialized view or cached summary may be used for performance if the ledger grows large.

---

## Consequences

**Positive**:
- Complete audit trail of all stock changes
- Immutable history cannot be accidentally corrupted
- Natural support for reconciliation and discrepancy detection
- Mirrors financial accounting principles

**Negative / Trade-offs**:
- Current stock requires summing movements (mitigated by indexed query + cached totals)
- Table size grows with every movement (mitigated by table partitioning when volumes justify it)

---

## Review Trigger

Revisit if inventory query performance becomes a measurable bottleneck — at which point a cached running total (updated transactionally with each movement) may be introduced.
