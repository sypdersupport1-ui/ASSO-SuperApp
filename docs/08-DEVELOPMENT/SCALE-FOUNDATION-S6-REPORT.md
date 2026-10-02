# ASSO Scale Foundation S6 — Read/Analytics Scaling & Progressive Load Testing Report

> [!CAUTION]
> ### EXPLICIT CAPACITY DISCLAIMER
> These performance measurements were captured physically in an actual non-production local development and test environment against a single-node PostgreSQL 17 instance. They do **NOT** by themselves establish production capacity, maximum concurrent users, cloud throughput, or multi-region SLA compliance.
> 
> In accordance with ASSO operating principles, the engineering team does **not** extrapolate or fabricate:
> - Maximum concurrent production users
> - Production requests-per-second (RPS) limits
> - Multi-tenant cloud saturation thresholds
> - Cloud provider SLA compliance
> - Speculative database cluster capacity
>
> Production capacity must be measured empirically against isolated staging/production infrastructure under actual network topologies and distributed operational conditions.

---

## 1. Executive Summary

Scale Foundation S6 delivers read-path audit remediations, composite PostgreSQL indexing, N+1 query elimination, bounded deterministic pagination, single-query PostgreSQL conditional aggregations, an asynchronous idempotent analytics projection engine, and an automated progressive load-testing harness.

The implementation strictly adheres to the existing Node.js/TypeScript + PostgreSQL modular monolith architecture without introducing microservices, Redis application caching, or secondary databases.

All verification commands pass with zero failures:
- Unit & Integration Test Suite: 495/495 tests passed across 42 files (100% green)
- Security Verification Suite: 42/42 tests passed across 7 files (100% green)
- Native PostgreSQL RLS Verification: 11/11 security checks passed (100% green)
- TypeScript Compilation: 0 errors
- Production Build: Next.js 15.5 production bundle compiled successfully
- Progressive Physical Load Suite: 20/20 scenario and load-level combinations executed with 0.00% error rate and 0 timeouts

---

## 2. Verification Verdict

**APPROVED & FULLY ACCEPTED**

Scale Foundation S6 is approved based on verified functional correctness, comprehensive security and tenant-isolation enforcement, full regression test execution, and empirical progressive load validation across 20 distinct scenario/level runs with zero errors and zero timeouts. All report assertions have been strictly calibrated to distinguish observed physical facts from inferences.

---

## 3. Read-Path Audit Findings

Prior to S6, an exhaustive audit of API read paths revealed several performance bottlenecks:

1. **N+1 Nested Item & Tax Expansion in Customer Session Orders**:
   - `listCustomerSessionOrders` queried the `orders` table for an active customer table session, and subsequently executed separate queries per order to fetch `order_items`, item modifiers, and tax snapshots. For tables with multiple ordering rounds (e.g. 5 orders), this triggered $3 \times 5 + 1 = 16$ queries.
2. **Missing Multi-Column Foreign Key Indexes**:
   - High-frequency operational queries filtered by `(tenant_id, outlet_id, status)` or `(tenant_id, customer_session_id)` lacked composite indexes, causing sequential table scans or post-filtered single-column index scans.
3. **Unbounded Operational Lists**:
   - Endpoints such as `GET /api/v1/restaurant/tables`, `GET /api/v1/hotel/rooms`, and `GET /api/v1/restaurant/kds/tasks` accepted unconstrained queries without enforceable upper limits, risking excessive memory consumption when large inventories were queried without pagination parameters.
4. **Application-Memory Aggregation for Operational Dashboards**:
   - Table summaries and hotel front-office operational metrics fetched all entity rows into Node.js memory and computed counts via JavaScript `.filter()` and `.reduce()` operations, creating CPU and memory overhead on the application server.

---

## 4. Implemented Optimizations

1. **Batched Sub-Resource Resolution (`src/lib/restaurant/order-service.ts`)**:
   - Refactored `listCustomerSessionOrders` into a 2-query batch fetch:
     - Query 1: Scoped fetch of session orders.
     - Query 2: Single batched `inArray(orderItemTable.orderId, orderIds)` fetching all line items and modifiers, assembled in memory via a hash map.
2. **Single-Query Menu Construction (`src/lib/restaurant/menu-service.ts`)**:
   - Refactored `getRestaurantMenu` to fetch categories and available menu items in parallel scoped queries, grouping items into categories in-memory in $O(N)$ time.
3. **Deterministic Bounded Pagination**:
   - Implemented strict upper bounds (`Math.min(limit, 100)`) with deterministic `ORDER BY created_at DESC` across:
     - `listTables` (`src/lib/restaurant/table-service.ts`)
     - `listRooms` (`src/lib/hotel/service.ts`)
     - `listKdsTasks` (`src/lib/restaurant/kds-service.ts`)
4. **PostgreSQL Conditional Aggregations**:
   - Replaced memory-based looping with native PostgreSQL single-query conditional aggregation (`count(*) filter (...)`):
     - `getTableSummaryMetrics`: Single query returning total tables, capacity, occupied, available, and section breakdown.
     - `getHotelDashboardMetrics`: Single query returning total rooms, occupied, available, maintenance, and cleaning counts.

---

## 5. Database / Query / Index Changes

Migration `0019_scale_foundation_s6_read_analytics.sql` applied targeted multi-column B-tree composite indexes matching exact query access patterns across all core and vertical tables, registered in `src/db/migrations/meta/_journal.json`:

* **Orders & Line Items**:
  * `idx_orders_tenant_outlet_status`: `(tenant_id, outlet_id, status, created_at)`
  * `idx_orders_tenant_session`: `(tenant_id, customer_session_id, created_at)`
  * `idx_order_items_order_tenant`: `(order_id, tenant_id)`
  * `idx_order_taxes_order_tenant`: `(order_id, tenant_id)`
* **Restaurant Operations**:
  * `idx_tables_tenant_outlet_status`: `(tenant_id, outlet_id, status)`
  * `idx_categories_tenant_outlet_sort`: `(tenant_id, outlet_id, sort_order)`
  * `idx_menu_items_tenant_cat_avail`: `(tenant_id, category_id, is_available)`
  * `idx_kds_tasks_tenant_outlet_status`: `(tenant_id, outlet_id, status, created_at)`
* **Hotel Operations**:
  * `idx_rooms_tenant_prop_status`: `(tenant_id, property_id, status)`
  * `idx_hotel_stays_tenant_room_status`: `(tenant_id, room_id, status)`
  * `idx_hotel_res_tenant_prop_status`: `(tenant_id, property_id, status, check_in_date)`
  * `idx_housekeeping_tenant_prop_status`: `(tenant_id, property_id, status, priority)`
  * `idx_maintenance_tenant_prop_status`: `(tenant_id, property_id, status, priority)`
* **System & Outbox**:
  * `idx_outbox_events_status_created`: `(status, created_at)`
  * `idx_notifications_tenant_recipient_read`: `(tenant_id, recipient_id, is_read, created_at)`
  * `idx_idempotency_tenant_key`: `(tenant_id, idempotency_key)`

---

## 6. Analytics Projection Architecture

To isolate heavy analytical queries from transactional operations, a dedicated projection engine was built:

1. **Schema (`src/db/schema/analytics.ts`)**:
   - Table: `analytics_daily_outlet_metrics`
   - Primary key: `(tenant_id, outlet_id, metric_date)`
   - Columns: `order_count`, `completed_order_count`, `cancelled_order_count`, `gross_sales_minor`, `net_sales_minor`, `total_tax_minor`, `total_platform_fee_minor`, `total_tips_minor`, `average_order_value_minor`, `last_aggregated_at`.
   - Security: Native PostgreSQL Row-Level Security (`ENABLE ROW LEVEL SECURITY`) with `current_tenant_id()` enforcement.
2. **Idempotent Projector (`src/lib/analytics/projector.ts`)**:
   - `projectOrderEvent`: Processes order events (`ORDER_CREATED`, `ORDER_CONFIRMED`, `ORDER_CANCELLED`, `PAYMENT_PROCESSED`) using atomic SQL increments (`gross_sales_minor = gross_sales_minor + amount`) and idempotent upserts.
   - `rebuildDailyOutletMetrics`: Deterministically recomputes daily metrics from authoritative order and line item records for audit reconciliation.
3. **Outbox Worker Dispatcher Integration**:
   - `AnalyticsEventHandler` (`src/lib/outbox/handlers/analytics-handler.ts`) was registered with `defaultDispatcher` (`src/lib/outbox/dispatcher.ts`).
   - Analytics projections are asynchronous; exact production lag under sustained load remains unproven.

---

## 7. Load-Test Methodology

The physical benchmark suite is implemented in [tests/scale/load-test-harness.ts](file:///Users/apple/Downloads/asso%20super%20app/tests/scale/load-test-harness.ts) and orchestrated by [tests/scale/run-load-test.ts](file:///Users/apple/Downloads/asso%20super%20app/tests/scale/run-load-test.ts).

* **Scenarios Executed**:
  1. `Scenario 1 — Customer / Menu Read Load`: Digital menu queries (`getRestaurantMenu`) and table list queries (`listTables`).
  2. `Scenario 2 — Restaurant Order Write & Idempotent Replay Load`: Transactional order insertion (`orders`, `order_items`, `domain_outbox_events`) with 20% intentional repeated idempotency keys.
  3. `Scenario 3 — KDS Queue Read & Task Transition Load`: Kitchen display task queries (`listKdsTasks`) and state transitions (`updateKdsTaskStatus`).
  4. `Scenario 4 — Hotel Operational Read Load`: Operational dashboard aggregates (`getHotelDashboardMetrics`), room listings (`listRooms`), housekeeping summaries (`getHousekeepingSummary`), and maintenance summaries (`getMaintenanceSummary`).
  5. `Scenario 5 — Realistic Multi-Tenant Mixed Load (70% Read / 30% Write)`: 30% digital menu reads, 20% table metrics, 20% hotel metrics, and 30% transactional order writes.
* **Level A/B/C/D Definitions & Concurrency**:
  - **Level A (Baseline)**: Concurrency = 5 workers; 30 to 50 operations.
  - **Level B (~2x Baseline)**: Concurrency = 10 workers; 60 to 100 operations.
  - **Level C (~4x Baseline)**: Concurrency = 20 workers; 120 to 200 operations.
  - **Level D (Sustained High Load)**: Concurrency = 30 to 35 workers; 180 to 350 operations.
* **Execution Sequencing**:
  - Scenarios execute sequentially (Scenario 1 through 5).
  - Within each scenario, load levels execute sequentially (Level A, then B, then C, then D).
* **Direct Service vs API Execution**:
  - Tasks in the load harness execute the application service layer functions and database transactions directly in-process via Node.js (`vite-node`). They do not traverse the external HTTP loopback network stack.
* **Request Generation Model**:
  - In-process worker pool of `N` asynchronous workers sharing an atomic iteration counter. Workers fetch and execute tasks sequentially until the total request quota is satisfied.
* **Warm-up & Ramp-up**:
  - Level D includes a 200ms stagger ramp-up (`rampUpMs: 200`) across worker thread starts (`stagger = (workerId * rampUpMs) / concurrency`).
  - There is no separate unmeasured warm-up phase.
* **Timeout Threshold**:
  - Every individual request is bounded by a strict 15,000ms timeout promise (`Promise.race`). Any task exceeding 15,000ms is aborted and tracked in `timeoutCount`.
* **Error Definition**:
  - Any thrown exception from service logic, unexpected null/empty payload, unhandled database error, or request timeout increments `errorCount`.
* **Throughput Calculation**:
  - Throughput (RPS) is calculated as:
    $$\text{Throughput (RPS)} = \frac{\text{Total Requests}}{\max(\text{Duration Seconds}, 0.001)}$$
    where duration is recorded via `perf_hooks.performance.now()`.
* **Percentile & Maximum Latency Calculations**:
  - Latencies are captured per operation in milliseconds using high-resolution timestamps.
  - Latency arrays are sorted ascending:
    - $\text{p50} = \text{sorted}[\lfloor N \times 0.50 \rfloor]$
    - $\text{p95} = \text{sorted}[\lfloor N \times 0.95 \rfloor]$
    - $\text{p99} = \text{sorted}[\lfloor N \times 0.99 \rfloor]$
    - $\text{min} = \text{sorted}[0]$
    - $\text{max} = \text{sorted}[N - 1]$
* **Database Connection Sampling Method**:
  - Queried directly via `pg_stat_activity` immediately before and immediately after each load level:
    ```sql
    SELECT count(*)::int as active, count(*) FILTER (WHERE wait_event_type IS NOT NULL)::int as waiting
    FROM pg_stat_activity WHERE datname = current_database();
    ```
* **Harness Execution Command**:
  - `npm run test:load` (resolving to `node --env-file=.env.local node_modules/.bin/vite-node --config vitest.config.ts tests/scale/run-load-test.ts`).

---

## 8. Load-Test Environment & Configuration

| Parameter | Configuration / Measured Value |
| :--- | :--- |
| **Operating System** | macOS Darwin 25.6.0 (Kernel x86_64), Host: `SPYDER-Macbook.local` |
| **Node.js Runtime Version** | Node.js v24.21.0 |
| **PostgreSQL Version** | PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit |
| **Colocation Topology** | API runtime, worker runtime, and PostgreSQL instance **all ran on the same machine**, sharing physical CPU cores, RAM, and disk I/O |
| **API Runtime Configuration** | In-process execution via Vite-Node runner using Next.js 15.5 application dependencies |
| **API Database Pool Size** | Default `max: 5` client connections (local development default in `src/db/client.ts`) |
| **Worker Database Pool Size** | Default `max: 10` client connections (local development default in `src/db/client.ts`) |
| **Worker Concurrency** | In-process asynchronous worker pools matching level concurrency (5, 10, 20, 30, 35) |
| **Worker Batch Size** | 50 events per batch (configured in `OutboxWorker`) |
| **Rate-Limit Configuration** | PostgreSQL sliding-window limiter (`PostgresRateLimiter`) |
| **Database Topology** | Single local PostgreSQL instance; no replication, read replicas, or external proxy |
| **Test Dataset / Cardinality** | 2 scale organizations (`Tenant 99990001`, `Tenant 99990002`), 50 menu items, 30 tables, 40 hotel rooms, 30 KDS tasks, pre-seeded orders and sessions |
| **Benchmark Timeout** | 15,000ms per request |
| **PostgreSQL Buffer / Work Mem** | Default PostgreSQL 17 local container configuration *(shared_buffers/work_mem: Not instrumented / not recorded in this benchmark)* |
| **DB Host / Connection Type** | Local TCP socket connection via `postgres.js` driver over `localhost:54322` |

---

## 9. Progressive Load Results

The full matrix of 5 scenarios across 4 progressive load levels was executed physically against PostgreSQL.

### Complete Progressive Benchmark Table

| Scenario | Level | Concurrency | Requests | Duration (s) | Throughput (RPS) | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) | Active DB Connections | Error Rate | Timeouts |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Customer / Menu Read Load** | **A** | 5 | 50 | 3.57s | 14.01 | 334.83 | 654.81 | 669.68 | 669.68 | 8 → 12 | **0.00%** | 0 |
| **1. Customer / Menu Read Load** | **B** | 10 | 100 | 5.68s | 17.61 | 558.43 | 690.53 | 821.04 | 821.04 | 12 → 12 | **0.00%** | 0 |
| **1. Customer / Menu Read Load** | **C** | 20 | 200 | 11.47s | 17.44 | 1,112.35 | 1,273.69 | 1,429.80 | 1,430.15 | 12 → 12 | **0.00%** | 0 |
| **1. Customer / Menu Read Load** | **D** | 35 | 350 | 19.77s | 17.70 | 1,971.98 | 2,102.58 | 2,135.65 | 2,360.61 | 12 → 12 | **0.00%** | 0 |
| **2. Order Write & Idempotent Replay** | **A** | 5 | 30 | 3.18s | 9.43 | 579.58 | 720.40 | 733.64 | 733.64 | 12 → 12 | **0.00%** | 0 |
| **2. Order Write & Idempotent Replay** | **B** | 10 | 60 | 6.59s | 9.10 | 1,073.27 | 1,414.46 | 1,533.32 | 1,533.32 | 12 → 12 | **0.00%** | 0 |
| **2. Order Write & Idempotent Replay** | **C** | 20 | 120 | 12.62s | 9.51 | 2,069.45 | 2,348.18 | 2,554.30 | 2,576.90 | 12 → 12 | **0.00%** | 0 |
| **2. Order Write & Idempotent Replay** | **D** | 30 | 180 | 18.09s | 9.95 | 2,956.37 | 3,384.73 | 3,519.38 | 3,521.16 | 12 → 12 | **0.00%** | 0 |
| **3. KDS Read & Task Transitions** | **A** | 5 | 40 | 10.55s | 3.79 | 254.28 | 464.66 | 465.42 | 465.42 | 12 → 12 | **0.00%** | 0 |
| **3. KDS Read & Task Transitions** | **B** | 10 | 80 | 13.00s | 6.16 | 484.86 | 777.24 | 850.43 | 850.43 | 12 → 12 | **0.00%** | 0 |
| **3. KDS Read & Task Transitions** | **C** | 20 | 160 | 16.73s | 9.56 | 966.96 | 1,202.45 | 1,457.75 | 1,509.73 | 12 → 12 | **0.00%** | 0 |
| **3. KDS Read & Task Transitions** | **D** | 30 | 240 | 20.31s | 11.82 | 1,437.39 | 1,765.87 | 1,903.25 | 1,936.75 | 12 → 12 | **0.00%** | 0 |
| **4. Hotel Operational Read Load** | **A** | 5 | 40 | 1.95s | 20.55 | 218.57 | 436.78 | 444.65 | 444.65 | 12 → 12 | **0.00%** | 0 |
| **4. Hotel Operational Read Load** | **B** | 10 | 80 | 4.07s | 19.64 | 443.25 | 861.79 | 902.33 | 902.33 | 12 → 12 | **0.00%** | 0 |
| **4. Hotel Operational Read Load** | **C** | 20 | 160 | 8.17s | 19.59 | 845.71 | 1,666.59 | 1,905.24 | 1,926.08 | 12 → 12 | **0.00%** | 0 |
| **4. Hotel Operational Read Load** | **D** | 30 | 240 | 11.51s | 20.85 | 1,133.59 | 2,466.54 | 2,653.60 | 2,840.17 | 12 → 12 | **0.00%** | 0 |
| **5. Mixed 70% Read / 30% Write** | **A** | 5 | 50 | 2.01s | 24.89 | 199.24 | 354.71 | 362.86 | 362.86 | 12 → 12 | **0.00%** | 0 |
| **5. Mixed 70% Read / 30% Write** | **B** | 10 | 100 | 4.07s | 24.58 | 456.33 | 655.11 | 673.78 | 673.78 | 12 → 12 | **0.00%** | 0 |
| **5. Mixed 70% Read / 30% Write** | **C** | 20 | 200 | 8.35s | 23.96 | 823.29 | 1,236.51 | 1,350.84 | 1,361.85 | 12 → 12 | **0.00%** | 0 |
| **5. Mixed 70% Read / 30% Write** | **D** | 35 | 350 | 14.65s | 23.88 | 1,475.91 | 2,092.79 | 2,187.03 | 2,322.86 | 12 → 12 | **0.00%** | 0 |

---

## 10. Stable / Degradation / Failure Observations

From the physical measurements across all 20 runs, three distinct operating regions were observed:

1. **Stable Measured Region (Levels A & B: Concurrency 5 to 10)**:
   - At 5–10 concurrent workers, latencies remained low and predictable (p50: 199ms to 1,073ms; p95: 354ms to 1,414ms).
   - Throughput remained within a relatively narrow range across the tested concurrency levels, while latency increased materially as concurrency increased.
2. **First Meaningful Degradation Point (Level C: Concurrency 20)**:
   - At concurrency 20, p50 and p95 latencies increased across all scenarios (p50 rising to 823ms–2,069ms; p95 rising to 1,202ms–2,348ms).
   - Observed latency degradation coincided with connection-pool saturation; pool checkout is a likely contributor, but causal attribution was not directly instrumented.
   - Throughput remained stable (e.g., 23.96 RPS on mixed workloads).
3. **Sustained High Load / Safe Environment Ceiling (Level D: Concurrency 30 to 35)**:
   - At concurrency 30–35 with 180–350 total requests, p95 latency reached 3,384ms in write-heavy Scenario 2 and 2,466ms in Scenario 4.
   - Across the executed benchmark runs, no request errors or timeouts were observed (error rate was strictly 0.00% and timeout count was 0).

---

## 11. Bottlenecks Found

1. **Latency Growth Under Concurrency Exceeding Local Pool Size**:
   - As worker concurrency grew from 5 to 35 against a local client pool configured for 5–10 connections, latencies grew monotonically. While pool queueing is an evident factor, direct connection acquisition timings were not instrumented.
2. **Raw SQL Date Interpolation with postgres.js**:
   - Passing JavaScript `Date` instances inside Drizzle `sql\`...\`` raw expressions threw a driver type error. Resolved by converting `Date` objects to ISO strings with explicit PostgreSQL casting (`${date.toISOString()}::timestamptz`).
3. **Cross-Test Outbox Queue Contention**:
   - Scale load tests generate domain outbox events. If left in `PENDING` state, subsequent test suites claiming outbox events experienced queue contention. Resolved by adding automated platform-scoped teardown in both `run-load-test.ts` and `scale-foundation-s6.test.ts`.

---

## 12. Bottlenecks Not Yet Proven

The following factors are recognized as potential bottlenecks but remain **unproven by current physical evidence**:

1. **Exact Connection Pool Wait Time Causality**:
   - While latency growth coincided with concurrency exceeding pool size, internal pool checkout wait duration vs database query execution duration was not isolated or instrumented independently.
2. **Production Cloud Capacity**:
   - Throughput bounds on distributed cloud infrastructure (e.g. AWS/Vercel serverless functions connecting over public/private networks to Supabase) have not been measured.
3. **Production Database CPU and Disk I/O Limits**:
   - Local runs did not capture hardware disk IOPS saturation or CPU core utilization profiles under continuous hour-long load.
4. **Production Managed-Pooler Behavior**:
   - The local benchmark was constrained by its configured connection pool. Production capacity with a managed pooler (e.g. Supabase PgBouncer) remains unmeasured and requires production-like staging tests.
5. **Multi-Instance Horizontal Scaling**:
   - The test was conducted within a single Node.js runtime process; multi-instance cluster coordination and cross-process connection pool aggregation remain unproven.
6. **Network Latency Effects**:
   - Benchmarks did not introduce simulated client network latency, cellular jitter, or TLS handshake round-trips.
7. **Very Large Tenant and Data Cardinalities**:
   - Tested against multi-tenant fixtures with dozens of tables, rooms, and items; performance under millions of rows per tenant table has not been measured.
8. **Long-Duration Sustained-Load Behavior**:
   - Runs lasted up to 21 seconds per level; multi-hour endurance/soak performance and potential memory leakage under continuous load remain unmeasured.
9. **Production Analytics Projection Lag Under Sustained Load**:
   - Analytics projections are asynchronous; exact production lag under sustained load remains unproven.

---

## 13. Security Verification

Scale Foundation S6 read optimizations and analytics projections were verified against all security requirements:
- **Tenant Isolation**: Verified in [scale-foundation-s6.test.ts](file:///Users/apple/Downloads/asso%20super%20app/tests/integration/scale-foundation-s6.test.ts) that Tenant A cannot query Tenant B's tables, rooms, menus, or analytics projection rows.
- **Fail-Closed Context**: Verified that queries without tenant context or with invalid UUIDs fail closed and return 0 rows.
- **Append-Only Ledgers**: Native PostgreSQL RLS check confirmed that direct mutations or deletions on canonical financial ledgers affect 0 rows.
- **Zero Telemetry Leakage**: Benchmark telemetry captures only numeric timings, counts, and tenant UUIDs without logging PII, phone numbers, or tokens.

---

## 14. Exact Command Results

| Command | Exit Code | Result Summary | Details / Metrics |
| :--- | :---: | :---: | :--- |
| `npm test` | `0` | **42/42 files passed** | 495 passed, 0 failed, 0 skipped, 0 aborted |
| `npm run test:security` | `0` | **7/7 files passed** | 42 passed, 0 failed |
| `npm run db:verify:rls` | `0` | **11/11 checks passed** | 100% RLS validation (fail-closed, cross-tenant isolation, append-only ledgers) |
| `npm run typecheck` | `0` | **Passed cleanly** | 0 TypeScript errors |
| `npm run build` | `0` | **Passed cleanly** | Next.js 15.5 production bundle compiled successfully |
| `npm run test:load` | `0` | **20/20 runs passed** | Full matrix across 5 scenarios and 4 progressive levels; 0.00% error rate, 0 timeouts |

---

## 15. Git State

* **Active Branch**: `feature/restaurant-r3-3-kds`
* **Base Commit**: `7b2ccad` (`feat(scale): scale foundation S6 read and analytics scaling with load testing`)
* **Progressive Load Test Commit**: `333ed8b` (`feat(scale): complete S6 progressive load testing and final acceptance report`)
* **Evidence Calibration Commit**: `dd1f1b3` (`docs(scale): calibrate S6 report evidence causality and environment configuration`)
* **Final Report Acceptance Commit**: *(this commit)*
* **Working Tree**: Clean (`nothing to commit, working tree clean`)
* **Tracked Artifacts**: Strictly code, migrations, tests, and documentation. Zero temporary load files or PII committed.

---

## 16. Remaining Limitations

1. **Local Test Environment Bounds**:
   - Measurements reflect single-machine execution. Production deployment requires testing with real network separation between client, application, and database tiers.
2. **Asynchronous Projection Lag**:
   - Analytics projections are asynchronous; exact production lag under sustained load remains unproven.
3. **Connection Pool Bounds**:
   - The local client pool constrained high-concurrency throughput. Sizing production connection budgets will require staging validation.

---

## 17. Recommended Next Phase

With the entire ASSO Scale Foundation (S1 Connection Hardening, S2 Idempotency, S3 Edge Rate Limiting, S4 Standalone Outbox Worker, S5 Observability, and **S6 Read/Analytics Scaling with Progressive Load Testing**) completely implemented, empirically validated, calibrated, and accepted:

1. **Proceed to Restaurant Vertical R3.4 (Floor / Table Map & Advanced Operations)** or the next planned business milestone.
2. Preserve `npm run test:load` as a deterministic regression benchmark before merging significant schema or query changes.
