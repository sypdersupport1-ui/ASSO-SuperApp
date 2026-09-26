# ASSO Shared Component System Specification

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 4)  
> **Component Library Direction:** Radix UI Primitives + Tailwind CSS + Lucide Icons  
> **Authority:** Aligned with `DESIGN-TOKENS.md` and `UX-PRINCIPLES.md`  

---

## 1. Component Architecture & Principles

All ASSO UI components follow a strict composable architecture:
1. **Unstyled Primitives:** Built on headless, fully accessible primitives (Radix UI) ensuring 100% keyboard navigation and screen-reader ARIA compliance.
2. **Deterministic Tokens:** Styled strictly via semantic design tokens (`--bg-surface`, `--primary-default`), preventing hard-coded CSS values.
3. **Discrete States:** Every interactive component explicitly defines 6 fundamental states: `default`, `hover`, `active`, `focus-visible`, `disabled`, and `loading`.

---

## 2. Navigation Components

| Component | Purpose & Anatomy | Variants | Keyboard & Accessibility |
| :--- | :--- | :--- | :--- |
| **SidebarNav** | Main application rail. Contains logo, collapsible section headers, nav items with icons, badges, and active pill indicator. | Expanded (`w-60`), Collapsed (`w-16`), Mobile Drawer (`w-full`). | Arrow Up/Down navigation, `aria-current="page"` on active destination. |
| **Breadcrumbs** | Displays hierarchical physical context (`Tenant > Outlet > Entity`). Links separated by chevron icon. | Inline text links with trailing current page non-interactive label. | Wrapped in `<nav aria-label="Breadcrumbs">`, ordered list `<ol>`. |
| **TabNav** | Sub-navigation within a view (e.g. Folio: `Charges`, `Payments`, `Guest Details`). | Underline (default), Segmented Pill (compact operational views). | Left/Right Arrow switching, `role="tablist"`, `aria-selected`. |
| **CommandPalette**| Spotlight search modal (`Cmd+K`). Fast entity navigation, actions, and shortcut execution. | Modal overlay with fuzzy search input, categorized group results. | Focus trapped in input, Arrow Up/Down, `Enter` to select, `Esc` to close. |

---

## 3. Action Components

| Component | Anatomy & Purpose | Variants | Interaction Behavior |
| :--- | :--- | :--- | :--- |
| **Button** | Primary interactive trigger. Supports leading icon, label, trailing shortcut, spinner. | `primary` (Solid Indigo), `secondary` (Outline Slate), `tertiary` (Ghost), `destructive` (Solid Rose), `destructive-outline`. | On click: ripple or opacity change. When `loading=true`, spinner replaces leading icon and pointer events disabled. |
| **IconButton** | Square touch/click target for actions without text (e.g., `Edit`, `Delete`, `Close`, `More`). | `ghost`, `outline`, `solid`. Sizes: `sm` (32px), `md` (40px), `lg` (48px). | Mandatory `aria-label` or wrapping `<Tooltip>` describing the action. |
| **SplitButton** | Dual action: Primary click executes default; chevron dropdown reveals secondary options. | `primary`, `secondary`. Example: `Save Order ▼` (`Save & Send to KDS`, `Save as Draft`). | Dropdown menu keyboard accessible; `Enter` fires default action. |

---

## 4. Input & Form Components

| Component | Purpose & Anatomy | Validation & States |
| :--- | :--- | :--- |
| **TextField** | Single-line alphanumeric input. Label, optional prefix/suffix icon, helper text, inline error message. | `default`, `focus` (ring 2px), `error` (border Rose-500 + error message), `disabled`. |
| **NumberInput** | Numeric values with increment/decrement steppers. Currency formatting support (`₹`). | Disallows non-numeric keystrokes. Tabular font numbers (`font-mono`). |
| **Select / Combobox**| Dropdown selection for single choice. Popover list with search filter for >6 items. | Virtualized scrolling for lists >50 items (e.g. inventory catalog). Search debounced. |
| **MultiSelect** | Tag-based multi-choice picker (e.g. item modifier groups, staff role assignment). | Selected items render as removable chips with `x` button. Keyboard `Backspace` removes last tag. |
| **DatePicker / Range**| Calendar popover for single dates or check-in/out ranges. Presets (Today, Yesterday, Last 7 Days). | Restricted bounds (disallows past dates for reservations; disallows checkout < check-in). |
| **Switch & Checkbox** | Binary toggle for instant settings or multi-row table selection. | Checked, Unchecked, Indeterminate (for table select-all headers). |
| **FileUpload** | Drag-and-drop zone with browse button. Previews file name, size, upload progress bar. | Validates MIME type and size (max 5MB) on client before requesting pre-signed S3 URL. |

---

## 5. Data Display & Operational Status Components

### 5.1 StatusBadges (Semantic State Indicators)
Every operational entity displays its status using standard color and icon pairings:

| Domain Entity | Status Value | Background Token | Text Token | Icon Pair |
| :--- | :--- | :--- | :--- | :--- |
| **Hotel Room** | `CLEAN` | `--success-subtle` | `--success-foreground` | `Sparkles` |
| **Hotel Room** | `DIRTY` | `--warning-subtle` | `--warning-foreground` | `Clock` |
| **Hotel Room** | `OCCUPIED` | `--danger-subtle` | `--danger-foreground` | `UserCheck` |
| **Hotel Room** | `MAINTENANCE` | `--bg-subtle` | `--text-secondary` | `Wrench` |
| **Order (KDS)** | `PLACED` | `--info-subtle` | `--info-foreground` | `Inbox` |
| **Order (KDS)** | `PREPARING` | `--warning-subtle` | `--warning-foreground` | `Flame` |
| **Order (KDS)** | `READY` | `--success-subtle` | `--success-foreground` | `CheckCircle2` |
| **Order (KDS)** | `SERVED` | `--bg-subtle` | `--text-muted` | `UtensilsCrossed`|
| **Bill / Payment**| `OPEN` | `--warning-subtle` | `--warning-foreground` | `Receipt` |
| **Bill / Payment**| `SETTLED` | `--success-subtle` | `--success-foreground` | `CreditCard` |
| **Bill / Payment**| `REFUNDED` | `--danger-subtle` | `--danger-foreground` | `RotateCcw` |
| **Restaurant Table**| `AVAILABLE` | `--success-subtle` | `--success-foreground` | `Check` |
| **Restaurant Table**| `OCCUPIED` | `--danger-subtle` | `--danger-foreground` | `Users` |
| **Restaurant Table**| `RESERVED` | `--info-subtle` | `--info-foreground` | `Calendar` |

---

## 6. Feedback & Overlay Components

| Component | Anatomy & Purpose | Timing & Behavior |
| :--- | :--- | :--- |
| **Toast** | Ephemeral notification banner anchored bottom-right. Success, Error, Info, Warning. | Auto-dismisses in 4000ms. Error toasts remain until dismissed or action taken. Pause on hover. |
| **ConfirmationDialog**| High-friction modal for destructive actions (e.g. `Void Bill`, `Cancel Order`, `Delete Staff`). | Focus automatically placed on "Cancel" button. `Esc` key cancels. Requires explicit click on Destructive button. |
| **Drawer / Sheet** | Slide-over panel from right edge. Used for complex sub-workflows (e.g. Edit Room Details, Item Modifier Configuration). | Background dimmed. Scroll locked on body. Width: `480px` desktop, `100%` mobile. |
| **SkeletonLoader** | Animated shimmer boxes matching exact dimensions of text, cards, and table rows during data fetching. | Replaces raw spinners to eliminate content layout shift (CLS). |
| **EmptyState** | Illustrated placeholder when a list has zero items. Contains title, supportive text, and primary call-to-action button. | Tailored by context (e.g. "No Active Orders" vs "No Search Results Found"). |
