-- =====================================================
-- Migration: Analytics events table + subscription improvements
-- =====================================================

-- 1. Analytics events table for server-side event ingestion
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  platform TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common analytics queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event ON analytics_events(event);
CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_timestamp ON analytics_events(event, timestamp);

-- RLS: Only service_role can insert/read analytics (not end users)
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Note: service_role already bypasses RLS, so no explicit policy needed.
-- If we want authenticated users to read their own analytics:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'analytics_events'
      AND policyname = 'Users can read own analytics'
  ) THEN
    CREATE POLICY "Users can read own analytics"
      ON analytics_events FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END
$$;

-- 2. Add RevenueCat-specific columns to subscriptions
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS revenuecat_product_id TEXT,
  ADD COLUMN IF NOT EXISTS revenuecat_environment TEXT
    CHECK (revenuecat_environment IS NULL OR revenuecat_environment IN ('SANDBOX', 'PRODUCTION')),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Add 'expired' and 'paused' to subscriptions status constraint
-- Drop and recreate to include new statuses from RevenueCat webhook
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'expired', 'paused'));

-- 4. Add unique constraint on subscriptions.user_id for upsert support
-- (RevenueCat webhook uses onConflict: 'user_id')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_user_id_unique'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);
  END IF;
END
$$;

-- 5. Audit log table for tracking important actions (LGPD compliance)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own audit log entries (LGPD right of access)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_log'
      AND policyname = 'Users can read own audit log'
  ) THEN
    CREATE POLICY "Users can read own audit log"
      ON audit_log FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END
$$;
