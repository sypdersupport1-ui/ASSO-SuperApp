# ASSO — Business Flows

This document describes the major business flows across ASSO. It is structured into:

- **A. Shared Cross-Platform Flows** — flows that work the same way (or nearly so) across all verticals
- **B. Hotel Flows** — hotel-specific workflows
- **C. Restaurant Flows** — restaurant-specific workflows
- **D. Cinema Flows** — cinema-specific workflows
- **E. Cross-Module Relationships** — how modules connect
- **F. Open Decisions**

For each significant flow:
- **Actor**: Who initiates or participates
- **Context**: The business context in which this occurs
- **Steps**: Major steps (not detailed UI steps)
- **Outcome**: What results from the flow
- **Connected Modules**: Which modules are involved
- **Rules**: Important business rules
- **Open Questions**: Unresolved items

---

# A. Shared Cross-Platform Flows

These flows are powered by shared ASSO engines and operate across all verticals, with the business context varying per vertical.

---

## A.1 Customer Entry via QR

**Actor**: Customer / Guest

**Context**: Any vertical — Room (Hotel), Table (Restaurant), Seat/Screen (Cinema)

**Steps**:
1. Customer scans a QR code placed at the business context
2. ASSO resolves the QR to: tenant → property → outlet → business context
3. System verifies the context is active and available
4. A customer session is created, scoped to the resolved context
5. Customer sees the vertical-specific experience

**Outcome**: Active customer session scoped to a business context

**Connected Modules**: QR Engine, Customer Engine, Business Context, Customer Sessions

**Rules**:
- QR contains opaque identifiers only — no sensitive data
- Server-side validation determines context
- Previous sessions on the same context must be invalidated when context changes (e.g., table turned over, guest checked out)
- Session is time-bounded

**Open Questions**:
- Static vs dynamic QR codes — `OPEN DECISION`
- Multi-device behavior at the same context — `OPEN DECISION`

---

## A.2 Customer Ordering

**Actor**: Customer (via session) or Staff (via POS/console)

**Context**: Any vertical — Room, Table, Seat/Screen

**Steps**:
1. Customer views the catalog/menu available for their context
2. Customer selects items and places an order
3. Order is validated (items available, context valid, session active)
4. Order is created and assigned to the business context
5. Order is routed to fulfillment (kitchen, service team, concession counter)
6. Order status updates are visible to the customer
7. Order items are added to the bill for the context

**Outcome**: Order created, routed for fulfillment, charges applied

**Connected Modules**: Catalog, Ordering, Fulfillment, Billing, Business Context, Customer Sessions

**Rules**:
- Orders are always tied to a tenant, property, outlet, and business context
- Catalog availability may vary by time, context, or vertical
- Order modifications/cancellations follow defined rules
- Inventory may be checked/reserved at order time (`OPEN DECISION`)

**Open Questions**:
- Whether inventory is checked at order time or only at fulfillment — `OPEN DECISION`
- Order modification rules after submission — `OPEN DECISION`

---

## A.3 Order Fulfillment

**Actor**: Kitchen staff, Service staff, Concession staff

**Context**: Depends on vertical

**Steps**:
1. Fulfillment team receives the order (via KDS, printed ticket, or console)
2. Items are prepared
3. Status is updated as items progress (received → preparing → ready → delivered)
4. Items are delivered to the business context or picked up by customer
5. Fulfillment is marked complete

**Outcome**: Order items delivered to the customer

**Connected Modules**: Ordering, Fulfillment, KDS (where applicable), Notifications

**Rules**:
- Fulfillment workflow may differ per vertical (room delivery vs table service vs counter pickup)
- Status transitions follow a controlled workflow
- Notifications may be sent to customer on status changes

---

## A.4 Billing & Payment

**Actor**: Customer, Staff

**Context**: Any vertical

**Steps**:
1. Charges accumulate against the business context (orders, services, and room tariffs)
2. Customer or staff requests the bill
3. Bill is generated showing all charges
4. Payment is made (cash, card, UPI, or other accepted method)
5. Payment is verified and recorded
6. Receipt/invoice is generated
7. Financial records are updated

**Outcome**: Bill settled, payment recorded, receipt generated

**Connected Modules**: Billing, Payments, Receipts/Invoices, POS

**Rules**:
- Financial calculations are server-side only
- Partial payments may be supported
- Refunds follow a controlled process with approval where required
- Payment must be idempotent — retried payment requests must not create duplicates
- Historical financial records must not be silently modified

**Open Questions**:
- Supported payment providers — `OPEN DECISION`
- Split-bill support — `OPEN DECISION`
- Tipping — `OPEN DECISION`

---

## A.5 POS Transaction (Staff-Initiated)

**Actor**: Staff (cashier, front desk, server)

**Context**: Any vertical — may or may not be tied to a specific business context

**Steps**:
1. Staff opens POS for the relevant outlet
2. Staff selects items / enters charges
3. Items are added to a transaction
4. Payment is collected
5. Transaction is completed and recorded
6. Receipt is generated
7. Inventory and financial records are updated

**Outcome**: POS transaction completed, payment collected, records updated

**Connected Modules**: POS, Billing, Payments, Inventory (consumption), Reporting

**Rules**:
- POS transactions may be context-bound (e.g., "charge to room 205") or standalone
- Staff authorization is required
- Cash management integration for cash transactions

---

## A.6 Service Request

**Actor**: Customer or Staff

**Context**: Any vertical — Room, Table, Seat/Screen

**Steps**:
1. Customer submits a service request (via session) or staff creates one
2. Request is categorized and prioritized
3. Request is assigned to appropriate staff/team
4. Staff receives notification
5. Request is acted upon
6. Status is updated
7. Request is resolved and closed
8. Resolution is recorded

**Outcome**: Service request fulfilled and recorded

**Connected Modules**: Service Requests, Notifications, Business Context, Chat (optionally)

**Rules**:
- Request categories are configurable per vertical
- Priority and assignment rules may be configurable
- Approval may be required for certain request types (policy-controlled)
- History is maintained

---

## A.7 Chat / Conversation

**Actor**: Customer, Staff

**Context**: Any vertical — may be tied to a customer session, order, service request, or business context

**Steps**:
1. Customer or staff initiates a conversation
2. Messages are exchanged in real-time
3. Conversation may be linked to an order, service request, or general inquiry
4. Conversation is resolved/closed by staff

**Outcome**: Communication completed, conversation history preserved

**Connected Modules**: Chat/Conversations, Customer Sessions, Notifications

**Rules**:
- Conversations are tenant-scoped
- Conversation history is preserved
- Staff may manage multiple conversations

---

## A.8 Inventory Management

**Actor**: Inventory Manager, Staff

**Context**: Property / Outlet — not tied to a specific customer context

**Steps**:
1. Inventory items are set up with categories, units, locations, and reorder thresholds
2. Stock is received (goods receiving from purchase orders)
3. Stock is consumed (via orders, manual consumption, or future auto-consumption)
4. Stock is adjusted (wastage, damage, expiry, manual adjustment)
5. Stock is transferred between locations
6. Low-stock alerts trigger when thresholds are reached
7. Stock movements are recorded in the ledger

**Outcome**: Accurate stock levels maintained, movement history preserved

**Connected Modules**: Inventory, Procurement, Ordering (consumption), Reporting

**Rules**:
- Inventory calculations are server-side only
- Every stock change creates a movement record (ledger entry)
- Adjustments require appropriate authorization
- Current stock = sum of all movements (opening + receipts + transfers in − consumption − wastage − transfers out − adjustments)

**Movement Types**:
- Opening balance
- Purchase receipt
- Transfer in / out
- Consumption
- Wastage
- Damage
- Expiry
- Adjustment (increase/decrease)
- Return to supplier

---

## A.9 Procurement

**Actor**: Procurement Manager, Inventory Manager

**Context**: Property / Outlet

**Steps**:
1. Procurement need is identified (manually or via low-stock alert)
2. Purchase order is created for a supplier
3. Purchase order is approved (if policy requires approval)
4. Purchase order is sent to supplier
5. Goods are received and verified against the purchase order
6. Stock is updated (goods receiving creates stock movement)
7. Financial record is created (expense or payable)

**Outcome**: Goods procured, stock updated, financial impact recorded

**Connected Modules**: Procurement, Inventory, Expenses, Suppliers, Approval

**Rules**:
- Purchase orders follow a controlled workflow (draft → approved → sent → receiving → completed)
- Partial receiving is supported
- Discrepancies between ordered and received quantities are recorded
- Approval thresholds are policy-controlled

---

## A.10 Expense Management

**Actor**: Staff, Manager, Owner

**Context**: Property / Outlet

**Steps**:
1. Staff records a daily expense (amount, category, vendor, payment source, notes)
2. Attachment (receipt) is uploaded if applicable
3. Expense is submitted
4. If approval is required (policy-controlled), expense goes through approval workflow
5. Approved expense is recorded
6. Cash management is updated if paid from cash

**Outcome**: Expense recorded, approved, and reflected in financial records

**Connected Modules**: Expenses, Approval, Cash Management, Reporting

**Rules**:
- Expense categories include standard and custom categories
- Payment sources: cash, bank, UPI, card, other
- Approval thresholds are configurable per tenant
- Expense history is maintained and auditable

**Conceptual Distinctions**:
```text
Inventory Purchase  — procurement of goods for stock
Operating Expense   — daily operational costs (utilities, repairs, maintenance, supplies)
Capital Expense     — FUTURE — asset purchases
```

---

## A.11 Cash Management

**Actor**: Cashier, Manager

**Context**: Property / Outlet

**Steps**:
1. Cash register is opened with an opening balance
2. Cash transactions are recorded throughout the day (sales, expenses, adjustments)
3. Cash register is closed with a closing balance
4. Discrepancies are identified and recorded
5. Cash summary is generated

**Outcome**: Cash position tracked, reconciled, and reported

**Connected Modules**: Cash Management, POS, Expenses, Billing, Reporting

---

## A.12 Reporting

**Actor**: Manager, Owner

**Context**: Property / Outlet / Organization

**Steps**:
1. User selects a report type and parameters (date range, outlet, and format)
2. System generates the report from operational data
3. Report is displayed / exported

**Outcome**: Business insights delivered

**Connected Modules**: Reporting, all operational modules

**Rules**:
- Metrics have clear, centrally-defined ownership
- Reports are tenant-scoped
- No report should independently calculate metrics that should be centrally defined

---

# B. Hotel Flows

Hotel-specific workflows that use shared engines within the hotel context.

---

## B.1 Guest Check-In

**Actor**: Front Desk Staff

**Context**: Hotel Property

**Steps**:
1. Guest arrives (with or without a reservation)
2. Front desk looks up reservation or creates a walk-in record
3. Room is assigned to the guest
4. Stay record is created (guest, room, dates, rate)
5. Guest folio is opened
6. Room QR is activated / provided to the guest
7. Room status is updated (occupied)
8. Guest session is initiated

**Outcome**: Guest is checked in, stay is active, room is occupied, folio is open

**Connected Modules**: Stays, Rooms, Guest Folio, Business Context, QR, Customer Sessions, Housekeeping

---

## B.2 Guest Check-Out

**Actor**: Front Desk Staff, Guest

**Context**: Hotel Property

**Steps**:
1. Guest requests checkout (or scheduled checkout time is reached)
2. All pending charges are finalized on the folio
3. Outstanding balance is presented
4. Payment is collected
5. Stay is closed
6. Guest session is ended / invalidated
7. Room status is updated (needs cleaning / available)
8. Housekeeping is notified

**Outcome**: Guest checked out, folio settled, room released

**Connected Modules**: Stays, Guest Folio, Billing, Payments, Rooms, Housekeeping, Customer Sessions

---

## B.3 Room Service Order

**Actor**: Hotel Guest (via session)

**Context**: Room

**Steps**:
1. Guest scans room QR or uses active session
2. Guest views room-service menu
3. Guest places an order
4. Order is routed to kitchen
5. Kitchen prepares the order
6. Order is delivered to the room
7. Charge is added to the guest folio

**Outcome**: Room service delivered, charge on folio

**Connected Modules**: Ordering, Catalog, Fulfillment, Billing (folio), Customer Sessions

**Rules**:
- Charges accumulate on the guest folio, not settled immediately
- Menu availability may vary by time of day

---

## B.4 Guest Service Request

**Actor**: Hotel Guest (via session) or Staff

**Context**: Room

**Steps**:
1. Guest requests a service (extra towels, room repair, or wake-up call)
2. Request is categorized (housekeeping, maintenance, or amenities)
3. Request is assigned to appropriate department/staff
4. Staff fulfills the request
5. Request is marked resolved
6. Some requests may result in charges on the folio

**Outcome**: Guest request fulfilled

**Connected Modules**: Service Requests, Housekeeping, Notifications, Billing (if chargeable)

---

## B.5 Housekeeping

**Actor**: Housekeeping Staff, Housekeeping Manager

**Context**: Hotel Rooms

**Steps**:
1. Rooms requiring cleaning are identified (checkout, guest request, scheduled)
2. Tasks are assigned to housekeeping staff
3. Staff cleans the room
4. Staff marks the room as clean / inspected
5. Room status is updated (available)

**Outcome**: Room is clean and ready for the next guest

**Connected Modules**: Housekeeping, Rooms, Service Requests, Inventory (cleaning supplies consumption)

---

## B.6 Hotel Reservation

**Actor**: Guest, Front Desk Staff

**Context**: Hotel Property

**Steps**:
1. Guest or staff initiates a reservation (dates, room type, guest details)
2. Availability is checked
3. Reservation is confirmed
4. Reservation appears in the front desk system
5. At check-in time, the reservation is converted to an active stay

**Outcome**: Room reserved for the guest

**Connected Modules**: Reservations, Rooms, Stays

**Open Questions**:
- Online booking integration — `OPEN DECISION`
- Reservation deposit/prepayment — `OPEN DECISION`
- Cancellation policies — `OPEN DECISION`

---

## B.7 Guest Folio Management

**Actor**: Front Desk Staff, Manager

**Context**: Guest Stay

**Steps**:
1. Folio is opened at check-in
2. Charges are accumulated (room rate, room service, minibar, and services)
3. Payments are applied (deposits, partial payments)
4. Adjustments, discounts, or corrections are made (with authorization)
5. Folio is settled at checkout

**Outcome**: Complete financial record of the guest's stay

**Connected Modules**: Guest Folio, Billing, Payments, Ordering, Service Requests

**Rules**:
- Folio modifications require appropriate authorization
- Void/adjustment operations create audit records
- Historical folios are preserved, not deleted

---

# C. Restaurant Flows

Restaurant-specific workflows that use shared engines within the restaurant context.

---

## C.1 Table Management

**Actor**: Host / Manager / Staff

**Context**: Restaurant Outlet

**Steps**:
1. Tables are configured (dining areas, table numbers, capacity)
2. Staff manages table status (available → occupied → needs clearing → available)
3. Customers are seated (walk-in or from waitlist/reservation)
4. Table QR is active for customer interaction
5. After customers leave, table is cleared and turned over

**Outcome**: Tables are efficiently managed through the dining cycle

**Connected Modules**: Tables, Business Context, Customer Sessions

**Table States**:
```text
Available → Occupied → Needs Clearing → Available
```

> `OPEN DECISION` — Exact table states and transitions to be finalized during architecture phase.

---

## C.2 Restaurant Dining Flow

**Actor**: Diner / Restaurant Customer

**Context**: Table

**Steps**:
1. Customer is seated at a table
2. Customer scans table QR code
3. Customer views the menu
4. Customer places an order
5. Order is sent to kitchen
6. Kitchen prepares the food (KDS workflow)
7. Food is served to the table
8. Customer may place additional orders
9. Customer requests the bill
10. Payment is collected
11. Table is cleared

**Outcome**: Complete dining experience from seating to payment

**Connected Modules**: Tables, QR, Customer Sessions, Catalog, Ordering, Fulfillment, KDS, Billing, Payments

---

## C.3 Kitchen / KDS Workflow

**Actor**: Kitchen Staff

**Context**: Restaurant Kitchen

**Steps**:
1. Orders arrive at the KDS (Kitchen Display System)
2. Kitchen acknowledges receipt
3. Items are prepared
4. Items are marked as ready
5. Service staff is notified
6. Items are delivered to the table

**Outcome**: Orders are prepared and served

**Connected Modules**: Ordering, Fulfillment, KDS, Notifications

**Rules**:
- Items may be grouped or sequenced (such as starters before main courses)
- Priority and timing management

> `OPEN DECISION` — KDS feature depth (multi-station routing, course management, timing) to be determined.

---

## C.4 Restaurant Queue / Waitlist

**Actor**: Host / Manager, Walk-in Customer

**Context**: Restaurant Outlet

**Steps**:
1. Customer arrives and restaurant is full
2. Customer is added to the queue/waitlist
3. Customer receives an estimated wait time
4. When a table becomes available, customer is notified
5. Customer is seated

**Outcome**: Walk-in customers are managed fairly during peak times

**Connected Modules**: Queue, Tables, Notifications

> `OPEN DECISION` — Whether Q/waitlist is included in initial scope or is `FUTURE`.

---

## C.5 Restaurant Reservation

**Actor**: Customer, Staff

**Context**: Restaurant Outlet

**Steps**:
1. Customer requests a reservation (date, time, party size)
2. Availability is checked
3. Reservation is confirmed
4. At reservation time, table is held/assigned
5. Customer arrives and is seated

**Outcome**: Table reserved for the customer

**Connected Modules**: Reservations, Tables

> `OPEN DECISION` — Whether reservations are included in initial scope or basic scope only.

---

# D. Cinema Flows

Cinema-specific workflows that use shared engines within the cinema context.

---

## D.1 Screen / Show Management

**Actor**: Cinema Manager / Staff

**Context**: Cinema Venue

**Steps**:
1. Screens are configured (screen name, capacity, seat layout)
2. Shows/screenings are scheduled (movie, screen, date, time)
3. Screen status is managed throughout the day
4. Between shows, screen is cleaned and prepared

**Outcome**: Shows are scheduled and managed

**Connected Modules**: Screens, Shows, Seats

---

## D.2 Cinema Customer Concession Order

**Actor**: Cinema Patron

**Context**: Seat / Screen

**Steps**:
1. Customer scans a QR code at their seat or in the cinema area
2. Customer views the concession menu
3. Customer places an order (food, beverages, snacks)
4. Order is routed to the concession counter
5. Order is prepared
6. Order is delivered to the seat area or customer picks it up
7. Payment is collected (at order time or via tab)

**Outcome**: Concession order fulfilled

**Connected Modules**: QR, Customer Sessions, Catalog, Ordering, Fulfillment, Billing, Payments

> `OPEN DECISION` — Delivery-to-seat vs counter-pickup model.

---

## D.3 Cinema Service Request

**Actor**: Cinema Patron

**Context**: Seat / Screen

**Steps**:
1. Customer submits a service request (e.g., seat issue, temperature, cleanliness)
2. Request is categorized and assigned
3. Staff responds to the request
4. Request is resolved

**Outcome**: Customer service issue addressed

**Connected Modules**: Service Requests, Notifications, Customer Sessions

---

## D.4 Cinema POS (Counter Sales)

**Actor**: Concession Staff

**Context**: Cinema Counter

**Steps**:
1. Customer approaches the concession counter
2. Staff enters items into POS
3. Payment is collected
4. Receipt is generated

**Outcome**: Counter sale completed

**Connected Modules**: POS, Billing, Payments, Inventory (consumption)

---

## D.5 Cinema Ticketing (FUTURE)

> This capability is planned for the future and is **not in initial scope**.

**Conceptual Flow**:
1. Customer selects a show and seat
2. Ticket is reserved/purchased
3. Customer receives a ticket/confirmation
4. Customer arrives and enters the screen
5. Ticket is validated

**Connected Modules** (future): Ticketing, Shows, Seats, Payments

---

# E. Cross-Module Relationships

The following diagram shows how major ASSO modules connect:

```text
                    Customer Entry (QR)
                           │
                    Customer Session
                           │
              ┌────────────┼────────────┐
              │            │            │
         Hotel Context  Restaurant  Cinema Context
              │         Context         │
              │            │            │
              └────────────┼────────────┘
                           │
                ┌──────────┼──────────┐
                │          │          │
            Ordering    Service    Chat
                │       Requests
                │          │
           Fulfillment     │
                │          │
                ▼          │
              Billing ◄────┘
                │
             Payments
                │
         ┌──────┼──────┐
         │      │      │
     Receipts  Cash   Financial
              Mgmt    History
```

### Key Cross-Module Interactions

| Event | Triggers |
|---|---|
| Order Completed | Inventory consumption, billing charge, financial record, notification |
| Payment Received | Cash management update, financial record, receipt generation |
| Expense Recorded | Cash management update (if cash), financial record, reporting |
| Stock Received (Goods Receiving) | Inventory update, financial record (expense/payable) |
| Guest Checkout | Folio settlement, session invalidation, room status change, housekeeping notification |
| Table Turned Over | Session invalidation, table status change |
| Show Ended | Session invalidation for that screen/showtime |

These cross-module interactions should be implemented through **domain events** to maintain clean module boundaries.

---

## E.2 Cross-Vertical Flow: Charge to Room / Folio (Restaurant / Cinema to Hotel)

In mixed-property deployments (for example, a hotel property with an on-site restaurant outlet or cinema hall), customers can charge outlet orders directly to their active hotel stay folio.

**Actor**: Diner / Patron, Restaurant Server / Cinema Cashier, Front Desk Staff

**Context**: Mixed Property (Restaurant / Cinema Outlet ↔ Hotel Room Stay)

**Steps**:
1. Customer dining at a restaurant table or purchasing concessions at a cinema counter requests to charge the bill to their room.
2. Server or cashier selects "Charge to Room" on the outlet POS.
3. Staff enters the room number and guest surname.
4. The system validates server-side:
   - The room has an active, checked-in stay
   - The guest name matches the reservation / stay record
   - Room charge privileges are enabled and credit limit is not exceeded
5. Upon confirmation, the outlet bill is closed under payment method "Room Charge".
6. A charge transaction is posted to the active guest folio with complete outlet metadata (outlet ID, original order number, itemized receipt, server ID, timestamp).
7. Customer signs the digital or printed charge voucher.
8. The guest folio balance updates immediately.
9. At hotel checkout, the front desk presents the consolidated folio including room tariff, room service, restaurant dining, and cinema charges for unified settlement.

**Outcome**: Seamless guest experience across outlets; accurate revenue allocation between outlets and central property folio.

**Connected Modules**: POS, Billing, Guest Folio, Hotel Stays, Payments, Audit, Reporting

**Rules**:
- Cross-outlet folio charging is only permitted within authorized property boundaries.
- Active stay validation and credit ceiling checks are strictly enforced server-side.
- Outlet revenue is credited to the originating outlet's ledger for cross-departmental reconciliation, even though settlement occurs at the front desk.

---

## E.3 Inter-Outlet Inventory Transfer

**Actor**: Outlet Manager, Central Inventory Clerk

**Context**: Property with multiple operating units (e.g., Central Warehouse → Restaurant Kitchen / Cinema Concession)

**Steps**:
1. Outlet manager identifies stock replenishment need and submits a stock transfer request.
2. Central inventory manager reviews and approves the request.
3. Items are dispatched; source stock ledger records outbound movement.
4. Receiving outlet inspects goods upon arrival and confirms receipt.
5. Destination stock ledger records inbound movement; location-specific quantities update.

**Outcome**: Accurate inventory tracking across multiple outlets within a single property.

**Connected Modules**: Inventory, Stock Ledger, Stock Transfers, Audit

---

# F. Open Decisions

| # | Decision | Context |
|---|---|---|
| 1 | QR code model — static vs dynamic | Affects customer entry across all verticals |
| 2 | Multi-device session at same context | Restaurant table with multiple phones |
| 3 | Inventory check at order time vs fulfillment | Affects ordering workflow |
| 4 | Order modification rules after submission | Cancellation window, item changes |
| 5 | Payment providers | Which payment integrations to support |
| 6 | Split bill support | Restaurant and potentially Hotel |
| 7 | Tipping | Whether and how tipping is supported |
| 8 | KDS depth | Multi-station routing, course management |
| 9 | Restaurant Q/waitlist initial scope | Include in initial release or `FUTURE` |
| 10 | Restaurant reservation depth | Basic or advanced reservation system |
| 11 | Cinema delivery model | Seat delivery vs counter pickup |
| 12 | Hotel online booking integration | External booking system integration |
| 13 | Hotel reservation deposits | Prepayment and cancellation policies |
| 14 | Hotel maintenance scope | Depth of maintenance management |
| 15 | Offline POS capability | Whether POS must work offline |
| 16 | Printing requirements | Receipt printing, KDS ticket printing |
| 17 | Multi-currency | Required for initial scope? |
| 18 | Multi-language (i18n) | Required for initial scope? |
| 19 | Recipe / auto-consumption | Future — but design should accommodate it |
| 20 | Cross-tenant customer data | Can a customer's history span multiple businesses? |
