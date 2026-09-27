CREATE TABLE "service_requests" (
	"request_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"context_id" uuid,
	"request_type" varchar(100) DEFAULT 'MAINTENANCE' NOT NULL,
	"category" varchar(100) DEFAULT 'OTHER' NOT NULL,
	"priority" varchar(50) DEFAULT 'NORMAL' NOT NULL,
	"status" varchar(50) DEFAULT 'OPEN' NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"assigned_to_staff_id" uuid,
	"reported_by_staff_id" uuid,
	"resolution_notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_outlet_id_outlets_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_context_id_business_contexts_context_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."business_contexts"("context_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_assigned_to_staff_id_users_user_id_fk" FOREIGN KEY ("assigned_to_staff_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_reported_by_staff_id_users_user_id_fk" FOREIGN KEY ("reported_by_staff_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_service_requests_tenant_outlet" ON "service_requests" USING btree ("tenant_id","outlet_id");--> statement-breakpoint
CREATE INDEX "idx_service_requests_context" ON "service_requests" USING btree ("context_id");--> statement-breakpoint
CREATE INDEX "idx_service_requests_status" ON "service_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_service_requests_assigned" ON "service_requests" USING btree ("assigned_to_staff_id");--> statement-breakpoint
CREATE INDEX "idx_service_requests_created_at" ON "service_requests" USING btree ("created_at");--> statement-breakpoint

-- Constraints on Service Requests
ALTER TABLE "service_requests" ADD CONSTRAINT "chk_service_req_priority" CHECK ("priority" IN ('LOW', 'NORMAL', 'HIGH', 'URGENT'));--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "chk_service_req_status" CHECK ("status" IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED'));--> statement-breakpoint

-- Native PostgreSQL Row Level Security (RLS)
ALTER TABLE "service_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "service_requests_tenant_select" ON "service_requests" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "service_requests_tenant_insert" ON "service_requests" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "service_requests_tenant_update" ON "service_requests" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "service_requests_tenant_delete" ON "service_requests" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
