# ASSO — Restaurant Vertical Slice 2: Digital Menu & Full Customer QR Flow

## Executive Summary

Restaurant Slice 2 (**R2**) delivers the complete end-to-end customer digital dining journey from physical Table QR scan to business customer identification, digital menu browsing, item details, and pre-order cart composition.

In strict adherence to ASSO architectural boundaries:
- **Zero Orders Created**: R2 stops strictly at the cart boundary. R2 creates no `orders`, `order_items`, `bills`, `payments`, `kds_tasks`, or transactional domain events (`ORDER_CONFIRMED`).
- **Shared Customer Engine**: Customers are identified by Name + Phone and deduplicated by normalized phone within the tenant using the shared `customers` table.
- **Shared Catalog Engine**: The restaurant digital menu reuses the platform `catalogs`, `catalogCategories`, and `catalogItems` schema rather than creating vertical-specific menu tables.
- **Server Authority**: Item stock availability and pricing are strictly authoritative from PostgreSQL; client-provided prices or cart totals are never trusted.
- **RBAC Segmentation**: Price management requires the dedicated permission `restaurant.menu.price.manage`, strictly separate from availability toggles (`restaurant.menu.availability`).

---

## Architecture & Customer Journey Flow

```text
Table QR (Opaque Token)
       ↓
Server Context Resolution (GET /api/v1/customer/qr/:token)
       ↓
Table Verified (Restaurant Outlet + Table Context)
       ↓
Name + Phone Verification Modal (POST /api/v1/restaurant/customer/identify)
       ↓
Find / Create Business Customer (Shared Customer Engine, Phone Normalized)
       ↓
Enriched Customer Session Token Minted (JWT with customerId claim)
       ↓
Dedicated Restaurant Customer Interface (/restaurant/table?token=...)
       ↓
Digital Menu (Categories & Dishes, Authoritative Pricing & Availability)
       ↓
Dish Details Modal (Culinary description, quantity selector, special instructions)
       ↓
Pre-Order Cart (Subtotal, 5% GST preview, Estimated Total preview)
       │
       └── [STRICT BOUNDARY] → Ordering & KDS dispatch is deferred to Restaurant Slice 3 (R3)
```

---

## Key Domain Invariants & Rules

### 1. Table Context Authority
- The physical Table QR code remains the sole authority for seating context.
- Customers cannot manipulate the URL or HTTP headers to change tables (e.g., Table 12 cannot be spoofed to Table 15). All session operations query the server-persisted context.

### 2. Name + Phone Customer Requirement
- Both **Name** (min 2 characters) and **Phone** (min 7 digits) are required before unlocking the digital menu.
- Phone numbers are normalized standardly (whitespace/dashes stripped, 10-digit Indian numbers auto-prefixed with `+91`).
- Deduplication: If a customer with the normalized phone exists in the tenant, the existing `customerId` is reused; no duplicate records are created.
- The `customer_sessions` table is linked to `customers.customer_id`.

### 3. Digital Menu Reusing Shared Catalog
- Catalogs are scoped per outlet (`catalogs.outlet_id`).
- Categories (`catalog_categories`) and items (`catalog_items`) inherit multi-tenant isolation.
- Customer-facing queries (`GET /api/v1/restaurant/menu`) strictly return available items (`is_available = true`) in active categories (`is_active = true`).
- Unavailable dishes (86'd) are hidden from customer view, and any client attempt to add an 86'd item to the cart fails server-side with a 422 error.

### 4. Dedicated Pricing & RBAC Permissions
- **Menu Viewing**: `restaurant.menu.view`
- **Category & Item Management**: `restaurant.menu.manage`
- **Stock Availability (86ing)**: `restaurant.menu.availability`
- **Base Price Editing**: `restaurant.menu.price.manage` (strictly distinct from availability to prevent unauthorized price tampering by floor staff)

### 5. Pre-Order Cart vs Financial Ledger Boundary
- The cart items are stored in `restaurant_cart_items` referencing `customer_sessions.session_id`.
- The cart line subtotals, tax estimates, and total previews are calculated dynamically on the server from `catalog_items.base_price`.
- Placing items in the cart does **NOT**:
  - Insert rows into `orders` or `order_items`
  - Generate a bill or invoice
  - Create payment records
  - Dispatch tasks to the Kitchen Display System (KDS)
  - Emit an `ORDER_CONFIRMED` outbox event
- Slice 3 (**R3**) will implement server-side validation, order creation, and KDS routing.

---

## API Surface

| Method | Endpoint | Auth / Permission | Description |
|---|---|---|---|
| `POST` | `/api/v1/restaurant/customer/identify` | Customer Session | Validates Name + Phone, finds/creates customer, updates session |
| `GET` | `/api/v1/restaurant/menu` | Public / Customer | Fetches available digital menu items & active categories |
| `GET` | `/api/v1/restaurant/admin/menu` | `restaurant.menu.view` | Fetches all items (including 86'd) for staff operations |
| `POST` | `/api/v1/restaurant/admin/menu/items/:id/availability` | `restaurant.menu.availability` | Toggles item stock state (In Stock vs 86'd) |
| `POST` | `/api/v1/restaurant/admin/menu/items/:id/price` | `restaurant.menu.price.manage` | Updates base item price in catalog |
| `POST` | `/api/v1/restaurant/admin/menu/categories/:id/status` | `restaurant.menu.manage` | Toggles category active status |
| `GET` | `/api/v1/restaurant/cart` | Customer Session | Retrieves session cart with authoritative totals preview |
| `POST` | `/api/v1/restaurant/cart/items` | Customer Session | Adds item to pre-order cart |
| `PATCH` | `/api/v1/restaurant/cart/items/:id` | Customer Session | Updates quantity (0 removes item) |
| `DELETE` | `/api/v1/restaurant/cart/items/:id` | Customer Session | Removes specific cart item |
| `DELETE` | `/api/v1/restaurant/cart` | Customer Session | Clears all cart items for session |

---

## Quality & Verification Results

All quality gates passed with zero regressions:

- **R2 Integration Suite**: 28 / 28 passed (100%)
- **R1 Integration Suite**: 26 / 26 passed (100%)
- **Full Test Suite**: 317 / 317 passed across 31 test files (100%)
- **Security Audit**: 42 / 42 passed (100%)
- **Supabase Native PostgreSQL & RLS**: 11 / 11 passed (100%)
- **TypeScript Typecheck**: 0 errors
- **Next.js Production Build**: 0 errors
