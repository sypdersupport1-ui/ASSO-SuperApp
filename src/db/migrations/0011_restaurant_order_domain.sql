-- ============================================================================
-- ASSO RESTAURANT VERTICAL / SLICE 3.1: ORDER DOMAIN & DATABASE FOUNDATION
-- Migration 0011: Restaurant Order Extensions, Constraints & Performance Indexes
-- ============================================================================

-- 1. Extend orders table with Restaurant context references
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'customer_id'
    ) THEN
        ALTER TABLE "orders" ADD COLUMN "customer_id" uuid;
    END IF;
END $$;
--> statement-breakpoint

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'table_id'
    ) THEN
        ALTER TABLE "orders" ADD COLUMN "table_id" uuid;
    END IF;
END $$;
--> statement-breakpoint

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'table_session_id'
    ) THEN
        ALTER TABLE "orders" ADD COLUMN "table_session_id" uuid;
    END IF;
END $$;
--> statement-breakpoint

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'dining_context'
    ) THEN
        ALTER TABLE "orders" ADD COLUMN "dining_context" varchar(50) DEFAULT 'DINE_IN' NOT NULL;
    END IF;
END $$;
--> statement-breakpoint

-- 2. Foreign Key Constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_customer_id_fk'
    ) THEN
        ALTER TABLE "orders" 
        ADD CONSTRAINT "orders_customer_id_fk" 
        FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("customer_id") 
        ON DELETE SET NULL ON UPDATE NO ACTION;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_table_id_fk'
    ) THEN
        ALTER TABLE "orders" 
        ADD CONSTRAINT "orders_table_id_fk" 
        FOREIGN KEY ("table_id") REFERENCES "public"."restaurant_tables"("table_id") 
        ON DELETE SET NULL ON UPDATE NO ACTION;
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'orders_table_session_id_fk'
    ) THEN
        ALTER TABLE "orders" 
        ADD CONSTRAINT "orders_table_session_id_fk" 
        FOREIGN KEY ("table_session_id") REFERENCES "public"."restaurant_table_sessions"("session_id") 
        ON DELETE SET NULL ON UPDATE NO ACTION;
    END IF;
END $$;
--> statement-breakpoint

-- 3. Data Integrity & Non-Negative Financial / Quantity Constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'chk_orders_subtotal_non_negative'
    ) THEN
        ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_subtotal_non_negative" CHECK ("subtotal_amount" >= 0);
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'chk_orders_tax_non_negative'
    ) THEN
        ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_tax_non_negative" CHECK ("tax_amount" >= 0);
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'chk_orders_total_non_negative'
    ) THEN
        ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_total_non_negative" CHECK ("total_amount" >= 0);
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'chk_order_items_quantity_positive'
    ) THEN
        ALTER TABLE "order_items" ADD CONSTRAINT "chk_order_items_quantity_positive" CHECK ("quantity" > 0);
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'chk_order_items_unit_price_non_negative'
    ) THEN
        ALTER TABLE "order_items" ADD CONSTRAINT "chk_order_items_unit_price_non_negative" CHECK ("unit_price" >= 0);
    END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'chk_order_items_subtotal_non_negative'
    ) THEN
        ALTER TABLE "order_items" ADD CONSTRAINT "chk_order_items_subtotal_non_negative" CHECK ("subtotal" >= 0);
    END IF;
END $$;
--> statement-breakpoint

-- 4. Unique Indexes & Scoped Idempotency
-- Disambiguate historical dev duplicates if any exist before creating unique index
DO $$
BEGIN
    UPDATE orders 
    SET order_number = order_number || '-' || substring(order_id::text, 1, 4)
    WHERE order_id IN (
        SELECT order_id
        FROM (
            SELECT order_id, ROW_NUMBER() OVER (PARTITION BY outlet_id, order_number ORDER BY created_at) as rn
            FROM orders
        ) t
        WHERE t.rn > 1
    );
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_orders_outlet_order_number" ON "orders" ("outlet_id", "order_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_orders_tenant_idempotency" ON "orders" ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint

-- 5. Performance Indexes for Table Sessions, Customers, and KDS Item Tracking
CREATE INDEX IF NOT EXISTS "idx_orders_tenant_table_session" ON "orders" ("tenant_id", "table_session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_tenant_table" ON "orders" ("tenant_id", "table_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_tenant_customer" ON "orders" ("tenant_id", "customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_tenant_status" ON "orders" ("tenant_id", "status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_order_items_tenant_order" ON "order_items" ("tenant_id", "order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_items_tenant_status" ON "order_items" ("tenant_id", "item_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_items_station" ON "order_items" ("tenant_id", "fulfillment_station");
