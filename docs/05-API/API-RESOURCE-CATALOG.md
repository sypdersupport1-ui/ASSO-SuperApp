# ASSO API Resource Catalog

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 3)  
> **Base Path:** `/api/v1/`  
> **Authority:** Aligned with `ENTITY-CATALOG.md` and `API-ARCHITECTURE.md`  

---

## 1. Identity, Authentication & Profile Resources

| Method | Endpoint Path | Description | Required Role / Permission |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login` | Staff / Admin login (email + password) | Public |
| `POST` | `/api/v1/auth/refresh` | Refresh expired access token | Authenticated (Refresh Token) |
| `POST` | `/api/v1/auth/logout` | Revoke current session token | Authenticated |
| `POST` | `/api/v1/auth/mfa/challenge` | Verify TOTP MFA code | Auth Challenge State |
| `GET` | `/api/v1/auth/me` | Fetch authenticated user profile & tenant roles | Authenticated |

---

## 2. Platform Administration & Commercial Resources

| Method | Endpoint Path | Description | Required Role / Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/platform/tenants` | List all organizations | `super_admin` |
| `POST` | `/api/v1/platform/tenants` | Create new tenant organization | `super_admin` |
| `GET` | `/api/v1/platform/modules` | List platform modules & capabilities | `super_admin` / `tenant_admin` |
| `GET` | `/api/v1/platform/pricing` | View commercial pricing configurations | `super_admin` |
| `PUT` | `/api/v1/platform/pricing/{pricingId}` | Update dynamic pricing (DEC-024) | `super_admin` |
| `POST` | `/api/v1/platform/tenants/{tenantId}/overrides` | Set tenant-specific pricing override | `super_admin` |

---

## 3. Tenant Administration, Outlets & Staff Resources

| Method | Endpoint Path | Description | Required Role / Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/tenants/current` | Get current tenant details | `settings.view` |
| `GET` | `/api/v1/outlets` | List outlets in tenant | `outlets.view` |
| `POST` | `/api/v1/outlets` | Create an outlet (Hotel, Restaurant, Cinema) | `outlets.create` |
| `GET` | `/api/v1/staff` | List staff members across outlets | `staff.view` |
| `POST` | `/api/v1/staff` | Invite/create new staff profile | `staff.create` |
| `GET` | `/api/v1/roles` | List available roles & permissions | `roles.view` |
| `POST` | `/api/v1/roles` | Create custom tenant role | `roles.manage` |

---

## 4. Context Resolution & Customer Guest Experience

| Method | Endpoint Path | Description | Required Role / Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/context/resolve` | Resolve opaque QR token to physical context | Public (Rate-Limited) |
| `POST` | `/api/v1/context/session` | Create ephemeral customer session for device | Public (Rate-Limited) |
| `GET` | `/api/v1/customer/menu` | Fetch active menu/catalog for current context | Customer Session / Staff |
| `GET` | `/api/v1/customer/orders` | Fetch orders placed in current context | Customer Session / Staff |

---

## 5. Catalog & Menu Resources

| Method | Endpoint Path | Description | Required Role / Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/catalog/items` | List menu items with categories and modifiers | `catalog.view` |
| `POST` | `/api/v1/catalog/items` | Create new catalog item | `catalog.manage` |
| `PATCH` | `/api/v1/catalog/items/{itemId}` | Update item price, availability, or station | `catalog.manage` |
| `DELETE` | `/api/v1/catalog/items/{itemId}` | Soft-delete catalog item | `catalog.manage` |

---

## 6. Shared Ordering & KDS Fulfillment Resources

| Method | Endpoint Path | Description | Required Role / Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/orders` | List orders (filterable by outlet, status, date) | `orders.view` |
| `POST` | `/api/v1/orders` | Create new order (Idempotency Key required) | Customer Session / `orders.create` |
| `GET` | `/api/v1/orders/{orderId}` | Get order details and items | `orders.view` |
| `PATCH` | `/api/v1/orders/{orderId}/status` | Transition order status (State machine enforced) | `orders.update` |
| `GET` | `/api/v1/fulfillment/kds` | KDS screen feed by fulfillment station | `fulfillment.kds.view` |
| `PATCH` | `/api/v1/fulfillment/items/{itemId}/status` | Mark item PREPARING/READY/SERVED | `fulfillment.kds.update` |

---

## 7. Shared Billing & Payments Resources

| Method | Endpoint Path | Description | Required Role / Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/billing/bills` | List bills by context or date | `billing.view` |
| `POST` | `/api/v1/billing/bills` | Generate bill from open orders | `billing.create` |
| `POST` | `/api/v1/payments/intent` | Create provider-neutral payment intent | `payments.create` |
| `POST` | `/api/v1/payments/record` | Record direct payment (Cash, POS Terminal) | `payments.create` |
| `POST` | `/api/v1/payments/refund` | Initiate refund (Subject to approval policy) | `payments.refund` |
| `POST` | `/api/v1/webhooks/payments/{provider}`| Inbound payment gateway webhook handler | Public (HMAC Verified) |

---

## 8. Hotel Vertical Resources

| Method | Endpoint Path | Description | Required Role / Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/hotel/rooms` | List hotel rooms and housekeeping status | `hotel.rooms.view` |
| `POST` | `/api/v1/hotel/checkin` | Check in guest & create stay + folio | `hotel.stays.manage` |
| `POST` | `/api/v1/hotel/checkout` | Settle folio & finalize guest checkout | `hotel.stays.manage` |
| `GET` | `/api/v1/hotel/folios/{folioId}`| View guest folio ledger entries | `hotel.folios.view` |
| `POST` | `/api/v1/hotel/folios/{folioId}/charges`| Post manual charge to guest folio | `hotel.folios.charge` |
| `GET` | `/api/v1/hotel/housekeeping` | List pending housekeeping tasks | `hotel.housekeeping.view` |
| `PATCH` | `/api/v1/hotel/housekeeping/{taskId}` | Update room cleaning progress | `hotel.housekeeping.update` |

---

## 9. Restaurant Vertical Resources

| Method | Endpoint Path | Description | Required Role / Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/restaurant/tables` | Table floor map & active occupancy status | `restaurant.tables.view` |
| `PATCH` | `/api/v1/restaurant/tables/{tableId}` | Update table status (AVAILABLE, DIRTY) | `restaurant.tables.manage` |
| `GET` | `/api/v1/restaurant/queue` | View active waitlist queue | `restaurant.queue.view` |
| `POST` | `/api/v1/restaurant/queue` | Add walk-in guest party to waitlist | `restaurant.queue.manage` |
| `POST` | `/api/v1/restaurant/reservations` | Create advance table reservation | `restaurant.reservations.create`|

---

## 10. Cinema Vertical Resources

| Method | Endpoint Path | Description | Required Role / Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/cinema/screens` | List auditoriums and seat layouts | `cinema.screens.view` |
| `GET` | `/api/v1/cinema/shows` | List active showtimes | `cinema.shows.view` |
| `POST` | `/api/v1/cinema/shows` | Schedule new showtime | `cinema.shows.manage` |

---

## 11. Shared Inventory & Procurement Resources

| Method | Endpoint Path | Description | Required Role / Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/inventory/items` | Master inventory items and stock levels | `inventory.view` |
| `GET` | `/api/v1/inventory/movements` | Audit ledger of historical stock movements | `inventory.view` |
| `POST` | `/api/v1/inventory/adjustments` | Record manual adjustment / wastage | `inventory.adjust` |
| `POST` | `/api/v1/inventory/transfers` | Transfer stock between locations/outlets | `inventory.transfer` |
| `GET` | `/api/v1/procurement/orders` | List purchase orders | `procurement.view` |
| `POST` | `/api/v1/procurement/orders` | Create purchase order | `procurement.create` |
| `POST` | `/api/v1/procurement/orders/{poId}/receive` | Receive goods into stock ledger | `procurement.receive` |

---

## 12. Shared Expenses & Cash Management Resources

| Method | Endpoint Path | Description | Required Role / Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/expenses` | List operational expenses | `expenses.view` |
| `POST` | `/api/v1/expenses` | Record expense voucher | `expenses.create` |
| `POST` | `/api/v1/expenses/{id}/approve` | Approve expense voucher | `expenses.approve` |
| `GET` | `/api/v1/cash/sessions/current` | Get active cash drawer status for staff | `cash.view` |
| `POST` | `/api/v1/cash/sessions/open` | Open cash drawer with starting float | `cash.manage` |
| `POST` | `/api/v1/cash/sessions/close` | Reconcile and close cash drawer | `cash.manage` |

---

## 13. Service Requests, Chat & Notifications Resources

| Method | Endpoint Path | Description | Required Role / Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/service-requests` | List service requests | `service.view` |
| `POST` | `/api/v1/service-requests` | Create service request (guest or staff) | Guest Session / `service.create` |
| `PATCH` | `/api/v1/service-requests/{id}` | Update status or assign staff | `service.update` |
| `GET` | `/api/v1/conversations/{id}/messages`| View chat conversation messages | Participant / `chat.view` |
| `POST` | `/api/v1/conversations/{id}/messages`| Send message in conversation | Participant / `chat.send` |
| `GET` | `/api/v1/notifications` | Fetch user in-app notifications | Authenticated User |
