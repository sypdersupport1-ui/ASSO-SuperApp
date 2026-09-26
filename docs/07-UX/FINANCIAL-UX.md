# ASSO Financial UX & Accounting Integrity Specification

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 4)  
> **Authority:** Aligned with Phase 2 Architecture (`DATA-OWNERSHIP.md`) and Phase 3 Immutable Financial Ledgers  

---

## 1. Golden Rules of Financial UX

ASSO operates under strict transactional accounting principles. Financial interfaces must communicate trustworthiness, precision, and historical permanence:

1. **Zero Silent Mutations:** The user interface never provides "Edit Price", "Change Amount", or "Delete Transaction" buttons on committed financial records.
2. **Explicit Compensating Workflows:** Any financial alteration must be explicitly initiated and labeled as an **Adjustment**, **Refund**, or **Reversal**.
3. **Audit Completeness:** Every financial entry permanently displays the 6 required audit attributes:
   $$\text{Amount (₹)} \quad|\quad \text{Status} \quad|\quad \text{Timestamp} \quad|\quad \text{Staff Actor} \quad|\quad \text{Payment Method} \quad|\quad \text{External Reference \#}$$

---

## 2. Financial Number Formatting & Tax Transparency

### 2.1 Currency Formatting Standard
- **Symbol & Placement:** `₹` prefix with comma grouping according to the Indian numbering system (e.g. `₹1,45,000.00` or `₹577.50`).
- **Tabular Font:** All monetary amounts in tables, invoices, and cart summaries strictly use tabular monospace figures (`font-mono`, `font-variant-numeric: tabular-nums;`) right-aligned to header columns.
- **Color Coding:**
  - Standard Charges / Debits: Neutral Dark (`--text-primary`, e.g. `₹1,200.00`)
  - Payments / Credits Applied: Emerald Green (`--success-default`, e.g. `-₹1,200.00`)
  - Reversals / Refunds Issued: Rose Red (`--danger-default`, e.g. `-₹350.00`)

### 2.2 Itemized Tax & Surcharge Breakdown
Financial summaries (Cart, Bill, Folio, Invoice) never collapse taxes into an opaque lump sum. They explicitly itemize:
```text
┌────────────────────────────────────────────────────────────┐
│ Subtotal (Items)                                 ₹1,000.00 │
│ Discount (WELCOME10 - 10%)                         -₹100.00│
│ Net Taxable Value                                  ₹900.00 │
│ CGST (2.5%)                                         ₹22.50 │
│ SGST (2.5%)                                         ₹22.50 │
│ Service Charge (Optional 5%)                        ₹45.00 │
├────────────────────────────────────────────────────────────┤
│ Total Payable Amount                               ₹990.00 │
└────────────────────────────────────────────────────────────┘
```

---

## 3. Financial Reversal & Refund Modal UX

When a cashier or manager must correct a billing error or refund a customer:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Issue Refund / Bill Adjustment                                     [✕] │
├────────────────────────────────────────────────────────────────────────┤
│ Original Transaction: TXN-2026-0918 (Amount: ₹990.00)                 │
│ Settled on: Today, 12:30 PM via UPI                                    │
│                                                                        │
│ Refund Type:                                                           │
│ 🔘 Full Refund (₹990.00)     ⚪ Partial Refund (Custom Amount)         │
│                                                                        │
│ Mandatory Approval Reason: *                                           │
│ [ Food Quality Issue ▼ ]                                               │
│                                                                        │
│ Manager Notes:                                                         │
│ [ Guest reported cold soup; item waived by Shift Lead.               ] │
│                                                                        │
│ ⚠ Warning: This action will record an immutable compensating reversal  │
│ in the settlement ledger and dispatch a webhook reversal.              │
├────────────────────────────────────────────────────────────────────────┤
│ [ Cancel ]                               [ Confirm & Issue Refund (₹) ]│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Payment Tender & Gateway Integration UX

ASSO adheres strictly to DEC-002 (Provider-Neutral Payment Architecture):
- **Payment Method Selector:** Clean tabs for `Cash`, `UPI QR`, `Card POS`, and `House Account / Bill to Room`.
- **Dynamic UPI Display:** When `UPI QR` is selected, the customer-facing or cashier display renders a high-contrast dynamic BharatQR / UPI intent QR code with a 180-second countdown timer.
- **Provider Status Handling:**
  - `Payment Processing...`: Spinner overlay with message *"Awaiting confirmation from bank..."*.
  - `Payment Succeeded`: Instant green checkmark chime + automatic receipt print prompt.
  - `Payment Failed`: Explicit error toast (`Insufficient funds`, `Transaction timed out by bank`) with immediate retry button.
