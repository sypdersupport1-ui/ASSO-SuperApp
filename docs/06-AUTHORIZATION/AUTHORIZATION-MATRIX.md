# ASSO Role-to-Permission Authorization Matrix

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 3)  
> **Authority:** Aligned with `PERMISSION-CATALOG.md` and `AUTHORIZATION-MODEL.md`  

---

## 1. System Role Definitions

- **SA:** Super Admin (Cross-Tenant Platform Operator)
- **TA:** Tenant Admin (Business Owner / General Manager)
- **OM:** Outlet Manager (Property / Branch Operational Manager)
- **FD:** Front Desk Agent (Hotel Reception & Stays)
- **HK:** Housekeeping Staff (Hotel Cleaning)
- **POS:** Cashier / POS Operator (Billing & Payments)
- **WT:** Waiter / Server (Restaurant Dining & Room Service)
- **KIT:** Kitchen / Bar Display Staff (Fulfillment Operators)
- **SK:** Storekeeper / Inventory Manager (Warehouse & Receiving)
- **ACC:** Accountant / Financial Controller (Expenses & Invoicing)
- **USH:** Cinema Usher (Auditorium & In-Seat Service)

---

## 2. Platform Core & Administrative Permissions

| Permission Full Code | SA | TA | OM | FD | HK | POS | WT | KIT | SK | ACC | USH |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `platform.tenants.manage` | **✓** | - | - | - | - | - | - | - | - | - | - |
| `platform.pricing.manage` | **✓** | - | - | - | - | - | - | - | - | - | - |
| `settings.view` | **✓** | **✓** | **✓** | - | - | - | - | - | - | **✓** | - |
| `settings.update` | - | **✓** | - | - | - | - | - | - | - | - | - |
| `outlets.view` | **✓** | **✓** | **✓** | **✓** | - | **✓** | **✓** | **✓** | **✓** | **✓** | **✓** |
| `outlets.manage` | - | **✓** | - | - | - | - | - | - | - | - | - |
| `staff.view` | **✓** | **✓** | **✓** | - | - | - | - | - | - | **✓** | - |
| `staff.manage` | - | **✓** | **✓** | - | - | - | - | - | - | - | - |
| `roles.view` | **✓** | **✓** | - | - | - | - | - | - | - | - | - |
| `roles.manage` | - | **✓** | - | - | - | - | - | - | - | - | - |

---

## 3. Catalog, Ordering & KDS Fulfillment Permissions

| Permission Full Code | SA | TA | OM | FD | HK | POS | WT | KIT | SK | ACC | USH |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `catalog.view` | **✓** | **✓** | **✓** | **✓** | - | **✓** | **✓** | **✓** | **✓** | - | **✓** |
| `catalog.manage` | - | **✓** | **✓** | - | - | - | - | - | - | - | - |
| `orders.view` | **✓** | **✓** | **✓** | **✓** | - | **✓** | **✓** | **✓** | - | - | **✓** |
| `orders.create` | - | **✓** | **✓** | **✓** | - | **✓** | **✓** | - | - | - | **✓** |
| `orders.update` | - | **✓** | **✓** | **✓** | - | **✓** | **✓** | - | - | - | - |
| `orders.cancel` | - | **✓** | **✓** | **✓** | - | **✓** | - | - | - | - | - |
| `orders.cancel.override` | - | **✓** | **✓** | - | - | - | - | - | - | - | - |
| `fulfillment.kds.view` | - | **✓** | **✓** | - | - | - | - | **✓** | - | - | - |
| `fulfillment.kds.update` | - | **✓** | **✓** | - | - | - | - | **✓** | - | - | - |

---

## 4. Billing, Payments & Cash Management Permissions

| Permission Full Code | SA | TA | OM | FD | HK | POS | WT | KIT | SK | ACC | USH |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `billing.view` | **✓** | **✓** | **✓** | **✓** | - | **✓** | - | - | - | **✓** | - |
| `billing.create` | - | **✓** | **✓** | **✓** | - | **✓** | - | - | - | - | - |
| `billing.discount` | - | **✓** | **✓** | - | - | - | - | - | - | - | - |
| `payments.create` | - | **✓** | **✓** | **✓** | - | **✓** | - | - | - | - | - |
| `payments.refund` | - | **✓** | **✓** | - | - | - | - | - | - | **✓** | - |
| `cash.view` | **✓** | **✓** | **✓** | **✓** | - | **✓** | - | - | - | **✓** | - |
| `cash.manage` | - | **✓** | **✓** | **✓** | - | **✓** | - | - | - | - | - |

---

## 5. Inventory & Procurement Permissions

| Permission Full Code | SA | TA | OM | FD | HK | POS | WT | KIT | SK | ACC | USH |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `inventory.view` | **✓** | **✓** | **✓** | - | **✓** | - | - | **✓** | **✓** | **✓** | - |
| `inventory.adjust` | - | **✓** | **✓** | - | - | - | - | - | **✓** | - | - |
| `inventory.transfer` | - | **✓** | **✓** | - | - | - | - | - | **✓** | - | - |
| `procurement.view` | **✓** | **✓** | **✓** | - | - | - | - | - | **✓** | **✓** | - |
| `procurement.create` | - | **✓** | **✓** | - | - | - | - | - | **✓** | **✓** | - |
| `procurement.approve` | - | **✓** | **✓** | - | - | - | - | - | - | **✓** | - |
| `procurement.receive` | - | **✓** | **✓** | - | - | - | - | - | **✓** | - | - |

---

## 6. Expenses Permissions

| Permission Full Code | SA | TA | OM | FD | HK | POS | WT | KIT | SK | ACC | USH |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `expenses.view` | **✓** | **✓** | **✓** | - | - | - | - | - | - | **✓** | - |
| `expenses.create` | - | **✓** | **✓** | - | - | - | - | - | - | **✓** | - |
| `expenses.approve` | - | **✓** | **✓** | - | - | - | - | - | - | - | - |

---

## 7. Hotel Vertical Specific Permissions

| Permission Full Code | SA | TA | OM | FD | HK | POS | WT | KIT | SK | ACC | USH |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `hotel.rooms.view` | **✓** | **✓** | **✓** | **✓** | **✓** | - | - | - | - | - | - |
| `hotel.rooms.manage` | - | **✓** | **✓** | - | - | - | - | - | - | - | - |
| `hotel.stays.manage` | - | **✓** | **✓** | **✓** | - | - | - | - | - | - | - |
| `hotel.folios.view` | **✓** | **✓** | **✓** | **✓** | - | **✓** | - | - | - | **✓** | - |
| `hotel.folios.charge` | - | **✓** | **✓** | **✓** | - | - | - | - | - | - | - |
| `hotel.housekeeping.view`| **✓** | **✓** | **✓** | **✓** | **✓** | - | - | - | - | - | - |
| `hotel.housekeeping.update`| - | **✓** | **✓** | **✓** | **✓** | - | - | - | - | - | - |

---

## 8. Restaurant Vertical Specific Permissions

| Permission Full Code | SA | TA | OM | FD | HK | POS | WT | KIT | SK | ACC | USH |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `restaurant.tables.view` | **✓** | **✓** | **✓** | - | - | **✓** | **✓** | - | - | - | - |
| `restaurant.tables.manage`| - | **✓** | **✓** | - | - | **✓** | **✓** | - | - | - | - |
| `restaurant.queue.view` | **✓** | **✓** | **✓** | - | - | **✓** | **✓** | - | - | - | - |
| `restaurant.queue.manage`| - | **✓** | **✓** | - | - | **✓** | **✓** | - | - | - | - |
| `restaurant.reservations.manage`| - | **✓** | **✓** | - | - | - | - | - | - | - | - |

---

## 9. Cinema Vertical Specific Permissions

| Permission Full Code | SA | TA | OM | FD | HK | POS | WT | KIT | SK | ACC | USH |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `cinema.screens.view` | **✓** | **✓** | **✓** | - | - | **✓** | - | - | - | - | **✓** |
| `cinema.shows.view` | **✓** | **✓** | **✓** | - | - | **✓** | - | - | - | - | **✓** |
| `cinema.shows.manage` | - | **✓** | **✓** | - | - | - | - | - | - | - | - |
| `cinema.seat_service.deliver`| - | **✓** | **✓** | - | - | - | - | - | - | - | **✓** |
