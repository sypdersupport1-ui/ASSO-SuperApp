# ASSO Real-Time & Network Resilience UX Specification

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 4)  
> **Authority:** Aligned with Phase 3 Real-Time SSE Architecture (`REALTIME-API.md`) and Online-First Resilience Model  

---

## 1. Real-Time Philosophy & User Awareness

ASSO operations depend on instantaneous synchronization across staff devices (POS, KDS, Floor Tables, Housekeeping). Because hospitality venues often experience dead spots, thick kitchen walls, or fluctuating guest Wi-Fi, the UI must **transparently communicate connection health without inducing panic**.

---

## 2. Global Connection State Indicators

The application shell top-bar features a persistent, non-intrusive connection status badge:

```text
┌────────────────────────────────────────────────────────────┐
│ [● Live]           [● Reconnecting (3s)]   [⚠ Offline (Stale)]│
└────────────────────────────────────────────────────────────┘
```

| Connection State | Visual Presentation | Timing & Internal Trigger | User Impact & Interface Behavior |
| :--- | :--- | :--- | :--- |
| **Live** | Small Emerald dot + `Live` text (or dot only on compact mobile). | Active SSE connection receiving regular 15s heartbeats. | Full real-time responsiveness. Normal operational flow. |
| **Refreshing** | Sky-Blue pulsing dot + `Updating...` | Active bulk sync or initial event stream catch-up. | Content updates smoothly without layout shift. |
| **Reconnecting** | Amber pulsing dot + `Reconnecting...` | Network glitch or serverless connection rotation. | UI displays reconnection countdown. `Last-Event-ID` replayed automatically. |
| **Offline / Stale**| Rose warning dot + `Offline` | No heartbeat received for >45 seconds; SSE disconnected. | Subtle sticky top banner: *"Network disconnected. Data may be stale. [Retry Now]"*. Falls back to short-polling. |

---

## 3. Operational Screen Staleness Protection

On high-concurrency screens (such as Kitchen KDS or Table Seating Map), acting on stale data could result in cooking an already-canceled order or seating guests at a taken table:
1. **Stale Data Warning Bar:** If the connection is broken for >30 seconds, an Amber warning ribbon locks across the top of the KDS / Table map:
   > ⚠ *Network interrupted at 12:42 PM. Reconnecting to kitchen stream... Do not discard physical tickets.*
2. **Action Disable on Prolonged Disconnect:** If offline for >2 minutes, high-risk mutating actions (e.g. finalizing bill, assigning room) display a confirmation warning: *"You are currently working offline. Reconnecting to verify room status before check-in."*

---

## 4. Optimistic UI Updates & Safe Rollback

To maintain a fluid 60fps feel during peak service, low-risk actions use **Optimistic UI Updates**:
- **KDS Item Bumping:** Tapping `BUMP` immediately animates the ticket to `READY` state on the cook's screen while the `PATCH /api/v1/fulfillment/items/{id}/status` request fires in the background.
- **Rollback Invariant:** If the server returns an error (e.g. network timeout or `409 Conflict`), the ticket smoothly animates back into the active queue, and a high-priority Rose toast alerts the cook: *"Failed to update Ticket #14. Please check connection."*
- **Financial Actions Never Optimistic:** Monetary tenders, refunds, and room checkouts strictly wait for server confirmation before displaying the success state.

---

## 5. Duplicate Submission Prevention

During intermittent connectivity, users tend to click buttons repeatedly:
- All state-mutating actions (Order Create, Bill Settle, Stock Adjustment) disable the primary button and display an internal spinner immediately upon first click.
- Every mutation attaches an immutable client-generated `Idempotency-Key` header. Even if a user refreshes or a retry packet is sent twice by the browser, the backend recognizes the duplicate key and returns the identical response without double-processing.
