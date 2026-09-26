CREATE TABLE "customers" (
	"customer_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"phone" varchar(50),
	"email" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_guests" (
	"guest_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"id_proof_type" varchar(50),
	"id_proof_number_masked" varchar(50),
	"nationality" varchar(50) DEFAULT 'INDIAN',
	"vip_status" varchar(50) DEFAULT 'STANDARD',
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_reservations" (
	"reservation_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"reservation_number" varchar(50) NOT NULL,
	"room_type_id" uuid NOT NULL,
	"assigned_room_id" uuid,
	"arrival_date" timestamp with time zone NOT NULL,
	"departure_date" timestamp with time zone NOT NULL,
	"adult_count" integer DEFAULT 1 NOT NULL,
	"children_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(50) DEFAULT 'CONFIRMED' NOT NULL,
	"special_requests" text,
	"total_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_guests" ADD CONSTRAINT "hotel_guests_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_guests" ADD CONSTRAINT "hotel_guests_customer_id_customers_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("customer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_reservations" ADD CONSTRAINT "hotel_reservations_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_reservations" ADD CONSTRAINT "hotel_reservations_outlet_id_outlets_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_reservations" ADD CONSTRAINT "hotel_reservations_guest_id_hotel_guests_guest_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."hotel_guests"("guest_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_reservations" ADD CONSTRAINT "hotel_reservations_room_type_id_hotel_room_types_room_type_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."hotel_room_types"("room_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_reservations" ADD CONSTRAINT "hotel_reservations_assigned_room_id_hotel_rooms_room_id_fk" FOREIGN KEY ("assigned_room_id") REFERENCES "public"."hotel_rooms"("room_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hotel_reservations_outlet_number" ON "hotel_reservations" USING btree ("outlet_id","reservation_number");--> statement-breakpoint

-- Constraints for Reservations
ALTER TABLE "hotel_reservations" ADD CONSTRAINT "chk_reservation_dates" CHECK ("arrival_date" < "departure_date");--> statement-breakpoint
ALTER TABLE "hotel_reservations" ADD CONSTRAINT "chk_reservation_guest_counts" CHECK ("adult_count" >= 1 AND "children_count" >= 0);--> statement-breakpoint
ALTER TABLE "hotel_reservations" ADD CONSTRAINT "chk_reservation_status" CHECK ("status" IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'NO_SHOW'));--> statement-breakpoint

-- Performance Indexes for Availability and Conflict Queries
CREATE INDEX "idx_hotel_reservations_dates" ON "hotel_reservations" ("outlet_id", "room_type_id", "status", "arrival_date", "departure_date");--> statement-breakpoint
CREATE INDEX "idx_hotel_reservations_assigned_room" ON "hotel_reservations" ("assigned_room_id", "status", "arrival_date", "departure_date");--> statement-breakpoint
CREATE INDEX "idx_hotel_guests_customer" ON "hotel_guests" ("tenant_id", "customer_id");--> statement-breakpoint
CREATE INDEX "idx_customers_tenant_phone" ON "customers" ("tenant_id", "phone");--> statement-breakpoint

-- Enable & Force RLS on Customers, Hotel Guests, and Hotel Reservations
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "customers_tenant_select" ON "customers" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "customers_tenant_insert" ON "customers" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "customers_tenant_update" ON "customers" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "customers_tenant_delete" ON "customers" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "hotel_guests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hotel_guests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "hotel_guests_tenant_select" ON "hotel_guests" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hotel_guests_tenant_insert" ON "hotel_guests" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hotel_guests_tenant_update" ON "hotel_guests" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hotel_guests_tenant_delete" ON "hotel_guests" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "hotel_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hotel_reservations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "hotel_reservations_tenant_select" ON "hotel_reservations" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hotel_reservations_tenant_insert" ON "hotel_reservations" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hotel_reservations_tenant_update" ON "hotel_reservations" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hotel_reservations_tenant_delete" ON "hotel_reservations" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);