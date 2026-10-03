-- ============================================================================
-- ASSO RESTAURANT VERTICAL — SLICE 3.5: TABLE RESERVATIONS & WAITLIST MANAGEMENT
-- Migration 0021: Restaurant Reservations, Waitlist & Multi-Tenant RLS
-- ============================================================================

-- 1. Restaurant Reservations Table
CREATE TABLE IF NOT EXISTS "restaurant_reservations" (
  "reservation_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "organizations"("organization_id"),
  "outlet_id" uuid NOT NULL REFERENCES "outlets"("outlet_id"),
  "customer_id" uuid REFERENCES "customers"("customer_id"),
  "customer_name" varchar(255) NOT NULL,
  "customer_phone" varchar(50) NOT NULL,
  "customer_email" varchar(255),
  "party_size" integer NOT NULL,
  "reservation_date" varchar(10) NOT NULL,
  "reservation_time" varchar(10) NOT NULL,
  "duration_minutes" integer DEFAULT 90 NOT NULL,
  "status" varchar(50) DEFAULT 'CONFIRMED' NOT NULL,
  "assigned_table_id" uuid REFERENCES "restaurant_tables"("table_id") ON DELETE SET NULL,
  "section_id" uuid REFERENCES "restaurant_sections"("section_id") ON DELETE SET NULL,
  "notes" text,
  "source" varchar(50) DEFAULT 'CUSTOMER_WEB' NOT NULL,
  "seated_session_id" uuid REFERENCES "restaurant_table_sessions"("session_id") ON DELETE SET NULL,
  "created_by_user_id" uuid REFERENCES "users"("user_id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_restaurant_reservations_tenant_outlet_date"
  ON "restaurant_reservations" ("tenant_id", "outlet_id", "reservation_date");

CREATE INDEX IF NOT EXISTS "idx_restaurant_reservations_tenant_outlet_status"
  ON "restaurant_reservations" ("tenant_id", "outlet_id", "status");

CREATE INDEX IF NOT EXISTS "idx_restaurant_reservations_assigned_table"
  ON "restaurant_reservations" ("tenant_id", "assigned_table_id", "reservation_date");

CREATE INDEX IF NOT EXISTS "idx_restaurant_reservations_customer_phone"
  ON "restaurant_reservations" ("tenant_id", "customer_phone");

-- Row Level Security for restaurant_reservations
ALTER TABLE "restaurant_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "restaurant_reservations" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurant_reservations_tenant_select" ON "restaurant_reservations";
DROP POLICY IF EXISTS "restaurant_reservations_tenant_insert" ON "restaurant_reservations";
DROP POLICY IF EXISTS "restaurant_reservations_tenant_update" ON "restaurant_reservations";
DROP POLICY IF EXISTS "restaurant_reservations_tenant_delete" ON "restaurant_reservations";

CREATE POLICY "restaurant_reservations_tenant_select" ON "restaurant_reservations" FOR SELECT
USING (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "restaurant_reservations_tenant_insert" ON "restaurant_reservations" FOR INSERT
WITH CHECK (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "restaurant_reservations_tenant_update" ON "restaurant_reservations" FOR UPDATE
USING (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
)
WITH CHECK (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "restaurant_reservations_tenant_delete" ON "restaurant_reservations" FOR DELETE
USING (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);


-- 2. Restaurant Waitlist Table
CREATE TABLE IF NOT EXISTS "restaurant_waitlist" (
  "waitlist_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "organizations"("organization_id"),
  "outlet_id" uuid NOT NULL REFERENCES "outlets"("outlet_id"),
  "customer_id" uuid REFERENCES "customers"("customer_id"),
  "customer_name" varchar(255) NOT NULL,
  "customer_phone" varchar(50) NOT NULL,
  "party_size" integer NOT NULL,
  "preferred_section_id" uuid REFERENCES "restaurant_sections"("section_id") ON DELETE SET NULL,
  "queue_position" integer NOT NULL,
  "estimated_wait_minutes" integer DEFAULT 15 NOT NULL,
  "status" varchar(50) DEFAULT 'WAITING' NOT NULL,
  "assigned_table_id" uuid REFERENCES "restaurant_tables"("table_id") ON DELETE SET NULL,
  "seated_session_id" uuid REFERENCES "restaurant_table_sessions"("session_id") ON DELETE SET NULL,
  "notes" text,
  "called_at" timestamp with time zone,
  "seated_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_restaurant_waitlist_tenant_outlet_queue"
  ON "restaurant_waitlist" ("tenant_id", "outlet_id", "status", "queue_position");

CREATE INDEX IF NOT EXISTS "idx_restaurant_waitlist_tenant_outlet_created"
  ON "restaurant_waitlist" ("tenant_id", "outlet_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_restaurant_waitlist_customer_phone"
  ON "restaurant_waitlist" ("tenant_id", "customer_phone");

-- Row Level Security for restaurant_waitlist
ALTER TABLE "restaurant_waitlist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "restaurant_waitlist" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurant_waitlist_tenant_select" ON "restaurant_waitlist";
DROP POLICY IF EXISTS "restaurant_waitlist_tenant_insert" ON "restaurant_waitlist";
DROP POLICY IF EXISTS "restaurant_waitlist_tenant_update" ON "restaurant_waitlist";
DROP POLICY IF EXISTS "restaurant_waitlist_tenant_delete" ON "restaurant_waitlist";

CREATE POLICY "restaurant_waitlist_tenant_select" ON "restaurant_waitlist" FOR SELECT
USING (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "restaurant_waitlist_tenant_insert" ON "restaurant_waitlist" FOR INSERT
WITH CHECK (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "restaurant_waitlist_tenant_update" ON "restaurant_waitlist" FOR UPDATE
USING (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
)
WITH CHECK (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "restaurant_waitlist_tenant_delete" ON "restaurant_waitlist" FOR DELETE
USING (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);
