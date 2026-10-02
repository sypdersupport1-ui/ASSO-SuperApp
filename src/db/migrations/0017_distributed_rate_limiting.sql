-- Migration 0017: Distributed Rate Limiting & Abuse Protection (Scale Foundation S3)

CREATE TABLE IF NOT EXISTS "rate_limits" (
  "key" varchar(256) PRIMARY KEY NOT NULL,
  "category" varchar(50) NOT NULL,
  "count" integer NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Index for efficient expiration-based bounded cleanup
CREATE INDEX IF NOT EXISTS "idx_rate_limits_expires_at" ON "rate_limits" ("expires_at");

-- Enable Row Level Security (RLS)
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;

-- Block ordinary tenant or anonymous client sessions from reading, inserting, updating, or deleting rate limit state.
-- Only platform/service execution (which runs outside tenant context as postgres or service_role) has access.
DROP POLICY IF EXISTS "rate_limits_system_policy" ON "rate_limits";
CREATE POLICY "rate_limits_system_policy" ON "rate_limits"
  FOR ALL
  TO postgres, service_role
  USING (true)
  WITH CHECK (true);
