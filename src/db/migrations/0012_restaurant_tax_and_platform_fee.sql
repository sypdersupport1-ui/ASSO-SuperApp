-- ============================================================================
-- ASSO RESTAURANT VERTICAL / SLICE 3.2: CONFIGURABLE GST & PLATFORM FEES
-- Migration 0012: Dynamic Tax & Platform Fee Configurations & Order Extensions
-- ============================================================================

-- 1. Extend orders table with snapshot columns for tax and platform fees
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'tax_rate'
    ) THEN
        ALTER TABLE "orders" ADD COLUMN "tax_rate" numeric(6, 4) DEFAULT '0.0000' NOT NULL;
    END IF;
END $$;
--> statement-breakpoint

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'platform_fee_type'
    ) THEN
        ALTER TABLE "orders" ADD COLUMN "platform_fee_type" varchar(20) DEFAULT 'PERCENTAGE' NOT NULL;
    END IF;
END $$;
--> statement-breakpoint

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'platform_fee_rate'
    ) THEN
        ALTER TABLE "orders" ADD COLUMN "platform_fee_rate" numeric(6, 4) DEFAULT '0.0000' NOT NULL;
    END IF;
END $$;
--> statement-breakpoint

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'platform_fee_amount'
    ) THEN
        ALTER TABLE "orders" ADD COLUMN "platform_fee_amount" numeric(14, 4) DEFAULT '0' NOT NULL;
    END IF;
END $$;
--> statement-breakpoint

-- 2. Financial Non-Negative Check Constraints on Orders
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'chk_orders_tax_rate_non_negative'
    ) THEN
        ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_tax_rate_non_negative" CHECK ("tax_rate" >= 0);
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'chk_orders_platform_fee_rate_non_negative'
    ) THEN
        ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_platform_fee_rate_non_negative" CHECK ("platform_fee_rate" >= 0);
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'chk_orders_platform_fee_amount_non_negative'
    ) THEN
        ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_platform_fee_amount_non_negative" CHECK ("platform_fee_amount" >= 0);
    END IF;
END $$;
--> statement-breakpoint

-- 3. Tax Configurations Table (Business / Outlet Level)
CREATE TABLE IF NOT EXISTS "tax_configurations" (
    "config_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "organizations"("organization_id") ON DELETE CASCADE,
    "outlet_id" uuid REFERENCES "outlets"("outlet_id") ON DELETE CASCADE,
    "tax_name" varchar(100) DEFAULT 'GST' NOT NULL,
    "tax_rate" numeric(6, 4) DEFAULT '0.0000' NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_tax_config_tenant_outlet" ON "tax_configurations" ("tenant_id", "outlet_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tax_config_tenant" ON "tax_configurations" ("tenant_id");
--> statement-breakpoint

-- 4. Platform Fee Configurations Table (ASSO Super Admin / Platform Level)
CREATE TABLE IF NOT EXISTS "platform_fee_configurations" (
    "config_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid REFERENCES "organizations"("organization_id") ON DELETE CASCADE,
    "outlet_id" uuid REFERENCES "outlets"("outlet_id") ON DELETE CASCADE,
    "fee_type" varchar(20) DEFAULT 'PERCENTAGE' NOT NULL,
    "fee_rate" numeric(6, 4) DEFAULT '0.0000' NOT NULL,
    "fixed_amount" numeric(14, 4) DEFAULT '0.0000' NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "description" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_platform_fee_tenant_outlet" ON "platform_fee_configurations" ("tenant_id", "outlet_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_platform_fee_tenant" ON "platform_fee_configurations" ("tenant_id");
--> statement-breakpoint

-- 5. Native Row Level Security (RLS)
ALTER TABLE "tax_configurations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tax_configurations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "platform_fee_configurations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "platform_fee_configurations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'tax_configurations' AND policyname = 'tax_configurations_tenant_isolation'
    ) THEN
        CREATE POLICY "tax_configurations_tenant_isolation" ON "tax_configurations"
        AS RESTRICTIVE
        FOR ALL
        TO authenticated
        USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'platform_fee_configurations' AND policyname = 'platform_fee_configurations_isolation'
    ) THEN
        CREATE POLICY "platform_fee_configurations_isolation" ON "platform_fee_configurations"
        AS RESTRICTIVE
        FOR ALL
        TO authenticated
        USING (
            "tenant_id" IS NULL 
            OR "tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        );
    END IF;
END $$;
