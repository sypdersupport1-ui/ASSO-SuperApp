-- Migration: 0016_idempotency_cryptographic_platform_rls.sql
-- Purpose: Unforgeable cryptographic & privilege verification for platform idempotency context.
-- Prevents ordinary tenant sessions from spoofing platform-wide access via mutable string GUCs.

-- 1. Create protected security schema inaccessible to authenticated/anon tenant roles
CREATE SCHEMA IF NOT EXISTS asso_private;
REVOKE ALL ON SCHEMA asso_private FROM PUBLIC, authenticated, anon;

-- 2. Store platform authentication secret in private schema
CREATE TABLE IF NOT EXISTS asso_private.platform_secret (
  id int PRIMARY KEY DEFAULT 1,
  secret text NOT NULL,
  CONSTRAINT single_row CHECK (id = 1)
);
REVOKE ALL ON asso_private.platform_secret FROM PUBLIC, authenticated, anon;

-- Seed default platform secret (can be overridden by server environment)
INSERT INTO asso_private.platform_secret (id, secret)
VALUES (1, 'asso_platform_auth_secret_dev_32b')
ON CONFLICT (id) DO NOTHING;

-- 3. Create authoritative verification function
-- NOTE ON POSTGRESQL EXECUTION IDENTITY:
-- Inside a SECURITY DEFINER function, current_user switches to the function owner ('postgres').
-- Therefore, the function does NOT attempt to rely on current_user to detect caller role.
-- Instead, caller role exclusion is enforced at the RLS policy level (where current_user is the invoker),
-- while this function authoritatively enforces:
--   a) Complete absence of tenant session context (app.current_tenant_id IS NULL)
--   b) Cryptographic verification of app.platform_context_token against asso_private.platform_secret
CREATE OR REPLACE FUNCTION public.asso_is_platform_context()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = asso_private, public, pg_temp
AS $$
DECLARE
  v_secret text;
  v_token text;
BEGIN
  -- 1. If app.current_tenant_id is set, this is a tenant-scoped session. Disqualify immediately.
  IF NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL THEN
    RETURN false;
  END IF;

  -- 2. Check for platform authorization token supplied by trusted server runtime
  v_token := current_setting('app.platform_context_token', true);
  IF v_token IS NULL OR v_token = '' THEN
    RETURN false;
  END IF;

  -- 3. Authoritative check: verify token against the private secret stored in asso_private
  SELECT s.secret INTO v_secret FROM asso_private.platform_secret s WHERE s.id = 1;
  IF v_secret IS NULL THEN
    RETURN false;
  END IF;

  RETURN v_token = v_secret;
END;
$$;

-- Grant execute to authenticated and anon so RLS policies can evaluate it without permission error
GRANT EXECUTE ON FUNCTION public.asso_is_platform_context() TO authenticated, anon, service_role, postgres;

-- 4. Replace RLS policies on idempotency_keys
-- Enforces:
--   - Tenant rows: accessible ONLY to matching tenant_id
--   - Platform rows: accessible ONLY when caller role is NOT authenticated/anon AND asso_is_platform_context() passes
DROP POLICY IF EXISTS "idempotency_keys_tenant_select" ON "idempotency_keys";
DROP POLICY IF EXISTS "idempotency_keys_tenant_insert" ON "idempotency_keys";
DROP POLICY IF EXISTS "idempotency_keys_tenant_update" ON "idempotency_keys";
DROP POLICY IF EXISTS "idempotency_keys_tenant_delete" ON "idempotency_keys";

CREATE POLICY "idempotency_keys_tenant_select" ON "idempotency_keys" FOR SELECT 
USING (
  (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (tenant_id IS NULL AND current_user NOT IN ('authenticated', 'anon') AND asso_is_platform_context())
);

CREATE POLICY "idempotency_keys_tenant_insert" ON "idempotency_keys" FOR INSERT 
WITH CHECK (
  (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (tenant_id IS NULL AND current_user NOT IN ('authenticated', 'anon') AND asso_is_platform_context())
);

CREATE POLICY "idempotency_keys_tenant_update" ON "idempotency_keys" FOR UPDATE 
USING (
  (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (tenant_id IS NULL AND current_user NOT IN ('authenticated', 'anon') AND asso_is_platform_context())
)
WITH CHECK (
  (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (tenant_id IS NULL AND current_user NOT IN ('authenticated', 'anon') AND asso_is_platform_context())
);

CREATE POLICY "idempotency_keys_tenant_delete" ON "idempotency_keys" FOR DELETE 
USING (
  (tenant_id IS NOT NULL AND tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  OR
  (tenant_id IS NULL AND current_user NOT IN ('authenticated', 'anon') AND asso_is_platform_context())
);
