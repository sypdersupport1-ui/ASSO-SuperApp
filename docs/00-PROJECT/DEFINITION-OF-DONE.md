# ASSO — Definition of Done

A product feature, capability, or change is **not complete** merely because it appears to work in the UI.

Before a change can be considered done, the following aspects must have been considered and addressed where applicable.

---

## Checklist

| # | Aspect | Description |
|---|---|---|
| 1 | **Business Flow** | Does the feature implement the correct business flow as documented? |
| 2 | **Module Ownership** | Is the domain object owned by the correct module? No duplicate sources of truth? |
| 3 | **Architecture** | Does the change follow established architecture patterns? Are module boundaries respected? |
| 4 | **API Contracts** | Are API contracts documented, versioned, and validated? |
| 5 | **Database** | Are schema changes handled through migrations? Is data integrity maintained? |
| 6 | **Authorization** | Is server-side authorization enforced? Is RBAC checked? |
| 7 | **Tenant Isolation** | Does the feature respect tenant boundaries in all operations? |
| 8 | **Module Entitlement** | Is the module entitlement check enforced before granting access? |
| 9 | **Policy** | Are business policies (approval rules, thresholds) respected? |
| 10 | **Input Validation** | Is all input validated server-side? |
| 11 | **Error Handling** | Are errors handled gracefully with appropriate user feedback? |
| 12 | **Idempotency** | Are critical operations (payments, inventory movements, etc.) safe against duplicate requests? |
| 13 | **Audit** | Are auditable operations logged appropriately? |
| 14 | **Testing** | Are appropriate tests written and passing? |
| 15 | **Documentation** | Is documentation updated to reflect the change? |
| 16 | **Review** | Has the change been reviewed through a pull request? |

---

## Context

Not every item applies to every change. A documentation-only change does not need idempotency review. A backend-only change does not need frontend testing.

The expectation is that contributors **actively consider** each aspect and make a conscious decision about whether it applies.

---

## Severity

The following aspects are **always required** for any change that touches application logic:

- Authorization
- Tenant isolation
- Module entitlement
- Input validation
- Testing
- Documentation (if architecture/contracts are affected)

The following are **required for critical paths** (payments, inventory, financial):

- Idempotency
- Audit
- Transactional integrity
- Policy enforcement
