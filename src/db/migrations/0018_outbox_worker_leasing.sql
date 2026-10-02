-- Migration: 0018_outbox_worker_leasing.sql
-- Scale Foundation S4: Standalone Transactional Outbox Worker Infrastructure
-- Adds lease-based claiming columns, claim index, and secure platform RLS policies.

-- 1. Add worker lease columns to domain_outbox_events
ALTER TABLE "domain_outbox_events" 
  ADD COLUMN IF NOT EXISTS "claimed_by" varchar(100),
  ADD COLUMN IF NOT EXISTS "claim_expires_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_attempted_at" timestamp with time zone;

-- 2. Add composite index for efficient FOR UPDATE SKIP LOCKED claiming and recovery
CREATE INDEX IF NOT EXISTS "idx_outbox_claimable" 
  ON "domain_outbox_events" ("status", "next_retry_at", "claim_expires_at");

CREATE INDEX IF NOT EXISTS "idx_outbox_claimed_by"
  ON "domain_outbox_events" ("claimed_by");

-- 3. Update RLS policies to grant trusted platform worker execution scope
DROP POLICY IF EXISTS "domain_outbox_events_tenant_select" ON "domain_outbox_events";
DROP POLICY IF EXISTS "domain_outbox_events_tenant_insert" ON "domain_outbox_events";
DROP POLICY IF EXISTS "domain_outbox_events_tenant_update" ON "domain_outbox_events";
DROP POLICY IF EXISTS "domain_outbox_events_tenant_delete" ON "domain_outbox_events";

CREATE POLICY "domain_outbox_events_select" ON "domain_outbox_events" FOR SELECT 
USING (
  (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "domain_outbox_events_insert" ON "domain_outbox_events" FOR INSERT 
WITH CHECK (
  (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "domain_outbox_events_update" ON "domain_outbox_events" FOR UPDATE 
USING (
  (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
)
WITH CHECK (
  (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);

CREATE POLICY "domain_outbox_events_delete" ON "domain_outbox_events" FOR DELETE 
USING (
  (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (current_user NOT IN ('authenticated', 'anon') AND public.asso_is_platform_context())
);
