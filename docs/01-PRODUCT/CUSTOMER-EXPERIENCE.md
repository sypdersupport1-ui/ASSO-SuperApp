# ASSO — Customer Experience

This document defines the customer-facing experience model across all ASSO verticals.

---

## 1. Common Customer Entry Model

All ASSO verticals share a common customer-entry pattern:

```text
QR / Customer Entry
        ↓
Resolve Business (Tenant / Property / Outlet)
        ↓
Resolve Business Context (Room / Table / Seat)
        ↓
Customer Session
        ↓
Vertical-Specific Experience
        ↓
Shared Capabilities (Ordering, Chat, Service Requests, Billing)
```

The entry mechanism and session management are shared platform capabilities. The experience that follows is shaped by the vertical and its business context.

---

## 2. QR-Based Entry

QR codes are the primary customer-entry mechanism.

### How It Works

1. Customer scans a QR code physically placed in the business context (room, table, or seat area)
2. ASSO resolves the QR to a specific business, outlet, and context
3. A customer session is established, scoped to that context
4. The customer sees the appropriate vertical experience

### QR Principles

- QR codes are **context identifiers**, not authorization tokens
- QR codes contain opaque identifiers — no sensitive data
- Server-side validation determines what the QR resolves to
- QR sessions are context-aware and revocable
- A previous customer's session must never persist into another customer's context
- QR codes may be static (fixed to a context) or dynamic (generated per session)

> `OPEN DECISION` — Whether QR codes are always static, always dynamic, or configurable per vertical/business has not been finalized.

---

## 3. Customer Session

Once a customer enters through QR (or another entry mechanism), a session is created.

### Session Properties

- Scoped to a specific tenant, property, outlet, and business context
- Time-bounded (sessions should not persist indefinitely)
- Revocable by staff or by context change (e.g., guest checkout, table turnover)
- Supports the capabilities enabled for that business (ordering, chat, service requests, bill viewing)

### Session Lifecycle

```text
Entry (QR scan / staff-initiated)
        ↓
Session Active
        ↓
Customer interacts (orders, requests, chat)
        ↓
Session Ends (checkout, departure, staff action, timeout)
```

---

## 4. Hotel Customer Experience

### Actor: Hotel Guest

### Entry

- Guest checks in at front desk or through a future self-check-in flow
- Guest receives or scans a room QR code
- Session is established, scoped to their stay and room

### Experience

```text
Room Context
    ├── View room information
    ├── Order food / beverages / amenities (room service)
    ├── Request services (housekeeping, maintenance, amenities)
    ├── Chat with hotel staff
    ├── View charges / folio
    └── Access hotel information
```

### Key Characteristics

- Session is tied to a **stay** (check-in to check-out), not just a single visit
- A guest may interact multiple times across their stay
- Multiple guests may share a room context (e.g., a couple in one room)
- Orders and service requests accumulate on the guest's stay/folio
- Billing may be settled at checkout or periodically

### Session End

- Guest checks out → session ends
- Room is turned over → previous guest's session must be invalidated
- Staff can manually end a session

---

## 5. Restaurant Customer Experience

### Actor: Diner / Restaurant Customer

### Entry

- Customer sits at a table
- Customer scans the table QR code
- Session is established, scoped to the table and the current dining session

### Experience

```text
Table Context
    ├── View menu / catalog
    ├── Place orders
    ├── Track order status
    ├── Request services (call waiter, request bill, request assistance)
    ├── Chat with staff
    ├── View current bill
    └── Pay (if digital payment is supported)
```

### Key Characteristics

- Session is tied to a **dining session** (seated to departure), which is typically shorter than a hotel stay
- Multiple customers at the same table may share a session or have individual sessions
- Orders are placed against the table context
- Kitchen receives and fulfills orders
- Billing is typically per-table, settled before departure

> `OPEN DECISION` — Whether multiple devices at the same table create separate sessions or share one session has not been finalized.

### Session End

- Table is cleared / turned over → session ends
- Staff marks the table as available → previous session is invalidated
- Customer pays and leaves

---

## 6. Cinema Customer Experience

### Actor: Cinema Patron

### Entry

- Customer is seated in a cinema screen/auditorium
- Customer scans a QR code at or near their seat
- Session is established, scoped to the screen and optionally the seat

### Experience

```text
Seat / Screen Context
    ├── Order food / beverages / concessions
    ├── Request services
    ├── Chat with staff
    └── View order status
```

### Key Characteristics

- Session is tied to a **show/screening session** — typically 2–3 hours
- The primary customer interaction is concession ordering and service requests
- Cinema does not currently include ticketing or seat reservation (marked as `FUTURE`)
- Orders are delivered to the seat area or picked up at a counter

> `OPEN DECISION` — Whether concession orders are delivered to seats, picked up, or both, may vary by cinema and should be configurable.

### Session End

- Show ends → sessions for that screen/showtime are ended
- Staff clears the screen → previous sessions are invalidated
- Customer leaves

---

## 7. Shared Customer Capabilities

Regardless of vertical, a customer with an active session can access the capabilities enabled for that business:

| Capability | Description |
|---|---|
| **View catalog/menu** | See what is available to order |
| **Place orders** | Order items from the catalog |
| **Track orders** | See the status of placed orders |
| **Service requests** | Request staff assistance or services |
| **Chat** | Communicate with staff |
| **View charges** | See current charges / bill |
| **Pay** | Make payments (where supported) |

Not every capability is available in every vertical or every business. Capabilities depend on:
- What modules the business has enabled (module entitlements)
- What the vertical supports
- What the business has configured

---

## 8. Non-Customer Users

Beyond the customer, ASSO serves several other user types whose experience is defined at the business-console and operational level:

| User Type | Description |
|---|---|
| **Staff** | Operational staff who fulfill orders, handle requests, manage operations |
| **Manager** | Business managers who oversee operations, approve actions, view reports |
| **Owner / Admin** | Business owners who manage configuration, staff, modules, billing |
| **Super Admin** | ASSO platform administrators who manage tenants, plans, system health |

The experience for these users is defined through the Business Console and Super Admin interfaces, which are covered separately.

---

## 9. Customer Data

Customer data is managed by the shared Customer Engine.

- A customer may interact with multiple businesses on the ASSO platform
- Customer data is shared where the customer consents, but operational data is tenant-scoped
- Customer identification may be anonymous (QR session only) or identified (phone, email, login)

> `OPEN DECISION` — The extent of cross-tenant customer data sharing (e.g., a guest who visits both a hotel and a restaurant on the platform) has not been decided. Initial implementation may treat each tenant's customer records independently.

---

## 10. Experience Principles

1. **Minimal friction** — customers should not need to install apps or create accounts to interact
2. **Context-aware** — the experience adapts to the business context (room, table, seat)
3. **Secure** — sessions are scoped, time-bounded, and revocable
4. **Consistent** — shared capabilities behave consistently across verticals
5. **Configurable** — businesses can control what customers see and can do
