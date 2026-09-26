# ASSO Application Shell Specification

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 4)  
> **Authority:** Aligned with `UX-PRINCIPLES.md` and `INFORMATION-ARCHITECTURE.md`  

---

## 1. Shell Layout Anatomy (Desktop View)

The ASSO staff application shell uses a standard three-zone responsive grid:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. HEADER (Height: 56px)                                                    │
│ [Logo] [Tenant / Outlet Switcher ▼] [Search (Cmd+K)]  [Status] [Bell] [User]│
├──────────────┬──────────────────────────────────────────────────────────────┤
│ 2. SIDEBAR   │ 3. MAIN WORKSPACE                                            │
│ (Width:240px)│ ┌──────────────────────────────────────────────────────────┐ │
│              │ │ Page Header & Breadcrumbs                                │ │
│ • Front Desk │ │ Title: Room 304 - Guest Folio      [Actions: Add Charge] │ │
│ • POS        │ ├──────────────────────────────────────────────────────────┤ │
│ • KDS        │ │ Primary Content Area (Scrollable)                        │ │
│ • Billing    │ │                                                          │ │
│ • Inventory  │ │                                                          │ │
│ • Expenses   │ │                                                          │ │
│              │ │                                                          │ │
│ ──────────── │ │                                                          │ │
│ [Profile]    │ └──────────────────────────────────────────────────────────┘ │
└──────────────┴──────────────────────────────────────────────────────────────┘
```

---

## 2. Shell Zone Specifications

### 2.1 The Application Header (Top Bar)
- **Dimensions:** Fixed height `56px` (`h-14`), sticky top `z-40`, border bottom `1px solid var(--border)`.
- **Left Zone:**
  - ASSO Brand Glyph & Wordmark.
  - Context Selector: A high-visibility dropdown allowing staff to select their active Organization and physical Outlet (Property, Bistro, or Multiplex). Displays vertical badge (`HOTEL`, `RESTAURANT`, `CINEMA`).
- **Center Zone:**
  - Quick Search / Command Palette input trigger: `Search rooms, orders, guests... (Cmd+K)`. Opens modal spotlight search.
- **Right Zone:**
  - Real-Time Network Indicator: Subtle status dot showing live SSE connection status (`Live`, `Reconnecting`, `Offline`).
  - Notification Center Trigger: Bell icon with unread indicator badge. Opens slide-over notification drawer.
  - User & Profile Menu: Staff avatar, name, active role badge (`Manager`, `Front Desk`), switch outlet, help center, theme toggle, and secure logout.

### 2.2 The Navigation Sidebar (Left Rail)
- **Desktop (≥1024px):**
  - Default: Expanded width `240px` (`w-60`).
  - Collapsed: Icon-only rail width `64px` (`w-16`) toggled via hotkey (`Cmd+\`) or collapse button.
- **Tablet (768px – 1023px):**
  - Defaults to collapsed icon-only rail (`64px`), expanding to overlay drawer upon click or touch.
- **Mobile (<768px):**
  - Fully hidden by default. Opens as a full slide-over drawer triggered by header hamburger menu.
- **Visual Styling:** Neutral dark or high-contrast subtle background (`bg-card`), clean 1px border separator, active item highlight with left accent bar and tinted background.

### 2.3 Page Header & Action Bar
Every screen within the workspace contains a standardized page header:
- **Breadcrumbs:** Path reflecting hierarchical context (e.g. `Outlets > Grand Hotel > Rooms > Room 304`).
- **Entity Title & Primary Status:** Title (e.g. `Room 304`) alongside state badge (`OCCUPIED - DIRTY`).
- **Contextual Metadata:** Secondary subtitle (e.g. `Deluxe King • Floor 3 • Guest: Ananya Sharma`).
- **Primary Action Zone:** Aligned right:
  - Destructive / Secondary buttons (e.g. `Cancel Order`, `Print Invoice`).
  - Primary Call-to-Action button (e.g. `+ New Order`, `Check Out Guest`, `Save Changes`).

### 2.4 Responsive Mobile Shell (<768px)
On mobile devices (e.g. handheld waiter tablets, housekeeping phones, cinema ushers):
- **Top Bar:** Simplified to `48px` height containing Hamburger Menu, Outlet Name, and Notification Bell.
- **Bottom Navigation Bar (Height: 60px):**
  - 4 to 5 primary operational destinations (e.g. `Rooms`, `Tasks`, `Orders`, `Alerts`).
  - Large tap targets (minimum `48px × 48px`).
- **Safe Area Insets:** Respects iOS/Android bottom gesture bars (`pb-safe`).
