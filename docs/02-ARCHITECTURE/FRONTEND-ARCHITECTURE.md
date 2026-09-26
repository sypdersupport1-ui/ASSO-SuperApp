# ASSO — Frontend Architecture

**Phase**: 2 — Master Architecture  
**Status**: Pre-Phase-3 Resolution Completed  
**Last Updated**: 2026-09-26  

---

## 1. Frontend Principle

ASSO implements **one unified Next.js application** in a single codebase that hosts three distinct user surfaces and application shells:

```text
                     ASSO Unified Frontend Codebase
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      ▼                            ▼                            ▼
Customer Shell              Business Shell              Super Admin Shell
(`/c/...`)                  (`/b/...`)                  (`/sa/...`)
Mobile-first QR experience   Staff operations & KDS      Platform management
Ultra-lightweight bundle    Dense, interactive tables   High-privilege portal
      │                            │                            │
      └────────────────────────────┼────────────────────────────┘
                                   │
                 ┌─────────────────┴─────────────────┐
                 ▼                                   ▼
        Shared Design System                Shared API Client
        (Tailwind + Radix Tokens)           (Typed HTTP + SSE Stream)
                 │                                   │
                 └─────────────────┬─────────────────┘
                                   ▼
                         ASSO Backend API Server
```

### Why One Application with Three Surfaces (ADR-009)?
1. **Single Developer + AI Agent Maintainability**: One repository, one `package.json`, one build pipeline, zero package publication overhead or version skew.
2. **Instant Preview Verification**: Feature branches generate a single Vercel preview deployment verifying Customer QR, Staff Console, and Super Admin in lockstep against preview databases.
3. **Strict Route Boundaries**: Enforced via Next.js App Router route groups (`(customer)`, `(console)`, `(admin)`) with isolated root layouts, separate session cookies, and dedicated auth middleware.

---

## 2. Application Shell Architecture

| Shell | Route Root | Primary Devices | Shell Philosophy | Session Context |
|---|---|---|---|---|
| **Customer Shell** | `/c/...` | Mobile smartphone (iOS / Android) | Zero navigation chrome, fast initial paint, contextual branding, touch-optimized (targets ≥ 44px) | `CustomerSession` (token bound to `tenant + outlet + context`) |
| **Business Console Shell** | `/b/...` | Desktop monitor, Tablet / iPad, POS terminal | Persistent sidebar, multi-outlet switcher, dense data grids, real-time alerts, keyboard shortcuts | `StaffSession` (scoped to `tenant + assigned_outlets + role`) |
| **Super Admin Shell** | `/sa/...` | Desktop workstation | Platform health metrics, organization list, module catalog, audit log viewer | `SuperAdminSession` (platform-wide privilege, mandatory MFA) |

---

## 3. Route Architecture

### 3.1 Customer Application Routes (`/c/...`)

```text
/c/[token]                    — QR entry: resolves opaque token → creates session → redirects
/c/hotel/[outletId]/menu      — Room service menu & catalog
/c/hotel/[outletId]/orders    — Live order tracker
/c/hotel/[outletId]/requests  — Service requests (Housekeeping, Amenities, Luggage)
/c/hotel/[outletId]/chat      — Real-time conversation with front desk
/c/hotel/[outletId]/bill      — View active stay charges / folio

/c/restaurant/[outletId]/menu — Dining menu with categories and item modifiers
/c/restaurant/[outletId]/orders— Table orders status
/c/restaurant/[outletId]/requests— Call waiter, request water/cutlery
/c/restaurant/[outletId]/chat — Chat with server/host
/c/restaurant/[outletId]/bill — View table bill, request bill, pay via UPI/Card

/c/cinema/[outletId]/menu     — Concession snacks and beverages menu
/c/cinema/[outletId]/orders   — Concession order tracking
/c/cinema/[outletId]/requests — Seat assistance / temperature / cleanliness
/c/cinema/[outletId]/chat     — Chat with theater usher/staff
```

### 3.2 Business Console Routes (`/b/...`)

```text
/b/login                          — Staff authentication (Email/Password)
/b/[outletId]/dashboard           — Outlet operations overview & live telemetry
/b/[outletId]/orders              — Order management & fulfillment tracking
/b/[outletId]/kitchen             — Kitchen Display System (KDS) full-screen view
/b/[outletId]/requests            — Service requests queue & assignment
/b/[outletId]/chat                — Live customer conversations inbox
/b/[outletId]/pos                 — Point-of-Sale terminal
/b/[outletId]/inventory           — Stock levels & location management
/b/[outletId]/inventory/movements — Immutable stock movement ledger
/b/[outletId]/procurement         — Purchase orders & goods receipt
/b/[outletId]/expenses            — Operating expenses & receipts
/b/[outletId]/cash                — Cash register sessions & reconciliation
/b/[outletId]/staff               — Staff profiles, outlet assignment, RBAC roles
/b/[outletId]/reports             — Centrally calculated metrics & exports
/b/[outletId]/settings            — Outlet configuration
/b/[outletId]/settings/modules    — View active module entitlements

Vertical-Specific Extensions:
  Hotel:
    /b/[outletId]/rooms           — Room grid, floor plans, room status
    /b/[outletId]/stays           — Active stays, check-in, check-out
    /b/[outletId]/reservations    — Room booking roster
    /b/[outletId]/housekeeping    — Housekeeping task board
    /b/[outletId]/folio/[stayId]  — Guest folio ledger & settlements
  Restaurant:
    /b/[outletId]/tables          — Table status floor view
    /b/[outletId]/queue           — Walk-in waitlist board (if entitled)
    /b/[outletId]/reservations    — Table reservations roster (if entitled)
  Cinema:
    /b/[outletId]/screens         — Screen & auditorium configuration
    /b/[outletId]/shows           — Screening schedule & concession tracking
```

### 3.3 Super Admin Routes (`/sa/...`)

```text
/sa/login                         — Platform admin login with mandatory MFA
/sa/dashboard                     — Global platform metrics & tenant activity
/sa/tenants                       — Tenant organization roster
/sa/tenants/[id]                  — Organization details, properties, outlets
/sa/tenants/new                   — Onboard new organization
/sa/plans                         — SaaS subscription plans & module bundles
/sa/modules                       — Module registry & dependency graph
/sa/monitoring                    — System health, job queues, error rates
/sa/config                        — Global platform settings
```

---

## 4. State Management Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Authoritative Server API                        │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ HTTP (REST) + SSE Push
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 Server State Layer (TanStack Query / SWR)              │
│  - Cached server responses (stale-while-revalidate)                    │
│  - Query invalidation on mutations and real-time domain events         │
│  - Optimistic updates for low-latency feedback                         │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
      ┌──────────────────────────────┴──────────────────────────────┐
      ▼                                                             ▼
┌───────────────────────────┐                         ┌───────────────────┐
│     Client UI State       │                         │ Form & Cart State │
│  - Modal visibility       │                         │  - Active Cart    │
│  - Sidebar open/collapsed │                         │  - Draft forms    │
│  - Active tab / filters   │                         │  - Zod validation │
│  (React State / Zustand)  │                         │  (ReactHookForm)  │
└───────────────────────────┘                         └───────────────────┘
```

1. **Server State is Authoritative**:
   - The frontend never calculates financial totals, inventory levels, or authorization rights independently.
   - TanStack Query manages caching, request deduplication, and background refetching.
2. **Real-Time Cache Synchronization**:
   - Inbound SSE domain events (`ORDER_STATUS_CHANGED`, `STOCK_ADJUSTED`) immediately trigger targeted query invalidation (`queryClient.invalidateQueries(['orders', orderId])`), updating the UI seamlessly.
3. **Cart State**:
   - Customer cart is maintained in client-side memory during catalog browsing.
   - Submission triggers `POST /api/v1/orders` with an idempotency key. Upon success, the cart clears and the view navigates to the live order tracker.

---

## 5. Real-Time Frontend Integration (ADR-010)

```typescript
// Architectural Hook Pattern: useRealtimeEvents
export function useRealtimeEvents(outletId: string, onEvent: (event: DomainEvent) => void) {
  useEffect(() => {
    const eventSource = new EventSource(`/api/v1/realtime/stream?outletId=${outletId}`);

    eventSource.onmessage = (e) => {
      const event = JSON.parse(e.data);
      onEvent(event);
    };

    eventSource.onerror = () => {
      // Browser automatically attempts reconnection with Last-Event-ID header
      // Fallback polling triggers if disconnected for > 15 seconds
    };

    return () => eventSource.close();
  }, [outletId, onEvent]);
}
```

- KDS, Staff Inboxes, and Customer Order Status screens consume this stream.
- Reconnections automatically pass `Last-Event-ID`, ensuring no dropped updates during momentary cellular/Wi-Fi blips.

---

## 6. Design System Architecture

### 6.1 Design Tokens (CSS Custom Properties)

All visual attributes are governed by semantic tokens defined in `styles/globals.css`:

```css
:root {
  /* Surface & Background Tokens */
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;

  /* Brand & Semantic Action Tokens */
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;

  /* Status Tokens */
  --success: 142.1 76.2% 36.3%;
  --success-foreground: 355.7 100% 97.3%;
  --warning: 38 92% 50%;
  --warning-foreground: 48 96% 89%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;

  /* Neutral & Utility Tokens */
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 221.2 83.2% 53.3%;
  --radius: 0.5rem;
}
```

### 6.2 Typography Scale
- **Font Stack**: Clean, modern sans-serif (`Inter`, system fallback `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`).
- **Type Scale**:
  - `Display`: `text-3xl font-bold tracking-tight` (Hero titles, KDS order numbers)
  - `Heading 1`: `text-2xl font-semibold` (Page headers)
  - `Heading 2`: `text-xl font-semibold` (Section titles)
  - `Heading 3`: `text-lg font-medium` (Card headers)
  - `Body`: `text-sm font-normal leading-relaxed` (Standard text, descriptions)
  - `Caption`: `text-xs text-muted-foreground` (Timestamps, metadata, secondary labels)

### 6.3 Spacing & 4px Grid
- Strict 4px base increments: `4px` (`p-1`), `8px` (`p-2`), `12px` (`p-3`), `16px` (`p-4`), `24px` (`p-6`), `32px` (`p-8`), `48px` (`p-12`), `64px` (`p-16`).
- Consistency rule: Card padding is `p-4` on mobile, `p-6` on tablet/desktop.

### 6.4 Responsive Breakpoints
- **Mobile** (`< 640px`): Single column, full-width cards, sticky bottom action bars, touch targets ≥ 44px.
- **Tablet** (`640px – 1024px`): Two-column grids, collapsible side navigation, optimized for KDS mounted screens and POS tablets.
- **Desktop** (`> 1024px`): Multi-column layouts, persistent navigation sidebar, dense data tables, modal dialogs.
- **Wide Desktop** (`> 1280px`): Full dashboard layouts with secondary auxiliary panels.

### 6.5 Accessibility Baseline (WCAG 2.1 AA)
- Headless primitives powered by Radix UI ensure correct ARIA roles (`role="dialog"`, `role="tab"`, `aria-expanded`).
- Keyboard navigability: All interactive controls are accessible via `Tab`, `Enter`, `Escape`, and arrow keys.
- Contrast ratio: Minimum 4.5:1 for body text and 3:1 for large headers and status badges.
- Focus rings: High-visibility focus indicators (`ring-2 ring-primary ring-offset-2`).

### 6.6 Standard Non-Happy-Path States

Every data-driven component in ASSO must implement four standard states:

1. **Loading State**:
   - Skeleton components (`Skeleton`) matching the shape of incoming content rather than generic full-page spinners.
   - Button loading indicators with disabled pointer events during async mutations.
2. **Error State**:
   - Field-level inline validation errors below inputs (`FormError`).
   - Component-level error boundaries with a "Try Again" action button.
   - Global network offline banner when connectivity drops.
3. **Empty State**:
   - Contextual icon or subtle illustration.
   - Clear explanatory message ("No active orders found for Table 7").
   - Primary call-to-action button ("Create First Order" or "Browse Catalog").
4. **Feedback State**:
   - Toast notifications for transient success/failure confirmations (auto-dismiss 4s).
   - Sticky banner alerts for critical operational warnings (e.g., "Cash register session closed", "Low stock alert").

---

## 7. Shared Component Library Structure

All reusable primitives live under `components/ui/` using headless Radix UI:

- **Primitives**: `Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Slider`.
- **Layout & Containers**: `Card`, `Dialog` (Modal), `Sheet` (Drawer), `Tabs`, `Accordion`, `Separator`.
- **Data Display**: `Table`, `Badge`, `Avatar`, `Tooltip`, `Popover`, `ScrollArea`.
- **Feedback**: `Alert`, `Toast` (Sonner), `Progress`, `Skeleton`.
- **Forms**: `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`.
- **Domain Components** (`components/domain/`):
  - `OrderCard`: Shared order visualization for Customer, POS, and KDS.
  - `StatusBadge`: Consistent color-coded state badges for orders, stays, and service requests.
  - `PriceDisplay`: Currency-formatted amount with tax inclusion indicators.
  - `ContextPicker`: Outlet and room/table/seat switcher for staff.

---

## 8. Resolution of Open Frontend Decisions

| Decision | Status | Architectural Resolution | Reference |
|---|---|---|---|
| Framework & Deployment | `RESOLVED` | Next.js App Router (TypeScript) in a single codebase with 3 route surfaces (`/c`, `/b`, `/sa`) | ADR-009 |
| Design System & Styling | `RESOLVED` | Tailwind CSS with CSS Custom Property design tokens + Radix UI (shadcn pattern) | ADR-009 |
| State Management | `RESOLVED` | Server-state-first with TanStack Query + lightweight Zustand for client UI state | ADR-009 |
| Real-Time Communication | `RESOLVED` | Hybrid SSE (`/api/v1/realtime/stream`) + standard HTTP POST/PATCH + polling fallback | ADR-010 |
| Offline POS | `RESOLVED` | Online-first with network resilience (memory cart, optimistic UI, retries with idempotency) | ADR-012 |
