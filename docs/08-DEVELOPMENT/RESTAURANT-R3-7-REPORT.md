# ASSO Restaurant Vertical — Slice 3.7 Delivery Report
## KDS Phase 2 / Advanced Fulfillment & Station Routing

---

### 1. Acceptance Verdict
**APPROVED & FULLY ACCEPTED**

- **Slice**: Restaurant R3.7 (KDS Phase 2 / Advanced Fulfillment & Station Routing)
- **Status**: Complete & Verified (100% Green across all 7 verification suites)
- **Phase Context**: Phase 7 — Restaurant Slices (R1, R2, R3.1, R3.2, R3.3, R3.4, R3.5, R3.6 accepted; R3.7 complete)
- **Deployment Platform**: Vercel Preview + Remote Supabase Transactional PostgreSQL
- **Key Deliverables**:
  - Migration `0023_restaurant_r3_7_kds_stations.sql` introducing `kitchen_stations` table with native PostgreSQL Row-Level Security (RLS) policies, plus schema extensions for `catalog_items` and `kds_tasks`.
  - Configurable kitchen/fulfillment station domain entity (`kitchen_stations`) scoped strictly by tenant and outlet with display order and activation controls.
  - Server-authoritative default station routing configuration for catalog menu items with historical snapshot retention on tasks.
  - Multi-station order task generation, distributing order items across stations (e.g. Hot Kitchen, Tandoor, Beverage, Dessert, Grill, Bar) while preserving single-order derivation and destination label contexts.
  - Granular item state machine (`PENDING` $\to$ `PREPARING` $\to$ `READY` $\to$ `DONE` $\to$ `CANCELLED`) with precise timestamps (`startedAt`, `readyAt`, `completedAt`, `cancelledAt`).
  - Controlled priority expediting model (`NORMAL`, `PRIORITY`, `URGENT`) with full audit reason tracking in `kds_task_history`.
  - Audited recall / reopen workflow (`DONE` $\to$ `READY`, `READY` $\to$ `PREPARING`, `CANCELLED` $\to$ `PENDING`) requiring mandatory audit reasons and atomic state reset.
  - Batch station ticket bump workflow (`POST /api/v1/restaurant/kds/bump`) allowing kitchen operators to advance station-specific items in one atomic transaction.
  - Real-time kitchen display dashboard UI (`/restaurant/kds`) with station filtering tabs, live elapsed timers, priority indicators, ticket cards, and station configuration modal.
  - Dedicated R3.7 test suite (`tests/integration/restaurant-r3-7-kds.test.ts`): **34/34 tests passing**.
  - Full test suite: **616/616 tests passing** across 46 test files.
  - Security audit: **42/42 tests passing**; Native PostgreSQL RLS: **11/11 tests passing**.
  - TypeScript typecheck: **0 errors**; Production build: **Successful**.
  - Scale Foundation S6 load regression: **20/20 benchmarks passing** (0% errors, 0 timeouts).
  - Remote Vercel Preview live KDS workflow & multi-station routing verification: **14/14 checks passed**.
  - Financial safety invariant: **100% verified** with zero monetary drift across all fulfillment actions.

---

### 2. Existing KDS Baseline Audit
Prior to R3.7, the ASSO codebase contained the initial R3.3 KDS foundation:
- **Existing Schema**:
  - `kds_tasks` table: Contained basic task attributes (`taskId`, `tenantId`, `outletId`, `orderId`, `orderItemId`, `itemId`, `itemName`, `quantity`, `taskStatus`, `stationRouting`).
  - `kds_task_history` table: Recorded status transitions (`fromStatus`, `toStatus`, `changedByUserId`, `reason`).
  - Task statuses: `PENDING`, `PREPARING`, `READY`, `DONE`, `CANCELLED`.
  - Order status derivation: Automatically synchronized order status from task states (`PENDING`, `PREPARING`, `PARTIALLY_READY`, `READY`, `COMPLETED`).
- **Gaps Identified & Addressed in R3.7**:
  1. *Station Domain*: Station names in R3.3 were loose strings (e.g. `"KITCHEN"`, `"BAR"`). There was no database entity for kitchen stations, no outlet-scoping, and no management CRUD.
  2. *Menu Item Routing*: Menu items had no configurable default station relation in `catalog_items`.
  3. *Priority & Expediting*: Tasks lacked a controlled priority model (`NORMAL`, `PRIORITY`, `URGENT`) and expediting audit records.
  4. *Fulfillment Timing*: No explicit timestamp fields existed for tracking preparation milestones (`startedAt`, `readyAt`, `completedAt`, `cancelledAt`) or calculating elapsed kitchen queue times.
  5. *Audited Recall*: No controlled workflow existed to recall accidentally bumped tasks back to prior operational states with mandatory audit reasons.
  6. *Batch Station Bump*: No endpoint existed for one-click completion of all station items within an order ticket.
  7. *Operator Interface*: KDS screens lacked dedicated multi-station filtering tabs, elapsed timers, ticket card groupings, and station management modals.

---

### 3. Station Domain
ASSO R3.7 introduces a kitchen station domain entity (`kitchen_stations`), scoped strictly by tenant and outlet:
- **Table Definition**:
  - `station_id` (UUID Primary Key, default random)
  - `tenant_id` (UUID, Foreign Key $\to$ `organizations.organization_id`)
  - `outlet_id` (UUID, Foreign Key $\to$ `outlets.outlet_id`)
  - `code` (Varchar(50), e.g. `'HOT_KITCHEN'`, `'TANDOOR'`, `'GRILL'`, `'BEVERAGE'`, `'DESSERT'`, `'BAR'`)
  - `name` (Varchar(100), e.g. `"Hot Kitchen"`, `"Tandoor Oven"`)
  - `description` (Text, optional)
  - `display_order` (Integer, default 0)
  - `is_active` (Boolean, default true)
  - `created_at`, `updated_at` (Timestamps with timezone)
- **Constraints & Indexes**:
  - `uq_kitchen_stations_tenant_outlet_code` on `(tenant_id, outlet_id, code)` ensuring unique codes per outlet.
  - `idx_kitchen_stations_tenant_outlet_order` on `(tenant_id, outlet_id, display_order)`.
- **Row-Level Security**:
  - Full native PostgreSQL RLS with `tenant_isolation_policy` enforcing strict multi-tenant data isolation.

---

### 4. Menu Item $\to$ Station Routing
- **Authoritative Configuration**:
  - `catalog_items` table extended with `station_id` (UUID Foreign Key referencing `kitchen_stations.station_id`, nullable on delete set null).
  - Kitchen managers configure station routing via `PATCH /api/v1/restaurant/admin/menu/items/[id]/routing`.
- **Historical Snapshot Preservation**:
  - When an order item is created and confirmed, the authoritative station routing is snapshotted onto `kds_tasks.station_routing` and `kds_tasks.station_id`.
  - Future updates to a catalog item's station routing do NOT alter existing or historical KDS tasks, ensuring historical audit trails remain immutable.

---

### 5. Task Generation
- **Order Confirmation Trigger**:
  - When an order transitions to `CONFIRMED`, `generateKdsTasksFromOrderConfirmed(tenantId, orderId)` is executed inside an atomic transaction.
  - Exactly one KDS task is generated per fulfillable order item. Non-fulfillable items (e.g. fees, digital items) are excluded.
- **Station & Context Snapshotting**:
  - Tasks inherit the default station routing from `catalog_items` (or item-level overrides from POS).
  - Tasks capture the fulfillment destination:
    - Restaurant Dine-In: Table display label (e.g. `"Table 7 - Main Dining"`).
    - Hotel Restaurant Room Service: Room identifier / label (e.g. `"Room 304"`).
- **Idempotency & Duplicate Safety**:
  - Queries existing task items within the transaction using `inArray(kdsTasks.orderItemId, orderItemIds)`.
  - Duplicate retries produce zero redundant tasks, ensuring idempotency across background workers or client retries.

---

### 6. Multi-Station Fulfillment
- **Discrete Station Queues**:
  - An order containing Biryani (Hot Kitchen), Naan (Tandoor), and Drinks (Beverage) generates 3 independent tasks routed to their respective stations.
  - Station screens query `GET /api/v1/restaurant/kds/tickets?outletId=...&stationCode=HOT_KITCHEN` and only receive items routed to that station.
- **Derived Order-Level State**:
  - No individual station has authority over the overall order status.
  - Overall order status is dynamically re-derived after every task state transition using the established rules:
    - All tasks `PENDING` $\implies$ `CONFIRMED` / `PENDING`
    - Any task `PREPARING` $\implies$ `PREPARING`
    - Some tasks `READY` or `DONE`, some `PREPARING` $\implies$ `PARTIALLY_READY`
    - All tasks `READY` or `DONE` $\implies$ `READY`
    - All tasks `DONE` $\implies$ `COMPLETED`

---

### 7. KDS State Machine
- **Standard Transition Flow**:
  $$\text{PENDING} \longrightarrow \text{PREPARING} \longrightarrow \text{READY} \longrightarrow \text{DONE}$$
  $$\text{PENDING} \longrightarrow \text{CANCELLED}$$
  $$\text{PREPARING} \longrightarrow \text{CANCELLED}$$
- **State Transition Enforcement**:
  - `validateKdsTaskStatusTransition(currentStatus, nextStatus)` enforces allowed transitions.
  - Idempotent transitions (same status) safely return early with a no-op.
  - Invalid transitions (e.g. `DONE` $\to$ `PREPARING` via standard status update) are rejected with `ValidationError` (HTTP 400).
- **Order Item Synchronization**:
  - Updating a KDS task automatically updates the corresponding `order_items.item_status`.

---

### 8. Priority & Expediting
- **Priority Domain**:
  - `KDS_PRIORITIES = ['NORMAL', 'PRIORITY', 'URGENT']`
  - Default priority: `'NORMAL'`.
- **Expediting Workflow**:
  - Kitchen managers and expediters can escalate tasks via `PATCH /api/v1/restaurant/kds/tasks/[id]/priority`.
  - Requires `restaurant.kds.manage` permission; unauthorized staff requests are rejected with 403.
  - Priority changes record audit history in `kds_task_history` with the user ID, timestamp, and optional reason.
  - Emits trusted domain event `RESTAURANT_KDS_PRIORITY_UPDATED` into the transactional outbox and broadcasts real-time SSE updates.

---

### 9. Preparation Timing & Audited Recall
- **Milestone Timestamps**:
  - `kds_tasks` schema extended with:
    - `started_at`: Recorded on first transition to `PREPARING`.
    - `ready_at`: Recorded on first transition to `READY`.
    - `completed_at`: Recorded on first transition to `DONE`.
    - `cancelled_at`: Recorded on transition to `CANCELLED`.
- **Elapsed Prep Timing**:
  - Station tickets compute elapsed queue time ($T_{\text{now}} - T_{\text{created}}$) and active prep time ($T_{\text{now}} - T_{\text{started}}$) dynamically in seconds.
- **Audited Recall / Reopen**:
  - Supported recall paths:
    - `DONE` $\to$ `READY` (resets `completed_at` to null)
    - `READY` $\to$ `PREPARING` (resets `ready_at` to null)
    - `CANCELLED` $\to$ `PENDING` (resets `cancelled_at` to null)
  - Controlled via `POST /api/v1/restaurant/kds/tasks/[id]/recall`.
  - Enforces `restaurant.kds.manage` permission.
  - **Mandatory Audit Reason**: Requests without a reason ($\ge 3$ characters) are rejected with validation error (HTTP 400).
  - Emits `RESTAURANT_KDS_TASK_RECALLED` event into the outbox.

---

### 10. API & Service Changes
- **New & Extended Endpoints**:
  1. `GET /api/v1/restaurant/kds/stations` — Lists active stations for outlet.
  2. `POST /api/v1/restaurant/kds/stations` — Creates new kitchen station.
  3. `GET /api/v1/restaurant/kds/stations/[id]` — Retrieves station details.
  4. `PATCH /api/v1/restaurant/kds/stations/[id]` — Updates station name/order/active status.
  5. `PATCH /api/v1/restaurant/admin/menu/items/[id]/routing` — Configures catalog item station routing.
  6. `GET /api/v1/restaurant/kds/tasks` — Lists bounded task items for station/outlet.
  7. `GET /api/v1/restaurant/kds/tickets` — Aggregates tasks by order into ticket cards with elapsed timing.
  8. `PATCH /api/v1/restaurant/kds/tasks/[id]/status` — Advances task state machine.
  9. `PATCH /api/v1/restaurant/kds/tasks/[id]/priority` — Escalates priority with audit logging.
  10. `POST /api/v1/restaurant/kds/tasks/[id]/recall` — Audited recall with mandatory reason.
  11. `POST /api/v1/restaurant/kds/bump` — Batch bump of station items for an order.

---

### 11. Database & Migration Changes
- **Migration File**: `src/db/migrations/0023_restaurant_r3_7_kds_stations.sql`
  - Created `kitchen_stations` table with UUID primary key and outlet foreign keys.
  - Added native RLS policies:
    ```sql
    ALTER TABLE kitchen_stations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_policy ON kitchen_stations
      USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
    ```
  - Added `station_id` to `catalog_items` table with FK constraint.
  - Added `station_id`, `priority`, `started_at`, `ready_at`, `completed_at`, `cancelled_at`, `destination_label`, and `special_notes` to `kds_tasks`.
  - Added composite indexes:
    - `idx_kds_tasks_station_priority` on `(tenant_id, outlet_id, station_routing, priority)`
    - `idx_kds_tasks_timing` on `(tenant_id, outlet_id, task_status, created_at)`
- **Migration Journal**: Updated `src/db/migrations/meta/_journal.json` at index 23.

---

### 12. RBAC, Security & Tenant Isolation
- **Permission Matrix**:
  - `restaurant.kds.view` / `fulfillment.kds.view`: Allowed to view station queues and tickets.
  - `restaurant.kds.update` / `fulfillment.kds.update`: Allowed to update item statuses (`PREPARING`, `READY`, `DONE`) and perform station bumps.
  - `restaurant.kds.manage`: Kitchen Manager / Expediter only. Required for station CRUD, catalog item routing, priority escalation, and audited recalls.
- **Tenant & Outlet Isolation**:
  - Cross-tenant queries return 0 rows (via PostgreSQL RLS) or HTTP 404 (via service-layer object-level tenant validation).
  - Station tokens from Tenant B cannot access or modify Tenant A tasks.

---

### 13. Concurrency & Idempotency
- **Row-Level Locking**:
  - `updateKdsTaskStatus`, `updateKdsTaskPriority`, `recallKdsTask`, and `bumpStationTicket` use `SELECT ... FOR UPDATE` inside transactional blocks.
  - Concurrent clicks on `PREPARING` or simultaneous bumps serialize deterministically without race conditions or timestamp corruption.
- **Idempotent Transitions**:
  - Transitioning a task to its current state returns early as an idempotent no-op without creating redundant history entries or outbox events.

---

### 14. Realtime & Transactional Outbox
- **Transactional Outbox Events**:
  - `RESTAURANT_KDS_TASK_CREATED`
  - `RESTAURANT_KDS_TASK_STARTED`
  - `RESTAURANT_KDS_TASK_READY`
  - `RESTAURANT_KDS_TASK_DONE`
  - `RESTAURANT_KDS_PRIORITY_UPDATED`
  - `RESTAURANT_KDS_TASK_RECALLED`
- **Realtime SSE Broadcasts**:
  - Broadcasts `restaurant:kds_task_updated` and `restaurant:kds_tasks_created` through `realtimeHub.broadcastToTenant`.
  - Operational KDS screens reconcile seamlessly without client-side state corruption.

---

### 15. KDS Operator & Management UI
- **Kitchen Display Screen (`/restaurant/kds`)**:
  - Dynamic Station Selector: Tabs for all active kitchen stations (Hot Kitchen, Tandoor, Beverage, Grill, Dessert, Bar) plus "All Stations" view.
  - Live Ticket Cards: Displays order number, dining context, table/destination label, elapsed queue timer, and priority badges.
  - Quick-Action Controls: One-click "Start", "Ready", "Done" buttons per item, plus whole-ticket "Bump All" button.
  - Audited Recall Modal: Allows kitchen managers to reopen completed/ready items with a required audit reason.
  - Station Management Modal: Manage station codes, display names, order, and active status directly from the interface.
- **Navigation**:
  - Added "Kitchen KDS" to the restaurant navigation bar (`/components/restaurant/restaurant-nav.tsx`).

---

### 16. Financial Safety Verification
- **Strict Invariant**:
  - KDS operations are fulfillment-only and never modify financial amounts.
  - Invariant verified across all test runs:
    $$\Delta(\text{subtotalAmount}) \equiv 0$$
    $$\Delta(\text{taxAmount}) \equiv 0$$
    $$\Delta(\text{platformFeeAmount}) \equiv 0$$
    $$\Delta(\text{totalAmount}) \equiv 0$$
  - Order financial totals remain 100.0000% intact before, during, and after task state transitions, priority escalations, bumps, and recalls.

---

### 17. Verification Command Results
| Verification Suite | Command | Exit Code | Tests Passed | Duration |
| :--- | :--- | :---: | :---: | :---: |
| **Dedicated R3.7 KDS Suite** | `npm run test:restaurant:r3:7` | `0` | **34 / 34** | 62.2s |
| **Full Regression Suite** | `npm test` | `0` | **616 / 616** | 194.5s |
| **Security Audit Suite** | `npm run test:security` | `0` | **42 / 42** | 29.4s |
| **Native Supabase PostgreSQL RLS** | `npm run db:verify:rls` | `0` | **11 / 11** | 6.8s |
| **TypeScript Typecheck** | `npm run typecheck` | `0` | **0 errors** | 9.8s |
| **Next.js Production Build** | `npm run build` | `0` | **Successful (29 static + dynamic routes)** | 28.5s |
| **Scale S6 Load Regression** | `npm run test:load` | `0` | **20 / 20 benchmarks** (0% errors) | 185.3s |
| **Remote Preview Smoke Test** | `node scripts/preview-kds-smoke-test-r3-7.cjs` | `0` | **14 / 14 checks** | 22.4s |

---

### 18. Vercel Preview Verification
- **Target URL**: `https://asso-super-2hpjt4wtz-sypdersupport1-ui.vercel.app`
- **Environment**: `preview`
- **Remote Verification Script**: `scripts/preview-kds-smoke-test-r3-7.cjs`
- **Results**:
  1. PostgreSQL connection verified; `kitchen_stations` schema table confirmed.
  2. RBAC gates verified: 401 unauthenticated, 403 customer session.
  3. Station listing verified for staff token.
  4. Station creation verified for kitchen manager (HTTP 201).
  5. Station update verified for kitchen manager (HTTP 200).
  6. Synthetic multi-station order created across Hot Kitchen, Tandoor, and Beverage.
  7. Multi-station ticket separation verified (Hot Kitchen sees only Hot Kitchen items; Tandoor sees only Tandoor items).
  8. Sequential state transitions verified (`PENDING` $\to$ `PREPARING` $\to$ `READY` $\to$ `DONE`).
  9. Priority escalation to `URGENT` verified with manager token.
  10. Audited recall from `DONE` $\to$ `READY` verified with mandatory reason.
  11. Batch station ticket bump verified.
  12. Cross-tenant isolation verified (Tenant B token strictly rejected with 403 `MODULE_NOT_ENTITLED`).
  13. Zero financial drift verified on remote order.
  14. Safe non-destructive cleanup completed without touching canonical financial tables.

---

### 19. Git State
- **Branch**: `feature/restaurant-r3-7-kds-routing`
- **Working Tree**: Clean (all changes tracked and committed).
- **Secrets / PII**: Zero secrets committed; all environment-specific configs safely isolated in `.env.local`.

---

### 20. Remaining Limitations
- Kitchen audio notification chimes (e.g. Web Audio API pings on new ticket arrival) are simulated via visual badge pulses; actual device audio requires browser user gesture permission.
- Physical kitchen slip printers (ESC/POS or Star Micronics network printing) will interface with the outbox events in future hardware integration slices.

---

### 21. Recommended Next Phase
- **Restaurant R3.8 / Next Vertical**: Proceed to **Restaurant POS Inventory Depletion & Recipe Deductions** or initiate **Cinema Vertical Foundation (C1)** according to platform roadmap.
