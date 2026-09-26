CREATE TABLE "commercial_plans" (
	"plan_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"tier_level" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_plans_plan_code_unique" UNIQUE("plan_code")
);
--> statement-breakpoint
CREATE TABLE "plan_modules" (
	"plan_id" uuid NOT NULL,
	"module_code" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_modules" (
	"module_code" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_core" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_configurations" (
	"pricing_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" varchar(50) NOT NULL,
	"target_code" varchar(50) NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"billing_period" varchar(50) NOT NULL,
	"base_price" numeric(14, 4) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_until" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_entitlements" (
	"entitlement_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"module_code" varchar(50) NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"granted_via" varchar(50) NOT NULL,
	"pricing_version_id" uuid,
	"applied_price" numeric(14, 4),
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_contexts" (
	"context_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"context_type" varchar(50) NOT NULL,
	"identifier" varchar(100) NOT NULL,
	"display_label" varchar(100) NOT NULL,
	"status" varchar(50) DEFAULT 'AVAILABLE' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_sessions" (
	"session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"context_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"device_fingerprint" varchar(255) NOT NULL,
	"customer_phone" varchar(50),
	"customer_name" varchar(100),
	"session_status" varchar(50) DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qr_tokens" (
	"token_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"context_id" uuid NOT NULL,
	"opaque_token" varchar(128) NOT NULL,
	"token_status" varchar(50) DEFAULT 'ACTIVE' NOT NULL,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qr_tokens_opaque_token_unique" UNIQUE("opaque_token")
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"bill_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"context_id" uuid,
	"bill_number" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'OPEN' NOT NULL,
	"subtotal_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
	"total_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
	"settled_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
	"idempotency_key" varchar(100),
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_categories" (
	"category_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"catalog_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"item_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"sku" varchar(100),
	"base_price" numeric(14, 4) NOT NULL,
	"tax_rate" numeric(6, 4) DEFAULT '0.0500' NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"fulfillment_station" varchar(50) DEFAULT 'KITCHEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalogs" (
	"catalog_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"order_item_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"item_name" varchar(255) NOT NULL,
	"unit_price" numeric(14, 4) NOT NULL,
	"quantity" integer NOT NULL,
	"subtotal" numeric(14, 4) NOT NULL,
	"fulfillment_station" varchar(50) DEFAULT 'KITCHEN' NOT NULL,
	"item_status" varchar(50) DEFAULT 'PLACED' NOT NULL,
	"special_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"history_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" varchar(50) NOT NULL,
	"to_status" varchar(50) NOT NULL,
	"changed_by_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"order_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"context_id" uuid NOT NULL,
	"session_id" uuid,
	"created_by_staff_id" uuid,
	"order_number" varchar(50) NOT NULL,
	"order_source" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'PLACED' NOT NULL,
	"cancellation_reason" text,
	"idempotency_key" varchar(100),
	"subtotal_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
	"total_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_refunds" (
	"refund_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"refund_amount" numeric(14, 4) NOT NULL,
	"gateway_refund_id" varchar(100),
	"reason" text NOT NULL,
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"approved_by_staff_id" uuid,
	"idempotency_key" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refunds_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"payment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"bill_id" uuid,
	"payment_method" varchar(50) NOT NULL,
	"gateway_provider" varchar(50) DEFAULT 'MOCK' NOT NULL,
	"gateway_transaction_reference" varchar(100),
	"gateway_metadata" jsonb DEFAULT '{}'::jsonb,
	"amount" numeric(14, 4) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"idempotency_key" varchar(100),
	"error_code" varchar(100),
	"error_description" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_transactions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"item_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"sku" varchar(100) NOT NULL,
	"unit_id" uuid NOT NULL,
	"reorder_level" numeric(12, 3) DEFAULT '0' NOT NULL,
	"current_cost" numeric(14, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_locations" (
	"location_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid,
	"name" varchar(255) NOT NULL,
	"location_type" varchar(50) DEFAULT 'CENTRAL_STORE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_stock_balances" (
	"balance_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity_on_hand" numeric(14, 4) DEFAULT '0' NOT NULL,
	"reserved_quantity" numeric(14, 4) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_stock_movements" (
	"movement_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"from_location_id" uuid,
	"to_location_id" uuid,
	"movement_type" varchar(50) NOT NULL,
	"quantity" numeric(14, 4) NOT NULL,
	"unit_cost" numeric(14, 4) NOT NULL,
	"reference_id" varchar(100),
	"reference_type" varchar(50),
	"performed_by_user_id" uuid,
	"reason" text,
	"idempotency_key" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_stock_movements_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "inventory_suppliers" (
	"supplier_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"contact_email" varchar(255),
	"contact_phone" varchar(50),
	"tax_identifier" varchar(100),
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_units" (
	"unit_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_folio_entries" (
	"entry_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"folio_id" uuid NOT NULL,
	"entry_type" varchar(50) NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"description" text NOT NULL,
	"reference_id" uuid,
	"reverses_entry_id" uuid,
	"posted_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_folios" (
	"folio_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"stay_id" uuid,
	"folio_number" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'OPEN' NOT NULL,
	"total_charges" numeric(14, 4) DEFAULT '0' NOT NULL,
	"total_payments" numeric(14, 4) DEFAULT '0' NOT NULL,
	"balance_due" numeric(14, 4) DEFAULT '0' NOT NULL,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"movement_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"movement_type" varchar(50) NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"reference_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_sessions" (
	"session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"opening_balance" numeric(14, 4) NOT NULL,
	"closing_balance" numeric(14, 4),
	"calculated_cash_in" numeric(14, 4) DEFAULT '0',
	"calculated_cash_out" numeric(14, 4) DEFAULT '0',
	"discrepancy_amount" numeric(14, 4) DEFAULT '0',
	"status" varchar(50) DEFAULT 'OPEN' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"category_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(50) NOT NULL,
	"is_active" varchar(10) DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"expense_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"payee_name" varchar(255) NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"incurred_date" date NOT NULL,
	"description" text NOT NULL,
	"receipt_attachment_url" text,
	"created_by_staff_id" uuid NOT NULL,
	"approved_by_staff_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_modules" ADD CONSTRAINT "plan_modules_plan_id_commercial_plans_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."commercial_plans"("plan_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_modules" ADD CONSTRAINT "plan_modules_module_code_platform_modules_module_code_fk" FOREIGN KEY ("module_code") REFERENCES "public"."platform_modules"("module_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_module_code_platform_modules_module_code_fk" FOREIGN KEY ("module_code") REFERENCES "public"."platform_modules"("module_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_pricing_version_id_pricing_configurations_pricing_id_fk" FOREIGN KEY ("pricing_version_id") REFERENCES "public"."pricing_configurations"("pricing_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_contexts" ADD CONSTRAINT "business_contexts_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_contexts" ADD CONSTRAINT "business_contexts_outlet_id_outlets_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_outlet_id_outlets_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_context_id_business_contexts_context_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."business_contexts"("context_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_token_id_qr_tokens_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."qr_tokens"("token_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_tokens" ADD CONSTRAINT "qr_tokens_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_tokens" ADD CONSTRAINT "qr_tokens_outlet_id_outlets_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_tokens" ADD CONSTRAINT "qr_tokens_context_id_business_contexts_context_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."business_contexts"("context_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_outlet_id_outlets_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_context_id_business_contexts_context_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."business_contexts"("context_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_catalog_id_catalogs_catalog_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("catalog_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_category_id_catalog_categories_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."catalog_categories"("category_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogs" ADD CONSTRAINT "catalogs_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogs" ADD CONSTRAINT "catalogs_outlet_id_outlets_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("order_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_item_id_catalog_items_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("order_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_user_id_users_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_outlets_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_context_id_business_contexts_context_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."business_contexts"("context_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_session_id_customer_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."customer_sessions"("session_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_staff_id_staff_profiles_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_profiles"("staff_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_id_payment_transactions_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment_transactions"("payment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_approved_by_staff_id_staff_profiles_staff_id_fk" FOREIGN KEY ("approved_by_staff_id") REFERENCES "public"."staff_profiles"("staff_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_outlet_id_outlets_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_bill_id_bills_bill_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("bill_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_unit_id_inventory_units_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."inventory_units"("unit_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_outlet_id_outlets_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_balances" ADD CONSTRAINT "inventory_stock_balances_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_balances" ADD CONSTRAINT "inventory_stock_balances_item_id_inventory_items_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_balances" ADD CONSTRAINT "inventory_stock_balances_location_id_inventory_locations_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_movements" ADD CONSTRAINT "inventory_stock_movements_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_movements" ADD CONSTRAINT "inventory_stock_movements_item_id_inventory_items_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_movements" ADD CONSTRAINT "inventory_stock_movements_from_location_id_inventory_locations_location_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."inventory_locations"("location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_movements" ADD CONSTRAINT "inventory_stock_movements_to_location_id_inventory_locations_location_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."inventory_locations"("location_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_stock_movements" ADD CONSTRAINT "inventory_stock_movements_performed_by_user_id_users_user_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_suppliers" ADD CONSTRAINT "inventory_suppliers_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_folio_entries" ADD CONSTRAINT "hotel_folio_entries_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_folio_entries" ADD CONSTRAINT "hotel_folio_entries_folio_id_hotel_folios_folio_id_fk" FOREIGN KEY ("folio_id") REFERENCES "public"."hotel_folios"("folio_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_folio_entries" ADD CONSTRAINT "hotel_folio_entries_posted_by_staff_id_staff_profiles_staff_id_fk" FOREIGN KEY ("posted_by_staff_id") REFERENCES "public"."staff_profiles"("staff_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_folios" ADD CONSTRAINT "hotel_folios_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_folios" ADD CONSTRAINT "hotel_folios_outlet_id_outlets_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_session_id_cash_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_sessions"("session_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_outlet_id_outlets_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_staff_id_staff_profiles_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("staff_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_outlet_id_outlets_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("category_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_staff_id_staff_profiles_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."staff_profiles"("staff_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_staff_id_staff_profiles_staff_id_fk" FOREIGN KEY ("approved_by_staff_id") REFERENCES "public"."staff_profiles"("staff_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hotel_folios_outlet_number" ON "hotel_folios" USING btree ("outlet_id","folio_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_exp_categories_tenant_code" ON "expense_categories" USING btree ("tenant_id","code");