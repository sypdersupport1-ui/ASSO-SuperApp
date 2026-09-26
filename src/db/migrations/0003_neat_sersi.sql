CREATE TABLE "hotel_room_types" (
	"room_type_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"base_occupancy" integer DEFAULT 2 NOT NULL,
	"max_occupancy" integer DEFAULT 3 NOT NULL,
	"base_rate" numeric(14, 4) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_rooms" (
	"room_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"context_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"room_number" varchar(50) NOT NULL,
	"floor_number" varchar(20),
	"operational_status" varchar(50) DEFAULT 'AVAILABLE' NOT NULL,
	"housekeeping_status" varchar(50) DEFAULT 'CLEAN' NOT NULL,
	"is_occupied" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hotel_room_types" ADD CONSTRAINT "hotel_room_types_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_room_types" ADD CONSTRAINT "hotel_room_types_outlet_id_outlets_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_rooms" ADD CONSTRAINT "hotel_rooms_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_rooms" ADD CONSTRAINT "hotel_rooms_outlet_id_outlets_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_rooms" ADD CONSTRAINT "hotel_rooms_context_id_business_contexts_context_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."business_contexts"("context_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_rooms" ADD CONSTRAINT "hotel_rooms_room_type_id_hotel_room_types_room_type_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."hotel_room_types"("room_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_room_types_outlet_code" ON "hotel_room_types" USING btree ("outlet_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hotel_rooms_outlet_number" ON "hotel_rooms" USING btree ("outlet_id","room_number");--> statement-breakpoint

-- Enable & Force RLS on Hotel Tables
ALTER TABLE "hotel_room_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hotel_room_types" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "hotel_room_types_tenant_select" ON "hotel_room_types" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hotel_room_types_tenant_insert" ON "hotel_room_types" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hotel_room_types_tenant_update" ON "hotel_room_types" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hotel_room_types_tenant_delete" ON "hotel_room_types" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "hotel_rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hotel_rooms" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "hotel_rooms_tenant_select" ON "hotel_rooms" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hotel_rooms_tenant_insert" ON "hotel_rooms" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hotel_rooms_tenant_update" ON "hotel_rooms" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hotel_rooms_tenant_delete" ON "hotel_rooms" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);