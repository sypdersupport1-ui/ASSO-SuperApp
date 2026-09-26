# ASSO — Open Decisions

**Phase**: 2 — Master Architecture  
**Status**: Active — Requires Human Resolution  
**Last Updated**: 2026-09-26

This document records all unresolved architectural and product decisions that must not be silently assumed. Each decision has a designated owner and must be resolved before the relevant phase can proceed with implementation.

> **Rule**: Do not implement any capability that depends on an open decision without first resolving the decision through a documented approval process.

---

## Decision Registry

| # | Decision | Category | Priority | Status |
|---|---|---|---|---|
| 1 | Cross-vertical folio charging | Commerce / Hotel | High | PROPOSED / OPEN |
| 2 | Payment provider selection | Commerce | High | OPEN |
| 3 | Frontend framework | Technology | High | OPEN |
| 4 | Real-time technology (SSE vs WebSocket) | Technology | Medium | OPEN |
| 5 | Module entitlement cache invalidation | Platform | Medium | OPEN |
| 6 | MFA enforcement for super admins | Security | High | OPEN |
| 7 | QR code model (static vs dynamic) | Customer Experience | Medium | OPEN |
| 8 | Multi-device session behavior at same table/room | Customer Experience | Medium | OPEN |
| 9 | Offline POS capability | Commerce | High | OPEN |
| 10 | Multi-currency support | Commerce | Medium | OPEN |
| 11 | Multi-language (i18n) scope | Platform | Medium | OPEN |
| 12 | Email provider selection | Technology | Medium | OPEN |
| 13 | SMS provider selection | Technology | Low | OPEN |
| 14 | Vertical implementation order | Roadmap | High | OPEN |
| 15 | Q / Waitlist initial scope (Restaurant) | Restaurant | Medium | OPEN |
| 16 | Table reservations depth (Restaurant) | Restaurant | Medium | OPEN |
| 17 | KDS feature depth | Operations | Medium | OPEN |
| 18 | Cinema QR scope (per-seat vs per-screen-area) | Cinema | Medium | OPEN |
| 19 | Cinema concession delivery model | Cinema | Medium | OPEN |
| 20 | Hotel online booking integration | Hotel | Medium | OPEN |
| 21 | Hotel reservation deposit model | Hotel | Low | OPEN |
| 22 | Hotel maintenance module depth | Hotel | Low | OPEN |
| 23 | Hotel minibar management | Hotel | Low | OPEN |
| 24 | Pricing / plan model | Platform | High | OPEN |
| 25 | Cross-tenant customer data sharing | Customer | Low | OPEN |
| 26 | Printing requirements | Operations | Medium | OPEN |
| 27 | Recipe / auto-consumption scope and timeline | Inventory | Low | OPEN |
| 28 | Split bill support | Commerce | Low | OPEN |
| 29 | Tipping model | Commerce | Low | OPEN |
| 30 | Virus scanning for file uploads | Security | Low | OPEN |
| 31 | Browser push notification initial scope | Notifications | Medium | OPEN |
| 32 | Customer session merge (multiple devices same context) | Customer Experience | Medium | OPEN |
| 33 | Encrypted message storage for conversations | Security / Privacy | Low | OPEN |
| 34 | Formal data retention and archival policies | Operations / Legal | Medium | OPEN |
| 35 | Super admin MFA enforcement | Security | High | OPEN |

---

## Detailed Decision Records

---

### Decision 1: Cross-Vertical Folio Charging

**Question**: Should ASSO support charging restaurant meals or cinema concessions to an active hotel room folio in a mixed-property operation?

**Why It Matters**: This would create a dependency between the restaurant/cinema vertical and the hotel folio system, complicating the shared architecture and introducing cross-vertical coupling.

**Options**:
1. Not support it in initial scope; each vertical bills independently
2. Support via the shared Billing Engine with a folio transfer capability
3. Support as a configurable feature for mixed-property organizations only

**Architectural Consequences**: Option 2 or 3 requires the Billing Engine to support cross-outlet charge posting within the same organization, with appropriate authorization rules.

**Current Recommendation**: Option 1 for initial scope. The architecture supports option 2 but it must not be implemented until explicitly approved.

**Owner**: Human Product Owner

**Status**: `PROPOSED / OPEN DECISION` — Not in initial approved scope. Do not implement.

---

### Decision 2: Payment Provider Selection

**Question**: Which payment gateway(s) should ASSO integrate with?

**Why It Matters**: Determines the payment UX (UPI, cards, wallets), integration complexity, and India vs international coverage.

**Options**:
1. Razorpay — India-first, supports UPI, cards, wallets, net banking; widely used
2. Stripe — International, clean API, limited India-specific payment methods natively
3. Both — Razorpay for India, Stripe for international (adds complexity)
4. PhonePe Business / PayU — Alternative India options

**Architectural Consequences**: The adapter pattern means the choice does not affect domain logic. Multiple providers can be added later.

**Owner**: Human Product Owner

**Status**: `OPEN DECISION` — Must be resolved before Phase 3 (payment module implementation).

---

### Decision 3: Frontend Framework and Tooling

**Question**: What is the frontend framework, state management library, and component/design system?

**Sub-decisions**:
- Framework: Next.js App Router vs alternatives
- State management: React Query vs SWR + Zustand
- Design system: Custom + Radix UI vs shadcn/ui vs Mantine
- Styling: Tailwind CSS vs Vanilla CSS vs CSS Modules

**Why It Matters**: Determines development velocity, architectural patterns, and long-term maintainability.

**Owner**: Human Product Owner + Antigravity

**Status**: `OPEN DECISION` — Must be resolved at the start of Phase 3.

---

### Decision 4: Real-Time Technology

**Question**: What mechanism to use for real-time updates (KDS, order status, chat)?

**Options**:
1. Server-Sent Events (SSE) — One-way, simpler for read streams; good for KDS and order status
2. WebSocket — Bidirectional; required for chat; higher complexity
3. Polling — Simplest, higher latency, wasted requests
4. Hybrid: SSE for read streams, WebSocket for chat

**Architectural Consequences**: Affects multi-instance scalability (sticky sessions or shared pub/sub needed for SSE/WebSocket at scale).

**Owner**: Human Product Owner + Antigravity

**Status**: `OPEN DECISION` — Must be resolved before KDS and Chat implementation in Phase 3.

---

### Decision 5: Module Entitlement Cache Invalidation (Multi-Instance)

**Question**: How are in-process module entitlement caches invalidated across multiple application instances?

**Options**:
1. Short TTL (5 minutes) — Accept brief inconsistency; acceptable for module toggles
2. PostgreSQL LISTEN/NOTIFY — Push cache invalidation via database channel
3. Redis pub/sub — If Redis is already introduced for another reason
4. Long TTL + force restart — Acceptable for very infrequent changes

**Current Recommendation**: Option 1 (short TTL) is acceptable for the initial single-instance deployment. Escalate to Option 2 when horizontal scaling is deployed.

**Owner**: Antigravity (technical decision, but requires human sign-off if Redis is introduced)

**Status**: `OPEN DECISION` — Option 1 as default; escalate when horizontal scaling is required.

---

### Decision 7: QR Code Model

**Question**: Should QR codes be static (printed once, permanent) or dynamic (can be updated without reprinting)?

**Options**:
1. Static QR with opaque tokens — Token maps to context in database; QR can be reprinted if context changes
2. Dynamic QR — QR URL can be updated without reprinting; requires a dynamic QR service

**Architectural Consequences**: The current design already uses opaque tokens, which means the QR content (the URL) is fixed but the server-side mapping can be updated. Reprinting is not required to rotate a token (the old QR is disabled and a new one issued). This is effectively Option 1 with rotation support.

**Current Recommendation**: Option 1 with rotation support (existing design). Dynamic QR service not required.

**Owner**: Human Product Owner

**Status**: `OPEN DECISION` — Current design leans toward Option 1. Confirm.

---

### Decision 9: Offline POS Capability

**Question**: Does the ASSO POS need to function offline (no internet connection)?

**Why It Matters**: Offline POS requires local data storage, sync mechanisms, and conflict resolution — significantly more complex than an online-only POS.

**Options**:
1. Online-only POS — Simpler; requires stable internet
2. Offline-capable POS — Complex; requires service workers, local storage, sync logic

**Architectural Consequences**: Option 2 significantly increases development complexity. Most modern POS systems work online-only with fallback UX.

**Owner**: Human Product Owner

**Status**: `OPEN DECISION` — Significant architectural impact if offline is required.

---

### Decision 14: Vertical Implementation Order

**Question**: In what order should the three verticals be implemented in Phase 3?

**Options**:
1. Hotel first → Restaurant → Cinema
2. Restaurant first → Hotel → Cinema
3. Cinema first → Restaurant → Hotel
4. Shared platform first → all verticals in parallel

**Why It Matters**: The first vertical establishes patterns for all others. Hotel has the most complex billing model (folio). Restaurant has the highest-frequency operations (many orders, KDS). Cinema has the simplest initial scope.

**Recommendation**: Restaurant first — highest-frequency operations validate the shared engines most rigorously. Hotel second — adds the folio/stay complexity. Cinema third — simplest vertical to complete the set.

**Owner**: Human Product Owner

**Status**: `OPEN DECISION` — Human approval required before Phase 3 begins.

---

### Decision 24: Pricing / Plan Model

**Question**: How will module entitlements be packaged and priced for customers?

**Options**:
1. Per-module pricing — Each module has a price; customers pay for what they use
2. Tiered plans — Pre-defined bundles (Starter, Standard, Enterprise)
3. Custom enterprise — Negotiate entitlements per customer
4. Hybrid — Tiered plans + add-on modules

**Why It Matters**: Determines the plan and entitlement data model and the Super Admin pricing management UI.

**Owner**: Human Product Owner

**Status**: `OPEN DECISION` — Does not block Phase 3 architecture but must be resolved before the billing/plan management is built.

---

### Decision 26: Printing Requirements

**Question**: Does ASSO need to support printing? What types?

**Candidates**:
- POS receipt printing (thermal printer)
- KDS order ticket printing
- Hotel folio printing (guest checkout)
- Purchase order printing

**Why It Matters**: Print integration requires hardware connectivity (browser printing or cloud print API), which is a separate integration surface.

**Owner**: Human Product Owner

**Status**: `OPEN DECISION` — Must be resolved before POS and KDS implementation.

---

## Resolution Process

To resolve an open decision:

1. Product owner evaluates options and business implications
2. A decision record is created in `docs/10-DECISIONS/ADR-[N]-[title].md`
3. The relevant architecture documents are updated to reflect the decision
4. Implementation proceeds based on the documented decision
5. This registry is updated to mark the decision as RESOLVED

Open decisions marked `PROPOSED / OPEN DECISION` (particularly Decision 1 — cross-vertical folio charging) must not be treated as approved scope under any circumstances without explicit product owner approval.
