-- ============================================================================
-- ASSO RESTAURANT VERTICAL / SLICE 2: DIGITAL MENU & CUSTOMER QR FLOW
-- Migration 0010: Customer Session Linking, Catalog Images & Pre-Order Cart
-- ============================================================================

-- 1. Extend customer_sessions with customer_id reference to shared customers
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customer_sessions' AND column_name = 'customer_id'
    ) THEN
        ALTER TABLE "customer_sessions" ADD COLUMN "customer_id" uuid;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'customer_sessions_customer_id_fk'
    ) THEN
        ALTER TABLE "customer_sessions" 
        ADD CONSTRAINT "customer_sessions_customer_id_fk" 
        FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("customer_id") 
        ON DELETE SET NULL ON UPDATE NO ACTION;
    END IF;
END $$;
--> statement-breakpoint

-- 2. Extend catalog_items with image_url for digital menu presentation
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'catalog_items' AND column_name = 'image_url'
    ) THEN
        ALTER TABLE "catalog_items" ADD COLUMN "image_url" text;
    END IF;
END $$;
--> statement-breakpoint

-- 3. Create restaurant_cart_items (Pre-Order / Customer Session Cart)
CREATE TABLE IF NOT EXISTS "restaurant_cart_items" (
	"cart_item_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"special_instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Foreign Key Constraints for restaurant_cart_items
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'restaurant_cart_items_tenant_id_fk'
    ) THEN
        ALTER TABLE "restaurant_cart_items" 
        ADD CONSTRAINT "restaurant_cart_items_tenant_id_fk" 
        FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") 
        ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'restaurant_cart_items_session_id_fk'
    ) THEN
        ALTER TABLE "restaurant_cart_items" 
        ADD CONSTRAINT "restaurant_cart_items_session_id_fk" 
        FOREIGN KEY ("session_id") REFERENCES "public"."customer_sessions"("session_id") 
        ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'restaurant_cart_items_item_id_fk'
    ) THEN
        ALTER TABLE "restaurant_cart_items" 
        ADD CONSTRAINT "restaurant_cart_items_item_id_fk" 
        FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("item_id") 
        ON DELETE NO ACTION ON UPDATE NO ACTION;
    END IF;
END $$;
--> statement-breakpoint

-- Unique and Performance Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "uq_restaurant_cart_session_item" ON "restaurant_cart_items" ("session_id", "item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_restaurant_cart_tenant_session" ON "restaurant_cart_items" ("tenant_id", "session_id");
--> statement-breakpoint

-- Row Level Security (RLS) Policies for restaurant_cart_items
ALTER TABLE "restaurant_cart_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "restaurant_cart_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'restaurant_cart_items' AND policyname = 'restaurant_cart_items_tenant_select'
    ) THEN
        CREATE POLICY "restaurant_cart_items_tenant_select" ON "restaurant_cart_items" 
        FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'restaurant_cart_items' AND policyname = 'restaurant_cart_items_tenant_insert'
    ) THEN
        CREATE POLICY "restaurant_cart_items_tenant_insert" ON "restaurant_cart_items" 
        FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'restaurant_cart_items' AND policyname = 'restaurant_cart_items_tenant_update'
    ) THEN
        CREATE POLICY "restaurant_cart_items_tenant_update" ON "restaurant_cart_items" 
        FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) 
        WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'restaurant_cart_items' AND policyname = 'restaurant_cart_items_tenant_delete'
    ) THEN
        CREATE POLICY "restaurant_cart_items_tenant_delete" ON "restaurant_cart_items" 
        FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
    END IF;
END $$;
