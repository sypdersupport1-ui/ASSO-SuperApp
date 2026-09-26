# ASSO — Canonical Entity Inventory & Data Catalog

**Phase**: 3 — Database, API & Security Architecture  
**Status**: Authoritative Technical Specification  
**System of Record**: PostgreSQL 16+ via Supabase  
**Tenant Isolation**: Mandatory `tenant_id` + Row-Level Security (RLS)  

This document serves as the master catalog of all database entities in ASSO. Every entity has a single owning module, an explicit tenancy scope, lifecycle rules, immutability requirements, and security classification.

---

## 1. Domain Group Index

1. **Platform Core & Tenancy**: Organizations, Properties, Outlets, Business Types, Config
2. **Identity, Staff & Access (RBAC)**: Users, Auth Sessions, Staff Profiles, Roles, Permissions
3. **Module Entitlements & Pricing (DEC-024)**: Modules, Dependencies, Plans, Add-Ons, Entitlements, Configurable Pricing
4. **Customer, Physical Context & Sessions**: Customers, Business Contexts, QR Codes, Customer Sessions
5. **Catalog & Menu**: Categories, Items, Variants, Modifiers, Availability Rules
6. **Ordering & Fulfillment**: Orders, Order Items, Modifiers, Order Status History, KDS Stations, Tasks
7. **Commerce, Billing & Payments**: POS Sessions & Transactions, Bills, Bill Items, Guest Folios, Folio Entries, Payments, Refunds, Payment Idempotency
8. **Inventory & Procurement**: Categories, Items, Locations, Stock Movement Ledger, Suppliers, Purchase Orders, Goods Receipts
9. **Finance & Cash Operations**: Expenses, Attachments, Approvals, Cash Sessions, Cash Transactions, Reconciliations
10. **Operations, Service & Communication**: Service Requests, Request History, Conversations, Participants, Messages, Notifications
11. **Vertical Modules**:
    - **Hotel**: Room Types, Rooms, Reservations, Guest Stays, Housekeeping Tasks
    - **Restaurant**: Dining Areas, Tables, Queue Entries, Table Reservations
    - **Cinema**: Screens, Seats, Shows
12. **Audit, Security & Platform Services**: Audit Events, Security Events, Background Jobs, Processed Events

---

## 2. Platform Core & Tenancy

### `organizations`
- **Owning Module**: `platform/tenancy`
- **Purpose**: Root multi-tenant boundary representing the legal or commercial enterprise (e.g., hotel chain, restaurant group).
- **Tenant Scope**: Root entity (`tenant_id = organization_id`).
- **Outlet/Property Scope**: Global to all descendant properties and outlets.
- **Primary Key**: `organization_id UUID` (`DEFAULT gen_random_uuid()`)
- **Important Fields**: `name TEXT NOT NULL`, `slug TEXT NOT NULL UNIQUE`, `status TEXT NOT NULL (ACTIVE, SUSPENDED, PENDING_VERIFICATION, ONBOARDING, ARCHIVED)`, `default_currency VARCHAR(3) NOT NULL DEFAULT 'INR'`, `timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata'`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Foreign Keys**: None (Root)
- **Unique Constraints**: `slug`
- **Indexes**: `idx_organizations_slug (slug)`, `idx_organizations_status (status)`
- **Lifecycle**: `ONBOARDING → ACTIVE ⇄ SUSPENDED → ARCHIVED`
- **Deletion Behavior**: Restricted / Soft-archive. Never hard-deleted if child properties, transactions, or audit records exist.
- **Audit & History**: Full audit trail in `audit_events`.
- **Security Sensitivity**: High (Tenant Root).

### `properties`
- **Owning Module**: `platform/tenancy`
- **Purpose**: Represents a physical physical location or estate (e.g., Grand Hotel Mumbai, Cineplex Mall).
- **Tenant Scope**: Mandatory `tenant_id UUID REFERENCES organizations(organization_id)`.
- **Outlet Scope**: Parent container of outlets.
- **Primary Key**: `property_id UUID` (`DEFAULT gen_random_uuid()`)
- **Important Fields**: `tenant_id UUID NOT NULL`, `name TEXT NOT NULL`, `slug TEXT NOT NULL`, `primary_business_type TEXT NOT NULL (HOTEL, RESTAURANT, CINEMA, MIXED)`, `address_line1 TEXT`, `address_line2 TEXT`, `city TEXT NOT NULL`, `state TEXT NOT NULL`, `postal_code TEXT NOT NULL`, `country_code VARCHAR(2) NOT NULL DEFAULT 'IN'`, `timezone TEXT NOT NULL`, `status TEXT NOT NULL (ACTIVE, INACTIVE, ARCHIVED)`
- **Foreign Keys**: `tenant_id REFERENCES organizations(organization_id)`
- **Unique Constraints**: `(tenant_id, slug)`
- **Indexes**: `idx_properties_tenant (tenant_id)`, `idx_properties_tenant_slug (tenant_id, slug)`
- **Lifecycle**: `ACTIVE ⇄ INACTIVE → ARCHIVED`
- **Deletion Behavior**: Soft-archive (`status = 'ARCHIVED'`).
- **Security Sensitivity**: High (Physical asset scope).

### `outlets`
- **Owning Module**: `platform/tenancy`
- **Purpose**: Distinct operational business unit within a property (e.g., Main Hotel, Rooftop Restaurant, Multiplex Auditorium Concessions).
- **Tenant Scope**: Mandatory `tenant_id UUID REFERENCES organizations(organization_id)`.
- **Outlet Scope**: Self (`outlet_id`).
- **Primary Key**: `outlet_id UUID` (`DEFAULT gen_random_uuid()`)
- **Important Fields**: `tenant_id UUID NOT NULL`, `property_id UUID NOT NULL`, `name TEXT NOT NULL`, `code TEXT NOT NULL`, `business_type TEXT NOT NULL (HOTEL, RESTAURANT, CINEMA)`, `operating_currency VARCHAR(3) NOT NULL DEFAULT 'INR'`, `status TEXT NOT NULL (ACTIVE, INACTIVE, CLOSED)`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Foreign Keys**: `tenant_id REFERENCES organizations(organization_id)`, `property_id REFERENCES properties(property_id)`
- **Unique Constraints**: `(property_id, code)`
- **Indexes**: `idx_outlets_tenant_property (tenant_id, property_id)`, `idx_outlets_business_type (tenant_id, business_type)`
- **Lifecycle**: `ACTIVE ⇄ INACTIVE → CLOSED`
- **Deletion Behavior**: Soft-delete/deactivate.
- **Security Sensitivity**: High (Direct context of orders, billing, and staff roles).

### `configurations`
- **Owning Module**: `platform/config`
- **Purpose**: Key-value JSON configuration store for tenant, property, or outlet-level operational parameters.
- **Tenant Scope**: Mandatory `tenant_id UUID REFERENCES organizations(organization_id)`.
- **Outlet/Property Scope**: Optional `property_id UUID`, Optional `outlet_id UUID`.
- **Primary Key**: `config_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `property_id UUID`, `outlet_id UUID`, `namespace TEXT NOT NULL`, `config_key TEXT NOT NULL`, `config_value JSONB NOT NULL`, `updated_by UUID NOT NULL`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Unique Constraints**: `(tenant_id, COALESCE(property_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid), namespace, config_key)`
- **Deletion Behavior**: Soft-invalidation; configuration history captured in audit trail.
- **Security Sensitivity**: Medium to High (Tax rates, business toggles, feature overrides).

---

## 3. Identity, Staff & Access Control (RBAC)

### `users`
- **Owning Module**: `platform/identity`
- **Purpose**: System credentials and login identity for staff and platform administrators.
- **Tenant Scope**: Cross-tenant credential identity (associated with tenants through `staff_profiles`).
- **Primary Key**: `user_id UUID`
- **Important Fields**: `email TEXT NOT NULL UNIQUE`, `phone TEXT UNIQUE`, `password_hash TEXT NOT NULL`, `status TEXT NOT NULL (ACTIVE, SUSPENDED, INVITED, LOCKED)`, `is_super_admin BOOLEAN NOT NULL DEFAULT FALSE`, `mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE`, `mfa_secret_encrypted TEXT`, `failed_login_attempts INT NOT NULL DEFAULT 0`, `locked_until TIMESTAMPTZ`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Unique Constraints**: `email`, `phone`
- **Deletion Behavior**: Deactivation only (`status = 'SUSPENDED'`). Passwords never deleted; salted bcrypt/argon2 hash only.
- **Security Sensitivity**: Critical (Authentication credentials).

### `auth_sessions`
- **Owning Module**: `platform/identity`
- **Purpose**: Active staff and administrator login sessions.
- **Primary Key**: `session_id UUID`
- **Important Fields**: `user_id UUID NOT NULL REFERENCES users(user_id)`, `token_hash TEXT NOT NULL UNIQUE`, `ip_address INET`, `user_agent TEXT`, `expires_at TIMESTAMPTZ NOT NULL`, `revoked_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Security Sensitivity**: Critical (Active session tokens).

### `staff_profiles`
- **Owning Module**: `platform/staff`
- **Purpose**: Employee profile within an organization, linking `users` to tenant context.
- **Tenant Scope**: Mandatory `tenant_id UUID REFERENCES organizations(organization_id)`.
- **Primary Key**: `staff_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `user_id UUID NOT NULL REFERENCES users(user_id)`, `first_name TEXT NOT NULL`, `last_name TEXT NOT NULL`, `employee_code TEXT`, `department TEXT`, `status TEXT NOT NULL (ACTIVE, ON_LEAVE, TERMINATED)`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Unique Constraints**: `(tenant_id, user_id)`, `(tenant_id, employee_code)`
- **Deletion Behavior**: Soft-deactivation (`status = 'TERMINATED'`). Historical orders and shifts must preserve staff reference.
- **Security Sensitivity**: Medium (Internal PII).

### `staff_outlet_assignments`
- **Owning Module**: `platform/staff`
- **Purpose**: Grants a staff member access to operate within one or more outlets.
- **Tenant Scope**: Mandatory `tenant_id UUID`.
- **Primary Key**: `assignment_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `staff_id UUID NOT NULL REFERENCES staff_profiles(staff_id)`, `outlet_id UUID NOT NULL REFERENCES outlets(outlet_id)`, `is_primary BOOLEAN NOT NULL DEFAULT FALSE`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Unique Constraints**: `(staff_id, outlet_id)`
- **Security Sensitivity**: High (Access boundary).

### `roles`
- **Owning Module**: `platform/rbac`
- **Purpose**: Named collection of permissions. Can be system-level templates or tenant-customized roles.
- **Tenant Scope**: Optional `tenant_id UUID` (Null for platform role templates; populated for custom tenant roles).
- **Primary Key**: `role_id UUID`
- **Important Fields**: `tenant_id UUID REFERENCES organizations(organization_id)`, `code TEXT NOT NULL`, `name TEXT NOT NULL`, `description TEXT`, `is_system_role BOOLEAN NOT NULL DEFAULT FALSE`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Unique Constraints**: `(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), code)`
- **Security Sensitivity**: High (Access control structure).

### `permissions`
- **Owning Module**: `platform/rbac`
- **Purpose**: Atomic platform-wide action authorization constants (e.g., `orders.create`, `inventory.adjust`).
- **Tenant Scope**: Global platform constants.
- **Primary Key**: `permission_id UUID`
- **Important Fields**: `code TEXT NOT NULL UNIQUE`, `module_id TEXT NOT NULL`, `resource TEXT NOT NULL`, `action TEXT NOT NULL`, `description TEXT`
- **Unique Constraints**: `code`
- **Security Sensitivity**: High (System authorization registry).

### `role_permissions`
- **Owning Module**: `platform/rbac`
- **Purpose**: Maps permissions to roles.
- **Primary Key**: `(role_id, permission_id)`
- **Security Sensitivity**: High.

### `staff_role_assignments`
- **Owning Module**: `platform/rbac`
- **Purpose**: Assigns a role to a staff profile within an outlet scope.
- **Tenant Scope**: Mandatory `tenant_id UUID`.
- **Primary Key**: `staff_role_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `staff_id UUID NOT NULL REFERENCES staff_profiles(staff_id)`, `outlet_id UUID NOT NULL REFERENCES outlets(outlet_id)`, `role_id UUID NOT NULL REFERENCES roles(role_id)`, `assigned_by UUID NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Unique Constraints**: `(staff_id, outlet_id, role_id)`
- **Security Sensitivity**: Critical (Authority delegation).

---

## 4. Module Entitlements & Configurable Pricing (DEC-024)

### `module_definitions`
- **Owning Module**: `platform/modules`
- **Purpose**: Platform registry of all available shared engines and vertical modules.
- **Tenant Scope**: Global.
- **Primary Key**: `module_id TEXT` (e.g., `ordering`, `inventory`, `hotel-core`, `kds`)
- **Important Fields**: `name TEXT NOT NULL`, `description TEXT`, `tier TEXT NOT NULL (CORE, STANDARD, ADVANCED, ADDON)`, `business_types TEXT[] NOT NULL`, `is_core BOOLEAN NOT NULL DEFAULT FALSE`
- **Security Sensitivity**: Medium.

### `module_dependencies`
- **Owning Module**: `platform/modules`
- **Purpose**: Enforces module prerequisite graph (e.g., `kds` requires `fulfillment`; `fulfillment` requires `ordering`).
- **Primary Key**: `(module_id, depends_on_module_id)`
- **Foreign Keys**: Both reference `module_definitions(module_id)`
- **Security Sensitivity**: Medium.

### `module_features`
- **Owning Module**: `platform/modules`
- **Purpose**: Granular sub-capabilities within a module that can be individually priced or toggled.
- **Primary Key**: `feature_id TEXT` (e.g., `orders.bulk-export`, `inventory.multi-warehouse`)
- **Important Fields**: `module_id TEXT NOT NULL REFERENCES module_definitions(module_id)`, `name TEXT NOT NULL`, `description TEXT`
- **Security Sensitivity**: Medium.

### `plans`
- **Owning Module**: `platform/modules`
- **Purpose**: Commercial SaaS subscription tier (e.g., "Restaurant Starter", "Hotel Full Suite").
- **Tenant Scope**: Global plan templates.
- **Primary Key**: `plan_id UUID`
- **Important Fields**: `code TEXT NOT NULL UNIQUE`, `name TEXT NOT NULL`, `business_types TEXT[] NOT NULL`, `billing_cycle TEXT NOT NULL DEFAULT 'MONTHLY' (MONTHLY, ANNUAL)`, `status TEXT NOT NULL (ACTIVE, DEPRECATED)`
- **Security Sensitivity**: High.

### `plan_modules`
- **Owning Module**: `platform/modules`
- **Purpose**: Links bundled modules to a plan.
- **Primary Key**: `(plan_id, module_id)`
- **Security Sensitivity**: High.

### `add_ons`
- **Owning Module**: `platform/modules`
- **Purpose**: Modular capabilities that can be purchased standalone on top of base plans (e.g., KDS, In-App Chat).
- **Primary Key**: `addon_id UUID`
- **Important Fields**: `code TEXT NOT NULL UNIQUE`, `module_id TEXT NOT NULL REFERENCES module_definitions(module_id)`, `name TEXT NOT NULL`, `status TEXT NOT NULL DEFAULT 'ACTIVE'`
- **Security Sensitivity**: High.

### `tenant_entitlements`
- **Owning Module**: `platform/modules`
- **Purpose**: Authoritative record of which modules are enabled for a specific outlet.
- **Tenant Scope**: Mandatory `tenant_id UUID REFERENCES organizations(organization_id)`.
- **Outlet Scope**: Mandatory `outlet_id UUID REFERENCES outlets(outlet_id)`.
- **Primary Key**: `entitlement_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `outlet_id UUID NOT NULL`, `module_id TEXT NOT NULL REFERENCES module_definitions(module_id)`, `status TEXT NOT NULL (ENABLED, DISABLED, SUSPENDED, TRIAL)`, `pricing_version_id UUID REFERENCES pricing_configurations(pricing_id)`, `applied_price NUMERIC(14, 4)`, `enabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `expires_at TIMESTAMPTZ`, `enabled_by UUID NOT NULL`
- **Unique Constraints**: `(outlet_id, module_id)`
- **Historical Integrity**: `applied_price` immutably captures the price at grant time, preserving historical billing integrity when catalog prices change.
- **Indexes**: `idx_tenant_entitlements_lookup (tenant_id, outlet_id, status)`
- **Security Sensitivity**: Critical (Access to business engines).

### `pricing_configurations` (DEC-024)
- **Owning Module**: `platform/modules`
- **Purpose**: Configurable commercial price definitions maintained by Super Admin without hard-coded numbers.
- **Tenant Scope**: Global platform pricing matrix.
- **Primary Key**: `pricing_id UUID`
- **Important Fields**: `plan_id UUID REFERENCES plans(plan_id)`, `addon_id UUID REFERENCES add_ons(addon_id)`, `feature_id TEXT REFERENCES module_features(feature_id)`, `version_number INT NOT NULL DEFAULT 1`, `currency VARCHAR(3) NOT NULL DEFAULT 'INR'`, `amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0)`, `billing_interval TEXT NOT NULL (MONTHLY, ANNUAL, ONE_OFF)`, `effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `effective_to TIMESTAMPTZ`, `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- **Versioning Rule**: Price updates do not overwrite historical rows; they close existing rows via `effective_to` and create new versioned rows.
- **Check Constraints**: Exactly one of `plan_id`, `addon_id`, or `feature_id` must be non-null.
- **Security Sensitivity**: High (Commercial pricing).

### `tenant_pricing_overrides` (DEC-024)
- **Owning Module**: `platform/modules`
- **Purpose**: Custom price agreements, negotiated discounts, or enterprise waivers applied to a specific tenant.
- **Tenant Scope**: Mandatory `tenant_id UUID REFERENCES organizations(organization_id)`.
- **Primary Key**: `override_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `plan_id UUID REFERENCES plans(plan_id)`, `addon_id UUID REFERENCES add_ons(addon_id)`, `currency VARCHAR(3) NOT NULL`, `custom_amount NUMERIC(12, 2) NOT NULL CHECK (custom_amount >= 0)`, `discount_percentage NUMERIC(5, 2) CHECK (discount_percentage BETWEEN 0 AND 100)`, `reason TEXT NOT NULL`, `effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `effective_to TIMESTAMPTZ`, `approved_by UUID NOT NULL`
- **Security Sensitivity**: High.

---

## 5. Customer, Physical Context & Sessions

### `customers`
- **Owning Module**: `engines/customer`
- **Purpose**: Customer profile and guest identification records within a tenant.
- **Tenant Scope**: Mandatory `tenant_id UUID REFERENCES organizations(organization_id)`.
- **Primary Key**: `customer_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `phone TEXT`, `email TEXT`, `full_name TEXT NOT NULL`, `notes TEXT`, `loyalty_identifier TEXT`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Unique Constraints**: `(tenant_id, phone)`, `(tenant_id, email)` (sparse unique indexes)
- **Deletion Behavior**: Soft-delete; historical orders and folios must retain customer link.
- **Security Sensitivity**: High (PII).

### `business_contexts`
- **Owning Module**: `engines/context`
- **Purpose**: Unified abstraction of physical customer service locations (Room, Table, Seat, Screen Area).
- **Tenant Scope**: Mandatory `tenant_id UUID REFERENCES organizations(organization_id)`.
- **Outlet Scope**: Mandatory `outlet_id UUID REFERENCES outlets(outlet_id)`.
- **Primary Key**: `context_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `outlet_id UUID NOT NULL`, `context_type TEXT NOT NULL (ROOM, TABLE, SEAT, SCREEN_AREA)`, `display_name TEXT NOT NULL`, `status TEXT NOT NULL (AVAILABLE, OCCUPIED, RESERVED, MAINTENANCE, CLEANING, INACTIVE)`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Unique Constraints**: `(outlet_id, context_type, display_name)`
- **Indexes**: `idx_contexts_outlet (tenant_id, outlet_id, context_type, status)`
- **Security Sensitivity**: High (Physical routing context).

### `qr_codes`
- **Owning Module**: `engines/qr`
- **Purpose**: Cryptographically opaque token registry mapping physical QR scans to business contexts without exposing internal IDs.
- **Tenant Scope**: Mandatory `tenant_id UUID REFERENCES organizations(organization_id)`.
- **Outlet Scope**: Mandatory `outlet_id UUID REFERENCES outlets(outlet_id)`.
- **Primary Key**: `qr_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `outlet_id UUID NOT NULL`, `context_id UUID NOT NULL REFERENCES business_contexts(context_id)`, `opaque_token TEXT NOT NULL UNIQUE`, `status TEXT NOT NULL DEFAULT 'ACTIVE' (ACTIVE, DISABLED, ROTATED)`, `rotation_count INT NOT NULL DEFAULT 0`, `last_scanned_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Unique Constraints**: `opaque_token`, `(context_id, status)` where status = 'ACTIVE'
- **Indexes**: `idx_qr_token (opaque_token)`, `idx_qr_context (tenant_id, context_id)`
- **Security Sensitivity**: Critical (Customer entry point). Tokens must be high-entropy (min 32 base62 characters).

### `customer_sessions`
- **Owning Module**: `engines/session`
- **Purpose**: Active browser session for a guest initiated via QR resolution, scoped strictly to a context.
- **Tenant Scope**: Mandatory `tenant_id UUID REFERENCES organizations(organization_id)`.
- **Outlet Scope**: Mandatory `outlet_id UUID REFERENCES outlets(outlet_id)`.
- **Primary Key**: `session_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `outlet_id UUID NOT NULL`, `context_id UUID NOT NULL REFERENCES business_contexts(context_id)`, `session_token_hash TEXT NOT NULL UNIQUE`, `customer_id UUID REFERENCES customers(customer_id)`, `device_fingerprint TEXT`, `status TEXT NOT NULL DEFAULT 'ACTIVE' (ACTIVE, EXPIRED, INVALIDATED)`, `expires_at TIMESTAMPTZ NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Multi-Device Support**: Multiple devices scanning the same context receive distinct `customer_sessions` sharing the underlying `context_id`.
- **Lifecycle**: Invalidated on context turnover (Hotel checkout, Table cleared, Cinema show ended).
- **Security Sensitivity**: Critical (Authorizes guest order creation).

---

## 6. Catalog Engine

### `catalog_categories`
- **Owning Module**: `engines/catalog`
- **Purpose**: Hierarchical categories for sellable menu items (e.g., Appetizers, Beverages, Room Amenities).
- **Tenant Scope**: Mandatory `tenant_id UUID`.
- **Outlet Scope**: Mandatory `outlet_id UUID`.
- **Primary Key**: `category_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `outlet_id UUID NOT NULL`, `name TEXT NOT NULL`, `parent_category_id UUID REFERENCES catalog_categories(category_id)`, `sort_order INT NOT NULL DEFAULT 0`, `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- **Unique Constraints**: `(outlet_id, parent_category_id, name)`
- **Security Sensitivity**: Low.

### `catalog_items`
- **Owning Module**: `engines/catalog`
- **Purpose**: Master record of sellable goods or services offered to guests.
- **Tenant Scope**: Mandatory `tenant_id UUID`.
- **Outlet Scope**: Mandatory `outlet_id UUID`.
- **Primary Key**: `catalog_item_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `outlet_id UUID NOT NULL`, `category_id UUID NOT NULL REFERENCES catalog_categories(category_id)`, `name TEXT NOT NULL`, `description TEXT`, `base_price NUMERIC(12, 2) NOT NULL CHECK (base_price >= 0)`, `tax_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (tax_percentage >= 0)`, `is_veg BOOLEAN`, `image_url TEXT`, `is_available BOOLEAN NOT NULL DEFAULT TRUE`, `is_active BOOLEAN NOT NULL DEFAULT TRUE`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Deletion Behavior**: Soft-delete (`is_active = FALSE`). Never hard-deleted because historical orders reference this ID.
- **Security Sensitivity**: Low (Public menu data).

### `catalog_modifier_groups` & `catalog_modifier_options`
- **Owning Module**: `engines/catalog`
- **Purpose**: Item variations and add-ons (e.g., Size: Small/Large, Toppings: Extra Cheese).
- **Primary Key**: `group_id UUID`, `option_id UUID`
- **Important Fields**: `min_selections INT`, `max_selections INT`, `price_delta NUMERIC(12, 2) NOT NULL DEFAULT 0`
- **Security Sensitivity**: Low.

---

## 7. Ordering & Fulfillment Engines

### `orders`
- **Owning Module**: `engines/ordering`
- **Purpose**: Operational order header representing guest or POS orders.
- **Tenant Scope**: Mandatory `tenant_id UUID REFERENCES organizations(organization_id)`.
- **Outlet Scope**: Mandatory `outlet_id UUID REFERENCES outlets(outlet_id)`.
- **Primary Key**: `order_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `outlet_id UUID NOT NULL`, `context_id UUID NOT NULL REFERENCES business_contexts(context_id)`, `order_number TEXT NOT NULL`, `order_source TEXT NOT NULL (CUSTOMER_QR, STAFF_POS, ROOM_SERVICE)`, `status TEXT NOT NULL DEFAULT 'PENDING' (PENDING, CONFIRMED, PREPARING, READY, DELIVERED, CLOSED, CANCELLED)`, `total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0)`, `tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0)`, `currency VARCHAR(3) NOT NULL DEFAULT 'INR'`, `customer_session_id UUID REFERENCES customer_sessions(session_id)`, `staff_user_id UUID REFERENCES users(user_id)`, `idempotency_key UUID UNIQUE`, `cancellation_reason TEXT`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Unique Constraints**: `(outlet_id, order_number)`, `idempotency_key`
- **Indexes**: `idx_orders_tenant_outlet (tenant_id, outlet_id, status, created_at DESC)`, `idx_orders_context (tenant_id, context_id, status)`
- **Lifecycle**: `PENDING → CONFIRMED → PREPARING → READY → DELIVERED → CLOSED | CANCELLED`
- **Deletion Behavior**: Never deleted. Cancellations preserve immutable order record with reason.
- **Audit & History**: State transitions logged in `order_status_history`.
- **Security Sensitivity**: High (Financial & operational record).

### `order_items`
- **Owning Module**: `engines/ordering`
- **Purpose**: Line items belonging to an order.
- **Primary Key**: `order_item_id UUID`
- **Important Fields**: `order_id UUID NOT NULL REFERENCES orders(order_id)`, `catalog_item_id UUID NOT NULL REFERENCES catalog_items(catalog_item_id)`, `quantity INT NOT NULL CHECK (quantity > 0)`, `unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0)`, `total_price NUMERIC(12, 2) NOT NULL CHECK (total_price >= 0)`, `status TEXT NOT NULL DEFAULT 'PENDING' (PENDING, ACKNOWLEDGED, PREPARING, READY, DELIVERED, CANCELLED)`, `special_instructions TEXT`
- **Security Sensitivity**: High.

### `order_status_history`
- **Owning Module**: `engines/ordering`
- **Purpose**: Append-only audit record of every order state transition.
- **Primary Key**: `history_id UUID`
- **Important Fields**: `order_id UUID NOT NULL REFERENCES orders(order_id)`, `from_status TEXT`, `to_status TEXT NOT NULL`, `changed_by_actor_type TEXT NOT NULL (STAFF, CUSTOMER, SYSTEM)`, `changed_by_actor_id UUID`, `reason TEXT`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Immutability**: 100% append-only. Zero UPDATE or DELETE.
- **Security Sensitivity**: High.

### `fulfillment_stations` & `fulfillment_tasks`
- **Owning Module**: `engines/fulfillment`
- **Purpose**: KDS station configurations (Kitchen, Bar, Concession) and routed preparation task state.
- **Primary Key**: `station_id UUID`, `task_id UUID`
- **Important Fields**: `station_id`, `order_item_id`, `station_type TEXT (KITCHEN, BAR, CONCESSION)`, `status TEXT (QUEUED, PREPARING, READY, DELIVERED)`, `started_at TIMESTAMPTZ`, `completed_at TIMESTAMPTZ`
- **Indexes**: `idx_fulfillment_station_active (outlet_id, station_id, status)`
- **Security Sensitivity**: Medium.

---

## 8. Commerce, Billing & Payments

### `pos_sessions`
- **Owning Module**: `engines/pos`
- **Purpose**: Active cashier terminal working session (opening cash, sales accumulation, closing shift).
- **Tenant Scope**: Mandatory `tenant_id UUID`.
- **Outlet Scope**: Mandatory `outlet_id UUID`.
- **Primary Key**: `pos_session_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `outlet_id UUID NOT NULL`, `opened_by UUID NOT NULL REFERENCES staff_profiles(staff_id)`, `closed_by UUID REFERENCES staff_profiles(staff_id)`, `status TEXT NOT NULL DEFAULT 'OPEN' (OPEN, CLOSED)`, `opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `closed_at TIMESTAMPTZ`
- **Security Sensitivity**: High (Cash handling).

### `bills`
- **Owning Module**: `engines/billing`
- **Purpose**: Short-duration operational billing account accumulating charges for a context (e.g. restaurant dining session, cinema concession order).
- **Tenant Scope**: Mandatory `tenant_id UUID REFERENCES organizations(organization_id)`.
- **Outlet Scope**: Mandatory `outlet_id UUID REFERENCES outlets(outlet_id)`.
- **Primary Key**: `bill_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `outlet_id UUID NOT NULL`, `context_id UUID NOT NULL REFERENCES business_contexts(context_id)`, `bill_number TEXT NOT NULL`, `subtotal_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0)`, `tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0)`, `discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0)`, `tip_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tip_amount >= 0)`, `total_payable NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_payable >= 0)`, `settled_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (settled_amount >= 0)`, `currency VARCHAR(3) NOT NULL DEFAULT 'INR'`, `status TEXT NOT NULL DEFAULT 'OPEN' (OPEN, SETTLED, VOIDED)`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `settled_at TIMESTAMPTZ`
- **Unique Constraints**: `(outlet_id, bill_number)`
- **Security Sensitivity**: High (Financial Statement).

### `bill_items`
- **Owning Module**: `engines/billing`
- **Purpose**: Immutable charge line posted to a bill.
- **Primary Key**: `bill_item_id UUID`
- **Important Fields**: `bill_id UUID NOT NULL REFERENCES bills(bill_id)`, `order_id UUID REFERENCES orders(order_id)`, `item_type TEXT NOT NULL (ORDER_CHARGE, SERVICE_CHARGE, TIP, ADJUSTMENT)`, `description TEXT NOT NULL`, `amount NUMERIC(12, 2) NOT NULL`, `tax_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0`, `posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `is_void BOOLEAN NOT NULL DEFAULT FALSE`, `void_reason TEXT`
- **Immutability (ADR-005)**: Line items are immutable once posted. Corrections must post negative compensating adjustments.
- **Security Sensitivity**: High.

### `guest_folios` (Hotel Vertical Ledger)
- **Owning Module**: `engines/billing` (orchestrated by Hotel Vertical)
- **Purpose**: Authoritative multi-day financial account bound to a `guest_stays` record.
- **Tenant Scope**: Mandatory `tenant_id UUID REFERENCES organizations(organization_id)`.
- **Outlet Scope**: Mandatory `outlet_id UUID REFERENCES outlets(outlet_id)`.
- **Primary Key**: `folio_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `outlet_id UUID NOT NULL`, `stay_id UUID NOT NULL`, `guest_id UUID NOT NULL REFERENCES customers(customer_id)`, `folio_number TEXT NOT NULL`, `total_charges NUMERIC(12, 2) NOT NULL DEFAULT 0`, `total_payments NUMERIC(12, 2) NOT NULL DEFAULT 0`, `balance_amount NUMERIC(12, 2) NOT NULL DEFAULT 0`, `currency VARCHAR(3) NOT NULL DEFAULT 'INR'`, `status TEXT NOT NULL DEFAULT 'OPEN' (OPEN, SETTLED, DISPUTED, CLOSED)`, `opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `settled_at TIMESTAMPTZ`
- **Unique Constraints**: `(outlet_id, folio_number)`
- **Security Sensitivity**: Critical (Hotel Stay Financial Ledger).

### `folio_entries` (Hotel Vertical Line Items)
- **Owning Module**: `engines/billing`
- **Purpose**: Immutable ledger entry on a hotel guest folio.
- **Primary Key**: `folio_entry_id UUID`
- **Important Fields**: `folio_id UUID NOT NULL REFERENCES guest_folios(folio_id)`, `entry_type TEXT NOT NULL (ROOM_TARIFF, ROOM_SERVICE, LAUNDRY, AMENITY, SERVICE_CHARGE, TAX, ADVANCE_DEPOSIT, PAYMENT, ADJUSTMENT, REVERSAL)`, `reference_id UUID`, `description TEXT NOT NULL`, `amount NUMERIC(12, 2) NOT NULL`, `posted_by UUID NOT NULL`, `posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `is_reversal BOOLEAN NOT NULL DEFAULT FALSE`, `reverses_entry_id UUID REFERENCES folio_entries(folio_entry_id)`
- **Immutability (ADR-005)**: Append-only ledger. Adjustments reference the original entry. Zero destructive row mutations.
- **Security Sensitivity**: Critical.

### `payment_transactions`
- **Owning Module**: `engines/payments`
- **Purpose**: Authoritative record of completed, failed, or pending monetary settlements.
- **Tenant Scope**: Mandatory `tenant_id UUID REFERENCES organizations(organization_id)`.
- **Outlet Scope**: Mandatory `outlet_id UUID REFERENCES outlets(outlet_id)`.
- **Primary Key**: `payment_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `outlet_id UUID NOT NULL`, `bill_id UUID REFERENCES bills(bill_id)`, `folio_id UUID REFERENCES guest_folios(folio_id)`, `payment_method TEXT NOT NULL (UPI, CARD, CASH, NET_BANKING, GATEWAY, HOUSE_ACCOUNT)`, `amount NUMERIC(14, 4) NOT NULL CHECK (amount > 0)`, `currency VARCHAR(3) NOT NULL DEFAULT 'INR'`, `status TEXT NOT NULL DEFAULT 'PENDING' (PENDING, PROCESSING, COMPLETED, FAILED, EXPIRED, REFUNDED, PARTIALLY_REFUNDED)`, `gateway_provider TEXT NOT NULL DEFAULT 'MOCK'`, `gateway_transaction_reference TEXT`, `gateway_metadata JSONB DEFAULT '{}'::jsonb`, `idempotency_key UUID NOT NULL UNIQUE`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `completed_at TIMESTAMPTZ`
- **Provider Neutrality (DEC-002)**: Payment gateway interactions are abstracted behind `PaymentGatewayAdapter`. Razorpay integration is deferred; development and preview utilize `MockPaymentAdapter`. No provider-specific DB columns.
- **Check Constraints**: Exactly one of `bill_id` or `folio_id` must be non-null.
- **Immutability**: Completed payment rows are immutable. Changes use `refund_transactions`.
- **Security Sensitivity**: Critical (Financial Money Movement).

### `refund_transactions`
- **Owning Module**: `engines/payments`
- **Purpose**: Immutable refund ledger.
- **Primary Key**: `refund_id UUID`
- **Important Fields**: `payment_id UUID NOT NULL REFERENCES payment_transactions(payment_id)`, `amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0)`, `status TEXT NOT NULL (PENDING, COMPLETED, FAILED)`, `reason TEXT NOT NULL`, `approved_by UUID NOT NULL`, `idempotency_key UUID NOT NULL UNIQUE`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Security Sensitivity**: Critical.

### `payment_idempotency`
- **Owning Module**: `engines/payments`
- **Purpose**: Strict duplicate-request prevention registry for payments and webhooks.
- **Primary Key**: `idempotency_key UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `request_hash TEXT NOT NULL`, `response_status INT NOT NULL`, `response_body JSONB NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `expires_at TIMESTAMPTZ NOT NULL`
- **Security Sensitivity**: High.

---

## 9. Inventory & Procurement Engines

### `inventory_categories` & `inventory_items`
- **Owning Module**: `engines/inventory`
- **Purpose**: Item master for stock tracking (ingredients, beverages, room amenities, linens, cleaning supplies).
- **Tenant Scope**: Mandatory `tenant_id UUID`.
- **Outlet Scope**: Mandatory `outlet_id UUID`.
- **Primary Key**: `inventory_item_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `outlet_id UUID NOT NULL`, `sku TEXT NOT NULL`, `name TEXT NOT NULL`, `unit_of_measure TEXT NOT NULL (KG, LTR, PCS, BOTTLE, BOX)`, `reorder_threshold NUMERIC(12, 2) NOT NULL DEFAULT 0`, `cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0)`, `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- **Unique Constraints**: `(outlet_id, sku)`
- **Deletion Behavior**: Soft-delete (`is_active = FALSE`). Never hard-deleted.
- **Security Sensitivity**: Medium.

### `inventory_locations`
- **Owning Module**: `engines/inventory`
- **Purpose**: Physical storage locations within an outlet (Main Storeroom, Kitchen Walk-in, Bar Floor, Housekeeping Closet).
- **Primary Key**: `location_id UUID`
- **Important Fields**: `outlet_id UUID NOT NULL`, `name TEXT NOT NULL`, `code TEXT NOT NULL`
- **Unique Constraints**: `(outlet_id, code)`
- **Security Sensitivity**: Medium.

### `stock_movements` (Immutable Inventory Ledger)
- **Owning Module**: `engines/inventory`
- **Purpose**: Append-only transactional ledger of every physical stock addition, deduction, transfer, and adjustment.
- **Tenant Scope**: Mandatory `tenant_id UUID REFERENCES organizations(organization_id)`.
- **Outlet Scope**: Mandatory `outlet_id UUID REFERENCES outlets(outlet_id)`.
- **Primary Key**: `movement_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `outlet_id UUID NOT NULL`, `inventory_item_id UUID NOT NULL REFERENCES inventory_items(inventory_item_id)`, `location_id UUID NOT NULL REFERENCES inventory_locations(location_id)`, `movement_type TEXT NOT NULL (OPENING_BALANCE, PURCHASE_RECEIPT, TRANSFER_IN, TRANSFER_OUT, CONSUMPTION, WASTAGE, DAMAGE, EXPIRY, ADJUSTMENT_INCREASE, ADJUSTMENT_DECREASE, RETURN_TO_SUPPLIER)`, `quantity NUMERIC(12, 4) NOT NULL`, `unit_cost NUMERIC(12, 2) NOT NULL CHECK (unit_cost >= 0)`, `reference_id UUID`, `transfer_id UUID`, `reason TEXT`, `created_by UUID NOT NULL REFERENCES users(user_id)`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Ledger Principle (ADR-004)**: `Current Stock = SUM(quantity)`. Historical records are never updated or deleted.
- **Security Sensitivity**: High (Asset tracking).

### `suppliers` & `purchase_orders` & `goods_receipts`
- **Owning Module**: `engines/procurement`
- **Purpose**: Vendor master, purchasing lifecycle, and receiving verification.
- **Primary Key**: `supplier_id UUID`, `po_id UUID`, `receipt_id UUID`
- **Important PO Fields**: `po_number TEXT NOT NULL`, `status TEXT NOT NULL (DRAFT, PENDING_APPROVAL, APPROVED, SENT, PARTIALLY_RECEIVED, RECEIVED, CLOSED, CANCELLED)`, `total_amount NUMERIC(12, 2) NOT NULL`
- **Security Sensitivity**: High (Financial commitments).

---

## 10. Expenses & Cash Management

### `expenses`
- **Owning Module**: `engines/expenses`
- **Purpose**: Operating expenditure logging (petty cash, maintenance repairs, local vendor payouts).
- **Tenant Scope**: Mandatory `tenant_id UUID`.
- **Outlet Scope**: Mandatory `outlet_id UUID`.
- **Primary Key**: `expense_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `outlet_id UUID NOT NULL`, `category_id UUID NOT NULL`, `vendor_name TEXT NOT NULL`, `amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0)`, `currency VARCHAR(3) NOT NULL DEFAULT 'INR'`, `payment_source TEXT NOT NULL (CASH, BANK_TRANSFER, UPI, CARD)`, `status TEXT NOT NULL DEFAULT 'SUBMITTED' (DRAFT, SUBMITTED, PENDING_APPROVAL, APPROVED, REJECTED, PAID)`, `submitted_by UUID NOT NULL`, `approved_by UUID`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Security Sensitivity**: High (Financial disbursement).

### `cash_sessions` & `cash_transactions` & `cash_reconciliations`
- **Owning Module**: `engines/cash`
- **Purpose**: Cash drawer management, daily opening float, cash intake from POS/Folios, cash payouts, and closing discrepancy audit.
- **Primary Key**: `cash_session_id UUID`, `cash_transaction_id UUID`, `reconciliation_id UUID`
- **Immutability**: Cash transactions are append-only.
- **Security Sensitivity**: High (Physical cash accountability).

---

## 11. Operations, Services & Chat

### `service_requests`
- **Owning Module**: `engines/service-requests`
- **Purpose**: Customer and staff operational tickets (Housekeeping, Room Amenities, Waiter Call, Maintenance, Seat Issues).
- **Tenant Scope**: Mandatory `tenant_id UUID`.
- **Outlet Scope**: Mandatory `outlet_id UUID`.
- **Primary Key**: `request_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `outlet_id UUID NOT NULL`, `context_id UUID NOT NULL REFERENCES business_contexts(context_id)`, `department TEXT NOT NULL (HOUSEKEEPING, MAINTENANCE, SERVICE, FRONT_DESK)`, `category_id UUID NOT NULL`, `title TEXT NOT NULL`, `description TEXT`, `priority TEXT NOT NULL DEFAULT 'MEDIUM' (LOW, MEDIUM, HIGH, URGENT)`, `status TEXT NOT NULL DEFAULT 'SUBMITTED' (SUBMITTED, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED, CANCELLED)`, `assigned_to UUID REFERENCES staff_profiles(staff_id)`, `created_by_actor_type TEXT NOT NULL (CUSTOMER, STAFF, SYSTEM)`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `resolved_at TIMESTAMPTZ`
- **Lifecycle**: `SUBMITTED → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED`
- **Security Sensitivity**: Medium.

### `conversations` & `conversation_messages`
- **Owning Module**: `engines/conversations`
- **Purpose**: In-app two-way messaging between guest and staff.
- **Primary Key**: `conversation_id UUID`, `message_id UUID`
- **Important Fields**: `context_id UUID NOT NULL`, `sender_type TEXT NOT NULL (CUSTOMER, STAFF, SYSTEM)`, `sender_id TEXT NOT NULL`, `message_text TEXT NOT NULL`, `is_read BOOLEAN NOT NULL DEFAULT FALSE`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Security Sensitivity**: High (Customer communications).

---

## 12. Vertical Modules

### 12.1 Hotel Vertical
- **`hotel_room_types`**: `(room_type_id UUID, outlet_id, name, base_rate, max_occupancy, amenities JSONB)`
- **`hotel_rooms`**: Extends `business_contexts` where `context_type = 'ROOM'`. Fields: `(context_id UUID PK FK, room_type_id UUID FK, room_number TEXT, floor INT, status)`
- **`hotel_reservations`**: `(reservation_id UUID, guest_id UUID FK, room_type_id UUID FK, check_in_date DATE, check_out_date DATE, status: CONFIRMED, CHECKED_IN, NO_SHOW, CANCELLED, rate_at_booking)`
- **`guest_stays`**: Active guest stay lifecycle: `(stay_id UUID, reservation_id UUID, guest_id UUID, context_id UUID FK, folio_id UUID FK, check_in_at TIMESTAMPTZ, actual_check_out_at TIMESTAMPTZ, status: ACTIVE, CHECKED_OUT)`
- **`housekeeping_tasks`**: `(task_id UUID, context_id UUID FK, task_type: CHECKOUT_CLEAN, STAYOVER, INSPECTION, status: PENDING, ASSIGNED, IN_PROGRESS, COMPLETED, VERIFIED, assigned_to UUID FK)`

### 12.2 Restaurant Vertical
- **`dining_areas`**: `(area_id UUID, outlet_id, name, capacity, sort_order, is_active)`
- **`restaurant_tables`**: Extends `business_contexts` where `context_type = 'TABLE'`. Fields: `(context_id UUID PK FK, area_id UUID FK, table_number TEXT, capacity INT, status)`
- **`queue_entries`**: Walk-in queue waitlist: `(queue_id UUID, customer_name, party_size, phone, status: WAITING, SEATED, CANCELLED, NO_SHOW, joined_at, seated_at)`
- **`table_reservations`**: `(reservation_id UUID, customer_name, customer_phone, party_size, reservation_date DATE, time_slot TIME, context_id UUID FK, status: CONFIRMED, SEATED, CANCELLED)`

### 12.3 Cinema Vertical
- **`cinema_screens`**: `(screen_id UUID, outlet_id, name, total_capacity, sound_system, screen_type)`
- **`cinema_seats`**: Extends `business_contexts` where `context_type = 'SEAT'`. Fields: `(context_id UUID PK FK, screen_id UUID FK, row_label TEXT, seat_number INT, seat_type: STANDARD, PREMIUM, VIP, is_active)`
- **`cinema_shows`**: `(show_id UUID, screen_id UUID FK, movie_title TEXT, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, status: SCHEDULED, ONGOING, COMPLETED, CANCELLED)`

---

## 13. Audit, Security & Platform Services

### `audit_events`
- **Owning Module**: `platform/audit`
- **Purpose**: Immutable operations log capturing every business-critical mutation.
- **Tenant Scope**: Mandatory `tenant_id UUID REFERENCES organizations(organization_id)`.
- **Primary Key**: `audit_id UUID`
- **Important Fields**: `tenant_id UUID NOT NULL`, `outlet_id UUID`, `actor_type TEXT NOT NULL (STAFF, SUPER_ADMIN, CUSTOMER, SYSTEM)`, `actor_id TEXT NOT NULL`, `event_type TEXT NOT NULL`, `resource_type TEXT NOT NULL`, `resource_id TEXT NOT NULL`, `before_state JSONB`, `after_state JSONB`, `ip_address INET`, `request_id TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Immutability**: Strict append-only. Zero UPDATE or DELETE permitted.
- **Security Sensitivity**: Critical (Legal and regulatory compliance).

### `security_events`
- **Owning Module**: `platform/audit`
- **Purpose**: Security telemetry (failed logins, MFA failures, RLS violations, rate-limit triggers).
- **Primary Key**: `security_event_id UUID`
- **Important Fields**: `event_name TEXT NOT NULL`, `severity TEXT NOT NULL (INFO, WARN, CRITICAL)`, `source_ip INET`, `metadata JSONB`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Security Sensitivity**: Critical.
