# ADR-012: Offline POS Architectural Scope

**Status**: Accepted  
**Date**: 2026-09-26  
**Deciders**: Human Product Owner, Antigravity  
**Resolves**: Open Decision #9 (Offline POS capability)

---

## Context

Point-of-Sale (POS) systems in physical hospitality environments often consider offline operation to withstand internet outages. However, true offline-capable distributed POS architecture introduces enormous complexity:
1. **Local Persistent Storage**: Embedded SQLite/IndexedDB on each POS terminal.
2. **Distributed Sync & Conflict Resolution**: Multi-master replication, merge conflict rules when two terminals sell the last item or apply different discounts simultaneously.
3. **Financial & Payment Constraints**: UPI payments (the dominant digital payment method in India) and live card authorizations strictly require online bank verification. Offline card processing ("store and forward") carries substantial fraud liability.
4. **Inventory Integrity**: Concurrent offline consumption breaks deterministic stock ledger tracking.
5. **Team Bandwidth**: Implementing and debugging offline synchronization would divert critical engineering capacity from a single primary developer + AI agent.

An architectural decision is required to define ASSO's POS connectivity model.

---

## Decision

1. **Online-First with Network Resilience for Initial Scope**:
   - The ASSO POS will operate as an **Online-First system** designed for high network resilience.
   - Initial production targets (hotels, restaurants, cinema concession counters) are expected to maintain commercial broadband backed by dual-SIM 4G/5G cellular failover routers (standard hospitality operational practice).

2. **Built-in Network Resilience Mechanisms**:
   - **Local Cart Persistence**: Active order lines and customer selections are held in client-side memory so that a momentary network drop does not wipe staff input.
   - **Optimistic UI with Request Retries**: POS operations display immediate feedback and automatically retry transient network failures using exponential backoff.
   - **Strict Idempotency**: Every POS transaction includes a client-generated `Idempotency-Key` (UUIDv4) preventing duplicate orders or payments when connections blip during submission.
   - **Visual Offline Indicator**: Immediate banner alerting cashier if the terminal loses connection to the ASSO API, disabling transaction submission until connectivity is restored.

3. **Offline Sync Deferred to Future Enterprise Phase**:
   - Offline batch synchronization is formally classified as a **Future Phase Capability**.
   - The core architecture **does not block future offline synchronization**:
     - All primary keys use system-wide UUIDs (`gen_random_uuid()`), which can be safely generated offline on client terminals without ID collisions upon sync.
     - Inventory movements are recorded as timestamped ledger records, allowing late-arriving offline batches to be reconciled as adjustment movements in future phases.

---

## Consequences

**Positive**:
- Prevents premature over-engineering of distributed multi-master sync protocols.
- Avoids financial fraud liability associated with offline payment acceptance.
- Drastically simplifies POS development, testing, and operational diagnostics.
- Maintains 100% real-time accuracy of inventory levels and kitchen KDS routing.

**Trade-offs & Mitigations**:
- *Trade-off*: Cash transactions cannot be completed if total internet connectivity (broadband + cellular backup) fails simultaneously.
  *Mitigation*: Properties maintain standard offline paper receipt fallbacks during catastrophic multi-provider internet outages. Cash register sessions can record manual adjustments upon reconnection.

---

## Review Trigger

Revisit if expanding to remote hospitality venues (e.g., remote resort safari camps, cruise vessels, flights) where continuous internet connectivity is physically unavailable.
