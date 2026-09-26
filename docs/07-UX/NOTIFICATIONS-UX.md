# ASSO Notification & Operational Alerts UX Specification

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 4)  
> **Authority:** Aligned with Phase 2 Architecture (`SHARED-ENGINES.md`) and Phase 3 Real-Time SSE  

---

## 1. Notification Hierarchy & Priority Matrix

In high-volume hospitality environments, alert fatigue is a serious operational hazard. ASSO classifies all notifications into four discrete priority tiers:

| Priority Tier | Visual Indicator | Delivery Mechanism | Audio Chime | Typical Operational Events |
| :--- | :--- | :--- | :--- | :--- |
| **1. Informational** | Slate / Neutral Dot | Passive In-App Notification Drawer only | None | Daily sales summary ready, shift report archived, guest checked out. |
| **2. Action Required** | Sky Blue Dot + Counter | Drawer Badge + Soft In-App Banner | Soft Blip | Expense voucher awaiting approval, housekeeping inspection pending, table seated. |
| **3. Warning** | Amber Warning Triangle | Ephemeral Toast (8s duration) + Drawer Log | Medium Chime | KDS order delayed >20 mins, item stock below reorder threshold, guest waitlist >30m. |
| **4. Critical** | Rose Shield / Exclamation | Persistent Viewport Banner (Cannot auto-dismiss) | Urgent Dual Chime | Payment gateway communication failure, room maintenance emergency, security event. |

---

## 2. Notification Delivery Surfaces

### 2.1 The Notification Drawer (Slide-Over Panel)
- Triggered by clicking the Header Bell icon. Displays badge with unread count (`3`).
- **Tabs:** `All Alerts`, `Action Required`, `System Logs`.
- **Card Anatomy:**
  - Semantic Icon (e.g. `Flame` for KDS alert, `Receipt` for expense).
  - Title: *"Approval Needed: Expense Voucher #EXP-081"*.
  - Body: *"Deep clean plumbing repair (₹6,500) submitted by Maintenance Lead."*
  - Context & Timestamp: *"Grand Palace • 4 mins ago"*.
  - Inline Quick Actions: `[View Voucher]` `[Dismiss]`.
- Top Action: `Mark All as Read`.

### 2.2 Toast Notifications (Transient Floating Alerts)
- Anchored to bottom-right on desktop (`bottom-4 right-4 z-50`), top-center on mobile (`top-16 inset-x-4`).
- Max stack: 3 toasts visible simultaneously. Subsequent toasts queue automatically.
- Success toasts auto-dismiss in 4 seconds. Error toasts remain until dismissed or action taken.
- Hover or touch pauses the auto-dismiss countdown.

### 2.3 Audio Alerts & Sound Preferences
- In kitchens and bars, audio cues are vital when staff are not facing the screen.
- **Sound Profiles:**
  - `New Order Arrival`: Crisp high-pitched chime.
  - `Urgent Delay Warning`: Staccato double-tone.
- **Staff Controls:** Configurable in user profile settings (`Mute Audio`, `Volume Stepper`, `Disable Non-Urgent Chimes`).
- **Scope Guard (DEC-013):** External commercial SMS gateway selection remains deferred. In Phase 4, notifications are delivered exclusively in-app and via SSE real-time push.
