# ASSO Operating Expenses & Cash Drawer UX Specification

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 4)  
> **Authority:** Aligned with Phase 2 Architecture (`SHARED-ENGINES.md`) and Phase 3 Database Schema  

---

## 1. Scope Boundary & Philosophy

ASSO is designed for day-to-day hospitality operations, **not as a complex general-ledger accounting ERP**:
- **Operating Expenses:** Captures store-level cash and bank disbursements (vendor repairs, emergency produce, utility bills, local cleaning supplies) with receipt attachment and managerial approval.
- **Cash Management:** Tracks cashier register sessions, physical cash drawer openings, cash drops to the master safe, and end-of-shift reconciliation discrepancies.
- **Clean Distinction:** Inventory purchase orders (handled by the Procurement Engine) are strictly separated from operational overhead expenses.

---

## 2. Operating Expenses UX

### 2.1 Expense Voucher Entry Modal
- **Header:** `New Operating Expense Voucher`.
- **Form Fields:**
  - `Expense Category`: Dropdown (`Property Maintenance`, `Kitchen Incidentals`, `Utilities`, `Office Supplies`, `Guest Compensation`, `Marketing`).
  - `Payee / Vendor Name`: Text input (e.g. "Ramesh Plumbing Works").
  - `Amount (₹)`: Numeric tabular input.
  - `Incurred Date`: Date picker (defaults to Today).
  - `Disbursement Source`: Radio (`Cash from Active Register Drawer` vs `Company Bank Account / UPI`).
  - `Receipt Photo Upload`: Drag-and-drop zone or phone camera snap (JPEG/PNG/PDF, max 5MB).
  - `Description / Purpose`: Textarea.
- **Approval Notification:** If the amount exceeds tenant threshold (e.g. >₹5,000), a banner indicates: *"Requires Outlet Manager approval before cash disbursement."*

### 2.2 Expense Approval & Reimbursement Queue
- **Manager Table View:**
  - Columns: `Date`, `Voucher #`, `Category`, `Payee`, `Amount (₹)`, `Receipt Preview`, `Submitted By`, `Status (PENDING, APPROVED, REJECTED, PAID)`, `Actions`.
  - Clicking receipt thumbnail opens full-screen image preview lightbox.
  - Actions: `Approve Voucher` (with optional note) or `Reject Voucher` (with mandatory explanation).

---

## 3. Cash Drawer Management UX

### 3.1 Shift Opening Flow (Register Start)
When a cashier begins their shift:
1. Modal displays: `Open Cash Drawer Session`.
2. Cashier enters `Starting Float Amount` (e.g. `₹5,000.00`).
3. Denomination Breakdown helper (optional toggle): Counter for ₹500, ₹200, ₹100, ₹50, ₹20, ₹10 notes.
4. Cashier clicks `Confirm & Open Drawer`. Session status transitions to `OPEN`.

### 3.2 Mid-Shift Cash Movements (Safe Drops & Drawer Expenses)
Cashiers can record mid-shift physical cash entries without closing the session:
- **Cash Drop to Safe:** When drawer exceeds policy limits (e.g. >₹25,000 in cash), cashier logs a `CASH DROP` of ₹15,000 handed to the duty manager, printing an acknowledgment slip.
- **Petty Cash Payout:** Direct link to an approved operational expense voucher.

### 3.3 Shift Closing & Reconciliation Flow
At the end of the shift:
1. Cashier taps `Close & Reconcile Register`.
2. System prompts cashier to perform a **Blind Cash Count** (cashier enters actual physical cash counted before system reveals expected balance):
   - `Actual Cash Counted: ₹14,250.00`
3. System reveals reconciliation analysis:
   ```text
   ┌────────────────────────────────────────────────────────┐
   │ Starting Float Amount                         ₹5,000.00│
   │ (+) Cash Sales Collected                     ₹11,500.00│
   │ (-) Cash Drops to Safe                       -₹2,000.00│
   │ (-) Approved Cash Expenses                     -₹250.00│
   ├────────────────────────────────────────────────────────┤
   │ Expected Drawer Cash                         ₹14,250.00│
   │ Actual Cash Counted                          ₹14,250.00│
   ├────────────────────────────────────────────────────────┤
   │ Discrepancy / Variance                            ₹0.00│
   │ Status: EXACT MATCH ✓ (Green Badge)                    │
   └────────────────────────────────────────────────────────┘
   ```
4. **Handling Discrepancies (Over / Short):** If a variance exists (e.g. `-₹100.00 SHORT`):
   - Row highlights in Amber/Rose.
   - Cashier and Manager must enter explanation notes before clicking `Finalize Shift & Lock Drawer`.
