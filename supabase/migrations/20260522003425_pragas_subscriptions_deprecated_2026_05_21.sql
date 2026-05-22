-- =====================================================================
-- Migration: Mark pragas_subscriptions table as DEPRECATED
-- Created:    2026-05-21
-- Reason:     Two competing subscription tables coexist:
--               (a) subscriptions      — shared multi-app, written by
--                                        revenuecat-webhook + stripe-webhook
--                                        (real source of truth)
--               (b) pragas_subscriptions — Pragas-only orphan, never written
--                                        by any deployed code path
--             To avoid future schema drift and accidental writes, label (b)
--             as DEPRECATED. We do NOT drop the table — it may hold legacy
--             rows or be referenced by an old mobile build. Safe path:
--               1) Block new writes via RLS deny-all (idempotent)
--               2) Add COMMENT marking deprecation
--               3) Verify zero call sites before next quarterly cleanup
-- =====================================================================

-- 1. Documentation: deprecation notice
COMMENT ON TABLE public.pragas_subscriptions IS
  'DEPRECATED 2026-05-21 — use public.subscriptions instead. Real subscription state is written by revenuecat-webhook + stripe-webhook into public.subscriptions. This table is kept for legacy compatibility only; do NOT add new write paths. Slated for removal after 90-day grace window (target 2026-08-21) if rowcount remains stable. See: /tmp/rumo-praga-rc-webhook-fix-report.md';

-- 2. Defense-in-depth: ensure RLS is enabled (silent deny-all for non-service_role)
ALTER TABLE public.pragas_subscriptions ENABLE ROW LEVEL SECURITY;

-- 3. Drop any permissive INSERT/UPDATE policies that would allow new writes
--    (idempotent — only drops if exists)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pragas_subscriptions'
      AND cmd IN ('INSERT', 'UPDATE', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.pragas_subscriptions', pol.policyname);
  END LOOP;
END
$$;

-- 4. Keep SELECT (for legacy reads). service_role bypasses RLS so cleanup scripts work.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pragas_subscriptions'
      AND policyname = 'deprecated_select_only_own'
  ) THEN
    CREATE POLICY deprecated_select_only_own
      ON public.pragas_subscriptions
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END
$$;
