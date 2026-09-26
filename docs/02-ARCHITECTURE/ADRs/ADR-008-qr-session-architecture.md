# ADR-008: QR and Customer Session Architecture

**Status**: Accepted  
**Date**: 2026-09-26  
**Deciders**: Human Product Owner, Antigravity

---

## Context

Customers enter the ASSO experience by scanning a QR code placed at a business context (hotel room, restaurant table, cinema seat). The architecture must be secure, scalable, and not require reprinting QR codes when internal mappings change.

---

## Decision

QR codes contain **opaque, cryptographically random tokens** only. The destination context is determined entirely server-side by looking up the token.

Customer sessions are created server-side after QR resolution and are scoped to the resolved tenant + outlet + context.

---

## Rationale

1. **Security**: If QR codes embedded tenant IDs, room numbers, or table numbers, a person with a QR image would gain information about the business's internal structure. Opaque tokens reveal nothing.

2. **Flexibility without reprinting**: If a room is renumbered or the context mapping changes, the token record in the database is updated. The physical QR code remains unchanged.

3. **Revocation**: A QR code can be disabled (e.g., room is under maintenance) without reprinting — simply mark the token as `DISABLED` in the database.

4. **Rate limiting protection**: The token-resolution endpoint can be rate-limited to prevent brute-force enumeration.

5. **Context-bound sessions**: Customer sessions are scoped to the resolved context. Even if a QR is photographed and used by multiple people, each session is context-bound and time-limited — this is acceptable behavior for restaurant/cinema use cases.

---

## QR Record

```text
qr_id, token (opaque random), tenant_id, outlet_id, context_id, context_type, status, created_at
```

The `token` is the only data embedded in the QR code (via a URL: `https://asso.app/c/[token]`).

---

## Session Scoping

```text
Customer Session = {tenant_id, outlet_id, context_id, context_type, ...}
```

A customer session cannot be used to access resources from a different context, outlet, or tenant.

---

## Consequences

**Positive**:
- No sensitive data in QR codes
- Revocable without reprinting
- Context-bound sessions limit the blast radius of a compromised QR

**Negative / Trade-offs**:
- Every QR scan requires a server-side database lookup (mitigated by token indexing)
- Shared/photographed QRs for hotel rooms create multi-session scenarios (mitigated by hotel check-in validation)

---

## Open Question

Static vs dynamic QR model — whether the ASSO app generates QR images itself or embeds them as static images — is tracked in `OPEN-DECISIONS.md` Decision #7.
