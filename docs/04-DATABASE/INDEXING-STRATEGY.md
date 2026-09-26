# ASSO Database Indexing Strategy & Performance Specification

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 3)  
> **Authority:** Aligned with `DATABASE-SCHEMA.md` and High-Concurrency Operational SLA  

---

## 1. Indexing Philosophy & Architectural Rules

1. **Multi-Tenant Composite Indexing:** Every index on a tenant-partitioned table MUST include `tenant_id` as the leading column. This allows PostgreSQL index scans to prune all other tenant partitions immediately.
2. **Outlet Filtering:** For outlet-level queries (e.g., KDS, Waitlist, Housekeeping), the standard index prefix is `(tenant_id, outlet_id, ...)`.
3. **No Redundant Single-Column Indexes:** If a composite index `(tenant_id, outlet_id, status)` exists, do NOT create an isolated index on `tenant_id`.
4. **Partial Indexes for Hot Operational Sets:** Only a tiny fraction of historical rows are in an active state (e.g., open orders, pending housekeeping, unexpired sessions). Partial indexes (`WHERE status = '...'` or `WHERE deleted_at IS NULL`) keep working indexes compact in memory.
5. **Foreign Key Indexing:** Every foreign key column that participates in joins or cascade checks must have an index to avoid full table scans during parent deletes or joins.

---

## 2. Core Operational Index Catalog

### 2.1 Multi-Tenancy & Identity Indexes

```sql
-- Outlets: Lookup by tenant and active status
CREATE INDEX idx_outlets_tenant_active ON outlets (tenant_id, is_active);

-- Staff Profiles: Lookup by tenant, user, and active employment
CREATE INDEX idx_staff_tenant_user ON staff_profiles (tenant_id, user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_staff_outlet ON staff_profiles (outlet_id) WHERE is_active = true;

-- Staff Roles: Lookup role assignments by staff profile
CREATE INDEX idx_staff_roles_staff ON staff_roles (staff_id, role_id);
```

### 2.2 QR Context & Ephemeral Sessions Indexes

```sql
-- QR Token Resolution: High-frequency lookup by opaque token string
-- Note: UNIQUE constraint already creates an index, but we ensure lowercase/case-sensitive consistency
CREATE UNIQUE INDEX idx_qr_tokens_opaque ON qr_tokens (opaque_token) WHERE token_status = 'ACTIVE';

-- Context Lookup by Outlet and Type
CREATE INDEX idx_contexts_outlet_type ON business_contexts (outlet_id, context_type) WHERE is_active = true;

-- Customer Session Active Lookup (Partial index for ultra-fast session validation)
CREATE INDEX idx_customer_sessions_active ON customer_sessions (token_id, device_fingerprint) 
    WHERE session_status = 'ACTIVE';
```

### 2.3 Shared Ordering Engine & KDS Indexes

```sql
-- Active Orders Query: POS and KDS lookups for open orders
CREATE INDEX idx_orders_active_kds ON orders (tenant_id, outlet_id, status, created_at DESC)
    WHERE status IN ('PLACED', 'ACCEPTED', 'IN_PREPARATION', 'READY');

-- Context Orders (e.g. get active orders for Room 302 or Table 5)
CREATE INDEX idx_orders_context_active ON orders (tenant_id, context_id, status)
    WHERE status NOT IN ('COMPLETED', 'CANCELLED');

-- Order Items KDS Station Routing (Kitchen vs Bar screens)
CREATE INDEX idx_order_items_station ON order_items (tenant_id, fulfillment_station, item_status)
    WHERE item_status IN ('PLACED', 'ACCEPTED', 'PREPARING');

-- Order Items by Order FK
CREATE INDEX idx_order_items_order_fk ON order_items (order_id);
```

### 2.4 Billing & Payments Indexes

```sql
-- Open Bills by Context (e.g., Table or Room checkout)
CREATE INDEX idx_bills_context_open ON bills (tenant_id, context_id, status)
    WHERE status IN ('OPEN', 'PARTIALLY_SETTLED');

-- Payment Idempotency Key Lookup
CREATE UNIQUE INDEX idx_payments_idempotency ON payment_transactions (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Gateway Transaction Reference Lookup (for webhook event matching)
CREATE INDEX idx_payments_gateway_ref ON payment_transactions (gateway_provider, gateway_transaction_reference);
```

### 2.5 Shared Inventory & Movement Ledger Indexes

```sql
-- Stock Balances: Current quantity lookup by location and item
CREATE UNIQUE INDEX idx_stock_balances_lookup ON inventory_stock_balances (location_id, item_id);

-- Low Stock Reorder Alert Scan
CREATE INDEX idx_inventory_items_reorder ON inventory_items (tenant_id, category)
    WHERE is_active = true;

-- Stock Movements Ledger: Historical audit trail sorted chronologically
CREATE INDEX idx_stock_movements_audit ON inventory_stock_movements (tenant_id, outlet_id, item_id, created_at DESC);

-- Movements by Location
CREATE INDEX idx_stock_movements_location ON inventory_stock_movements (location_id, created_at DESC);
```

### 2.6 Hotel Specific Indexes

```sql
-- Hotel Rooms: Room status and housekeeping lookup
CREATE INDEX idx_hotel_rooms_status ON hotel_rooms (outlet_id, housekeeping_status, is_occupied);

-- Active Guest Stays (Currently checked-in guests)
CREATE INDEX idx_hotel_stays_active ON hotel_stays (outlet_id, room_id, status)
    WHERE status = 'CHECKED_IN';

-- Hotel Folio Entries: Chronological ledger scan by folio
CREATE INDEX idx_hotel_folio_entries_scan ON hotel_folio_entries (tenant_id, folio_id, created_at ASC);

-- Housekeeping Tasks: Uncompleted tasks sorted by priority
CREATE INDEX idx_housekeeping_pending ON hotel_housekeeping_tasks (outlet_id, status, priority)
    WHERE status IN ('PENDING', 'IN_PROGRESS');
```

### 2.7 Restaurant Specific Indexes

```sql
-- Active Restaurant Tables by Dining Area
CREATE INDEX idx_restaurant_tables_area ON restaurant_tables (outlet_id, area_id, status);

-- Active Waitlist / Queue (Waiting guests sorted by creation time)
CREATE INDEX idx_restaurant_queue_waiting ON restaurant_queue_entries (outlet_id, status, created_at ASC)
    WHERE status = 'WAITING';

-- Table Reservations: Schedule scan for today's shifts
CREATE INDEX idx_restaurant_reservations_schedule ON restaurant_reservations (outlet_id, reservation_time, status)
    WHERE status IN ('REQUESTED', 'CONFIRMED');
```

### 2.8 Cinema Specific Indexes

```sql
-- Active Shows: Current and upcoming movies by auditorium
CREATE INDEX idx_cinema_shows_schedule ON cinema_shows (outlet_id, screen_id, start_time)
    WHERE end_time > clock_timestamp();

-- Seat layout lookup
CREATE INDEX idx_cinema_seats_screen ON cinema_seats (screen_id, row_code, seat_number);
```

### 2.9 Audit & Compliance Indexes

```sql
-- Audit Events: Filter by tenant, entity type, and chronological timestamp
CREATE INDEX idx_audit_events_search ON audit_events (tenant_id, entity_type, entity_id, created_at DESC);

-- Security Events: Critical and high severity incident review
CREATE INDEX idx_security_events_review ON security_events (tenant_id, severity, created_at DESC);
```

---

## 3. Index Maintenance & Performance Monitoring

- **B-Tree Default:** All standard indexes utilize PostgreSQL B-Trees for logarithmic lookups and range scans.
- **Index Fill Factor:** High-write tables (`orders`, `stock_movements`, `audit_events`) maintain standard 100% fill factor since historical rows are rarely updated (HOT updates utilized where updates occur).
- **Periodic Unused Index Scrutiny:** `pg_stat_user_indexes` will be monitored during staging and preview phases to eliminate any zero-scan indexes prior to production deployment.
