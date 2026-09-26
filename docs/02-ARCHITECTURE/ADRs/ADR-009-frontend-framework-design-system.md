# ADR-009: Frontend Framework and Design System Architecture

**Status**: Accepted  
**Date**: 2026-09-26  
**Deciders**: Human Product Owner, Antigravity  
**Resolves**: Open Decision #3 (Frontend framework and tooling) & Section 11 (Three frontend applications interpretation)

---

## Context

ASSO requires three user-facing application surfaces:
1. **Customer Experience**: Mobile-first, QR-initiated, ultra-fast initial render, context-bound (Room, Table, Seat), zero friction, no mandatory login.
2. **Business Console**: Staff operational portal (Hotel front-desk/housekeeping, Restaurant captain/POS/KDS, Cinema concession), high interactivity, information-dense, real-time updates.
3. **Super Admin Console**: Platform administration, tenant onboarding, module entitlement management, monitoring, enterprise configuration.

The platform team currently operates with **one human primary developer and Antigravity as the primary AI engineering agent**. The frontend architecture must maximize maintainability, developer velocity, type safety, accessibility, and visual elegance while avoiding unnecessary operational fragmentation.

---

## Decision

### 1. Application Deployment Model: Single Codebase, Three Route Surfaces and Shells

ASSO will use a **single Next.js application** hosting three distinct route surfaces and application shells:
- `/c/...` — **Customer Experience Shell**: Minimal client-side JS bundle, zero extraneous navigation chrome, mobile-first touch optimization, branded per tenant context.
- `/b/...` — **Business Console Shell**: Desktop and tablet-optimized, persistent navigation, multi-outlet switcher, operational dashboard, KDS view, data grids.
- `/sa/...` — **Super Admin Console Shell**: Enterprise admin portal, cross-tenant management, system metrics, module catalog.

All three surfaces share:
- Shared design system tokens and headless UI primitives (`components/ui/`)
- Shared typed API client (`lib/api/`)
- Shared domain types and validation schemas (`lib/validations/`)
- Unified build, test, and preview deployment pipeline on Vercel

Independent repositories or separate build targets (monorepos with 3 separate apps) are **rejected** as premature complexity for a single primary developer.

### 2. Core Framework: Next.js (App Router) + TypeScript

- **Next.js App Router (React Server Components)**:
  - Customer QR routes benefit from Server Components for instantaneous first-contentful paint (HTML delivered pre-rendered with zero initial client JS execution overhead).
  - Client Components (`"use client"`) are used selectively for interactive features: cart management, chat message stream, KDS status toggles, POS number pads.
  - Server Actions and Route Handlers provide co-located, type-safe API boundaries and background dispatch.
- **Strict TypeScript**: End-to-end type safety between backend schemas, API contracts, and frontend components.

### 3. State Management: Server-State-First Pattern

- **Server State**: Managed via React Query (TanStack Query) / SWR pattern. Data is fetched from and invalidated against authoritative API endpoints with `stale-while-revalidate` semantics.
- **Client State**: Minimal local state using React `useState`/`useReducer` and Zustand for lightweight ephemeral UI state (active modal, cart draft, sidebar collapse).
- **Form State & Validation**: React Hook Form combined with Zod schemas matching backend validation contracts.

### 4. Design System & Styling Architecture

- **Styling Engine**: **Tailwind CSS** with **CSS Custom Properties (Design Tokens)**.
  - Semantic design tokens defined in CSS root variables (`--background`, `--foreground`, `--primary`, `--secondary`, `--accent`, `--muted`, `--border`, `--radius`, etc.).
  - Enables future multi-tenant branding/whitelabeling and dark mode without code changes.
- **Component Primitives**: **Radix UI Primitives** following the **shadcn/ui** architecture pattern.
  - Headless, fully unstyled, accessible primitives (handling ARIA attributes, keyboard navigation, focus trapping, screen readers out of the box).
  - Components live directly in the codebase (`components/ui/`), owned by ASSO, fully customizable, and transparent to AI agents and developers.

---

## Architectural Rationale

1. **Maintainability for Single Developer + AI Agent**:
   - A single repository with shared TypeScript types eliminates version skew between packages.
   - Code changes to shared domain logic or UI primitives immediately type-check across all three application surfaces.
2. **Customer QR Performance**:
   - Customers scan QR codes on variable cellular connections. Next.js Server Components allow the initial menu/context to render before client bundles finish downloading.
3. **Accessibility Baseline**:
   - Radix UI primitives enforce WCAG 2.1 AA compliance natively for complex widgets (dialogs, dropdowns, selects, tabs, accordions).
4. **Environment & Preview Alignment**:
   - A single deployment artifact on Vercel enables seamless preview URLs on feature branches, testing Customer, Console, and Super Admin in lockstep.

---

## Consequences

**Positive**:
- Single build and deployment pipeline; simple CI/CD.
- 100% code sharing for domain types, validation schemas, and UI primitives.
- High developer velocity with AI agent pair-programming.
- Superb mobile performance on customer QR scans.

**Trade-offs & Mitigations**:
- *Risk*: Route bundle leakage between customer app and business console.
  *Mitigation*: Next.js App Router automatically code-splits per route group (`/c`, `/b`, `/sa`). Dynamic imports are used for heavy console libraries (e.g. charts, data grids).
- *Risk*: Staff accidentally navigating to Super Admin.
  *Mitigation*: Server-side route middleware strictly validates session type per route root (`/sa` requires Super Admin session; `/b` requires Staff session; `/c` requires Customer session).

---

## Review Trigger

Revisit if Customer Experience traffic scale necessitates complete CDN-edge isolation on a dedicated edge network separate from the business console.
