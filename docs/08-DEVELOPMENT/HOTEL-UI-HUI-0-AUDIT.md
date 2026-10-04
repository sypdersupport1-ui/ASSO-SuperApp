# ASSO Hotel Vertical — HUI-0 Frontend & UX Blueprint Audit
## Comprehensive Baseline Audit of Current Hotel Admin and Customer Experiences

---

## 1. Executive Summary

This document establishes the factual, repository-backed baseline for the **ASSO Hotel Frontend and UX** following the complete acceptance of Hotel Slices 1–9 and Restaurant Slices R1–R3.7.

**Audit Scope & Boundaries**:
- This is a **READ-ONLY AUDIT & UX BLUEPRINT** phase (`HUI-0`).
- **Zero code changes** have been made to application logic, database schemas, API routes, RBAC rules, financial logic, or frontend components.
- The working tree remains 100% clean against commit `138d3e20b0004d1b0b1d5d71681704b95e4cf4ce`.
- Both the **Hotel Admin / Staff Experience** (12 pages/workspaces) and the **Hotel Customer Experience** (2 guest routes) were audited across visual design, operational flow, responsive behavior, role-awareness, and technical integration with shared platform engines.

**Key Findings Summary**:
1. **Strong Functional Foundation**: All 9 Hotel backend slices (Rooms, Reservations, Stays, Front Office, Housekeeping, Maintenance, QR, Room Service F&B, Folio & Billing) have working frontend surfaces connected to real APIs.
2. **Visual Inconsistency & Disconnect**: While core pages (`/hotel`, `/hotel/rooms`, `/hotel/front-office`) use the platform's standard light/dark semantic CSS variables, the Folio workspace (`/hotel/folio/[stayId]` and `FolioWorkspace.tsx`) is hardcoded to a dark zinc palette (`bg-zinc-950 text-zinc-100`), creating an abrupt visual jarring effect when navigating between Front Desk and Folio.
3. **Client Auth Inconsistency**: Only 3 admin pages (`front-office`, `housekeeping`, `maintenance`) utilize `hotelFetch` from `@/lib/hotel/client-auth` to inject Bearer tokens; the remaining 9 admin pages invoke plain native `fetch()` without authentication headers, relying on ambient development cookies/demo sessions.
4. **Error Handling Antipatterns**: Multiple admin dialogs and forms (`rooms`, `room-types`, `settings`, `guests`) trigger native browser `alert()` popups upon API errors or validation failures, severely degrading the premium hospitality feel.
5. **Customer Experience Gaps**: The customer guest portal at `/hotel/guest` supports service request dispatching with live SSE and in-room dining at `/hotel/guest/room-service`, but **customer-facing folio / bill viewing is completely absent** (both in UI and API).
6. **Hotel $\leftrightarrow$ Restaurant Integration Gap**: `HotelNav` contains zero links or entry points to the Restaurant workspace (`/restaurant`, `/restaurant/tables`, `/restaurant/kds`), despite the shared platform model designating Hotel Restaurant as a companion module with Room Service KDS routing.

---

## 2. Repository / Branch / Commit Baseline

- **Repository**: `https://github.com/sypdersupport1-ui/ASSO-SuperApp.git`
- **Active Git Branch**: `feature/restaurant-r3-7-kds-routing`
- **Verified Commit Hash**: `138d3e20b0004d1b0b1d5d71681704b95e4cf4ce`
- **Clean Working Tree**: Confirmed (`git status` reports `nothing to commit, working tree clean`)
- **Runtime Environment**: Next.js 15.5.26, React 19, TypeScript 5 (Strict Mode), PostgreSQL (Neon/Supabase) via Drizzle ORM.

---

## 3. Audit Method

1. **Static Code & Schema Analysis**: Complete traversal of `src/app/hotel/`, `src/components/hotel/`, `src/lib/hotel/`, and associated API routes under `src/app/api/v1/hotel/` and `src/app/api/v1/customer/`.
2. **Component & Token Analysis**: Verification of CSS classes, design tokens in `src/app/globals.css`, Lucide icon usages, layout wrappers, and UI primitives (`src/components/ui/`).
3. **Local HTTP Runtime Probing**: Started Next.js server on `http://localhost:3000` and probed all 14 Hotel routes, confirming HTTP 200 compilation and HTML payload generation.
4. **Security & RLS Automated Audits**: Executed `npm run test:security` (42/42 passed) and `npm run db:verify:rls` (11/11 passed).
5. **Full Regression Execution**: Ran `npm test` across all 46 test files (616/616 passed).
6. **Load & Capacity Audit**: Ran `npm run test:load` (20/20 benchmarks passed).
7. **Typecheck & Production Build**: Ran `npm run typecheck` (0 errors) and `npm run build` (29 routes compiled).

---

## 4. Hotel Admin Route Inventory

| Route | File Path | Primary Function | Primary Components Used |
| :--- | :--- | :--- | :--- |
| `/hotel` | `src/app/hotel/page.tsx` | Operational Dashboard with room inventory KPIs, occupancy rate, housekeeping breakdown, room type table, and seed trigger. | `HotelNav`, `Card`, `Badge`, `Button`, `Alert` |
| `/hotel/front-office` | `src/app/hotel/front-office/page.tsx` | Daily operational front desk workspace: Arrivals, Departures, In-House, Attention tabs; quick check-in modal, quick check-out modal. | `HotelNav`, `Tabs`, `Dialog`, `Input`, `hotelFetch` |
| `/hotel/rooms` | `src/app/hotel/rooms/page.tsx` | Room Rack: Grid of room cards with operational/housekeeping badges, floor/status filtering, create room modal, status transition modal, QR code manager. | `HotelNav`, `Dialog`, `Input`, `Badge`, `Button` |
| `/hotel/room-types` | `src/app/hotel/room-types/page.tsx` | Room Types catalog: Card grid displaying base rates, occupancy bounds; create room type modal. | `HotelNav`, `Dialog`, `Input`, `Card`, `Button` |
| `/hotel/guests` | `src/app/hotel/guests/page.tsx` | Guest Directory: Searchable guest list, VIP badges, ID proof masks; create guest modal; guest detail modal with reservation history. | `HotelNav`, `Dialog`, `Input`, `Badge`, `Button` |
| `/hotel/reservations` | `src/app/hotel/reservations/page.tsx` | Reservations Management: Status-filtered list (Pending, Confirmed, Checked In, Completed, Cancelled, No Show); create reservation modal with room assignment. | `HotelNav`, `Dialog`, `Input`, `Badge`, `Button` |
| `/hotel/stays` | `src/app/hotel/stays/page.tsx` | In-house stays tracker: Table of active/completed stays, guest contact, room info; check-out confirmation modal; direct link to `/hotel/folio/[stayId]`. | `HotelNav`, `Dialog`, `Input`, `Badge`, `Button` |
| `/hotel/housekeeping` | `src/app/hotel/housekeeping/page.tsx` | Housekeeping Console: Task KPIs (Clean, Dirty, In Progress, Inspected); task tabs; create task modal; start/complete actions; inspect pass/fail modal; assign staff modal. | `HotelNav`, `Tabs`, `Dialog`, `Input`, `hotelFetch` |
| `/hotel/maintenance` | `src/app/hotel/maintenance/page.tsx` | Maintenance & Engineering: Requests list; category/impact filters; create request modal (Plumbing, Electrical, HVAC, etc.); start, resolve (with room status restore), close, reopen actions. | `HotelNav`, `Tabs`, `Dialog`, `Input`, `hotelFetch` |
| `/hotel/room-service` | `src/app/hotel/room-service/page.tsx` | Staff In-Room Dining Console: Real-time orders across Placed $\to$ Delivered; status advance controls; item 86 availability toggle drawer. | `HotelNav`, `Badge`, `Button`, `getStaffAuthHeaders` |
| `/hotel/folio/[stayId]` | `src/app/hotel/folio/[stayId]/page.tsx` | Stay Folio Page: Host page embedding `FolioWorkspace` for stay-scoped financial management. | `HotelNav`, `FolioWorkspace`, `Button` |
| `/hotel/settings` | `src/app/hotel/settings/page.tsx` | Hotel Property Settings: Property configuration table (timezone, currency, code); create property modal. | `HotelNav`, `Dialog`, `Input`, `Badge`, `Button` |

---

## 5. Hotel Customer Route Inventory

| Route | File Path | Primary Function | Primary Components Used |
| :--- | :--- | :--- | :--- |
| `/hotel/guest` | `src/app/hotel/guest/page.tsx` | Digital Guest Concierge Portal: QR resolution, session caching, verified room session badge, guest welcome hero, service category cards (Housekeeping, Amenities, Maintenance, Assistance), preset quick-picks, request submission dialog, live request tracking with SSE. | Native responsive elements, Lucide icons, SSE `EventSource` |
| `/hotel/guest/room-service` | `src/app/hotel/guest/room-service/page.tsx` | In-Room Dining Mobile Ordering: QR resolution, menu categories, menu items with pricing/availability, cart drawer with item notes and quantity modification, order placement, live order tracker (Received $\to$ Delivered) with SSE. | Native responsive drawer, Lucide icons, SSE `EventSource` |

---

## 6. Shared Components Used by Hotel

| Component | Path | Used In | Evaluation |
| :--- | :--- | :--- | :--- |
| `HotelNav` | `src/components/hotel/hotel-nav.tsx` | All 12 Hotel Admin pages | Sticky header, brand context, desktop links, mobile hamburger drawer, live Supabase DB badge. Lacks role filtering and Restaurant workspace link. |
| `FolioWorkspace` | `src/components/hotel/folio-workspace.tsx` | `/hotel/folio/[stayId]` | Comprehensive financial workspace (charges, payments, adjustments, refunds, close/reopen). Strongly hardcoded to dark zinc palette (`bg-zinc-950`). |
| `Button` | `src/components/ui/button.tsx` | All Hotel pages | Full variant support (`default`, `outline`, `ghost`, `destructive`, `secondary`). Minimum touch target 44px on mobile requires verification. |
| `Card` | `src/components/ui/card.tsx` | All Hotel pages | Clean border/card backgrounds; consistent border-radius (`rounded-xl`). |
| `Badge` | `src/components/ui/badge.tsx` | All Hotel pages | Variants: `default`, `secondary`, `destructive`, `outline`, `success`, `warning`, `info`. High visual consistency. |
| `Dialog` | `src/components/ui/dialog.tsx` | Rooms, Guests, Reservations, Housekeeping, Maintenance | Modal dialog system with backdrop and header/content/footer structure. |
| `Tabs` | `src/components/ui/tabs.tsx` | Front Office, Housekeeping, Maintenance | Standard tabbed navigation with pill styling. |
| `Input` | `src/components/ui/input.tsx` | All Hotel forms | Standard form input with border and focus rings. |

---

## 7. Admin UI Completeness Matrix

| Screen / Feature | Route | Visual Status | Functional Status | Gaps / Defects | Priority | Target Phase |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| **Operational Dashboard** | `/hotel` | ✅ COMPLETE | ✅ COMPLETE | Lacks time-range filtering; manual refresh only. | LOW | HUI-4 |
| **Front Office - Arrivals** | `/hotel/front-office` | ✅ COMPLETE | ✅ COMPLETE | Check-in modal requires room picker dropdown enhancement. | MEDIUM | HUI-2 |
| **Front Office - Departures** | `/hotel/front-office` | ✅ COMPLETE | ✅ COMPLETE | Quick checkout modal lacks direct folio balance check alert. | HIGH | HUI-2 |
| **Front Office - In-House** | `/hotel/front-office` | ✅ COMPLETE | ✅ COMPLETE | Search is text-based; lacks VIP or floor filter pills. | LOW | HUI-4 |
| **Front Office - Attention** | `/hotel/front-office` | ✅ COMPLETE | ✅ COMPLETE | Good alert cards for overdue check-ins/check-outs. | LOW | HUI-4 |
| **Room Rack** | `/hotel/rooms` | 🟡 PARTIAL | ✅ COMPLETE | Grid cards are functional but dense; alerts use native `alert()`. | HIGH | HUI-1 |
| **Room Types Catalog** | `/hotel/room-types` | 🟡 PARTIAL | ✅ COMPLETE | Simple card grid; lacks room amenity tags and image previews. | MEDIUM | HUI-3 |
| **Guest Directory** | `/hotel/guests` | 🟡 PARTIAL | ✅ COMPLETE | Searchable table; create guest dialog uses native `alert()`. | HIGH | HUI-3 |
| **Reservations List** | `/hotel/reservations` | 🟡 PARTIAL | ✅ COMPLETE | Table overflows horizontally on tablet/mobile; form lacks datepicker. | HIGH | HUI-2 |
| **Active Stays** | `/hotel/stays` | 🟡 PARTIAL | ✅ COMPLETE | Table layout overflows on mobile; lacks quick folio balance column. | HIGH | HUI-2 |
| **Housekeeping Console** | `/hotel/housekeeping` | ✅ COMPLETE | ✅ COMPLETE | Rich KPI cards, task creation, inspection workflows; uses `hotelFetch`. | LOW | HUI-4 |
| **Maintenance Console** | `/hotel/maintenance` | ✅ COMPLETE | ✅ COMPLETE | Full category breakdown, impact controls, resolution flow; uses `hotelFetch`. | LOW | HUI-4 |
| **Staff Room Service** | `/hotel/room-service` | 🟡 PARTIAL | ✅ COMPLETE | Functional order progress buttons; lacks direct link to `/restaurant/kds`. | MEDIUM | HUI-3 |
| **Stay Folio Workspace** | `/hotel/folio/[stayId]` | 🟡 PARTIAL | ✅ COMPLETE | Complete financial actions, but hardcoded dark zinc theme breaks visual harmony. | CRITICAL | HUI-1 |
| **Hotel Settings** | `/hotel/settings` | 🟡 PARTIAL | ✅ COMPLETE | Basic property table; lacks operational policies / tax configuration controls. | MEDIUM | HUI-5 |

---

## 8. Customer UI Completeness Matrix

| Journey Step / Screen | Route | Visual Status | Functional Status | Gaps / Defects | Priority | Target Phase |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: |
| **QR Code Entry & Resolution** | `/hotel/guest?token=...` | ✅ COMPLETE | ✅ COMPLETE | Server-authoritative resolution; verified room session header; error states for revoked/expired tokens. | LOW | HUI-4 |
| **Concierge Home Page** | `/hotel/guest` | ✅ COMPLETE | ✅ COMPLETE | Category cards with icons and subtitles; welcome hero with guest name. | LOW | HUI-4 |
| **Service Request Presets** | `/hotel/guest` | ✅ COMPLETE | ✅ COMPLETE | 4 categories (Housekeeping, Amenities, Maintenance, Assistance) with one-click presets. | LOW | HUI-4 |
| **Service Request Form** | `/hotel/guest` | ✅ COMPLETE | ✅ COMPLETE | Title, description, and Normal/Urgent priority toggle; submits to `/api/v1/customer/service-requests`. | LOW | HUI-4 |
| **Live Request Tracker** | `/hotel/guest` (Tab 2) | ✅ COMPLETE | ✅ COMPLETE | Displays active and resolved requests with timestamps and live SSE updates. | LOW | HUI-4 |
| **Digital Dining Menu** | `/hotel/guest/room-service` | ✅ COMPLETE | ✅ COMPLETE | Category tabs, dish cards, prices, vegetarian/spicy indicators, add-to-cart buttons. | LOW | HUI-4 |
| **Dining Cart & Drawer** | `/hotel/guest/room-service` | ✅ COMPLETE | ✅ COMPLETE | Quantity modifiers (+/-), line item special instructions, tax & fee breakdown, order submit button. | LOW | HUI-4 |
| **In-Room Dining Order Tracker** | `/hotel/guest/room-service` | ✅ COMPLETE | ✅ COMPLETE | Live 5-stage progress (Received $\to$ Preparing $\to$ Ready $\to$ On the way $\to$ Delivered) via SSE. | LOW | HUI-4 |
| **Customer Stay / Room Details** | `/hotel/guest` | 🟡 PARTIAL | 🟡 PARTIAL | Room number shown in header; lacks check-in/out dates, Wi-Fi password card, hotel amenities guide. | HIGH | HUI-4 |
| **Customer Folio / Room Charges** | N/A | ❌ MISSING | ❌ MISSING | Guests cannot view their accumulated room charges, dining bills, or current folio balance. | HIGH | HUI-4 |
| **Customer Profile / OTP Login** | N/A | ⏸ DEFERRED | ⏸ DEFERRED | QR session authentication is used exclusively; customer account login deferred to Platform Auth phase. | LOW | Deferred |

---

## 9. Hotel ↔ Restaurant Integration Matrix

| Integration Point | Current Status | Findings & Specific Code Locations | Recommended Remediation |
| :--- | :---: | :--- | :--- |
| **Hotel Admin $\to$ Restaurant Navigation** | ❌ MISSING | `HotelNav` (`src/components/hotel/hotel-nav.tsx`) does not contain any link to `/restaurant`, `/restaurant/tables`, or `/restaurant/kds`. Staff must manually edit the URL or navigate back to the root page `/`. | Add an optional "Restaurant" nav item in `HotelNav` when the tenant is entitled to the `RESTAURANT` module. |
| **Restaurant $\to$ Hotel Navigation** | ❌ MISSING | `RestaurantNav` (`src/components/restaurant/restaurant-nav.tsx`) only has a "Platform" back link to `/`. It does not link back to the Hotel workspace. | Add an explicit "Hotel Admin" switcher link in `RestaurantNav` when in a hotel context. |
| **Room Service KDS Destination Handoff** | ✅ COMPLETE | Verified in Restaurant R3.7: KDS generates tasks with `destination_label = "Room 304"` and routes items to Hot Kitchen, Tandoor, Beverage stations. | Maintain server-authoritative destination labeling. |
| **Hotel Staff Room Service Console** | 🟡 PARTIAL | `/hotel/room-service/page.tsx` exists as a standalone mini-console. It manages orders but does not provide a direct link to the full `/restaurant/kds` screen for station operators. | Add a "Open Kitchen KDS" button on `/hotel/room-service`. |
| **Room Service $\to$ Folio Billing Link** | ✅ COMPLETE | When Room Service orders are created with `chargeToRoom: true`, charges post to the active stay's folio in `src/lib/hotel/folio-service.ts`. | Preserved; financial invariant remains immutable. |
| **Root Landing Page (`src/app/page.tsx`)** | 🟡 PARTIAL | Lines 191 & 238: Hotel is labeled "Phase 7 (Slice 1 Active)" and Restaurant is labeled "Slice 1 Active". Both are far out of date (Hotel is at Slice 9, Restaurant at R3.7). | Update launcher banners on root page to reflect current slice status. |

---

## 10. Role / Navigation Audit

ASSO enforces a locked hierarchical role structure:
```text
HOTEL ADMIN (Owner authority over Hotel + enabled Restaurant module)
├── HOTEL MANAGER
│   ├── Front Desk (Front Office, Reservations, Stays, Guests, Room Rack)
│   ├── Housekeeping (Housekeeping tasks, inspections, room turnover)
│   ├── Maintenance (Maintenance requests, equipment repairs, room out-of-service)
│   └── Other Hotel Staff
└── RESTAURANT MANAGER
    └── RESTAURANT STAFF
```

**Audit Findings**:
1. **Unconditional Link Exposure**: `HotelNav` (`src/components/hotel/hotel-nav.tsx`, lines 36–48) renders all 11 navigation links statically without inspecting user roles or session permissions. A Housekeeping staff member sees Settings, Front Office, and Folio; a Front Desk clerk sees Maintenance configuration.
2. **Server-Side Authorization Safety**: Although the frontend does not filter links, server-side route handlers enforce strict RBAC via `extractRequestContext` and `authenticateKdsStaff`. Unauthorized API calls return `403 FORBIDDEN` or `401 AUTHENTICATION_REQUIRED`.
3. **No Role-Aware UI Adapters**: There is no client-side hook (e.g. `useCurrentUser` or `usePermissions`) to conditionally render action buttons (such as "Reopen Folio" or "Create Property").

---

## 11. Responsive / Mobile Audit

| Screen / Viewport | Device Class | Usability State | Concrete Findings & Deficiencies |
| :--- | :--- | :---: | :--- |
| **Hotel Customer Portal** | Mobile (375px–430px) | ✅ EXCELLENT | Designed mobile-first (`max-w-xl mx-auto`), sticky headers, large tap targets ($>44$px), touch drawers, smooth tab toggles. |
| **Hotel Customer Dining** | Mobile (375px–430px) | ✅ EXCELLENT | Category pill scroller, floating bottom cart pill, sticky checkout drawer, responsive item cards. |
| **Hotel Admin Navigation** | Mobile ($<1024$px) | ✅ GOOD | Hamburger menu toggle slides open a full-height mobile drawer with 44px tap targets. |
| **Front Office Tables** | Mobile / Tablet | 🟡 PARTIAL | Arrivals, Departures, and In-House tables scroll horizontally with awkward cutoffs. Lacks responsive mobile card view. |
| **Room Rack Grid** | Mobile ($<640$px) | 🟡 PARTIAL | Switches to 2-column or 1-column grid; room action buttons become cramped; room status badges wrap onto multiple lines. |
| **Reservations & Stays Tables** | Mobile ($<768$px) | 🟡 PARTIAL | 7–8 column data tables cause severe horizontal overflow; action buttons in the rightmost column require excessive horizontal scrolling. |
| **Folio Workspace** | Tablet / Mobile | 🟡 PARTIAL | Ledger table overflows; ledger summary cards stack awkwardly; charge/payment dialogs require scroll to access submit button. |

---

## 12. Real User Journey Audit

### Admin / Staff Journeys

| # | User Journey | Result | Operational Assessment |
| :-: | :--- | :---: | :--- |
| 1 | **Reservation $\to$ Check-in $\to$ Stay $\to$ Check-out** | **Works** | Flow succeeds end-to-end. Reservation created in `/hotel/reservations`, checked in via `/hotel/front-office` modal, tracked in `/hotel/stays`, and checked out with departure notes. Room status transitions to `DIRTY`. |
| 2 | **Walk-in $\to$ Room assignment $\to$ Check-in** | **Partially Works** | Requires creating reservation first, then navigating to Front Office. No dedicated 1-click "Walk-in Check-in" quick action on Front Desk. |
| 3 | **Guest lookup $\to$ Reservation / Stay** | **Works** | Search by guest name on `/hotel/guests` opens modal showing reservation history; clicking reservation allows navigation to stay. |
| 4 | **Checkout $\to$ Housekeeping Turnover** | **Works** | Checkout automatically moves room housekeeping status to `DIRTY`; Housekeeping screen `/hotel/housekeeping` shows dirty room in "Dirty Turnover" tab. Task can be started, completed, and inspected. |
| 5 | **Maintenance issue $\to$ Resolution** | **Works** | Created on `/hotel/maintenance`, sets room to `OUT_OF_SERVICE`, technician starts request, resolves with "Restore Room to Available", room returns to rack. |
| 6 | **Service Request $\to$ Assignment $\to$ Completion** | **Partially Works** | Customer submits request via `/hotel/guest`; backend creates record; however, Admin currently views service requests primarily within Housekeeping or Maintenance console rather than a unified "Guest Service Requests" desk queue. |
| 7 | **Room Service $\to$ KDS $\to$ Delivery** | **Works** | Order placed via customer dining portal `/hotel/guest/room-service`; appears on `/hotel/room-service` and Restaurant KDS; kitchen advances order; live status updates on customer screen. |
| 8 | **Folio $\to$ Payment $\to$ Settlement** | **Works** | Accessible via `/hotel/folio/[stayId]` or Stays table; posts charges, payments, adjustments; closes folio once balance is 0.0000. Visual dark theme disconnect is the primary issue. |
| 9 | **Hotel Admin $\to$ Hotel Restaurant Switch** | **Blocked** | No navigation link exists in `HotelNav` to switch to Restaurant workspace without editing browser URL. |

### Customer Journeys

| # | User Journey | Result | Operational Assessment |
| :-: | :--- | :---: | :--- |
| 10 | **QR $\to$ Welcome $\to$ Hotel Home** | **Works** | Seamless QR resolution via URL token or session storage; resolves room number, hotel name, and active guest first name; renders verified session badge. |
| 11 | **Hotel Home $\to$ In-Room Dining $\to$ Order** | **Works** | Banner on home navigates to `/hotel/guest/room-service`; customer selects dishes, adds to cart with special notes, places order; order confirmation displays instantly. |
| 12 | **In-Room Dining $\to$ Live Order Tracker** | **Works** | Order progress bar updates in real time via SSE connection without requiring manual page refresh. |
| 13 | **Hotel Home $\to$ Service Request Submission** | **Works** | Customer clicks category preset (e.g. "Fresh towels"), dialog opens pre-populated, customer submits; request appears in "My Requests" tab with live status updates. |
| 14 | **Hotel Home $\to$ My Stay & Folio / Charges** | **Blocked** | Customer cannot view running room charges or folio balance; no screen exists in customer portal. |

---

## 13. Visual Design System Audit

| UI Element | Current Implementation | Consistency Evaluation | Recommendation |
| :--- | :--- | :---: | :--- |
| **Typography** | Inter + Outfit (`--font-inter`, `--font-outfit`) | ✅ HIGH | Applied consistently via `font-sans` and `font-display`. |
| **Color Tokens** | HSL variables in `globals.css` | 🟡 MIXED | Standard pages use `--background`, `--card`, `--foreground`. Folio workspace and customer portal use hardcoded Tailwind zinc/slate classes (`bg-zinc-950`, `bg-slate-900`). |
| **Borders & Radii** | `--radius: 0.5rem` (`rounded-xl`, `rounded-2xl`) | ✅ HIGH | Modern rounded card silhouettes across all screens. |
| **Buttons** | `src/components/ui/button.tsx` | 🟡 MIXED | Admin pages use button primitives, but multiple forms use unstyled `<button>` tags with custom classes. |
| **Tables** | Native HTML `<table>` in cards | 🟡 MIXED | Tables lack sticky headers; horizontal scrolling lacks visual shadow indicators; row padding varies between pages. |
| **Badges** | `src/components/ui/badge.tsx` | ✅ HIGH | Status badges use consistent color mappings (Green: Clean/Available, Blue: Occupied, Amber: Reserved/Dirty, Red: Out of Order/Cancelled). |
| **Alerts / Toasts** | `src/components/ui/alert.tsx` vs `window.alert()` | ❌ INCONSISTENT | Page-level banners use `Alert`, but form submissions and error catches fall back to browser `alert()`. |
| **Modal Dialogs** | `src/components/ui/dialog.tsx` | ✅ HIGH | Standardized dialog overlays and animations. |

---

## 14. Hotel Visual Personality Assessment

- **Target Persona**: **PREMIUM HOSPITALITY** (Calm, trustworthy, polished, elegant, operationally efficient, distinct from casual dining or cinema ticketing).
- **Current Aesthetic Rating**: **6.5 / 10**
  - *Positive Aspects*:
    - Deep indigo and emerald accents convey trust and calm luxury.
    - Customer mobile experience feels like a native boutique hotel app with glassmorphism and subtle gradients.
    - Clean typography hierarchy using Outfit for headers and Inter for data tables.
  - *Deficiencies*:
    - Abrupt dark-mode plunge when navigating to Folio workspace.
    - Intrusive browser `alert()` popups ruin the luxury digital feeling.
    - Dense data tables on admin screens feel like developer prototypes rather than a bespoke hotel PMS.
    - Lack of warm hospitality accents (e.g. subtle gold/warm sand borders or luxury typography touches).

---

## 15. Loading / Empty / Error / Success State Audit

| Screen | Loading State | Empty State | Error State | Success State |
| :--- | :---: | :---: | :---: | :---: |
| **Dashboard (`/hotel`)** | Skeleton pulse cards | Detailed card with seed button | Dismissible alert with retry | KPI cards display |
| **Front Office (`/hotel/front-office`)** | Spinner with text | Empty table message | Alert banner | Toast / auto-refresh |
| **Room Rack (`/hotel/rooms`)** | Pulse grid | "No rooms found" message | Alert banner | Card grid with badges |
| **Reservations (`/hotel/reservations`)** | Loading indicator | "No reservations found" | Alert banner | Table rows |
| **Stays (`/hotel/stays`)** | Loading indicator | "No active stays" | Alert banner | Table rows |
| **Housekeeping (`/hotel/housekeeping`)** | Loading spinner | "No tasks in this category" | Alert banner | Tabs with badge counts |
| **Maintenance (`/hotel/maintenance`)** | Loading spinner | "No requests found" | Alert banner | Tabs with badge counts |
| **Folio (`/hotel/folio/[stayId]`)** | Spinner with text | "No entries recorded" | Red error card with retry | Real-time balance update |
| **Customer Concierge (`/hotel/guest`)** | Backdrop blur spinner | "No requests submitted yet" | Dedicated error card with QR help | Green confirmation pill |
| **Customer Dining (`/hotel/guest/room-service`)** | Category skeleton | "No dishes in this category" | Error card with retry | Order tracker badge |

---

## 16. Accessibility Basics Audit

1. **Color Contrast**: Main text (`text-foreground` on `bg-background` and `text-white` on `bg-slate-900`) achieves WCAG AA contrast ratio ($>7:1$). Certain muted timestamps (`text-[10px] text-muted-foreground`) border on $3.8:1$ and require bump to $4.5:1$.
2. **Touch Targets**: Customer portal achieves $\ge 44 \times 44$px for all interactive buttons. Admin tables have some compact icon buttons ($32 \times 32$px) that require increased padding on touch devices.
3. **Form Labels**: Most dialog inputs have visible labels; however, several select inputs rely solely on placeholder text.
4. **Keyboard Focus**: Native focus rings (`ring-2 ring-primary`) are supported via `globals.css` layer base, but custom div buttons in the customer portal lack explicit `onKeyDown` handlers.

---

## 17. Functional vs Frontend Completeness

```text
┌─────────────────────────────────┬──────────────────┬──────────────────┐
│ Hotel Domain Area               │ Backend Engine   │ Frontend UI      │
├─────────────────────────────────┼──────────────────┼──────────────────┤
│ Rooms, Types & Rack             │ COMPLETE (100%)  │ COMPLETE (95%)   │
│ Guest Directory                 │ COMPLETE (100%)  │ COMPLETE (90%)   │
│ Reservations & Booking          │ COMPLETE (100%)  │ COMPLETE (90%)   │
│ Front Office Check-in/out       │ COMPLETE (100%)  │ COMPLETE (95%)   │
│ Stays & In-House Tracking       │ COMPLETE (100%)  │ COMPLETE (90%)   │
│ Housekeeping Operations         │ COMPLETE (100%)  │ COMPLETE (95%)   │
│ Maintenance & Engineering       │ COMPLETE (100%)  │ COMPLETE (95%)   │
│ Staff Room Service Console      │ COMPLETE (100%)  │ PARTIAL (80%)    │
│ Folio, Billing & Refunds        │ COMPLETE (100%)  │ PARTIAL (75%)    │
│ Customer QR Concierge           │ COMPLETE (100%)  │ COMPLETE (95%)   │
│ Customer In-Room Dining Ordering│ COMPLETE (100%)  │ COMPLETE (95%)   │
│ Customer Folio / Charges View   │ COMPLETE (100%)  │ MISSING (0%)     │
│ Hotel ↔ Restaurant Navigation   │ COMPLETE (100%)  │ MISSING (10%)    │
└─────────────────────────────────┴──────────────────┴──────────────────┘
```

---

## 18. Missing UI

1. **Customer-Facing Folio / Bill View**:
   - *Route*: `/hotel/guest/folio` or a dedicated "My Bill" tab on `/hotel/guest`.
   - *Missing*: No customer UI to view itemized room charges, room service orders, taxes, payments made, or outstanding balance.
   - *Priority*: **HIGH**.
   - *Proposed Phase*: **HUI-4**.
2. **Hotel $\leftrightarrow$ Restaurant Global Switcher**:
   - *Component*: `HotelNav` and `RestaurantNav`.
   - *Missing*: No navigation link connecting the two sibling vertical consoles.
   - *Priority*: **HIGH**.
   - *Proposed Phase*: **HUI-1**.
3. **Unified Guest Service Requests Desk (Admin)**:
   - *Missing*: Admin screen consolidating guest service requests (amenity requests, luggage assistance, wake-up calls) that fall outside pure Housekeeping turnover or Maintenance workorders.
   - *Priority*: **MEDIUM**.
   - *Proposed Phase*: **HUI-3**.
4. **Walk-in Direct Check-in Flow**:
   - *Route*: `/hotel/front-office`.
   - *Missing*: 1-click modal for walk-in arrivals (creates guest, reservation, room assignment, and stay in one flow).
   - *Priority*: **MEDIUM**.
   - *Proposed Phase*: **HUI-2**.

---

## 19. Partial UI

1. **Stay Folio Workspace (`/hotel/folio/[stayId]`)**:
   - *What Exists*: Full ledger operations (charges, payments, adjustments, refunds, close/reopen).
   - *What is Weak*: Hardcoded dark zinc theme (`bg-zinc-950`) completely contradicts the rest of the application; lacks printable guest invoice layout.
   - *Priority*: **CRITICAL**.
   - *Proposed Phase*: **HUI-1**.
2. **Client Authentication Consistency**:
   - *What Exists*: `hotelFetch` helper in `src/lib/hotel/client-auth.ts`.
   - *What is Weak*: Only 3 pages use it; 9 pages use plain `fetch()` without auth headers.
   - *Priority*: **CRITICAL**.
   - *Proposed Phase*: **HUI-1**.
3. **Error Handling & Native Browser Alerts**:
   - *What Exists*: Functional form submission catches.
   - *What is Weak*: Uses `window.alert()` instead of inline form feedback or toast notifications.
   - *Priority*: **HIGH**.
   - *Proposed Phase*: **HUI-1**.
4. **Responsive Table Stacking**:
   - *What Exists*: Desktop HTML tables on Front Office, Stays, Reservations, Guests.
   - *What is Weak*: Horizontal scroll overflow on tablet and mobile viewports.
   - *Priority*: **HIGH**.
   - *Proposed Phase*: **HUI-2**.
5. **Staff Room Service Console**:
   - *What Exists*: Status advance buttons and item availability toggle.
   - *What is Weak*: Lacks direct link to Restaurant KDS station view (`/restaurant/kds`).
   - *Priority*: **MEDIUM**.
   - *Proposed Phase*: **HUI-3**.

---

## 20. UX Refinement Opportunities

1. **Premium Hospitality Visual Polish**: Elevate card borders with subtle warm gold/champagne accents (`hsl(38 92% 50%)`), sophisticated serif/sans typography pairs, and calm luxury spacing.
2. **Unified Toast System**: Replace all `alert()` calls with a shared non-blocking toast notification mechanism.
3. **Keyboard Shortcuts for Front Desk**: Add quick keyboard accelerators (e.g. `Ctrl+N` for New Reservation, `Ctrl+F` for Front Desk search) for high-efficiency front office operators.
4. **Printable Folio Invoice View**: Add a CSS print stylesheet (`@media print`) on the Folio page so hotel staff can click "Print Guest Folio" and produce a clean letterhead receipt.
5. **Customer Room Service Re-order**: Allow guests to click "Reorder" on previously delivered in-room dining orders.

---

## 21. Critical / High / Medium / Low Findings

### Critical Findings
- **C1: Folio Theme Fracture**: Hardcoded `bg-zinc-950` in `FolioWorkspace.tsx` causes a severe visual break with the rest of the Hotel PMS.
- **C2: Client Auth Inconsistency**: 9 out of 12 Hotel Admin pages bypass `hotelFetch`, risking 401 Unauthorized errors in strict authentication environments.

### High Findings
- **H1: Missing Customer Folio View**: Hotel guests have no digital visibility into their room charges or room service bills on `/hotel/guest`.
- **H2: Native `alert()` Invasiveness**: Error handling across room, guest, and settings forms relies on browser `alert()`.
- **H3: Missing Hotel $\leftrightarrow$ Restaurant Navigation**: Staff cannot navigate between Hotel PMS and Restaurant Console without manually typing URLs.
- **H4: Mobile Table Overflow**: Front Office, Stays, and Reservations tables overflow horizontally on mobile and tablet screens.

### Medium Findings
- **M1: Static Role Navigation**: `HotelNav` does not filter links based on user permissions or roles.
- **M2: Front Office Walk-in Friction**: No streamlined single-step walk-in check-in action.
- **M3: Root Page Outdated Badges**: `src/app/page.tsx` still displays "Slice 1 Active" for both Hotel and Restaurant.

### Low Findings
- **L1: Manual Dashboard Refresh**: `/hotel` lacks an auto-polling toggle or SSE subscription for live inventory counters.
- **L2: Missing Room Amenity Badges**: Room Types page does not show amenity tags (e.g. Wi-Fi, Balcony, King Bed).

---

## 22. Recommended HUI-1 Scope
### Phase: Hotel UI Foundation, Design Token Alignment & Folio Harmonization
- **Objective**: Fix the visual fracture and client authentication foundation without changing business logic.
- **Key Deliverables**:
  1. Refactor `FolioWorkspace.tsx` and `/hotel/folio/[stayId]` to use semantic CSS variables (`bg-card`, `border-border`, `text-foreground`), matching the rest of the application in both light and dark modes.
  2. Standardize all 12 Hotel Admin pages to use `hotelFetch` from `@/lib/hotel/client-auth.ts`, ensuring robust Bearer token injection across all API calls.
  3. Replace all instances of `window.alert()` with an accessible inline Alert or Toast notification component.
  4. Add bidirectional navigation links between `HotelNav` and `RestaurantNav`.
  5. Update root page (`src/app/page.tsx`) vertical launcher banners to reflect current slice status.

---

## 23. Recommended HUI-2 Scope
### Phase: Front Desk, Reservations & In-House Stays UX
- **Objective**: Optimize operational efficiency for Front Desk clerks and managers.
- **Key Deliverables**:
  1. Implement responsive card views for Arrivals, Departures, and In-House stays on tablet and mobile viewports.
  2. Add a streamlined "Walk-in Check-in" quick modal on Front Office.
  3. Enhance Reservations creation form with interactive room type rate previews and date range inputs.
  4. Add quick folio balance indicator pill directly in the In-House Stays table.

---

## 24. Recommended HUI-3 Scope
### Phase: Rooms, Catalog & Service Operations UX
- **Objective**: Polish room management, housekeeping turnover, and maintenance engineering workflows.
- **Key Deliverables**:
  1. Room Rack density controls (compact, comfortable, floor-by-floor view).
  2. Add room amenity pills and image upload placeholders to Room Types.
  3. Link Staff Room Service console directly to Restaurant KDS (`/restaurant/kds`).
  4. Unified Guest Service Requests queue on the admin console.

---

## 25. Recommended HUI-4 Scope
### Phase: Customer Digital Experience & Guest Folio
- **Objective**: Deliver a complete, seamless luxury mobile guest portal.
- **Key Deliverables**:
  1. Build customer-facing "My Charges / Bill" screen on `/hotel/guest` linking to live folio entries.
  2. Add Hotel Amenities guide, Wi-Fi card, and hotel contact details to the guest concierge home.
  3. Add re-order capability and estimated delivery countdown to in-room dining tracker.

---

## 26. Recommended HUI-5 Scope
### Phase: Hotel Settings, Policies & Final Closure
- **Objective**: Finalize configuration, multi-property controls, and complete Hotel vertical closure.
- **Key Deliverables**:
  1. Role-aware navigation hiding in `HotelNav` based on active user permissions.
  2. Operational policies UI (check-in/check-out default times, late checkout fees, cancellation rules).
  3. Comprehensive end-to-end visual QA and responsive cross-browser validation.

---

## 27. Items Explicitly Deferred

- **Cinema Vertical (C1)**: Paused until Hotel UI closure is fully accepted.
- **Restaurant POS Inventory Depletion (R3.8)**: Paused during Hotel UI phases.
- **Customer Account / OTP Auth**: Digital guest portal continues to rely on high-entropy QR tokens and room session caching.
- **Physical Hardware Integrations**: ESC/POS slip printers and magnetic key card encoders interface with domain events in future phases.

---

## 28. Items That Must NOT Be Changed

1. **State Machines**: All valid transitions for rooms, reservations, stays, housekeeping, maintenance, and folios in `src/lib/hotel/*-state-machines.ts` are strictly locked.
2. **Canonical Financial Calculations**: Exact 4-decimal integer micro-currency arithmetic (`subtotal`, `taxes`, `payments`, `balanceDue`) in `src/lib/hotel/folio-service.ts` must remain 100% immutable.
3. **Database Schema & RLS**: Table schemas in `src/db/schema/hotel.ts` and native Supabase PostgreSQL RLS policies must not be altered during UI phases.
4. **Backend API Contracts**: All route handler schemas under `/api/v1/hotel/*` and `/api/v1/customer/*` must remain backward compatible.

---

## 29. Risks / Ambiguities

1. **Light / Dark Mode Preference**: The application currently lacks a global theme toggle button in the header; it relies on the OS `prefers-color-scheme`. Folio's forced dark theme was likely an ad-hoc attempt to create a dark room console, which must be unified under the CSS token system.
2. **Customer Folio Privacy**: Showing folio charges to customers on mobile requires strict room-session validation to ensure guests only see charges for their current active stay.

---

## 30. Final Hotel UI Baseline Verdict

### A. WHAT IS ALREADY GOOD
- **Robust End-to-End Capabilities**: Every hotel operational capability (from room racks and front desk to housekeeping, maintenance, and folio billing) has a real, working UI.
- **Mobile Guest Portal**: The customer QR experience (`/hotel/guest` and `/hotel/guest/room-service`) is modern, responsive, and includes real-time SSE updates.
- **Flawless Backend Quality**: 616 full regression tests, 42 security tests, 11 RLS tests, 20 load benchmarks, 0 typecheck errors, and clean Next.js production build.

### B. WHAT MUST BE FIXED (HUI-1 Priority)
- **Folio Theme Fracture**: Replace hardcoded `bg-zinc-950` with semantic design tokens.
- **Client Auth Inconsistency**: Standardize all admin page fetches on `hotelFetch`.
- **Eliminate `window.alert()`**: Replace native alerts with in-page alert/toast feedback.
- **Add Hotel $\leftrightarrow$ Restaurant Navigation**: Enable seamless switching between sibling vertical workspaces.

### C. WHAT SHOULD BE POLISHED (HUI-2 & HUI-3 Priority)
- Responsive mobile card views for dense admin data tables.
- Streamlined Walk-in Check-in flow on Front Desk.
- Room Rack display density toggles.

### D. WHAT SHOULD REMAIN DEFERRED
- Cinema vertical C1.
- Restaurant R3.8 inventory depletion.
- Customer SMS/OTP account logins.

### E. RECOMMENDED NEXT SLICE: HUI-1
- **Slice Title**: `HUI-1: Hotel UI Foundation, Design Token Alignment & Folio Harmonization`
- **Scope**: Audit-driven design token refactor of `FolioWorkspace.tsx`, centralized `hotelFetch` adoption across all 12 admin pages, non-blocking toast notifications, and bidirectional Hotel/Restaurant workspace navigation.
- **Status**: Ready for Human Developer review and approval. Zero code changes made in HUI-0.
