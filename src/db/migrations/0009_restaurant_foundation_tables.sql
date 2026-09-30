-- ============================================================================
-- ASSO RESTAURANT VERTICAL / SLICE 1: RESTAURANT FOUNDATION & TABLE MANAGEMENT
-- Migration 0009: Restaurant Tables, Table Sessions & Native PostgreSQL RLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "restaurant_tables" (
	"table_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"context_id" uuid NOT NULL,
	"table_number" varchar(50) NOT NULL,
	"display_label" varchar(100) NOT NULL,
	"capacity" integer DEFAULT 4 NOT NULL,
	"section" varchar(100) DEFAULT 'Main Dining' NOT NULL,
	"status" varchar(50) DEFAULT 'AVAILABLE' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "restaurant_table_sessions" (
	"session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"session_number" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'ACTIVE' NOT NULL,
	"guest_count" integer DEFAULT 1 NOT NULL,
	"customer_name" varchar(100),
	"customer_phone" varchar(50),
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"opened_by_user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Foreign Key Constraints
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE NO ACTION ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE NO ACTION ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_context_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."business_contexts"("context_id") ON DELETE NO ACTION ON UPDATE NO ACTION;--> statement-breakpoint

ALTER TABLE "restaurant_table_sessions" ADD CONSTRAINT "restaurant_table_sessions_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE NO ACTION ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "restaurant_table_sessions" ADD CONSTRAINT "restaurant_table_sessions_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE NO ACTION ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "restaurant_table_sessions" ADD CONSTRAINT "restaurant_table_sessions_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."restaurant_tables"("table_id") ON DELETE NO ACTION ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "restaurant_table_sessions" ADD CONSTRAINT "restaurant_table_sessions_opened_by_user_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;--> statement-breakpoint

-- Unique and Performance Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "uq_restaurant_tables_outlet_number" ON "restaurant_tables" ("outlet_id", "table_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_restaurant_tables_tenant_outlet" ON "restaurant_tables" ("tenant_id", "outlet_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_restaurant_tables_context_id" ON "restaurant_tables" ("context_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_restaurant_tables_status" ON "restaurant_tables" ("tenant_id", "status");--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_restaurant_table_sessions_number" ON "restaurant_table_sessions" ("tenant_id", "session_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_active_session_per_table" ON "restaurant_table_sessions" ("table_id") WHERE "status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_restaurant_table_sessions_tenant_table" ON "restaurant_table_sessions" ("tenant_id", "table_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_restaurant_table_sessions_status" ON "restaurant_table_sessions" ("tenant_id", "status");--> statement-breakpoint

-- Row Level Security (RLS) Policies
ALTER TABLE "restaurant_tables" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "restaurant_tables" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "restaurant_tables_tenant_select" ON "restaurant_tables" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "restaurant_tables_tenant_insert" ON "restaurant_tables" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "restaurant_tables_tenant_update" ON "restaurant_tables" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "restaurant_tables_tenant_delete" ON "restaurant_tables" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "restaurant_table_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "restaurant_table_sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "restaurant_table_sessions_tenant_select" ON "restaurant_table_sessions" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "restaurant_table_sessions_tenant_insert" ON "restaurant_table_sessions" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "restaurant_table_sessions_tenant_update" ON "restaurant_table_sessions" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "restaurant_table_sessions_tenant_delete" ON "restaurant_table_sessions" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
