-- Migration: 0019_scale_foundation_s6_read_analytics.sql
-- Scale Foundation S6: Read Path Hardening & Analytics Reporting Projections

-- 1. Analytics / Reporting Projection Table: analytics_daily_outlet_metrics
CREATE TABLE IF NOT EXISTS "analytics_daily_outlet_metrics" (
  "metric_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "organizations"("organization_id"),
  "outlet_id" uuid NOT NULL REFERENCES "outlets"("outlet_id"),
  "vertical" varchar(30) NOT NULL,
  "metric_date" varchar(10) NOT NULL,
  "order_count" integer NOT NULL DEFAULT 0,
  "gross_sales_amount" numeric(14, 4) NOT NULL DEFAULT '0',
  "net_sales_amount" numeric(14, 4) NOT NULL DEFAULT '0',
  "tax_amount" numeric(14, 4) NOT NULL DEFAULT '0',
  "platform_fee_amount" numeric(14, 4) NOT NULL DEFAULT '0',
  "discount_amount" numeric(14, 4) NOT NULL DEFAULT '0',
  "completed_order_count" integer NOT NULL DEFAULT 0,
  "cancelled_order_count" integer NOT NULL DEFAULT 0,
  "guest_count" integer NOT NULL DEFAULT 0,
  "last_event_id" uuid,
  "last_processed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "uq_analytics_daily_tenant_outlet_date" UNIQUE ("tenant_id", "outlet_id", "metric_date")
);

CREATE INDEX IF NOT EXISTS "idx_analytics_daily_tenant_date"
  ON "analytics_daily_outlet_metrics" ("tenant_id", "metric_date");

-- Enable Row Level Security on analytics_daily_outlet_metrics
ALTER TABLE "analytics_daily_outlet_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_daily_outlet_metrics" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics_daily_outlet_metrics_tenant_select" ON "analytics_daily_outlet_metrics";
DROP POLICY IF EXISTS "analytics_daily_outlet_metrics_tenant_insert" ON "analytics_daily_outlet_metrics";
DROP POLICY IF EXISTS "analytics_daily_outlet_metrics_tenant_update" ON "analytics_daily_outlet_metrics";
DROP POLICY IF EXISTS "analytics_daily_outlet_metrics_tenant_delete" ON "analytics_daily_outlet_metrics";

CREATE POLICY "analytics_daily_outlet_metrics_select" ON "analytics_daily_outlet_metrics" FOR SELECT
USING (
  (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "analytics_daily_outlet_metrics_insert" ON "analytics_daily_outlet_metrics" FOR INSERT
WITH CHECK (
  (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "analytics_daily_outlet_metrics_update" ON "analytics_daily_outlet_metrics" FOR UPDATE
USING (
  (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
)
WITH CHECK (
  (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "analytics_daily_outlet_metrics_delete" ON "analytics_daily_outlet_metrics" FOR DELETE
USING (
  (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

-- 2. Core & Customer Indexes
CREATE INDEX IF NOT EXISTS "idx_outlets_tenant_vertical"
  ON "outlets" ("tenant_id", "vertical_type");

CREATE INDEX IF NOT EXISTS "idx_customers_tenant_phone"
  ON "customers" ("tenant_id", "phone");

CREATE INDEX IF NOT EXISTS "idx_customers_tenant_email"
  ON "customers" ("tenant_id", "email");

-- 3. Business Context & Customer Session Indexes
CREATE INDEX IF NOT EXISTS "idx_business_contexts_tenant_outlet"
  ON "business_contexts" ("tenant_id", "outlet_id");

CREATE INDEX IF NOT EXISTS "idx_business_contexts_tenant_type"
  ON "business_contexts" ("tenant_id", "context_type");

CREATE INDEX IF NOT EXISTS "idx_qr_tokens_context"
  ON "qr_tokens" ("context_id");

CREATE INDEX IF NOT EXISTS "idx_qr_tokens_tenant_outlet"
  ON "qr_tokens" ("tenant_id", "outlet_id");

CREATE INDEX IF NOT EXISTS "idx_customer_sessions_tenant_outlet"
  ON "customer_sessions" ("tenant_id", "outlet_id");

CREATE INDEX IF NOT EXISTS "idx_customer_sessions_token"
  ON "customer_sessions" ("token_id");

CREATE INDEX IF NOT EXISTS "idx_customer_sessions_context"
  ON "customer_sessions" ("context_id");

CREATE INDEX IF NOT EXISTS "idx_customer_sessions_tenant_status"
  ON "customer_sessions" ("tenant_id", "session_status");

-- 4. Restaurant Tables & Sessions Indexes
CREATE INDEX IF NOT EXISTS "idx_restaurant_tables_tenant_outlet_status"
  ON "restaurant_tables" ("tenant_id", "outlet_id", "status");

CREATE INDEX IF NOT EXISTS "idx_restaurant_tables_tenant_outlet_sec"
  ON "restaurant_tables" ("tenant_id", "outlet_id", "section");

CREATE INDEX IF NOT EXISTS "idx_restaurant_table_sessions_tenant_outlet_status"
  ON "restaurant_table_sessions" ("tenant_id", "outlet_id", "status");

-- 5. Hotel Rooms, Stays, and Housekeeping Indexes
CREATE INDEX IF NOT EXISTS "idx_hotel_rooms_tenant_outlet"
  ON "hotel_rooms" ("tenant_id", "outlet_id");

CREATE INDEX IF NOT EXISTS "idx_hotel_rooms_context"
  ON "hotel_rooms" ("context_id");

CREATE INDEX IF NOT EXISTS "idx_hotel_rooms_room_type"
  ON "hotel_rooms" ("room_type_id");

CREATE INDEX IF NOT EXISTS "idx_hotel_rooms_status"
  ON "hotel_rooms" ("tenant_id", "operational_status");

CREATE INDEX IF NOT EXISTS "idx_hotel_stays_tenant_outlet"
  ON "hotel_stays" ("tenant_id", "outlet_id");

CREATE INDEX IF NOT EXISTS "idx_hotel_stays_room_status"
  ON "hotel_stays" ("tenant_id", "room_id", "status");

CREATE INDEX IF NOT EXISTS "idx_hk_tasks_tenant_outlet_status"
  ON "hotel_housekeeping_tasks" ("tenant_id", "outlet_id", "status");

-- 6. Operations: Catalogs, Items, Bills, Payments, Service Requests Indexes
CREATE INDEX IF NOT EXISTS "idx_catalogs_tenant_outlet"
  ON "catalogs" ("tenant_id", "outlet_id");

CREATE INDEX IF NOT EXISTS "idx_catalog_categories_catalog_order"
  ON "catalog_categories" ("catalog_id", "display_order");

CREATE INDEX IF NOT EXISTS "idx_catalog_categories_tenant"
  ON "catalog_categories" ("tenant_id", "catalog_id");

CREATE INDEX IF NOT EXISTS "idx_catalog_items_category_avail"
  ON "catalog_items" ("category_id", "is_available");

CREATE INDEX IF NOT EXISTS "idx_catalog_items_tenant_avail"
  ON "catalog_items" ("tenant_id", "is_available");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_bills_outlet_number"
  ON "bills" ("outlet_id", "bill_number");

CREATE INDEX IF NOT EXISTS "idx_bills_tenant_outlet"
  ON "bills" ("tenant_id", "outlet_id");

CREATE INDEX IF NOT EXISTS "idx_bills_tenant_status"
  ON "bills" ("tenant_id", "status");

CREATE INDEX IF NOT EXISTS "idx_bills_context"
  ON "bills" ("context_id");

CREATE INDEX IF NOT EXISTS "idx_payment_tx_tenant_outlet"
  ON "payment_transactions" ("tenant_id", "outlet_id");

CREATE INDEX IF NOT EXISTS "idx_payment_tx_bill"
  ON "payment_transactions" ("bill_id");

CREATE INDEX IF NOT EXISTS "idx_payment_tx_tenant_status"
  ON "payment_transactions" ("tenant_id", "status");

CREATE INDEX IF NOT EXISTS "idx_service_requests_tenant_outlet_type"
  ON "service_requests" ("tenant_id", "outlet_id", "request_type");

-- 7. System & Communication Indexes
CREATE INDEX IF NOT EXISTS "idx_audit_events_tenant_created"
  ON "audit_events" ("tenant_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_audit_events_resource"
  ON "audit_events" ("resource_type", "resource_id");

CREATE INDEX IF NOT EXISTS "idx_outbox_status_created"
  ON "domain_outbox_events" ("status", "created_at");

CREATE INDEX IF NOT EXISTS "idx_in_app_recipient_unread"
  ON "in_app_notifications" ("tenant_id", "recipient_id", "is_read");
