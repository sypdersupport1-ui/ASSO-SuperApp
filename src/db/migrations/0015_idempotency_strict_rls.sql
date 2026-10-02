DROP POLICY IF EXISTS "idempotency_keys_tenant_select" ON "idempotency_keys";
--> statement-breakpoint
DROP POLICY IF EXISTS "idempotency_keys_tenant_insert" ON "idempotency_keys";
--> statement-breakpoint
DROP POLICY IF EXISTS "idempotency_keys_tenant_update" ON "idempotency_keys";
--> statement-breakpoint
DROP POLICY IF EXISTS "idempotency_keys_tenant_delete" ON "idempotency_keys";
--> statement-breakpoint
CREATE POLICY "idempotency_keys_tenant_select" ON "idempotency_keys" FOR SELECT USING (
  ("tenant_id" IS NOT NULL AND "tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  ("tenant_id" IS NULL AND current_setting('app.is_platform_context', true) = 'true')
);
--> statement-breakpoint
CREATE POLICY "idempotency_keys_tenant_insert" ON "idempotency_keys" FOR INSERT WITH CHECK (
  ("tenant_id" IS NOT NULL AND "tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  ("tenant_id" IS NULL AND current_setting('app.is_platform_context', true) = 'true')
);
--> statement-breakpoint
CREATE POLICY "idempotency_keys_tenant_update" ON "idempotency_keys" FOR UPDATE USING (
  ("tenant_id" IS NOT NULL AND "tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  ("tenant_id" IS NULL AND current_setting('app.is_platform_context', true) = 'true')
) WITH CHECK (
  ("tenant_id" IS NOT NULL AND "tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  ("tenant_id" IS NULL AND current_setting('app.is_platform_context', true) = 'true')
);
--> statement-breakpoint
CREATE POLICY "idempotency_keys_tenant_delete" ON "idempotency_keys" FOR DELETE USING (
  ("tenant_id" IS NOT NULL AND "tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  ("tenant_id" IS NULL AND current_setting('app.is_platform_context', true) = 'true')
);
