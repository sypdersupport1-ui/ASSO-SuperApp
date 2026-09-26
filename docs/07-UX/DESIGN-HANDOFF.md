# ASSO Frontend Design Handoff & Implementation Specification

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 4)  
> **Target Frontend Stack:** Next.js 15+ App Router, React 19, TypeScript (Strict), Tailwind CSS v3.4+, Radix UI Primitives, Lucide React, TanStack Query v5  
> **Authority:** Bridges Phase 3 Technical Contracts to Future Phase 5/6 Frontend Implementation  

---

## 1. Engineering Handoff Golden Rules

When application implementation begins in subsequent phases, frontend developers must adhere strictly to these engineering mandates:

1. **No Inventing UX on the Fly:** Every screen, interaction, modal, and state must follow the approved Phase 4 UX specifications.
2. **Zero Hard-Coded Colors or Margins:** All styling must utilize Tailwind CSS utilities mapped directly to the design tokens defined in `DESIGN-TOKENS.md` (e.g. `text-[var(--text-primary)]`, `bg-[var(--bg-surface)]`, `rounded-md`).
3. **Backend is the Authority:** Frontend visibility and disabled states are ergonomics only. Every mutation must handle Phase 3 error codes (`401`, `403 MODULE_NOT_ENTITLED`, `403 PERMISSION_DENIED`, `409 CONCURRENT_MODIFICATION`, `429 RATE_LIMIT_EXCEEDED`).
4. **Mandatory 11-State Coverage:** Every component and screen must handle all 11 standardized UI states defined in `UX-STATES.md`.

---

## 2. Token-to-Tailwind Mapping Architecture

Future implementation configures `tailwind.config.ts` to expose the semantic CSS custom properties:

```typescript
// tailwind.config.ts mapping snippet
export default {
  theme: {
    extend: {
      colors: {
        app: 'var(--bg-app)',
        surface: 'var(--bg-surface)',
        card: 'var(--bg-card)',
        border: 'var(--border-default)',
        primary: {
          DEFAULT: 'var(--primary-default)',
          hover: 'var(--primary-hover)',
          subtle: 'var(--primary-subtle)',
          foreground: 'var(--primary-foreground)',
        },
        success: {
          DEFAULT: 'var(--success-default)',
          subtle: 'var(--success-subtle)',
          foreground: 'var(--success-foreground)',
        },
        warning: {
          DEFAULT: 'var(--warning-default)',
          subtle: 'var(--warning-subtle)',
          foreground: 'var(--warning-foreground)',
        },
        danger: {
          DEFAULT: 'var(--danger-default)',
          subtle: 'var(--danger-subtle)',
          foreground: 'var(--danger-foreground)',
        },
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'sans-serif'],
        display: ['var(--font-display)', 'Outfit', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
    },
  },
};
```

---

## 3. Component Primitive Mapping

| Design Component | Recommended Implementation Primitive | Notes & Key Props |
| :--- | :--- | :--- |
| **Modal / Confirmation** | `@radix-ui/react-dialog` | Focus locked, backdrop dimmed, `Escape` key dismiss. |
| **Popover / Context Menu**| `@radix-ui/react-popover` | Aligns automatically to trigger; respects viewport boundaries. |
| **Dropdown / Combobox** | `@radix-ui/react-dropdown-menu` | Keyboard arrow navigation, search filtering. |
| **Tabs (Sub-navigation)** | `@radix-ui/react-tabs` | ARIA tablist, arrow key switching. |
| **Toast Notifications** | `@radix-ui/react-toast` or `sonner` | Queued, auto-dismiss in 4s, paused on hover. |
| **Slide-over Drawers** | `vaul` or Radix Dialog (Right Slide) | Swipe down to dismiss on mobile, body scroll locked. |
| **Data Tables** | `@tanstack/react-table` | Headless, handles sorting, filtering, and row selection. |
| **Icons** | `lucide-react` | Standard 16px (small), 20px (default), 24px (large). |

---

## 4. Feature Implementation Checklist (Vertical Slice Recipe)

Before submitting any frontend component or view for review, verify:

- [ ] **1. Entitlement & RBAC Checked:** View is conditionally displayed based on tenant module entitlement and staff permission.
- [ ] **2. 11 UX States Implemented:** Loading shimmer, empty state, error state, and stale data banner are explicitly styled and tested.
- [ ] **3. Design Tokens Applied:** Zero arbitrary hex codes (`#123456`) or arbitrary pixel values (`p-[13px]`).
- [ ] **4. Form Schema Validation:** Form validated using Zod schema matching the Phase 3 API contract DTO.
- [ ] **5. Idempotency Key Added:** Mutating actions (`POST`, `PATCH`) generate and send `Idempotency-Key` header.
- [ ] **6. Responsive Layout Verified:** Tested on Mobile (375px), Tablet (768px), and Desktop (1280px). Tables reflow to cards on mobile.
- [ ] **7. Accessibility Verified:** Keyboard tab order is logical, interactive elements have visible focus rings, and color contrast meets WCAG 2.1 AA (≥4.5:1).
- [ ] **8. Real-Time Wired:** Components subscribe to SSE events via TanStack Query invalidation without causing full-page reloads.
