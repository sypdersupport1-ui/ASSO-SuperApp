-- ============================================================================
-- ASSO PHASE 8 / SLICE 1: SHARED TRANSACTION EVENTS + COMMUNICATION FOUNDATION
-- Migration 0008: Outbox, Templates, Notifications, Delivery Logs & Native RLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS "domain_outbox_events" (
	"outbox_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid,
	"vertical" varchar(30) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"aggregate_type" varchar(100) NOT NULL,
	"aggregate_id" varchar(100) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"provider_ref" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"next_retry_at" timestamp with time zone
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "communication_templates" (
	"template_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"vertical" varchar(30) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"channel" varchar(30) NOT NULL,
	"template_identifier" varchar(100) NOT NULL,
	"title_template" varchar(255) NOT NULL,
	"body_template" text NOT NULL,
	"supported_variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "in_app_notifications" (
	"notification_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid,
	"recipient_type" varchar(20) NOT NULL,
	"recipient_id" varchar(100) NOT NULL,
	"role_scope" varchar(50),
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"deep_link" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "communication_delivery_logs" (
	"log_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outbox_id" uuid,
	"event_id" uuid NOT NULL,
	"channel" varchar(30) NOT NULL,
	"recipient" varchar(255) NOT NULL,
	"status" varchar(20) NOT NULL,
	"provider_reference" varchar(255),
	"error_message" text,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Foreign Key Constraints
ALTER TABLE "domain_outbox_events" ADD CONSTRAINT "domain_outbox_events_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE NO ACTION ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "domain_outbox_events" ADD CONSTRAINT "domain_outbox_events_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE NO ACTION ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "communication_templates" ADD CONSTRAINT "communication_templates_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE NO ACTION ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE NO ACTION ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE NO ACTION ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "communication_delivery_logs" ADD CONSTRAINT "communication_delivery_logs_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE NO ACTION ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "communication_delivery_logs" ADD CONSTRAINT "communication_delivery_logs_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."domain_outbox_events"("outbox_id") ON DELETE NO ACTION ON UPDATE NO ACTION;--> statement-breakpoint

-- Unique and Performance Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "uq_outbox_event_id" ON "domain_outbox_events" ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_outbox_idempotency_key" ON "domain_outbox_events" ("idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbox_tenant_status" ON "domain_outbox_events" ("tenant_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbox_created_at" ON "domain_outbox_events" ("created_at");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_comm_tpl_lookup" ON "communication_templates" ("tenant_id", "vertical", "event_type", "channel");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_comm_tpl_identifier" ON "communication_templates" ("template_identifier");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_in_app_tenant_recipient" ON "in_app_notifications" ("tenant_id", "recipient_type", "recipient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_in_app_tenant_role_scope" ON "in_app_notifications" ("tenant_id", "role_scope");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_in_app_created_at" ON "in_app_notifications" ("created_at");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_comm_logs_tenant_outbox" ON "communication_delivery_logs" ("tenant_id", "outbox_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_comm_logs_event_id" ON "communication_delivery_logs" ("event_id");--> statement-breakpoint

-- Row Level Security (RLS) Policies
ALTER TABLE "domain_outbox_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "domain_outbox_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "domain_outbox_events_tenant_select" ON "domain_outbox_events" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "domain_outbox_events_tenant_insert" ON "domain_outbox_events" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "domain_outbox_events_tenant_update" ON "domain_outbox_events" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "domain_outbox_events_tenant_delete" ON "domain_outbox_events" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "communication_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "communication_templates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "communication_templates_tenant_select" ON "communication_templates" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR "tenant_id" IS NULL);--> statement-breakpoint
CREATE POLICY "communication_templates_tenant_insert" ON "communication_templates" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "communication_templates_tenant_update" ON "communication_templates" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "communication_templates_tenant_delete" ON "communication_templates" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "in_app_notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "in_app_notifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "in_app_notifications_tenant_select" ON "in_app_notifications" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "in_app_notifications_tenant_insert" ON "in_app_notifications" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "in_app_notifications_tenant_update" ON "in_app_notifications" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "in_app_notifications_tenant_delete" ON "in_app_notifications" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "communication_delivery_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "communication_delivery_logs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "communication_delivery_logs_tenant_select" ON "communication_delivery_logs" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "communication_delivery_logs_tenant_insert" ON "communication_delivery_logs" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "communication_delivery_logs_tenant_update" ON "communication_delivery_logs" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "communication_delivery_logs_tenant_delete" ON "communication_delivery_logs" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
