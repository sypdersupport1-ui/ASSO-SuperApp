-- ============================================================================
-- ASSO RESTAURANT VERTICAL — SLICE 3.4: FLOOR / TABLE MAP & ADVANCED OPERATIONS
-- Migration 0020: Restaurant Sections, Spatial Layout Metadata & RLS
-- ============================================================================

-- 1. Restaurant Sections Table
CREATE TABLE IF NOT EXISTS "restaurant_sections" (
  "section_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "organizations"("organization_id"),
  "outlet_id" uuid NOT NULL REFERENCES "outlets"("outlet_id"),
  "name" varchar(100) NOT NULL,
  "code" varchar(50),
  "display_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_restaurant_sections_outlet_name" UNIQUE ("outlet_id", "name")
);

CREATE INDEX IF NOT EXISTS "idx_restaurant_sections_tenant_outlet"
  ON "restaurant_sections" ("tenant_id", "outlet_id");

CREATE INDEX IF NOT EXISTS "idx_restaurant_sections_tenant_outlet_order"
  ON "restaurant_sections" ("tenant_id", "outlet_id", "display_order");

-- Row Level Security for restaurant_sections
ALTER TABLE "restaurant_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "restaurant_sections" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurant_sections_tenant_select" ON "restaurant_sections";
DROP POLICY IF EXISTS "restaurant_sections_tenant_insert" ON "restaurant_sections";
DROP POLICY IF EXISTS "restaurant_sections_tenant_update" ON "restaurant_sections";
DROP POLICY IF EXISTS "restaurant_sections_tenant_delete" ON "restaurant_sections";

CREATE POLICY "restaurant_sections_tenant_select" ON "restaurant_sections" FOR SELECT
USING (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "restaurant_sections_tenant_insert" ON "restaurant_sections" FOR INSERT
WITH CHECK (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "restaurant_sections_tenant_update" ON "restaurant_sections" FOR UPDATE
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

CREATE POLICY "restaurant_sections_tenant_delete" ON "restaurant_sections" FOR DELETE
USING (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

-- 2. Add spatial and visual layout columns to existing restaurant_tables
ALTER TABLE "restaurant_tables"
  ADD COLUMN IF NOT EXISTS "section_id" uuid REFERENCES "restaurant_sections"("section_id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "pos_x" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "pos_y" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "width" integer DEFAULT 90 NOT NULL,
  ADD COLUMN IF NOT EXISTS "height" integer DEFAULT 90 NOT NULL,
  ADD COLUMN IF NOT EXISTS "shape" varchar(20) DEFAULT 'RECTANGLE' NOT NULL,
  ADD COLUMN IF NOT EXISTS "rotation" integer DEFAULT 0 NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_restaurant_tables_section_id"
  ON "restaurant_tables" ("section_id");

CREATE INDEX IF NOT EXISTS "idx_restaurant_tables_tenant_outlet_section_id"
  ON "restaurant_tables" ("tenant_id", "outlet_id", "section_id");
