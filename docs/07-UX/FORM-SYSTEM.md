# ASSO Form System Specification

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 4)  
> **Validation Architecture:** Zod Schema Validation + React Hook Form + Phase 3 Error Mapping  
> **Authority:** Aligned with `COMPONENT-SYSTEM.md` and Phase 3 API Contracts  

---

## 1. Form Principles & Anatomy

Forms in ASSO run mission-critical hospitality tasks (guest check-in, POS order entry, purchase order submission, expense vouchers). They prioritize speed, explicit error feedback, and data safety:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Field Label *                     [Help Tooltip (?)]                   │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Input Value                                              [Icon / ✕]│ │
│ └────────────────────────────────────────────────────────────────────┘ │
│ ⚠ Error message: Unit price must be a positive number.                 │
│ Helper text: Entered in Indian Rupees (INR) including tax.             │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Structural Guidelines
- **Vertical Stacking:** Forms default to single-column or logical two-column grids for predictable tab sequence. Multi-column layouts (>2 columns) are restricted strictly to large desktop displays for related inputs (e.g. First Name / Last Name).
- **Explicit Labels:** Every input must have a permanent visible label above the field. Placeholders are never used as labels.
- **Required vs Optional:** Required fields display an asterisk (`*`). When the majority of fields in a form are required, optional fields are explicitly tagged with `(optional)`.
- **Action Placement:** Submit actions are left-aligned or anchored in a sticky bottom footer on mobile/drawers:
  - Primary button (`Submit`, `Save Changes`, `Process Payment`) positioned first.
  - Secondary button (`Cancel`, `Save Draft`) positioned adjacent.

---

## 2. Validation & Error Handling

### 2.1 Two-Tier Validation Architecture
1. **Client-Side Validation (Immediate):** Validated on `blur` or submit via Zod schema matching the Phase 3 API contract. Prevents unnecessary network round-trips for format or missing field errors.
2. **Server-Side Validation Mapping:** If the API returns `400 Validation Failed` with field details, the form automatically maps each issue in `error.details[]` to its respective field:
   ```json
   { "field": "items[0].quantity", "issue": "Must be greater than 0" }
   ```

### 2.2 Inline Error Standards
- The field border turns Rose-500 (`--danger-default`).
- An error message with a warning icon appears directly below the field.
- Screen readers are notified via `aria-invalid="true"` and `aria-describedby="field-error-id"`.
- On submit failure, the form automatically scrolls to and focuses the first invalid input.

---

## 3. High-Impact & Financial Form Standards

For operations involving money movement, room status locks, or stock adjustments:
1. **Double-Check Summary:** Before final submission, high-value forms (e.g. Check-out Folio Settlement, Stock Cycle Count Adjustment) display an immutable summary card listing:
   - Total Amount / Net Delta
   - Selected Payment Method or Reason
   - Target Account or Inventory Location
2. **Explicit Reason Requirement:** Financial adjustments, voids, and cancellations mandate a non-empty `Reason` textarea with predefined quick-select chips (`Damaged Goods`, `Customer Dispute`, `Manager Waiver`).
3. **Double-Submission Prevention:** Form submission buttons enter an active spinner loading state and are disabled immediately upon first click. The gateway enforces `Idempotency-Key` headers to guarantee exactly-once processing even if network retries occur.

---

## 4. Unsaved Changes & Dirty State Guard

1. **Dirty Form Detection:** Any modification to form inputs flags the form state as `isDirty`.
2. **Navigation Interception:** If a user attempts to navigate away, close a modal, or click another sidebar link with unsaved changes:
   - An in-app confirmation dialog intercepts: *"You have unsaved changes. Are you sure you want to discard them?"*
   - Options: `Discard Changes` (Secondary Destructive) vs `Keep Editing` (Primary).
3. **Browser Tab Guard:** In-flight dirty forms bind to `window.onbeforeunload` to prevent accidental tab closing or page refresh.
