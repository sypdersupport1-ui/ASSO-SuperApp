CREATE TABLE "hotel_housekeeping_tasks" (
	"task_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"task_type" varchar(50) DEFAULT 'DEPARTURE_TURNOVER' NOT NULL,
	"trigger_source" varchar(50) DEFAULT 'MANUAL' NOT NULL,
	"assigned_staff_id" uuid,
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"priority" varchar(50) DEFAULT 'NORMAL' NOT NULL,
	"notes" text,
	"inspection_notes" text,
	"inspected_by" uuid,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"inspected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hotel_housekeeping_tasks" ADD CONSTRAINT "hotel_housekeeping_tasks_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_housekeeping_tasks" ADD CONSTRAINT "hotel_housekeeping_tasks_outlet_id_outlets_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_housekeeping_tasks" ADD CONSTRAINT "hotel_housekeeping_tasks_room_id_hotel_rooms_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."hotel_rooms"("room_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_housekeeping_tasks" ADD CONSTRAINT "hotel_housekeeping_tasks_assigned_staff_id_users_user_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_housekeeping_tasks" ADD CONSTRAINT "hotel_housekeeping_tasks_inspected_by_users_user_id_fk" FOREIGN KEY ("inspected_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hk_tasks_tenant_outlet" ON "hotel_housekeeping_tasks" USING btree ("tenant_id","outlet_id");--> statement-breakpoint
CREATE INDEX "idx_hk_tasks_room" ON "hotel_housekeeping_tasks" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "idx_hk_tasks_status" ON "hotel_housekeeping_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_hk_tasks_assigned" ON "hotel_housekeeping_tasks" USING btree ("assigned_staff_id");--> statement-breakpoint
CREATE INDEX "idx_hk_tasks_created_at" ON "hotel_housekeeping_tasks" USING btree ("created_at");--> statement-breakpoint

-- Constraints on Housekeeping Tasks
ALTER TABLE "hotel_housekeeping_tasks" ADD CONSTRAINT "chk_hk_task_type" CHECK ("task_type" IN ('DEPARTURE_TURNOVER', 'ROUTINE_CLEANING', 'DEEP_CLEANING', 'INSPECTION'));--> statement-breakpoint
ALTER TABLE "hotel_housekeeping_tasks" ADD CONSTRAINT "chk_hk_task_status" CHECK ("status" IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'CLEANED', 'INSPECTED', 'CANCELLED'));--> statement-breakpoint
ALTER TABLE "hotel_housekeeping_tasks" ADD CONSTRAINT "chk_hk_task_priority" CHECK ("priority" IN ('LOW', 'NORMAL', 'HIGH', 'URGENT'));--> statement-breakpoint

-- Native PostgreSQL Row Level Security (RLS)
ALTER TABLE "hotel_housekeeping_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hotel_housekeeping_tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "hotel_hk_tasks_tenant_select" ON "hotel_housekeeping_tasks" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hotel_hk_tasks_tenant_insert" ON "hotel_housekeeping_tasks" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hotel_hk_tasks_tenant_update" ON "hotel_housekeeping_tasks" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hotel_hk_tasks_tenant_delete" ON "hotel_housekeeping_tasks" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
