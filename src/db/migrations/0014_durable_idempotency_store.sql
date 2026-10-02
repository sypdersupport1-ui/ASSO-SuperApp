ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "operation" varchar(100) DEFAULT 'DEFAULT' NOT NULL;
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "response_headers" jsonb;
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "resource_id" varchar(128);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "locked_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp with time zone DEFAULT (now() + interval '120 seconds') NOT NULL;
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ALTER COLUMN "tenant_id" DROP NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_idempotency_keys_tenant_op_key" ON "idempotency_keys" USING btree (COALESCE("tenant_id", '00000000-0000-0000-0000-000000000000'::uuid), "operation", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_idempotency_keys_expires_at" ON "idempotency_keys" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_idempotency_keys_lease" ON "idempotency_keys" USING btree ("status", "lease_expires_at");
--> statement-breakpoint
DROP POLICY IF EXISTS "idempotency_keys_tenant_select" ON "idempotency_keys";
--> statement-breakpoint
DROP POLICY IF EXISTS "idempotency_keys_tenant_insert" ON "idempotency_keys";
--> statement-breakpoint
DROP POLICY IF EXISTS "idempotency_keys_tenant_update" ON "idempotency_keys";
--> statement-breakpoint
DROP POLICY IF EXISTS "idempotency_keys_tenant_delete" ON "idempotency_keys";
--> statement-breakpoint
CREATE POLICY "idempotency_keys_tenant_select" ON "idempotency_keys" FOR SELECT USING ("tenant_id" IS NULL OR "tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "idempotency_keys_tenant_insert" ON "idempotency_keys" FOR INSERT WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "idempotency_keys_tenant_update" ON "idempotency_keys" FOR UPDATE USING ("tenant_id" IS NULL OR "tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" IS NULL OR "tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "idempotency_keys_tenant_delete" ON "idempotency_keys" FOR DELETE USING ("tenant_id" IS NULL OR "tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
