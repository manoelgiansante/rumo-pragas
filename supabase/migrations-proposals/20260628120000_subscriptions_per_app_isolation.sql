-- =====================================================================
-- Migration: Per-app isolation of the shared `subscriptions` table
-- Created:    2026-06-28
-- Project:    jxcnfyeemdltdfqtgbcl (SHARED — all non-RM AgroRumo apps)
-- Audit item: P2 — Cross-app entitlement leakage (golive 2026-06-27)
--
-- ┌───────────────────────────────────────────────────────────────────┐
-- │  STATUS: PROPOSAL ONLY — *** DO NOT APPLY STANDALONE ***            │
-- │  This is a PORTFOLIO-WIDE, COORDINATED, BREAKING change.            │
-- └───────────────────────────────────────────────────────────────────┘
--
-- PROBLEM
-- -------
-- All non-RM apps share the jxcn project, the same `auth.users`, AND the
-- same `public.subscriptions` table. That table is keyed ONLY by user_id
-- (UNIQUE(user_id)), and every app's revenuecat-webhook / stripe-webhook
-- upserts with onConflict:'user_id', deriving the plan from GLOBAL
-- entitlement ids ('pro' / 'enterprise'). Consequences:
--   • Subscribing to Pro/Enterprise in ANY AgroRumo app unlocks Pro in
--     Rumo Pragas for the same user (cross-app entitlement leak).
--   • A CANCELLATION coming from another app downgrades the Pragas
--     subscriber (cross-app downgrade).
-- Currently LATENT: public.subscriptions has 0 rows. Fix before revenue.
--
-- FIX
-- ---
-- Add an `app` discriminator column and re-key uniqueness to
-- UNIQUE(user_id, app) so every app owns its own subscription row.
--
-- WHY THIS CANNOT BE APPLIED ALONE (ZERO-Q / shared prod)
-- ------------------------------------------------------
-- Dropping UNIQUE(user_id) instantly breaks EVERY other app whose
-- webhook still does `onConflict:'user_id'` and whose `handle_new_user`
-- trigger still does `ON CONFLICT (user_id)`. The shared `handle_new_user`
-- function is CREATE-OR-REPLACE'd by whichever app deployed last, so the
-- live definition may not be the Pragas one below.
--
-- REQUIRED CO-ORDINATED ROLLOUT (CEO / portfolio owner):
--   1. In EVERY non-RM app repo, update in the SAME release:
--        - revenuecat-webhook  -> add `app`, onConflict:'user_id,app'
--        - stripe-webhook       -> add `app`, onConflict:'user_id,app'
--        - all `.from('subscriptions').select(...)` readers -> .eq('app', <key>)
--        - handle_new_user trigger -> ON CONFLICT (user_id, app)
--      (Pragas side of this sweep is done in THIS branch — see commit.)
--   2. Apply this migration ONCE to jxcn (additive column first is safe;
--      the constraint swap is the breaking step — gate it on step 1).
--   3. Deploy all updated edge functions.
--   4. Only then ship mobile builds whose readers filter by `app`.
--
-- FASTER ALTERNATIVE (documented for CEO): per-app dedicated webhook
-- (revenuecat-webhook-pragas, mirroring -finance / -operacional). Still
-- requires the `app` column to avoid row collision on the shared table.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Add the app discriminator (ADDITIVE — safe to apply early/alone)
-- ---------------------------------------------------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS app text NOT NULL DEFAULT 'rumo-pragas';

COMMENT ON COLUMN public.subscriptions.app IS
  'App that owns this subscription row (e.g. rumo-pragas, rumo-finance). '
  'Added 2026-06-28 to isolate entitlements on the shared jxcn subscriptions table. '
  'Webhooks upsert onConflict (user_id, app); readers must filter .eq(app, <key>).';

-- Backfill is a no-op while the table is empty, but make the intent explicit
-- and idempotent in case rows exist by the time this is applied.
UPDATE public.subscriptions SET app = 'rumo-pragas' WHERE app IS NULL;

-- ---------------------------------------------------------------------
-- 2. *** BREAKING STEP — gate on the portfolio-wide sweep above ***
--    Swap UNIQUE(user_id) -> UNIQUE(user_id, app).
--    Drops any unique constraint defined SOLELY on (user_id), regardless
--    of its auto-generated name (init: subscriptions_user_id_key;
--    migration 20260407: subscriptions_user_id_unique).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'subscriptions'
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname ORDER BY a.attname)
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) = ARRAY['user_id']
  LOOP
    EXECUTE format('ALTER TABLE public.subscriptions DROP CONSTRAINT %I', con.conname);
  END LOOP;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_user_app_unique'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_user_app_unique UNIQUE (user_id, app);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_app
  ON public.subscriptions (user_id, app);

-- ---------------------------------------------------------------------
-- 3. Keep the signup path consistent with the new key.
--    NOTE: handle_new_user is SHARED & CREATE-OR-REPLACE'd by every app.
--    This Pragas-flavoured version inserts the app default and uses the
--    new conflict target so signup does not error after step 2. Other
--    apps MUST ship an equivalent recreation in the same coordinated
--    rollout, or the last-writer definition will regress.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.pragas_profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.subscriptions (user_id, plan, status, provider, app)
  VALUES (NEW.id, 'free', 'active', 'free', 'rumo-pragas')
  ON CONFLICT (user_id, app) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS is unchanged: existing policies scope by auth.uid() = user_id and
-- already deny cross-user reads; the `app` filter is enforced in the
-- application layer (edge functions + mobile readers).
