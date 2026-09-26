# ASSO Responsive Design & Breakpoint Specification

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 4)  
> **Authority:** Aligned with `APPLICATION-SHELL.md` and `UX-PRINCIPLES.md`  

---

## 1. Responsive Viewport Strategy

ASSO is accessed across a diverse spectrum of physical hardware: commercial desktop terminals (front desk, box office), ruggedized tablets (waiters, kitchen leads), and personal smartphones (guests scanning QR codes, housekeeping staff, cinema ushers).

The platform rejects simple down-scaling in favor of **structural interface reflow**:

```text
┌───────────────────────────┬──────────────┬────────────────────────────────────────────────────────┐
│ Breakpoint Tier           │ Viewport (px)│ Typical Hardware Profile                               │
├───────────────────────────┼──────────────┼────────────────────────────────────────────────────────┤
│ Mobile (`sm`)             │ < 640px      │ Guest Smartphones, Housekeeping Phones, Usher Devices  │
│ Tablet (`md`)             │ 640px–1023px │ Handheld Waiter Tablets, KDS Wall Tablets, Managers   │
│ Desktop (`lg`)            │ 1024px–1439px│ Front Desk Terminals, POS Counter PCs, Office Laptops  │
│ Large Desktop (`xl`)      │ ≥ 1440px     │ Multi-Station KDS Screens, Revenue Management Displays │
└───────────────────────────┴──────────────┴────────────────────────────────────────────────────────┘
```

---

## 2. Layout Transformation Rules

### 2.1 Navigation Shell Reflow
- **Desktop (≥1024px):** Persistent left sidebar (`w-60` or collapsible `w-16`). Content occupies remaining viewport.
- **Tablet (640px–1023px):** Sidebar collapses to compact `w-16` icon rail by default to maximize operational workspace. Expanding slides an overlay drawer.
- **Mobile (<640px):**
  - Left sidebar completely hidden; accessible via top-left hamburger button.
  - Bottom Tab Navigation bar (`h-14`) anchors to bottom with 4–5 primary thumb-reachable destinations.

### 2.2 Tables to Responsive Card Lists
- On viewports `<768px`, data tables with >3 columns automatically reflow into stacked cards:
  - Table Header row disappears.
  - Each record renders as an interactive card.
  - Primary identifier (`Room 304`, `Order #102`) and status badge form the card header.
  - Secondary metrics stack vertically in key-value pairs.
  - Action buttons expand to full-width touch targets at the bottom of the card.

### 2.3 Split-Pane Master-Detail Views
- **Desktop (≥1024px):** Dual-pane layout (e.g. Left 60% Catalog Grid, Right 40% Active POS Bill Ticket). Both panes visible simultaneously.
- **Tablet & Mobile (<1024px):**
  - Master pane occupies 100% width.
  - Detail pane (e.g. Bill Ticket, Guest Folio Details) transforms into a slide-over **Bottom Sheet** or full-screen drawer triggered by a sticky bottom action bar (e.g. `View Cart (3 Items) • ₹450`).

### 2.4 Modals vs Full-Screen Bottom Sheets
- **Desktop / Tablet:** Centered floating dialog (`max-w-lg`, `rounded-xl`, dimmed backdrop).
- **Mobile (<640px):** Automatically transforms into a **Bottom Drawer Sheet** anchored to the bottom edge (`rounded-t-2xl`, swipe-down to dismiss, full thumb-zone reachability).

---

## 3. Thumb Zone Ergonomics (Mobile Touch Layouts)

On smartphone viewports (<640px), critical actions are positioned within the natural physiological thumb zone (the bottom 40% of the screen):

```text
┌────────────────────────┐
│ [Logo]       [Context] │  ← Hard to Reach (Header info only)
├────────────────────────┤
│                        │
│ Primary Content        │  ← Natural Viewing Zone
│ (Menu items, tasks)    │
│                        │
├────────────────────────┤
│ [Sticky Bottom CTA]    │  ← Natural Thumb Reach Zone
│ [Bottom Tab Bar]       │    (Add to Cart, Tender, Save)
└────────────────────────┘
```
- Floating action buttons and primary submission bars anchor to the bottom of the screen above the safe area inset (`pb-safe`).
- Destructive actions are placed outside the immediate thumb swing path to prevent accidental taps.
