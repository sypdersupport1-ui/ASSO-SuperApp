# ASSO UX Principles & Interaction Guidelines

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 4)  
> **Authority:** Aligned with Phase 1 Product Definition and Phase 2 Master Architecture  

---

## 1. Core UX Philosophy

ASSO is an enterprise hospitality and entertainment operating system running high-throughput physical operations across **Hotels, Restaurants, and Cinemas**. Staff operate under intense peak workloads, noisy physical environments, and tight time constraints, while guests expect seamless, instant self-service without technical friction.

The design philosophy is summarized as:

> **One coherent ASSO product experience with shared interaction patterns and distinct industry workflows.**

---

## 2. The Seven Foundational UX Principles

### 2.1 Clarity Over Decoration
- **Instant Orientation:** Users must instantly recognize where they are, what physical context they are managing, and what action is required.
- **High-Information Density:** Operational screens prioritize scannable data, legible status badges, and clear typography over gratuitous white space or decorative illustrations.
- **Calm Under Load:** Use clean contrast, subdued neutral backgrounds, and purposeful semantic accents (emerald, amber, rose) so users are not visually overwhelmed during lunch rushes, sold-out cinema shows, or peak hotel check-in hours.

### 2.2 Operational Efficiency (Speed to Action)
- **Zero Redundant Clicks:** Common actions (ordering, status update, table assignment, payment capture) must be reachable in 1–2 interactions.
- **Keyboard-First Acceleration:** High-frequency desktop/POS screens support dedicated hotkeys (`Enter` to tender, `Esc` to cancel, `/` to search, `Cmd+K` for global command palette).
- **Batch Processing:** Tables and lists provide multi-select actions for routine staff operations (e.g. bulk housekeeping assignment, multi-item KDS bump).

### 2.3 Context Awareness
- **Explicit Physical Anchors:** Every operational view clearly displays its physical context:
  - *Hotel:* Property → Floor → Room Number → Guest Stay
  - *Restaurant:* Outlet → Dining Area → Table Number → Seated Party
  - *Cinema:* Auditorium / Screen → Showtime → Row & Seat Number
- **Unambiguous Context Switching:** Staff managing multiple properties or outlets have a persistent, prominent context selector in the application header.

### 2.4 Safety & Financial Integrity
- **Destructive Action Friction:** Irreversible operations (voiding a bill, marking room out-of-order, canceling an order in prep) require double-confirmation with mandatory reason logging.
- **Explicit Compensating Workflows:** In accordance with Phase 3 immutable financial ledgers, the UI never offers "edit transaction" or "silent delete." It explicitly presents "Issue Refund," "Apply Adjustment," or "Reversal Voucher."
- **Permission Transparency:** When an action is prohibited by RBAC or approval policy, the UI explains *why* (e.g. "Refund exceeds ₹1,000 threshold — Manager approval required") rather than simply failing silently.

### 2.5 Progressive Disclosure
- **Layered Complexity:** Standard tasks show only essential inputs and controls. Advanced capabilities (custom modifiers, tax overrides, custom split-billing, inventory ledger traces) are accessed via drawers, sheets, or expandable accordions.
- **Task-Focused Layouts:** Workers see only the tools necessary for their active role (e.g. KDS screens hide billing; housekeeping boards hide financial folios).

### 2.6 Responsive & Ergonomic Adaptation
- **Form-Factor Optimized:** 
  - *Desktop (POS, Admin, Front Desk):* Dense tables, dual-pane master-detail views, keyboard shortcuts.
  - *Tablet (Waiters, Managers, Floor Staff):* Large touch targets (≥48px), tap-friendly card grids, bottom action sheets.
  - *Mobile (Guest QR, Ushers, Housekeeping):* Single-column flow, sticky bottom actions, thumb-zone ergonomics.

### 2.7 Universal Accessibility (WCAG 2.1 AA)
- **High Contrast:** All typography meets or exceeds 4.5:1 contrast ratio against its background.
- **Non-Color Dependent Status:** State indicators always pair color with text labels or distinct icons (e.g. Red + Exclamation, Green + Checkmark).
- **Full Keyboard Operability:** All interactive components support standard tab order, focus rings, and `Escape` dismissal.
