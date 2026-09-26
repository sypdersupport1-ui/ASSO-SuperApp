# ASSO Design Tokens Specification

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 4)  
> **Format:** CSS Custom Properties & Tailwind Utility Tokens  
> **Authority:** Aligned with `UX-PRINCIPLES.md`  

---

## 1. Typography Tokens

### 1.1 Font Family Strategy
- **Interface Body & Headings:** `Inter`, system-ui, -apple-system, sans-serif. Highly legible at small sizes on dense operational grids.
- **Brand / Editorial Display:** `Outfit`, sans-serif. Clean, geometric, used for public marketing, customer welcome hero, and high-impact headings.
- **Tabular & Financial Data:** `JetBrains Mono`, monospace (with tabular figures `font-variant-numeric: tabular-nums;`). Guarantees monetary digits, order numbers, and timestamps align vertically in tables.

### 1.2 Type Scale
| Token | Font Size | Line Height | Weight | Typical Usage |
| :--- | :--- | :--- | :--- | :--- |
| `--font-display` | `32px` (`2.0rem`) | `1.2` (`38px`) | Bold (700) | Landing hero titles, cinema screen titles |
| `--font-h1` | `24px` (`1.5rem`) | `1.25` (`30px`)| SemiBold (600) | Major page titles (e.g. "Front Desk Rack") |
| `--font-h2` | `20px` (`1.25rem`)| `1.3` (`26px`) | SemiBold (600) | Section headers, card titles, drawer headers |
| `--font-h3` | `16px` (`1.0rem`) | `1.4` (`22px`) | Medium (500) | Sub-sections, modal titles, table group headers |
| `--font-body` | `14px` (`0.875rem`)| `1.5` (`21px`) | Regular (400) | Standard interface text, inputs, table cells |
| `--font-body-sm` | `12px` (`0.75rem`)| `1.5` (`18px`) | Regular (400) | Helper text, secondary descriptions, timestamps |
| `--font-caption` | `11px` (`0.6875rem`)| `1.4` (`15px`)| Medium (500) | Status badges, table column headers, keyboard shortcuts |
| `--font-tabular` | `14px` (`0.875rem`)| `1.4` (`20px`) | Medium (500) | Price amounts (₹), quantities, transaction IDs |

---

## 2. Spacing & Layout Tokens

ASSO uses a strict 4px base grid system:

| Token | Pixels | Rem Value | Common Application |
| :--- | :--- | :--- | :--- |
| `--space-1` | `4px` | `0.25rem` | Micro padding, badge horizontal padding, icon gap |
| `--space-2` | `8px` | `0.5rem` | Form field gap, button internal padding, list item gap |
| `--space-3` | `12px` | `0.75rem` | Card internal padding (compact), input horizontal pad |
| `--space-4` | `16px` | `1.0rem` | Standard card padding, standard grid gutter, dialog pad |
| `--space-5` | `20px` | `1.25rem` | Page section margin, container horizontal padding |
| `--space-6` | `24px` | `1.5rem` | Page header padding, large card padding |
| `--space-8` | `32px` | `2.0rem` | Major dashboard grid gap, modal margin |
| `--space-12`| `48px` | `3.0rem` | Empty state padding, section vertical separation |

---

## 3. Sizing & Control Heights

To maintain touch ergonomic standards (WCAG Target Size ≥ 44px on mobile) while supporting desktop data density:

| Control Target | Desktop Height | Mobile / Touch Height | Padding Horizontal |
| :--- | :--- | :--- | :--- |
| **Input / Select (Compact)** | `32px` (`h-8`) | `40px` (`h-10`) | `10px` |
| **Input / Select (Default)** | `38px` (`h-9.5`) | `44px` (`h-11`) | `12px` |
| **Button (Small / Table Action)**| `32px` (`h-8`) | `40px` (`h-10`) | `12px` |
| **Button (Default)** | `40px` (`h-10`) | `48px` (`h-12`) | `16px` |
| **Button (Large / Tender)** | `48px` (`h-12`) | `56px` (`h-14`) | `24px` |
| **Table Row (Data Dense)** | `40px` | `48px` | `12px` |
| **Table Row (Default)** | `48px` | `56px` | `16px` |

---

## 4. Border Radius & Elevation Tokens

### 4.1 Border Radius
- `--radius-sm`: `4px` (Inputs, small tags, sub-menu items)
- `--radius-md`: `8px` (Standard buttons, dropdown menus, cards)
- `--radius-lg`: `12px` (Modals, primary metric cards, bottom sheets)
- `--radius-xl`: `16px` (Floating action panels, guest mobile card containers)
- `--radius-full`: `9999px` (Avatars, pill status badges, circular icon buttons)

### 4.2 Elevation & Shadow Layers
- `--elevation-flat`: `none`
- `--elevation-card`: `0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)`
- `--elevation-dropdown`: `0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.04)`
- `--elevation-modal`: `0 20px 25px -5px rgba(0, 0, 0, 0.12), 0 10px 10px -5px rgba(0, 0, 0, 0.04)`
- `--elevation-floating`: `0 25px 50px -12px rgba(0, 0, 0, 0.25)`

---

## 5. Semantic Color Tokens (Light & Dark Extensible)

ASSO uses semantic color roles rather than fixed primitive hex values. This guarantees full support for Light Mode (default high-contrast operational) and Dark Mode (e.g. Cinema box office, dim restaurant lounges):

```css
:root {
  /* Surface & Base */
  --bg-app: #F8FAFC;           /* Slate 50 */
  --bg-surface: #FFFFFF;       /* Pure White */
  --bg-card: #FFFFFF;
  --bg-subtle: #F1F5F9;        /* Slate 100 */
  --border-default: #E2E8F0;   /* Slate 200 */
  --border-strong: #CBD5E1;    /* Slate 300 */

  /* Text & Foreground */
  --text-primary: #0F172A;     /* Slate 900 */
  --text-secondary: #475569;   /* Slate 600 */
  --text-muted: #94A3B8;       /* Slate 400 */
  --text-inverted: #FFFFFF;

  /* Primary Brand (Indigo / Modern SaaS) */
  --primary-default: #4F46E5;  /* Indigo 600 */
  --primary-hover: #4338CA;    /* Indigo 700 */
  --primary-subtle: #EEF2FF;   /* Indigo 50 */
  --primary-foreground: #FFFFFF;

  /* Semantic State Accents */
  --success-default: #059669;  /* Emerald 600 - CLEAN, READY, SETTLED */
  --success-subtle: #ECFDF5;   /* Emerald 50 */
  --success-foreground: #065F46;

  --warning-default: #D97706;  /* Amber 600 - PREPARING, DIRTY, PENDING */
  --warning-subtle: #FFFBEB;   /* Amber 50 */
  --warning-foreground: #92400E;

  --danger-default: #E11D48;   /* Rose 600 - OCCUPIED, CANCELLED, OUT_OF_SERVICE */
  --danger-subtle: #FFF1F2;    /* Rose 50 */
  --danger-foreground: #9F1239;

  --info-default: #0284C7;     /* Sky 600 - RESERVED, IN_TRANSIT */
  --info-subtle: #F0F9FF;      /* Sky 50 */
  --info-foreground: #075985;

  /* Focus & Focus Ring */
  --focus-ring: #4F46E5;       /* 2px solid with 2px offset */
}
```
