CREATE TABLE "hotel_stays" (
	"stay_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"stay_number" varchar(50) NOT NULL,
	"check_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_check_out_at" timestamp with time zone NOT NULL,
	"actual_check_out_at" timestamp with time zone,
	"status" varchar(50) DEFAULT 'ACTIVE' NOT NULL,
	"adult_count" integer DEFAULT 1 NOT NULL,
	"children_count" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hotel_stays" ADD CONSTRAINT "hotel_stays_tenant_id_organizations_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_stays" ADD CONSTRAINT "hotel_stays_outlet_id_outlets_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("outlet_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_stays" ADD CONSTRAINT "hotel_stays_reservation_id_hotel_reservations_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."hotel_reservations"("reservation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_stays" ADD CONSTRAINT "hotel_stays_guest_id_hotel_guests_guest_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."hotel_guests"("guest_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_stays" ADD CONSTRAINT "hotel_stays_room_id_hotel_rooms_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."hotel_rooms"("room_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hotel_stays_outlet_number" ON "hotel_stays" USING btree ("outlet_id","stay_number");--> statement-breakpoint
CREATE INDEX "idx_hotel_stays_tenant_status" ON "hotel_stays" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_hotel_stays_reservation" ON "hotel_stays" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "idx_hotel_stays_room" ON "hotel_stays" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "idx_hotel_stays_guest" ON "hotel_stays" USING btree ("guest_id");--> statement-breakpoint

-- Update reservation status constraint to allow CHECKED_IN and COMPLETED
ALTER TABLE "hotel_reservations" DROP CONSTRAINT IF EXISTS "chk_reservation_status";--> statement-breakpoint
ALTER TABLE "hotel_reservations" ADD CONSTRAINT "chk_reservation_status" CHECK ("status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW'));--> statement-breakpoint

-- Hard Invariant: At most ONE ACTIVE stay per physical room
CREATE UNIQUE INDEX "uq_hotel_stays_active_room" ON "hotel_stays" ("room_id") WHERE "status" = 'ACTIVE';--> statement-breakpoint

-- Hard Invariant: At most ONE ACTIVE stay per reservation
CREATE UNIQUE INDEX "uq_hotel_stays_active_reservation" ON "hotel_stays" ("reservation_id") WHERE "status" = 'ACTIVE';--> statement-breakpoint

-- Constraints on Stays
ALTER TABLE "hotel_stays" ADD CONSTRAINT "chk_stay_status" CHECK ("status" IN ('ACTIVE', 'CHECKED_OUT'));--> statement-breakpoint
ALTER TABLE "hotel_stays" ADD CONSTRAINT "chk_stay_guest_counts" CHECK ("adult_count" >= 1 AND "children_count" >= 0);--> statement-breakpoint

-- Native PostgreSQL Row Level Security (RLS)
ALTER TABLE "hotel_stays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hotel_stays" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "hotel_stays_tenant_select" ON "hotel_stays" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hotel_stays_tenant_insert" ON "hotel_stays" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hotel_stays_tenant_update" ON "hotel_stays" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "hotel_stays_tenant_delete" ON "hotel_stays" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);