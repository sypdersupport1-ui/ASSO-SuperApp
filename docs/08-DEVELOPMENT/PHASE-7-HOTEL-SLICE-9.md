# ASSO — Phase 7 Hotel Vertical — Slice 9: Hotel Folio & Billing

## 1. Overview & Architecture

Hotel Slice 9 introduces the authoritative **Hotel Folio & Billing Engine** to the ASSO Hotel vertical foundation (Slices 1–8). This represents the first dedicated financial/accounting domain within the Hotel subsystem.

The core architectural invariant strictly enforced across this slice is:

$$\text{Order} \neq \text{Folio Charge} \neq \text{Payment} \neq \text{Settlement}$$

The operational order subsystem (Slice 8) remains responsible for menu cataloging, cart building, customer ordering, and kitchen fulfillment. Slice 9 introduces an immutable financial ledger where billable operational completions (such as `DELIVERED` room-service orders, room charges, and manual facility services) are atomically posted without modifying or overloading the operational order lifecycle.

---

## 2. Canonical Data Model & Schema Design

The financial ledger model is built on two canonical tables:

```text
Tenant (organizations)
  └── Hotel Property (outlets)
        └── Hotel Stay (hotel_stays)
              └── Hotel Folio Header (hotel_folios)
                    └── Folio Entries Ledger (hotel_folio_entries)
```

### Table 1: `hotel_folios` (Canonical Folio Header Projection)
* `folio_id` (UUID, Primary Key)
* `tenant_id` (UUID, Foreign Key $\rightarrow$ `organizations.organization_id`)
* `outlet_id` (UUID, Foreign Key $\rightarrow$ `outlets.outlet_id`)
* `stay_id` (UUID, Foreign Key $\rightarrow$ `hotel_stays.stay_id`)
* `folio_number` (VARCHAR(50), Unique per outlet format: `FOL-YYYYMMDD-XXXXXX`)
* `status` (VARCHAR(50), Lifecycle: `OPEN` $\leftrightarrow$ `CLOSED`)
* `total_charges` (NUMERIC(14,4), Default 0.0000)
* `total_payments` (NUMERIC(14,4), Default 0.0000)
* `balance_due` (NUMERIC(14,4), Default 0.0000)
* `settled_at` (TIMESTAMPTZ, Nullable)
* `created_at`, `updated_at` (TIMESTAMPTZ)

### Table 2: `hotel_folio_entries` (Strictly Append-Only Financial Ledger)
* `entry_id` (UUID, Primary Key)
* `tenant_id` (UUID, Foreign Key $\rightarrow$ `organizations.organization_id`)
* `folio_id` (UUID, Foreign Key $\rightarrow$ `hotel_folios.folio_id`)
* `entry_type` (VARCHAR(50): `ROOM_CHARGE`, `FOOD_CHARGE`, `SERVICE_CHARGE`, `TAX`, `PAYMENT`, `ADJUSTMENT`, `REFUND`, `REVERSAL`)
* `amount` (NUMERIC(14,4), Stored numeric representation)
* `description` (TEXT, Mandatory audit trail description)
* `reference_id` (UUID, Nullable operational record linkage e.g. `order_id` or `stay_id`)
* `reverses_entry_id` (UUID, Nullable self-reference for compensating entries)
* `posted_by_staff_id` (UUID, Foreign Key $\rightarrow$ `staff_profiles.staff_id`)
* `created_at` (TIMESTAMPTZ, Immutable timestamp)

---

## 3. Financial Integrity & Immutability Principle

1. **Strictly Append-Only Ledger**: Historical monetary records are never mutated or deleted (`UPDATE` and `DELETE` queries are rejected at both database RLS and application service layers).
2. **Compensating Entries for Corrections**: Any financial correction uses explicit compensating ledger entries (`ADJUSTMENT`, `REVERSAL`, `REFUND`) with mandatory documented reasons.
3. **Exact Decimal Arithmetic**: All monetary values are represented using `NUMERIC(14, 4)` in PostgreSQL and parsed deterministically into exact cents/paisa representations.

### Balance Calculation Convention
The folio balance is derived deterministically from all posted entries:
* **Debits / Charges (+)**: `ROOM_CHARGE`, `FOOD_CHARGE`, `SERVICE_CHARGE`, `TAX`, `REFUND`, `ADJUSTMENT` (when positive).
* **Credits / Payments (-)**: `PAYMENT` (negative stored amount), `REVERSAL`, `ADJUSTMENT` (when negative).
* **Net Balance Due**:
$$\text{Balance Due} = \sum \text{Charges} - \sum \text{Payments}$$

---

## 4. Operational Billable Triggers & Idempotency

### A. Room Charges
* Generated from authoritative reservation and room type base rates upon check-in or manual front desk posting.
* Persists description, rate, tax snapshots, stay linkage, and posting timestamp.

### B. Room-Service F&B Charges (Slice 8 Integration)
* Room-service orders become billable exclusively when the operational order reaches the **`DELIVERED`** state.
* Earlier states (`PLACED`, `ACCEPTED`, `PREPARING`, `READY`, `OUT_FOR_DELIVERY`) create zero folio entries.
* **Idempotency Guarantee**: The folio posting service verifies existing entries matching `reference_id = order.order_id` and `entry_type = 'FOOD_CHARGE'`. Replaying the delivery transition returns the existing entry and prevents duplicate financial debits.

### C. Manual Facility & Service Charges
* Supports front-desk posting for laundry, spa, parking, minibar, or airport transfers.
* Mandatory description and positive numeric amounts validated server-side.

---

## 5. Payments, Refunds & Settlement Boundary

### Internal Financial Records
* Models provider-neutral financial transaction records (`CASH`, `CREDIT_CARD`, `DEBIT_CARD`, `UPI`, `BANK_TRANSFER`, `CITY_LEDGER`, `OTHER`).
* Records payment references and transaction timestamps.
* When `balanceDue <= 0`, `settledAt` timestamp is marked automatically on the folio header.

### Compensating Refunds
* Refunds reference the specific original payment entry (`reverses_entry_id = original_payment.entry_id`).
* Enforces that cumulative refund amount cannot exceed the original payment amount.
* Requires documented reason and staff permission.

---

## 6. Folio Lifecycle & Status Machine

```text
       ┌──────────────┐
       │     OPEN     │ ◄──────────┐
       └──────┬───────┘            │
              │ closeFolio()       │ reopenFolio()
              ▼                    │ (Authorized with reason)
       ┌──────────────┐            │
       │    CLOSED    │ ───────────┘
       └──────────────┘
```

* **`OPEN`**: Accepts normal charges, order postings, payments, adjustments, and refunds.
* **`CLOSED`**: Blocks all ordinary financial postings. Reopening requires authorized staff permissions (`hotel.stays.manage`) and mandatory audit logging with business justification.

---

## 7. Security, RLS & Authorization

### RBAC & Module Entitlements
* **Module Entitlement**: Requires `HOTEL` entitlement for the requesting organization.
* **Staff Permissions**: Requires `hotel.stays.manage` for financial mutations and `hotel.read` for read access.
* **Customer Role**: Completely barred from all folio mutation endpoints (`POST /charges`, `/adjustments`, `/payments`, `/refunds`, `/close`, `/reopen`). Returns `403 Forbidden`.

### Native PostgreSQL RLS
* PostgreSQL fail-closed RLS policies applied to `hotel_folios` and `hotel_folio_entries`.
* RLS enforces tenant isolation on `tenant_id = current_setting('app.current_tenant_id', true)::uuid`.
* Native database triggers and policies block `UPDATE` and `DELETE` on `hotel_folio_entries`.

---

## 8. Front Office Folio Workspace UI

Located at `/hotel/folio/[stayId]`, featuring:
* **KPI Header Cards**: Total Charges, Total Payments Recorded, Net Outstanding Balance, and Lifecycle Status Badge (`OPEN` / `CLOSED` / `SETTLED`).
* **Guest & Stay Summary Card**: Room number, room type, guest name, reservation reference, and check-in/out timestamps.
* **Interactive Monospace Ledger**: Clear DEBIT / CREDIT typography, entry type badges, formatted timestamps, source linkages (e.g. Order #RS-...), and reversal pointers.
* **Consequential Dialogs**:
  * Post Manual Service Charge
  * Record Payment (with method and reference number)
  * Compensating Adjustment / Courtesy Discount (requires reason)
  * Refund Transaction (validated against payment entry)
  * Close Folio / Front Office Settlement
  * Reopen Closed Folio (requires authorized audit reason)

---

## 9. API Specifications

| Method | Path | Description | Required Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/hotel/folios/[stayId]` | Retrieves hydrated folio detail with entries | `hotel.read` |
| `POST` | `/api/v1/hotel/folios/[stayId]/charges` | Posts room or manual service charge | `hotel.stays.manage` |
| `POST` | `/api/v1/hotel/folios/[stayId]/adjustments` | Posts compensating adjustment / discount | `hotel.stays.manage` |
| `POST` | `/api/v1/hotel/folios/[stayId]/payments` | Records internal payment transaction | `hotel.stays.manage` |
| `POST` | `/api/v1/hotel/folios/[stayId]/refunds` | Processes compensating refund | `hotel.stays.manage` |
| `POST` | `/api/v1/hotel/folios/[stayId]/close` | Closes folio for front desk settlement | `hotel.stays.manage` |
| `POST` | `/api/v1/hotel/folios/[stayId]/reopen` | Reopens closed folio under policy | `hotel.stays.manage` |

---

## 10. Verification & Test Evidence

### Test Summary
* **Unit Tests**: `tests/unit/hotel-folio-state-machines.test.ts` (10 tests) $\rightarrow$ **10/10 Passed**
* **Integration Tests**: `tests/integration/hotel-slice9-folio-billing.test.ts` (14 tests) $\rightarrow$ **14/14 Passed**
* **Security & IDOR Tests**: `tests/security/folio-security.test.ts` (5 tests) $\rightarrow$ **5/5 Passed**
* **Native PostgreSQL RLS**: `scripts/verify-supabase-native-rls.ts` (11 checks) $\rightarrow$ **11/11 Passed (100%)**
* **TypeScript Compilation**: `npm run typecheck` $\rightarrow$ **Clean (0 errors)**
* **Next.js Production Build**: `npm run build` $\rightarrow$ **Compiled & Optimized Successfully**

---

## 11. Explicit Non-Goals & Boundaries
* No general ledger / chart of accounts / double-entry balance sheets (handled by separate accounting engines).
* No external payment gateway SDKs (Razorpay/Stripe) embedded into Slice 9 core (internal payment transactions only).
* Restaurant and Cinema vertical billing workflows remain separately isolated.
