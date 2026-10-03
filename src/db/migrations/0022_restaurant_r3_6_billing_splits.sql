-- ============================================================================
-- ASSO RESTAURANT VERTICAL — SLICE 3.6: BILL SPLITTING, TIP & MULTI-PAYMENT
-- Migration 0022: Restaurant Billing, Splits, Tips & Multi-Payment Settlement
-- ============================================================================

-- 1. Extend existing shared operations "bills" table for Restaurant Context & Snapshots
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "table_session_id" uuid REFERENCES "restaurant_table_sessions"("session_id") ON DELETE SET NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "order_id" uuid REFERENCES "orders"("order_id") ON DELETE SET NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "platform_fee_amount" numeric(14, 4) DEFAULT '0' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "tip_amount" numeric(14, 4) DEFAULT '0' NOT NULL;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "notes" text;

CREATE INDEX IF NOT EXISTS "idx_bills_tenant_session" ON "bills" ("tenant_id", "table_session_id");
CREATE INDEX IF NOT EXISTS "idx_bills_tenant_order" ON "bills" ("tenant_id", "order_id");

-- 2. Extend existing shared operations "payment_transactions" table
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "portion_id" uuid;
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "received_by_staff_id" uuid REFERENCES "users"("user_id") ON DELETE SET NULL;
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "notes" text;

CREATE INDEX IF NOT EXISTS "idx_payment_tx_portion" ON "payment_transactions" ("portion_id");

-- 3. Restaurant Bill Splits Table
CREATE TABLE IF NOT EXISTS "restaurant_bill_splits" (
  "split_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "organizations"("organization_id"),
  "outlet_id" uuid NOT NULL REFERENCES "outlets"("outlet_id"),
  "bill_id" uuid NOT NULL REFERENCES "bills"("bill_id") ON DELETE CASCADE,
  "split_type" varchar(50) NOT NULL, -- 'EQUAL', 'ITEM', 'CUSTOM'
  "total_portions" integer NOT NULL,
  "status" varchar(50) DEFAULT 'ACTIVE' NOT NULL, -- 'ACTIVE', 'SETTLED', 'CANCELLED'
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_restaurant_bill_splits_tenant_bill"
  ON "restaurant_bill_splits" ("tenant_id", "bill_id");

CREATE INDEX IF NOT EXISTS "idx_restaurant_bill_splits_tenant_status"
  ON "restaurant_bill_splits" ("tenant_id", "status");

-- Row Level Security for restaurant_bill_splits
ALTER TABLE "restaurant_bill_splits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "restaurant_bill_splits" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurant_bill_splits_tenant_select" ON "restaurant_bill_splits";
DROP POLICY IF EXISTS "restaurant_bill_splits_tenant_insert" ON "restaurant_bill_splits";
DROP POLICY IF EXISTS "restaurant_bill_splits_tenant_update" ON "restaurant_bill_splits";
DROP POLICY IF EXISTS "restaurant_bill_splits_tenant_delete" ON "restaurant_bill_splits";

CREATE POLICY "restaurant_bill_splits_tenant_select" ON "restaurant_bill_splits" FOR SELECT
USING (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "restaurant_bill_splits_tenant_insert" ON "restaurant_bill_splits" FOR INSERT
WITH CHECK (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "restaurant_bill_splits_tenant_update" ON "restaurant_bill_splits" FOR UPDATE
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

CREATE POLICY "restaurant_bill_splits_tenant_delete" ON "restaurant_bill_splits" FOR DELETE
USING (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);


-- 4. Restaurant Bill Split Portions Table
CREATE TABLE IF NOT EXISTS "restaurant_bill_split_portions" (
  "portion_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "organizations"("organization_id"),
  "outlet_id" uuid NOT NULL REFERENCES "outlets"("outlet_id"),
  "split_id" uuid NOT NULL REFERENCES "restaurant_bill_splits"("split_id") ON DELETE CASCADE,
  "portion_number" integer NOT NULL,
  "name" varchar(100) NOT NULL,
  "allocated_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
  "tax_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
  "platform_fee_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
  "discount_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
  "tip_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
  "total_amount" numeric(14, 4) NOT NULL,
  "paid_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
  "status" varchar(50) DEFAULT 'UNPAID' NOT NULL, -- 'UNPAID', 'PARTIALLY_PAID', 'PAID'
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_restaurant_split_portions_tenant_split"
  ON "restaurant_bill_split_portions" ("tenant_id", "split_id");

CREATE INDEX IF NOT EXISTS "idx_restaurant_split_portions_tenant_status"
  ON "restaurant_bill_split_portions" ("tenant_id", "status");

-- Row Level Security for restaurant_bill_split_portions
ALTER TABLE "restaurant_bill_split_portions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "restaurant_bill_split_portions" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurant_bill_split_portions_tenant_select" ON "restaurant_bill_split_portions";
DROP POLICY IF EXISTS "restaurant_bill_split_portions_tenant_insert" ON "restaurant_bill_split_portions";
DROP POLICY IF EXISTS "restaurant_bill_split_portions_tenant_update" ON "restaurant_bill_split_portions";
DROP POLICY IF EXISTS "restaurant_bill_split_portions_tenant_delete" ON "restaurant_bill_split_portions";

CREATE POLICY "restaurant_bill_split_portions_tenant_select" ON "restaurant_bill_split_portions" FOR SELECT
USING (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "restaurant_bill_split_portions_tenant_insert" ON "restaurant_bill_split_portions" FOR INSERT
WITH CHECK (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "restaurant_bill_split_portions_tenant_update" ON "restaurant_bill_split_portions" FOR UPDATE
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

CREATE POLICY "restaurant_bill_split_portions_tenant_delete" ON "restaurant_bill_split_portions" FOR DELETE
USING (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);


-- 5. Restaurant Bill Split Items Table (Item-Based Split Mapping)
CREATE TABLE IF NOT EXISTS "restaurant_bill_split_items" (
  "split_item_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "organizations"("organization_id"),
  "outlet_id" uuid NOT NULL REFERENCES "outlets"("outlet_id"),
  "portion_id" uuid NOT NULL REFERENCES "restaurant_bill_split_portions"("portion_id") ON DELETE CASCADE,
  "order_item_id" uuid NOT NULL REFERENCES "order_items"("order_item_id") ON DELETE CASCADE,
  "allocated_quantity" integer NOT NULL,
  "allocated_amount" numeric(14, 4) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_restaurant_split_items_tenant_portion"
  ON "restaurant_bill_split_items" ("tenant_id", "portion_id");

CREATE INDEX IF NOT EXISTS "idx_restaurant_split_items_order_item"
  ON "restaurant_bill_split_items" ("order_item_id");

-- Row Level Security for restaurant_bill_split_items
ALTER TABLE "restaurant_bill_split_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "restaurant_bill_split_items" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurant_bill_split_items_tenant_select" ON "restaurant_bill_split_items";
DROP POLICY IF EXISTS "restaurant_bill_split_items_tenant_insert" ON "restaurant_bill_split_items";
DROP POLICY IF EXISTS "restaurant_bill_split_items_tenant_update" ON "restaurant_bill_split_items";
DROP POLICY IF EXISTS "restaurant_bill_split_items_tenant_delete" ON "restaurant_bill_split_items";

CREATE POLICY "restaurant_bill_split_items_tenant_select" ON "restaurant_bill_split_items" FOR SELECT
USING (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "restaurant_bill_split_items_tenant_insert" ON "restaurant_bill_split_items" FOR INSERT
WITH CHECK (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "restaurant_bill_split_items_tenant_update" ON "restaurant_bill_split_items" FOR UPDATE
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

CREATE POLICY "restaurant_bill_split_items_tenant_delete" ON "restaurant_bill_split_items" FOR DELETE
USING (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);


-- 6. Restaurant Tip Distributions Table
CREATE TABLE IF NOT EXISTS "restaurant_tip_distributions" (
  "tip_distribution_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "organizations"("organization_id"),
  "outlet_id" uuid NOT NULL REFERENCES "outlets"("outlet_id"),
  "bill_id" uuid NOT NULL REFERENCES "bills"("bill_id") ON DELETE CASCADE,
  "staff_id" uuid REFERENCES "staff_profiles"("staff_id") ON DELETE SET NULL,
  "recipient_name" varchar(100) NOT NULL,
  "amount" numeric(14, 4) NOT NULL,
  "percentage" numeric(6, 4),
  "notes" text,
  "distributed_by_user_id" uuid REFERENCES "users"("user_id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_restaurant_tip_dist_tenant_bill"
  ON "restaurant_tip_distributions" ("tenant_id", "bill_id");

CREATE INDEX IF NOT EXISTS "idx_restaurant_tip_dist_staff"
  ON "restaurant_tip_distributions" ("tenant_id", "staff_id");

-- Row Level Security for restaurant_tip_distributions
ALTER TABLE "restaurant_tip_distributions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "restaurant_tip_distributions" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurant_tip_distributions_tenant_select" ON "restaurant_tip_distributions";
DROP POLICY IF EXISTS "restaurant_tip_distributions_tenant_insert" ON "restaurant_tip_distributions";
DROP POLICY IF EXISTS "restaurant_tip_distributions_tenant_update" ON "restaurant_tip_distributions";
DROP POLICY IF EXISTS "restaurant_tip_distributions_tenant_delete" ON "restaurant_tip_distributions";

CREATE POLICY "restaurant_tip_distributions_tenant_select" ON "restaurant_tip_distributions" FOR SELECT
USING (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "restaurant_tip_distributions_tenant_insert" ON "restaurant_tip_distributions" FOR INSERT
WITH CHECK (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "restaurant_tip_distributions_tenant_update" ON "restaurant_tip_distributions" FOR UPDATE
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

CREATE POLICY "restaurant_tip_distributions_tenant_delete" ON "restaurant_tip_distributions" FOR DELETE
USING (
  ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);
