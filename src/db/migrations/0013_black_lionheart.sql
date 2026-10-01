CREATE TABLE "kds_task_history" (
	"history_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"from_status" varchar(50) NOT NULL,
	"to_status" varchar(50) NOT NULL,
	"changed_by_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kds_tasks" (
	"task_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"item_name" varchar(255) NOT NULL,
	"quantity" integer NOT NULL,
	"dining_context" varchar(50) NOT NULL,
	"table_id" uuid,
	"table_session_id" uuid,
	"order_source" varchar(50) NOT NULL,
	"station_routing" varchar(50) DEFAULT 'KITCHEN' NOT NULL,
	"task_status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"idempotency_key" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kds_task_history" ADD CONSTRAINT "kds_task_history_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kds_task_history" ADD CONSTRAINT "kds_task_history_task_id_kds_tasks_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."kds_tasks"("task_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kds_task_history" ADD CONSTRAINT "kds_task_history_changed_by_user_id_users_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kds_tasks" ADD CONSTRAINT "kds_tasks_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kds_tasks" ADD CONSTRAINT "kds_tasks_outlet_id_outlets_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kds_tasks" ADD CONSTRAINT "kds_tasks_order_id_orders_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("order_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kds_tasks" ADD CONSTRAINT "kds_tasks_order_item_id_order_items_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("order_item_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kds_tasks" ADD CONSTRAINT "kds_tasks_item_id_catalog_items_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("item_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kds_tasks" ADD CONSTRAINT "kds_tasks_table_id_restaurant_tables_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."restaurant_tables"("table_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "kds_tasks" ADD CONSTRAINT "kds_tasks_table_session_id_restaurant_table_sessions_session_id_fk" FOREIGN KEY ("table_session_id") REFERENCES "public"."restaurant_table_sessions"("session_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_kds_tasks_order_item" ON "kds_tasks" USING btree ("order_item_id");
--> statement-breakpoint
CREATE INDEX "idx_kds_tasks_tenant_outlet" ON "kds_tasks" USING btree ("tenant_id","outlet_id");
--> statement-breakpoint
CREATE INDEX "idx_kds_tasks_order" ON "kds_tasks" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX "idx_kds_tasks_status" ON "kds_tasks" USING btree ("tenant_id","task_status");
--> statement-breakpoint
CREATE INDEX "idx_kds_tasks_station" ON "kds_tasks" USING btree ("tenant_id","outlet_id","station_routing");
--> statement-breakpoint
-- Enable RLS
ALTER TABLE kds_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE kds_task_history ENABLE ROW LEVEL SECURITY;
-- Create policies
CREATE POLICY kds_tasks_tenant_isolation ON kds_tasks FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY kds_task_history_tenant_isolation ON kds_task_history FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
