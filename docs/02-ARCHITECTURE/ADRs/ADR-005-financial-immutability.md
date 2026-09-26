# ADR-005: Financial Transaction Immutability

**Status**: Accepted  
**Date**: 2026-09-26  
**Deciders**: Human Product Owner, Antigravity

---

## Context

ASSO handles real money — payments, refunds, folio charges, expenses. The question is how to model financial corrections and adjustments.

---

## Decision

**All financial transaction records are immutable after creation.** Corrections are made by creating new compensating records, not by modifying historical records.

```text
Original Transaction (never modified)
      +
Compensating/Adjustment Transaction (new record, references original)
      =
Net correct financial position
```

---

## Rationale

1. **Legal and compliance**: Financial records must be auditable and tamper-evident. Silent modifications destroy the audit trail.

2. **Reconciliation**: External financial systems (bank statements, payment gateways) reconcile against specific transaction IDs. Modifying a transaction creates irreconcilable discrepancies.

3. **Trust**: Business operators and auditors must be able to trust that what they see in a report matches what actually happened.

4. **Error traceability**: When a financial error occurred and how it was corrected must be visible in the record.

---

## Application

| Scenario | Correct Approach |
|---|---|
| Folio charge posted incorrectly | Post negative adjustment entry referencing the original |
| Payment recorded wrong amount | Issue a refund for the difference; do not edit the payment |
| Expense approved then revoked | Record an expense reversal; do not delete the original |
| POS transaction entered incorrectly | Void transaction (creates a void record); original preserved |
| Stock movement recorded incorrectly | Post a correcting adjustment movement |

---

## Consequences

**Positive**:
- Tamper-evident financial history
- Clear audit trail for all corrections
- Reconciliation is reliable

**Negative / Trade-offs**:
- Correction workflows are slightly more complex than simple edits
- Reporting must account for adjustments and reversals to show net positions

---

## Enforcement

- No `UPDATE` or `DELETE` SQL statements on financial tables (`payment_transactions`, `refund_transactions`, `folio_entries`, `bill_items`, `stock_movements`, `cash_transactions`)
- Database-level constraints (write triggers that reject modifications) evaluated for highest-risk tables
- Code reviews enforce the pattern
- Audit Engine records any attempt to modify historical records
