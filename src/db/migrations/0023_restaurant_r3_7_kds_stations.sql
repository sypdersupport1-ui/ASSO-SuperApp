-- ============================================================================
-- ASSO RESTAURANT VERTICAL — SLICE 3.7: KDS PHASE 2 / ADVANCED FULFILLMENT & STATIONS
-- Migration 0023: Kitchen Stations, Menu Routing & Enhanced KDS Tasks
-- ============================================================================

-- 1. Create kitchen_stations table
CREATE TABLE IF NOT EXISTS "kitchen_stations" (
  "station_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "organizations"("organization_id"),
  "outlet_id" uuid NOT NULL REFERENCES "outlets"("outlet_id"),
  "code" varchar(50) NOT NULL,
  "name" varchar(100) NOT NULL,
  "description" text,
  "display_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_kitchen_stations_tenant_outlet_code" 
  ON "kitchen_stations" ("tenant_id", "outlet_id", "code");

CREATE INDEX IF NOT EXISTS "idx_kitchen_stations_tenant_outlet_order" 
  ON "kitchen_stations" ("tenant_id", "outlet_id", "display_order");

-- 2. Enable and Force Row-Level Security for kitchen_stations
ALTER TABLE "kitchen_stations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kitchen_stations" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kitchen_stations_tenant_select" ON "kitchen_stations";
DROP POLICY IF EXISTS "kitchen_stations_tenant_insert" ON "kitchen_stations";
DROP POLICY IF EXISTS "kitchen_stations_tenant_update" ON "kitchen_stations";
DROP POLICY IF EXISTS "kitchen_stations_tenant_delete" ON "kitchen_stations";

CREATE POLICY "kitchen_stations_tenant_select" ON "kitchen_stations" FOR SELECT
USING (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "kitchen_stations_tenant_insert" ON "kitchen_stations" FOR INSERT
WITH CHECK (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "kitchen_stations_tenant_update" ON "kitchen_stations" FOR UPDATE
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

CREATE POLICY "kitchen_stations_tenant_delete" ON "kitchen_stations" FOR DELETE
USING (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

-- 3. Extend catalog_items for explicit station link
ALTER TABLE "catalog_items" ADD COLUMN IF NOT EXISTS "station_id" uuid REFERENCES "kitchen_stations"("station_id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_catalog_items_station" ON "catalog_items" ("tenant_id", "station_id");

-- 4. Extend kds_tasks for multi-station fulfillment, priority and granular timing
ALTER TABLE "kds_tasks" ADD COLUMN IF NOT EXISTS "station_id" uuid REFERENCES "kitchen_stations"("station_id") ON DELETE SET NULL;
ALTER TABLE "kds_tasks" ADD COLUMN IF NOT EXISTS "priority" varchar(20) DEFAULT 'NORMAL' NOT NULL;
ALTER TABLE "kds_tasks" ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone;
ALTER TABLE "kds_tasks" ADD COLUMN IF NOT EXISTS "ready_at" timestamp with time zone;
ALTER TABLE "kds_tasks" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;
ALTER TABLE "kds_tasks" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
ALTER TABLE "kds_tasks" ADD COLUMN IF NOT EXISTS "destination_label" varchar(100);
ALTER TABLE "kds_tasks" ADD COLUMN IF NOT EXISTS "special_notes" text;

CREATE INDEX IF NOT EXISTS "idx_kds_tasks_station_priority" ON "kds_tasks" ("tenant_id", "outlet_id", "station_routing", "priority");
CREATE INDEX IF NOT EXISTS "idx_kds_tasks_timing" ON "kds_tasks" ("tenant_id", "task_status", "created_at");
