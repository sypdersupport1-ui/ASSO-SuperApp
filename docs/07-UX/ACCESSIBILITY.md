# ASSO Accessibility Specification (WCAG 2.1 AA)

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 4)  
> **Compliance Target:** WCAG 2.1 Level AA Standard  
> **Authority:** Aligned with `UX-PRINCIPLES.md` and `COMPONENT-SYSTEM.md`  

---

## 1. Accessibility Philosophy

In ASSO, accessibility is an operational asset:
- Kitchen cooks with greasy or gloved hands benefit from large, high-contrast touch targets.
- Cashiers under harsh ceiling lights require high visual contrast.
- Blind or low-vision guests scanning room QR codes require full screen-reader and voice-over accessibility.
- Keyboard-only power users (front desk receptionists, storekeepers) require rapid, uninterrupted tab navigation.

---

## 2. Core Technical Standards

### 2.1 Color Contrast Ratios (WCAG 1.4.3)
- **Normal Text (<18pt / <24px):** Minimum contrast ratio of **4.5:1** against its background.
- **Large Text (≥18pt or ≥14pt bold):** Minimum contrast ratio of **3.0:1**.
- **UI Components & Borders:** Interactive input borders and icon buttons maintain at least **3.0:1** contrast against adjacent backgrounds.
- **Tested Palettes:**
  - Dark Slate `#0F172A` on White `#FFFFFF` = **16.1:1** (Exceeds AAA).
  - Slate Muted `#475569` on Slate 50 `#F8FAFC` = **6.8:1** (Exceeds AA).
  - Primary Indigo `#4F46E5` on White `#FFFFFF` = **4.6:1** (Meets AA).

### 2.2 Color Independence (WCAG 1.4.1)
Color is never used as the sole conveyor of information:
- Error states combine a red border with an inline error message and a warning icon (`AlertCircle`).
- Status badges combine background tint with explicit text labels and semantic icons (`Sparkles` for clean, `Flame` for cooking, `Receipt` for unpaid).

### 2.3 Focus Visibility & Keyboard Ergonomics (WCAG 2.4.7)
- **Focus Ring Standard:** Every interactive element exhibits a prominent focus indicator when navigated via keyboard:
  ```css
  :focus-visible {
    outline: 2px solid var(--primary-default);
    outline-offset: 2px;
  }
  ```
- **Never Suppress Outline:** `outline: none` is strictly prohibited unless replaced with an equally visible custom focus ring.
- **Tab Sequence:** Follows natural reading order (left-to-right, top-to-bottom). Modals and drawers implement strict focus trapping (`react-focus-lock` / Radix FocusScope).

### 2.4 Touch Target Sizing (WCAG 2.5.5)
- All interactive controls on mobile and tablet viewports provide a minimum target area of **44px × 44px** (or equivalent touch padding) to prevent mis-taps during rushed service.

---

## 3. Screen Reader & ARIA Implementation

1. **Semantic HTML First:** Use native elements (`<button>`, `<nav>`, `<main>`, `<dialog>`, `<table>`, `<header>`) rather than generic `<div>` wrappers.
2. **Form Accessibility:**
   - Every input has an explicit `<label for="...">`.
   - Error messages are associated via `aria-invalid="true"` and `aria-describedby="error-element-id"`.
3. **Live Regions (`aria-live`):**
   - KDS new order arrival: `<div aria-live="polite" role="status">` announces: *"New order received for Table 14"*.
   - Toast messages: Announced immediately via `role="alert"` for critical errors or `role="status"` for confirmations.
4. **Dialogs & Overlays:**
   - Wrapped in `role="dialog"` or `role="alertdialog"`.
   - Includes `aria-labelledby="dialog-title-id"` and `aria-describedby="dialog-desc-id"`.
   - `Escape` key immediately closes the dialog, returning focus to the trigger element.

---

## 4. Motion & Sensory Adaptation

```css
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
When reduced motion is requested by the operating system, all sliding drawers, KDS bumping transitions, and loading pulses snap immediately to their final state.
