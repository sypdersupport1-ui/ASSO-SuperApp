# ASSO Granular Permission Catalog

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 3)  
> **Authority:** Aligned with `ENTITY-CATALOG.md` and `AUTHORIZATION-MODEL.md`  

---

## 1. Permission Naming Standard

All ASSO permissions adhere to the lowercase dot-notated pattern:

$$\text{<module\_code>}.\text{[<subresource>].}\text{<action>}$$

Examples: `orders.create`, `inventory.adjust`, `hotel.folios.charge`, `expenses.approve`.

---

## 2. Platform Core & Administrative Permissions

| Permission Code | Category | Description | Default Roles |
| :--- | :--- | :--- | :--- |
| `platform.tenants.manage` | Platform | Create/suspend tenant organizations | `SUPER_ADMIN` |
| `platform.pricing.manage` | Platform | Modify commercial pricing (DEC-024) | `SUPER_ADMIN` |
| `settings.view` | Core | View tenant profile and configurations | `TENANT_ADMIN`, `OUTLET_MANAGER` |
| `settings.update` | Core | Update business details, tax IDs | `TENANT_ADMIN` |
| `outlets.view` | Core | View outlets in organization | `TENANT_ADMIN`, `OUTLET_MANAGER` |
| `outlets.manage` | Core | Create, update, or deactivate outlets | `TENANT_ADMIN` |
| `staff.view` | Core | View staff directory and rosters | `TENANT_ADMIN`, `OUTLET_MANAGER` |
| `staff.manage` | Core | Invite staff, modify profile, assign roles | `TENANT_ADMIN` |
| `roles.view` | Core | View role templates and assigned permissions| `TENANT_ADMIN` |
| `roles.manage` | Core | Create and edit custom tenant roles | `TENANT_ADMIN` |

---

## 3. Catalog, Ordering & KDS Fulfillment Permissions

| Permission Code | Category | Description | Default Roles |
| :--- | :--- | :--- | :--- |
| `catalog.view` | Catalog | Browse menu items, categories, pricing | All Staff Roles |
| `catalog.manage` | Catalog | Create/edit menu items, prices, modifiers | `TENANT_ADMIN`, `OUTLET_MANAGER` |
| `orders.view` | Ordering | View active and historical orders | `OUTLET_MANAGER`, `CASHIER_POS`, `WAITER` |
| `orders.create` | Ordering | Place new order on behalf of guest | `OUTLET_MANAGER`, `CASHIER_POS`, `WAITER` |
| `orders.update` | Ordering | Add items, change notes or delivery status | `OUTLET_MANAGER`, `CASHIER_POS`, `WAITER` |
| `orders.cancel` | Ordering | Cancel unaccepted orders | `OUTLET_MANAGER`, `CASHIER_POS` |
| `orders.cancel.override` | Ordering | Override and cancel order already in prep | `OUTLET_MANAGER` |
| `fulfillment.kds.view` | KDS | View kitchen/bar display station feeds | `KITCHEN_STAFF`, `BAR_STAFF`, `OUTLET_MANAGER` |
| `fulfillment.kds.update` | KDS | Mark item PREPARING, READY, SERVED | `KITCHEN_STAFF`, `BAR_STAFF` |

---

## 4. Billing, Payments & Cash Management Permissions

| Permission Code | Category | Description | Default Roles |
| :--- | :--- | :--- | :--- |
| `billing.view` | Billing | View bills and settlement status | `OUTLET_MANAGER`, `CASHIER_POS` |
| `billing.create` | Billing | Generate bill from active orders | `OUTLET_MANAGER`, `CASHIER_POS` |
| `billing.discount` | Billing | Apply discount or promotion to bill | `OUTLET_MANAGER` |
| `payments.create` | Payments | Process payment (Cash, Card, UPI, Gateway)| `OUTLET_MANAGER`, `CASHIER_POS` |
| `payments.refund` | Payments | Initiate customer refund (Subject to policy)| `OUTLET_MANAGER` |
| `cash.view` | Cash | View cash drawer balance and movements | `OUTLET_MANAGER`, `CASHIER_POS` |
| `cash.manage` | Cash | Open, close, and reconcile cash drawer sessions| `OUTLET_MANAGER`, `CASHIER_POS` |

---

## 5. Inventory & Procurement Permissions

| Permission Code | Category | Description | Default Roles |
| :--- | :--- | :--- | :--- |
| `inventory.view` | Inventory | View stock levels, items, and movements | `TENANT_ADMIN`, `OUTLET_MANAGER`, `STOREKEEPER` |
| `inventory.adjust` | Inventory | Record cycle count adjustments or wastage | `STOREKEEPER`, `OUTLET_MANAGER` |
| `inventory.transfer` | Inventory | Transfer stock between locations/outlets | `STOREKEEPER`, `OUTLET_MANAGER` |
| `procurement.view` | Procurement | View purchase orders and suppliers | `TENANT_ADMIN`, `OUTLET_MANAGER`, `STOREKEEPER` |
| `procurement.create` | Procurement | Draft and submit purchase orders | `OUTLET_MANAGER`, `STOREKEEPER` |
| `procurement.approve` | Procurement | Approve purchase order above threshold | `TENANT_ADMIN`, `FINANCE_CONTROLLER` |
| `procurement.receive` | Procurement | Record goods receipt into inventory ledger | `STOREKEEPER`, `OUTLET_MANAGER` |

---

## 6. Expenses Permissions

| Permission Code | Category | Description | Default Roles |
| :--- | :--- | :--- | :--- |
| `expenses.view` | Expenses | View operational expense vouchers | `TENANT_ADMIN`, `OUTLET_MANAGER`, `ACCOUNTANT` |
| `expenses.create` | Expenses | Record operational expense voucher | `OUTLET_MANAGER`, `ACCOUNTANT` |
| `expenses.approve` | Expenses | Approve expense vouchers for payout | `TENANT_ADMIN`, `OUTLET_MANAGER` |

---

## 7. Hotel Vertical Specific Permissions

| Permission Code | Category | Description | Default Roles |
| :--- | :--- | :--- | :--- |
| `hotel.rooms.view` | Hotel | View room rack and occupancy status | `FRONT_DESK`, `HOTEL_MANAGER`, `HOUSEKEEPING` |
| `hotel.rooms.manage` | Hotel | Configure room types, rates, maintenance | `HOTEL_MANAGER` |
| `hotel.stays.manage` | Hotel | Perform guest check-in, room moves, checkout| `FRONT_DESK`, `HOTEL_MANAGER` |
| `hotel.folios.view` | Hotel | View guest folio ledger entries | `FRONT_DESK`, `HOTEL_MANAGER` |
| `hotel.folios.charge` | Hotel | Post charges or adjustments to folio | `FRONT_DESK`, `HOTEL_MANAGER` |
| `hotel.housekeeping.view` | Hotel | View room cleaning task assignments | `HOUSEKEEPING_STAFF`, `HOTEL_MANAGER` |
| `hotel.housekeeping.update`| Hotel | Update room cleaning status (DIRTY → CLEAN) | `HOUSEKEEPING_STAFF` |

---

## 8. Restaurant Vertical Specific Permissions

| Permission Code | Category | Description | Default Roles |
| :--- | :--- | :--- | :--- |
| `restaurant.tables.view` | Restaurant | View dining areas and table status | `WAITER`, `RESTAURANT_HOST`, `RESTAURANT_MANAGER` |
| `restaurant.tables.manage`| Restaurant | Update table state, seat party | `RESTAURANT_HOST`, `RESTAURANT_MANAGER` |
| `restaurant.queue.view` | Restaurant | View guest waitlist | `RESTAURANT_HOST`, `RESTAURANT_MANAGER` |
| `restaurant.queue.manage`| Restaurant | Add/call/seat guests from waitlist | `RESTAURANT_HOST`, `RESTAURANT_MANAGER` |
| `restaurant.reservations.manage`| Restaurant| Manage table reservations | `RESTAURANT_HOST`, `RESTAURANT_MANAGER` |

---

## 9. Cinema Vertical Specific Permissions

| Permission Code | Category | Description | Default Roles |
| :--- | :--- | :--- | :--- |
| `cinema.screens.view` | Cinema | View auditorium layouts and seat grids | `CINEMA_USHER`, `CINEMA_MANAGER` |
| `cinema.shows.view` | Cinema | View scheduled showtimes and movies | `CINEMA_USHER`, `CINEMA_MANAGER` |
| `cinema.shows.manage` | Cinema | Schedule showtimes and enable ordering | `CINEMA_MANAGER` |
| `cinema.seat_service.deliver`| Cinema | Deliver concession orders to seats | `CINEMA_USHER` |

---

## 10. Service Requests, Chat & Reporting Permissions

| Permission Code | Category | Description | Default Roles |
| :--- | :--- | :--- | :--- |
| `service.view` | Service | View guest and operational service tickets | All Staff Roles |
| `service.create` | Service | Raise maintenance or service ticket | All Staff Roles |
| `service.update` | Service | Assign, progress, or resolve service ticket | Assigned Staff, `OUTLET_MANAGER` |
| `chat.view` | Chat | View guest-staff chat conversations | Assigned Staff, `OUTLET_MANAGER` |
| `chat.send` | Chat | Send messages to guests or internal staff | Assigned Staff, `OUTLET_MANAGER` |
| `reports.view` | Reports | View operational and financial dashboards | `TENANT_ADMIN`, `OUTLET_MANAGER`, `ACCOUNTANT` |
