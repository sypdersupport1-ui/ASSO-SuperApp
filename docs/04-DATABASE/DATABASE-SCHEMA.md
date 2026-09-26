# ASSO Database Schema Specification

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 3)  
> **Authority:** Aligned with Phase 2 Master Architecture (`ADR-001` through `ADR-013`) and `ENTITY-CATALOG.md`  
> **Target Engine:** PostgreSQL 16+ (Supabase/Managed PostgreSQL)  

---

## 1. Schema Design Principles & Conventions

1. **Primary Keys:** Every table uses UUID primary keys generated via `gen_random_uuid()` (PostgreSQL pgcrypto/standard uuid v4).
2. **Tenant Scoping:** All tenant-owned data columns use `tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT`.
3. **Outlet Scoping:** All physical outlet operations mandate `outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT`.
4. **Timestamp Columns:** Every record includes `created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()`.
5. **Soft Deletion:** Business entities requiring soft deletion use `deleted_at TIMESTAMPTZ NULL`.
6. **Financial Precision:** All monetary amounts are stored as `NUMERIC(14, 4)` (supporting sub-cent calculations) or integer cents (`BIGINT`) with explicit ISO currency codes (`VARCHAR(3) DEFAULT 'INR'`).
7. **Foreign Key Restraints:** Deletions on parent entities default to `ON DELETE RESTRICT` for referential integrity. Cascades (`ON DELETE CASCADE`) are restricted strictly to child details that have no independent lifecycle (e.g., `order_item_modifiers` cascade from `order_items`).
8. **Row-Level Security:** RLS is enabled on all tenant-owned tables (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`).

---

## 2. Core Platform & Multi-Tenancy DDL

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Organizations (Tenants)
CREATE TABLE organizations (
    organization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255),
    tax_identifier VARCHAR(100),
    primary_business_type VARCHAR(50) NOT NULL CHECK (primary_business_type IN ('HOTEL', 'RESTAURANT', 'CINEMA', 'MIXED_ENTERPRISE')),
    subscription_status VARCHAR(50) NOT NULL DEFAULT 'TRIAL' CHECK (subscription_status IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deleted_at TIMESTAMPTZ
);

-- Outlets (Properties / Branches)
CREATE TABLE outlets (
    outlet_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    vertical_type VARCHAR(50) NOT NULL CHECK (vertical_type IN ('HOTEL', 'RESTAURANT', 'CINEMA')),
    timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Kolkata',
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    is_active BOOLEAN NOT NULL DEFAULT true,
    address JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_outlets_tenant_code UNIQUE (tenant_id, code)
);

-- Users (Universal Authentication Identity)
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(50) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_super_admin BOOLEAN NOT NULL DEFAULT false,
    mfa_enabled BOOLEAN NOT NULL DEFAULT false,
    mfa_secret_encrypted TEXT,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deleted_at TIMESTAMPTZ
);

-- Staff Profiles (Tenant/Outlet Employment)
CREATE TABLE staff_profiles (
    staff_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    outlet_id UUID REFERENCES outlets(outlet_id) ON DELETE RESTRICT, -- Null implies all outlets in tenant
    employee_code VARCHAR(50),
    department VARCHAR(100),
    job_title VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_staff_tenant_user UNIQUE (tenant_id, user_id)
);

-- Roles
CREATE TABLE roles (
    role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(organization_id) ON DELETE CASCADE, -- NULL = System default role
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_roles_tenant_name UNIQUE (tenant_id, name)
);

-- Permissions (Platform Master Catalog)
CREATE TABLE permissions (
    permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_code VARCHAR(50) NOT NULL,
    action_code VARCHAR(50) NOT NULL,
    full_code VARCHAR(100) GENERATED ALWAYS AS (module_code || '.' || action_code) STORED UNIQUE,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Role Permissions Mapping
CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(permission_id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (role_id, permission_id)
);

-- Staff Roles Assignment
CREATE TABLE staff_roles (
    staff_id UUID NOT NULL REFERENCES staff_profiles(staff_id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(role_id) ON DELETE RESTRICT,
    outlet_id UUID REFERENCES outlets(outlet_id) ON DELETE RESTRICT, -- NULL = Entire tenant scope
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (staff_id, role_id, outlet_id)
);
```

---

## 3. Commercial Plans, Modules & Pricing DDL (DEC-024)

```sql
-- Commercial Subscription Plans
CREATE TABLE commercial_plans (
    plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    tier_level INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Platform Modules Definition
CREATE TABLE platform_modules (
    module_code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_core BOOLEAN NOT NULL DEFAULT false,
    dependencies VARCHAR(50)[] DEFAULT ARRAY[]::VARCHAR(50)[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Module Features
CREATE TABLE module_features (
    feature_code VARCHAR(50) PRIMARY KEY,
    module_code VARCHAR(50) NOT NULL REFERENCES platform_modules(module_code) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Plan Module Mapping
CREATE TABLE plan_modules (
    plan_id UUID NOT NULL REFERENCES commercial_plans(plan_id) ON DELETE CASCADE,
    module_code VARCHAR(50) NOT NULL REFERENCES platform_modules(module_code) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (plan_id, module_code)
);

-- Tenant Module Entitlements
CREATE TABLE tenant_entitlements (
    entitlement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    module_code VARCHAR(50) NOT NULL REFERENCES platform_modules(module_code) ON DELETE RESTRICT,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    granted_via VARCHAR(50) NOT NULL CHECK (granted_via IN ('PLAN', 'ADDON', 'OVERRIDE')),
    pricing_version_id UUID REFERENCES pricing_configurations(pricing_id) ON DELETE SET NULL, -- Immutably links to commercial price version at grant time
    applied_price NUMERIC(14, 4), -- Historical commercial price snapshot agreed at grant time (preserves billing audit integrity)
    valid_from TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_tenant_module_entitlement UNIQUE (tenant_id, module_code)
);

-- Pricing Configurations (DEC-024: Dynamic Super Admin Pricing; Version-Preserved)
CREATE TABLE pricing_configurations (
    pricing_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('PLAN', 'MODULE', 'FEATURE', 'ADDON')),
    target_code VARCHAR(50) NOT NULL,
    version_number INT NOT NULL DEFAULT 1, -- Version sequence for historical audit
    billing_period VARCHAR(50) NOT NULL CHECK (billing_period IN ('MONTHLY', 'ANNUAL', 'ONE_TIME')),
    base_price NUMERIC(14, 4) NOT NULL CHECK (base_price >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    effective_from TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    effective_until TIMESTAMPTZ, -- Active version has NULL; historical version has timestamp
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Tenant Pricing Overrides (DEC-024: Historical Override Auditing)
CREATE TABLE tenant_pricing_overrides (
    override_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('PLAN', 'MODULE', 'FEATURE', 'ADDON')),
    target_code VARCHAR(50) NOT NULL,
    override_price NUMERIC(14, 4) NOT NULL CHECK (override_price >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    reason TEXT NOT NULL,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

---

## 4. Physical Business Context & QR Engine DDL

```sql
-- Physical Business Context (Unified Context Abstraction)
CREATE TABLE business_contexts (
    context_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    context_type VARCHAR(50) NOT NULL CHECK (context_type IN ('ROOM', 'TABLE', 'SEAT', 'SCREEN_AREA', 'COUNTER')),
    identifier VARCHAR(100) NOT NULL, -- e.g., "Room 304", "Table 12", "Seat G-14"
    display_label VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE',
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_contexts_outlet_identifier UNIQUE (outlet_id, identifier)
);

-- QR Tokens (Secure Opaque Reference)
CREATE TABLE qr_tokens (
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    context_id UUID NOT NULL REFERENCES business_contexts(context_id) ON DELETE RESTRICT,
    opaque_token VARCHAR(128) UNIQUE NOT NULL, -- SHA-256 or Cryptographic UUID
    token_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (token_status IN ('ACTIVE', 'SUSPENDED', 'REVOKED')),
    revocation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Customer Sessions (Per-device ephemeral session)
CREATE TABLE customer_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    context_id UUID NOT NULL REFERENCES business_contexts(context_id) ON DELETE RESTRICT,
    token_id UUID NOT NULL REFERENCES qr_tokens(token_id) ON DELETE RESTRICT,
    device_fingerprint VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50),
    customer_name VARCHAR(100),
    session_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (session_status IN ('ACTIVE', 'EXPIRED', 'TERMINATED')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

---

## 5. Catalog & Menu Engine DDL

```sql
-- Catalogs
CREATE TABLE catalogs (
    catalog_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID REFERENCES outlets(outlet_id) ON DELETE RESTRICT, -- NULL = All outlets in tenant
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Catalog Categories
CREATE TABLE catalog_categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    catalog_id UUID NOT NULL REFERENCES catalogs(catalog_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Catalog Items
CREATE TABLE catalog_items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES catalog_categories(category_id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sku VARCHAR(100),
    base_price NUMERIC(14, 4) NOT NULL CHECK (base_price >= 0),
    tax_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.0500 CHECK (tax_rate >= 0),
    is_available BOOLEAN NOT NULL DEFAULT true,
    fulfillment_station VARCHAR(50) NOT NULL DEFAULT 'KITCHEN' CHECK (fulfillment_station IN ('KITCHEN', 'BAR', 'PANTRY', 'CONCESSION', 'DESK')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Item Modifiers / Variants
CREATE TABLE catalog_item_modifiers (
    modifier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    item_id UUID NOT NULL REFERENCES catalog_items(item_id) ON DELETE CASCADE,
    group_name VARCHAR(100) NOT NULL, -- e.g., "Size", "Spice Level", "Add-on"
    name VARCHAR(100) NOT NULL,
    price_delta NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

---

## 6. Shared Ordering Engine & KDS DDL

```sql
-- Orders
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    context_id UUID NOT NULL REFERENCES business_contexts(context_id) ON DELETE RESTRICT,
    session_id UUID REFERENCES customer_sessions(session_id) ON DELETE SET NULL,
    created_by_staff_id UUID REFERENCES staff_profiles(staff_id) ON DELETE RESTRICT,
    order_number VARCHAR(50) NOT NULL,
    order_source VARCHAR(50) NOT NULL CHECK (order_source IN ('QR_CUSTOMER', 'STAFF_POS', 'DESK_ORDER')),
    status VARCHAR(50) NOT NULL DEFAULT 'PLACED' CHECK (status IN ('DRAFT', 'PLACED', 'ACCEPTED', 'IN_PREPARATION', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED')),
    cancellation_reason TEXT,
    idempotency_key VARCHAR(100),
    subtotal_amount NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
    tax_amount NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    discount_amount NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_orders_tenant_number UNIQUE (tenant_id, outlet_id, order_number)
);

-- Order Items
CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES catalog_items(item_id) ON DELETE RESTRICT,
    item_name VARCHAR(255) NOT NULL,
    unit_price NUMERIC(14, 4) NOT NULL CHECK (unit_price >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    subtotal NUMERIC(14, 4) NOT NULL CHECK (subtotal >= 0),
    fulfillment_station VARCHAR(50) NOT NULL DEFAULT 'KITCHEN',
    item_status VARCHAR(50) NOT NULL DEFAULT 'PLACED' CHECK (item_status IN ('PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED')),
    special_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Order Item Modifiers
CREATE TABLE order_item_modifiers (
    order_modifier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID NOT NULL REFERENCES order_items(order_item_id) ON DELETE CASCADE,
    modifier_id UUID NOT NULL REFERENCES catalog_item_modifiers(modifier_id) ON DELETE RESTRICT,
    modifier_name VARCHAR(100) NOT NULL,
    price_delta NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Order Status Audit Log
CREATE TABLE order_status_history (
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    from_status VARCHAR(50) NOT NULL,
    to_status VARCHAR(50) NOT NULL,
    changed_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

---

## 7. Shared Billing & Payments DDL

```sql
-- Bills
CREATE TABLE bills (
    bill_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    context_id UUID REFERENCES business_contexts(context_id) ON DELETE RESTRICT,
    bill_number VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SETTLED', 'PARTIALLY_SETTLED', 'VOIDED')),
    subtotal_amount NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
    tax_amount NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    discount_amount NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    settled_amount NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (settled_amount >= 0),
    idempotency_key VARCHAR(100),
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_bills_tenant_number UNIQUE (tenant_id, outlet_id, bill_number)
);

-- Bill Orders Mapping
CREATE TABLE bill_orders (
    bill_id UUID NOT NULL REFERENCES bills(bill_id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (bill_id, order_id)
);

-- Payment Transactions (DEC-002: Provider-Neutral Gateway Architecture; Provider Implementation Deferred)
CREATE TABLE payment_transactions (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    bill_id UUID REFERENCES bills(bill_id) ON DELETE RESTRICT,
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('CASH', 'UPI', 'CARD', 'NETBANKING', 'GATEWAY', 'HOUSE_ACCOUNT')),
    gateway_provider VARCHAR(50) NOT NULL DEFAULT 'MOCK', -- 'MOCK' for dev/preview; production commercial gateway deferred
    gateway_transaction_reference VARCHAR(100), -- Provider-neutral external transaction reference
    gateway_metadata JSONB DEFAULT '{}'::jsonb, -- Provider-neutral attributes/payload (no provider-specific DB columns)
    amount NUMERIC(14, 4) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED')),
    idempotency_key VARCHAR(100) UNIQUE,
    error_code VARCHAR(100),
    error_description TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Payment Refunds
CREATE TABLE payment_refunds (
    refund_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    payment_id UUID NOT NULL REFERENCES payment_transactions(payment_id) ON DELETE RESTRICT,
    refund_amount NUMERIC(14, 4) NOT NULL CHECK (refund_amount > 0),
    gateway_refund_id VARCHAR(100),
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED')),
    approved_by_staff_id UUID REFERENCES staff_profiles(staff_id) ON DELETE RESTRICT,
    idempotency_key VARCHAR(100) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Inbound Webhook Events
CREATE TABLE inbound_webhook_events (
    webhook_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    signature_header TEXT NOT NULL,
    processing_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (processing_status IN ('PENDING', 'PROCESSED', 'FAILED', 'IGNORED')),
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_webhook_provider_event UNIQUE (provider, event_id)
);
```

---

## 8. Hotel Vertical Specific DDL

```sql
-- Hotel Room Types
CREATE TABLE hotel_room_types (
    room_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    base_occupancy INT NOT NULL DEFAULT 2,
    max_occupancy INT NOT NULL DEFAULT 3,
    base_rate NUMERIC(14, 4) NOT NULL CHECK (base_rate >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_room_types_outlet_code UNIQUE (outlet_id, code)
);

-- Hotel Rooms (Maps to physical business_contexts)
CREATE TABLE hotel_rooms (
    room_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    context_id UUID NOT NULL REFERENCES business_contexts(context_id) ON DELETE RESTRICT,
    room_type_id UUID NOT NULL REFERENCES hotel_room_types(room_type_id) ON DELETE RESTRICT,
    room_number VARCHAR(50) NOT NULL,
    floor_number VARCHAR(20),
    housekeeping_status VARCHAR(50) NOT NULL DEFAULT 'CLEAN' CHECK (housekeeping_status IN ('CLEAN', 'DIRTY', 'INSPECTED', 'MAINTENANCE', 'OUT_OF_SERVICE')),
    is_occupied BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_hotel_rooms_outlet_number UNIQUE (outlet_id, room_number)
);

-- Hotel Guests
CREATE TABLE hotel_guests (
    guest_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    id_proof_type VARCHAR(50),
    id_proof_number_masked VARCHAR(50),
    nationality VARCHAR(50) DEFAULT 'INDIAN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Hotel Stays
CREATE TABLE hotel_stays (
    stay_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    room_id UUID NOT NULL REFERENCES hotel_rooms(room_id) ON DELETE RESTRICT,
    primary_guest_id UUID NOT NULL REFERENCES hotel_guests(guest_id) ON DELETE RESTRICT,
    reservation_code VARCHAR(50),
    check_in_time TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expected_check_out_time TIMESTAMPTZ NOT NULL,
    actual_check_out_time TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'CHECKED_IN' CHECK (status IN ('RESERVED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Hotel Guest Folios
CREATE TABLE hotel_folios (
    folio_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    stay_id UUID NOT NULL REFERENCES hotel_stays(stay_id) ON DELETE RESTRICT,
    folio_number VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SETTLED', 'CLOSED')),
    total_charges NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    total_payments NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    balance_due NUMERIC(14, 4) GENERATED ALWAYS AS (total_charges - total_payments) STORED,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_hotel_folios_outlet_number UNIQUE (outlet_id, folio_number)
);

-- Hotel Folio Ledger Entries (Immutable Financial Ledger)
CREATE TABLE hotel_folio_entries (
    entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    folio_id UUID NOT NULL REFERENCES hotel_folios(folio_id) ON DELETE RESTRICT,
    entry_type VARCHAR(50) NOT NULL CHECK (entry_type IN ('ROOM_CHARGE', 'TAX', 'SERVICE', 'PAYMENT', 'ADJUSTMENT', 'REVERSAL')),
    amount NUMERIC(14, 4) NOT NULL, -- Negative for payments/reversals
    description TEXT NOT NULL,
    reference_id UUID, -- Links to bill_id, payment_id, or original entry_id if adjustment
    reverses_entry_id UUID REFERENCES hotel_folio_entries(entry_id) ON DELETE RESTRICT,
    posted_by_staff_id UUID REFERENCES staff_profiles(staff_id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Hotel Housekeeping Tasks
CREATE TABLE hotel_housekeeping_tasks (
    task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    room_id UUID NOT NULL REFERENCES hotel_rooms(room_id) ON DELETE RESTRICT,
    task_type VARCHAR(50) NOT NULL DEFAULT 'ROUTINE_CLEAN' CHECK (task_type IN ('ROUTINE_CLEAN', 'DEEP_CLEAN', 'TURNDOWN', 'CHECKOUT_CLEAN', 'MAINTENANCE_INSPECTION')),
    priority VARCHAR(50) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'INSPECTED', 'COMPLETED', 'BLOCKED')),
    assigned_to_staff_id UUID REFERENCES staff_profiles(staff_id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

---

## 9. Restaurant Vertical Specific DDL

```sql
-- Restaurant Dining Areas
CREATE TABLE restaurant_dining_areas (
    area_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL, -- e.g., "Main Dining", "Rooftop", "Patio", "Bar Lounge"
    is_smoking BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_dining_areas_outlet_name UNIQUE (outlet_id, name)
);

-- Restaurant Tables (Maps to physical business_contexts)
CREATE TABLE restaurant_tables (
    table_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    context_id UUID NOT NULL REFERENCES business_contexts(context_id) ON DELETE RESTRICT,
    area_id UUID NOT NULL REFERENCES restaurant_dining_areas(area_id) ON DELETE RESTRICT,
    table_number VARCHAR(50) NOT NULL,
    seating_capacity INT NOT NULL DEFAULT 4 CHECK (seating_capacity > 0),
    status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'DIRTY', 'OUT_OF_SERVICE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_tables_outlet_number UNIQUE (outlet_id, table_number)
);

-- Restaurant Waitlist / Queue
CREATE TABLE restaurant_queue_entries (
    queue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    guest_name VARCHAR(100) NOT NULL,
    guest_phone VARCHAR(50) NOT NULL,
    party_size INT NOT NULL CHECK (party_size > 0),
    status VARCHAR(50) NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'CALLED', 'SEATED', 'CANCELLED', 'NO_SHOW')),
    assigned_table_id UUID REFERENCES restaurant_tables(table_id) ON DELETE SET NULL,
    estimated_wait_minutes INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Restaurant Table Reservations
CREATE TABLE restaurant_reservations (
    reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    table_id UUID REFERENCES restaurant_tables(table_id) ON DELETE SET NULL,
    guest_name VARCHAR(100) NOT NULL,
    guest_phone VARCHAR(50) NOT NULL,
    party_size INT NOT NULL CHECK (party_size > 0),
    reservation_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('REQUESTED', 'CONFIRMED', 'SEATED', 'CANCELLED', 'NO_SHOW')),
    special_requests TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

---

## 10. Cinema Vertical Specific DDL

```sql
-- Cinema Auditoriums / Screens
CREATE TABLE cinema_screens (
    screen_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    screen_number VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL, -- e.g., "Screen 1 - IMAX", "Screen 2 - VIP"
    sound_type VARCHAR(50) DEFAULT 'DOLBY_ATMOS',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_screens_outlet_number UNIQUE (outlet_id, screen_number)
);

-- Cinema Seats (Maps to physical business_contexts)
CREATE TABLE cinema_seats (
    seat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    context_id UUID NOT NULL REFERENCES business_contexts(context_id) ON DELETE RESTRICT,
    screen_id UUID NOT NULL REFERENCES cinema_screens(screen_id) ON DELETE RESTRICT,
    row_code VARCHAR(10) NOT NULL, -- e.g., "A", "G"
    seat_number VARCHAR(10) NOT NULL, -- e.g., "12", "14"
    seat_tier VARCHAR(50) NOT NULL DEFAULT 'STANDARD' CHECK (seat_tier IN ('STANDARD', 'PREMIUM', 'RECLINER', 'VIP')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_cinema_seats_screen_row_num UNIQUE (screen_id, row_code, seat_number)
);

-- Cinema Showtimes
CREATE TABLE cinema_shows (
    show_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    screen_id UUID NOT NULL REFERENCES cinema_screens(screen_id) ON DELETE RESTRICT,
    movie_title VARCHAR(255) NOT NULL,
    language VARCHAR(50) NOT NULL,
    certification VARCHAR(20) DEFAULT 'UA',
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    is_ordering_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

---

## 11. Shared Inventory & Procurement DDL (Immutable Ledgers)

```sql
-- Inventory Units
CREATE TABLE inventory_units (
    unit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL, -- 'KG', 'LTR', 'PCS', 'BOX'
    name VARCHAR(50) NOT NULL
);

-- Suppliers
CREATE TABLE inventory_suppliers (
    supplier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(255),
    tax_identifier VARCHAR(100),
    payment_terms_days INT NOT NULL DEFAULT 30,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Inventory Master Items
CREATE TABLE inventory_items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100) NOT NULL,
    unit_id UUID NOT NULL REFERENCES inventory_units(unit_id) ON DELETE RESTRICT,
    category VARCHAR(100) NOT NULL, -- 'RAW_FOOD', 'BEVERAGE', 'LINEN', 'HOUSEKEEPING', 'PRINTING'
    reorder_threshold NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_inventory_items_tenant_sku UNIQUE (tenant_id, sku)
);

-- Inventory Locations (Store Rooms, Pantries, Bars)
CREATE TABLE inventory_locations (
    location_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_inv_locations_outlet_code UNIQUE (outlet_id, code)
);

-- Inventory Stock Balances (Current Snapshot)
CREATE TABLE inventory_stock_balances (
    balance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES inventory_locations(location_id) ON DELETE RESTRICT,
    item_id UUID NOT NULL REFERENCES inventory_items(item_id) ON DELETE RESTRICT,
    current_quantity NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (current_quantity >= 0),
    last_movement_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_stock_balances_loc_item UNIQUE (location_id, item_id)
);

-- Inventory Stock Movements (Immutable Ledger)
CREATE TABLE inventory_stock_movements (
    movement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES inventory_locations(location_id) ON DELETE RESTRICT,
    item_id UUID NOT NULL REFERENCES inventory_items(item_id) ON DELETE RESTRICT,
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN ('PURCHASE_RECEIPT', 'INTER_OUTLET_TRANSFER', 'INTERNAL_TRANSFER', 'MANUAL_ADJUSTMENT', 'WASTAGE', 'RECONCILIATION')),
    quantity_delta NUMERIC(14, 4) NOT NULL, -- Positive for in, negative for out
    unit_cost NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    reference_id UUID, -- Links to purchase_order_id, transfer_id, or adjustment_id
    notes TEXT,
    created_by_staff_id UUID NOT NULL REFERENCES staff_profiles(staff_id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Purchase Orders
CREATE TABLE purchase_orders (
    po_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES inventory_suppliers(supplier_id) ON DELETE RESTRICT,
    po_number VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
    total_amount NUMERIC(14, 4) NOT NULL DEFAULT 0.0000,
    approved_by_staff_id UUID REFERENCES staff_profiles(staff_id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_po_outlet_number UNIQUE (outlet_id, po_number)
);

-- Purchase Order Items
CREATE TABLE purchase_order_items (
    po_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES purchase_orders(po_id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES inventory_items(item_id) ON DELETE RESTRICT,
    quantity_ordered NUMERIC(14, 4) NOT NULL CHECK (quantity_ordered > 0),
    quantity_received NUMERIC(14, 4) NOT NULL DEFAULT 0.0000 CHECK (quantity_received >= 0),
    unit_price NUMERIC(14, 4) NOT NULL CHECK (unit_price >= 0),
    total_price NUMERIC(14, 4) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

---

## 12. Shared Expenses & Cash Management DDL

```sql
-- Expense Categories
CREATE TABLE expense_categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_exp_categories_tenant_code UNIQUE (tenant_id, code)
);

-- Expenses
CREATE TABLE expenses (
    expense_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    category_id UUID NOT NULL REFERENCES expense_categories(category_id) ON DELETE RESTRICT,
    payee_name VARCHAR(255) NOT NULL,
    amount NUMERIC(14, 4) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'UPI', 'CARD')),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PAID')),
    incurred_date DATE NOT NULL,
    description TEXT NOT NULL,
    receipt_attachment_url TEXT,
    created_by_staff_id UUID NOT NULL REFERENCES staff_profiles(staff_id) ON DELETE RESTRICT,
    approved_by_staff_id UUID REFERENCES staff_profiles(staff_id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Cash Drawers / Sessions
CREATE TABLE cash_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    staff_id UUID NOT NULL REFERENCES staff_profiles(staff_id) ON DELETE RESTRICT,
    opening_balance NUMERIC(14, 4) NOT NULL CHECK (opening_balance >= 0),
    closing_balance NUMERIC(14, 4),
    calculated_cash_in NUMERIC(14, 4) DEFAULT 0.0000,
    calculated_cash_out NUMERIC(14, 4) DEFAULT 0.0000,
    discrepancy_amount NUMERIC(14, 4) DEFAULT 0.0000,
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'RECONCILED')),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    closed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Cash Movements Ledger (Append-Only)
CREATE TABLE cash_movements (
    movement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    session_id UUID NOT NULL REFERENCES cash_sessions(session_id) ON DELETE RESTRICT,
    movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN ('PAYMENT_IN', 'EXPENSE_OUT', 'DROP', 'FLOAT_ADJUSTMENT')),
    amount NUMERIC(14, 4) NOT NULL, -- Positive for in, negative for out
    reference_id UUID, -- Links to payment_id or expense_id
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

---

## 13. Service Requests, Chat & Notifications DDL

```sql
-- Service Requests
CREATE TABLE service_requests (
    request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    context_id UUID NOT NULL REFERENCES business_contexts(context_id) ON DELETE RESTRICT,
    request_type VARCHAR(100) NOT NULL, -- 'HOUSEKEEPING_AMENITY', 'MAINTENANCE', 'BILL_ASSISTANCE', 'CINEMA_CLEANUP'
    priority VARCHAR(50) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED')),
    description TEXT NOT NULL,
    assigned_to_staff_id UUID REFERENCES staff_profiles(staff_id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Conversations
CREATE TABLE conversations (
    conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES outlets(outlet_id) ON DELETE RESTRICT,
    context_id UUID REFERENCES business_contexts(context_id) ON DELETE SET NULL,
    subject VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Conversation Messages
CREATE TABLE messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    sender_type VARCHAR(50) NOT NULL CHECK (sender_type IN ('CUSTOMER', 'STAFF', 'SYSTEM')),
    sender_id UUID, -- Maps to users(user_id) or customer_sessions(session_id)
    content TEXT NOT NULL,
    attachments JSONB DEFAULT '[]'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Notifications
CREATE TABLE notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    recipient_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    channel VARCHAR(50) NOT NULL CHECK (channel IN ('IN_APP', 'EMAIL', 'SMS')),
    template_code VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SENT', 'FAILED', 'READ')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

---

## 14. Governance, Policies, Audits & Security Events DDL

```sql
-- Approval Policies
CREATE TABLE approval_policies (
    policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
    policy_type VARCHAR(50) NOT NULL CHECK (policy_type IN ('EXPENSE_THRESHOLD', 'REFUND_THRESHOLD', 'INVENTORY_ADJUSTMENT', 'LATE_CHECKOUT')),
    threshold_amount NUMERIC(14, 4),
    required_role_id UUID NOT NULL REFERENCES roles(role_id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_policy_tenant_type UNIQUE (tenant_id, policy_type)
);

-- Approval Requests
CREATE TABLE approval_requests (
    request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    policy_id UUID NOT NULL REFERENCES approval_policies(policy_id) ON DELETE RESTRICT,
    entity_type VARCHAR(50) NOT NULL, -- 'EXPENSE', 'REFUND', 'STOCK_ADJUSTMENT'
    entity_id UUID NOT NULL,
    requested_by_staff_id UUID NOT NULL REFERENCES staff_profiles(staff_id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    decision_reason TEXT,
    decided_by_staff_id UUID REFERENCES staff_profiles(staff_id) ON DELETE RESTRICT,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Audit Events (Immutable Append-Only Compliance Record)
CREATE TABLE audit_events (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(organization_id) ON DELETE SET NULL,
    outlet_id UUID REFERENCES outlets(outlet_id) ON DELETE SET NULL,
    actor_id UUID, -- user_id or staff_id
    actor_type VARCHAR(50) NOT NULL CHECK (actor_type IN ('STAFF', 'CUSTOMER', 'SUPER_ADMIN', 'SYSTEM')),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    before_state JSONB,
    after_state JSONB,
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- Security Events (Tamper-evident Security Log)
CREATE TABLE security_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(organization_id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL CHECK (event_type IN ('AUTH_FAILURE', 'MFA_FAILURE', 'UNAUTHORIZED_CROSS_TENANT_ATTEMPT', 'QR_SCAN_SUSPICIOUS', 'RATE_LIMIT_EXCEEDED', 'SIGNATURE_VERIFICATION_FAILED')),
    severity VARCHAR(50) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    actor_identifier VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
```

---

## 15. Standard PostgreSQL Function & Trigger Definitions

```sql
-- Trigger Function: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = clock_timestamp();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply Trigger across core tables with updated_at
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
CREATE TRIGGER trg_outlets_updated_at BEFORE UPDATE ON outlets FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
CREATE TRIGGER trg_staff_profiles_updated_at BEFORE UPDATE ON staff_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
CREATE TRIGGER trg_business_contexts_updated_at BEFORE UPDATE ON business_contexts FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
CREATE TRIGGER trg_bills_updated_at BEFORE UPDATE ON bills FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
CREATE TRIGGER trg_payment_transactions_updated_at BEFORE UPDATE ON payment_transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
CREATE TRIGGER trg_hotel_stays_updated_at BEFORE UPDATE ON hotel_stays FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
CREATE TRIGGER trg_hotel_folios_updated_at BEFORE UPDATE ON hotel_folios FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
```
