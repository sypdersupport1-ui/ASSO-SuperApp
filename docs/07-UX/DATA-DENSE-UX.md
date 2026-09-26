# ASSO Data-Dense Table & Grid UX Specification

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 4)  
> **Authority:** Aligned with `COMPONENT-SYSTEM.md` and Phase 3 API Standards  

---

## 1. Data-Dense Table Philosophy

ASSO operational staff manage high-volume transactional logs (Orders, Bills, Folio Entries, Stock Movements, Housekeeping Tasks). These interfaces prioritize **legibility, vertical alignment, and instantaneous scanning** over white space.

---

## 2. Table Layout & Ergonomic Standards

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Search orders...  [Filters (3) ▼]  [Date: Today ▼]          [Columns ▼] [Bulk Action ▼]│
├────┬────────────┬─────────────┬───────────┬──────────────┬────────────┬───────────┬────┤
│ ☐  │ Order # ▲  │ Time        │ Context   │ Station      │ Status     │ Total (₹) │ ···│
├────┼────────────┼─────────────┼───────────┼──────────────┼────────────┼───────────┼────┤
│ ☐  │ ORD-0042   │ 12:30:15 PM │ Room 304  │ Kitchen      │ [READY]    │    577.50 │ [⋮]│
│ ☐  │ ORD-0043   │ 12:31:02 PM │ Table 12  │ Bar          │ [PREPARING]│    320.00 │ [⋮]│
│ ☑  │ ORD-0044   │ 12:32:40 PM │ Seat G-14 │ Concession   │ [PLACED]   │    210.00 │ [⋮]│
├────┴────────────┴─────────────┴───────────┴──────────────┴────────────┴───────────┴────┤
│ Showing 1-20 of 142 orders                    [Rows: 20 ▼]  [< Prev] [1] 2 3 [Next >]  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Visual & Structural Guidelines
- **Row Densities:**
  - *Compact (`38px` row height):* Default for inventory stock ledgers, financial folios, and detailed audit trails.
  - *Standard (`48px` row height):* Default for active orders, reservations, and room racks.
- **Sticky Column Headers:** Headers stay locked at top of table container during vertical scroll (`position: sticky; top: 0; z-index: 10;`).
- **Sticky Leading Key Identifier:** The primary entity column (e.g. `Order #`, `Room #`, `SKU`) remains sticky on the left during horizontal scrolling.
- **Monospace Alignment:** Monetary values (`₹577.50`), quantities, and timestamps strictly use tabular figures (`font-mono`) right-aligned to match column headers. Text descriptions are left-aligned.

---

## 3. Sorting, Filtering & Search Controls

### 3.1 Server-Side Sorting & Pagination
- Matches Phase 3 REST standard: `?sort=createdAt:desc&page=1&limit=20`.
- Clicking a column header toggles: `Ascending (▲) → Descending (▼) → Default (None)`. Active sort column has subtle background tint.
- Pagination bar displays current slice, total record count, page size dropdown (`10`, `20`, `50`, `100`), and accessible `Previous` / `Next` controls.

### 3.2 Filtering Bar
- **Instant Search:** Debounced (300ms) full-text search across primary identifiers, guest names, or SKU codes.
- **Filter Chips:** Pre-built, clickable quick filters above the table (e.g. `All`, `Unpaid`, `In Preparation`, `Needs Attention`). Active chip displays item count badge.
- **Advanced Popover Filters:** Date ranges, specific outlets, or staff assignees managed via a dropdown popover. When filters are active, a `Clear All` button appears alongside an active filter counter (`Filters (3)`).

---

## 4. Bulk Actions & Selection Toolbar

1. **Select-All Checkbox:** Header checkbox supports tri-state: `Checked` (all rows on page selected), `Unchecked`, or `Indeterminate` (subset selected).
2. **Floating Bulk Action Bar:** When ≥1 row is selected, a floating bar slides up from the bottom of the table:
   - Displays count: `3 items selected`.
   - Contextual bulk actions: `Mark as Ready`, `Assign to Staff`, `Export CSV`, `Batch Print`.
   - `Deselect All` button to dismiss.

---

## 5. Responsive Mobile Transformation (<768px)

Wide tabular grids cannot be read comfortably on phone screens. On mobile viewports:
1. The table automatically transforms into a **Vertical Card List**.
2. Each row becomes an interactive card containing:
   - Top Bar: Primary Identifier (`ORD-0042`) + Status Badge (`READY`).
   - Body: Physical context (`Room 304`), Time, and Item summary.
   - Bottom Bar: Total Amount (`₹577.50`) + Quick Action Button (`Serve`).
3. Cards support swipe gestures or tap to expand full detail sheet.
