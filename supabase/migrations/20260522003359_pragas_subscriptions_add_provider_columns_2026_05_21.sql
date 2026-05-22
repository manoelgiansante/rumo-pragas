-- =====================================================================
-- Migration: Restore missing columns on subscriptions table
-- Created:    2026-05-21
-- Reason:     P0 — revenuecat-webhook deployed with verify_jwt=true since
--             2026-03-22 dropped 100% of paid subscription events. After
--             flipping verify_jwt=false, handler attempts upsert into
--             subscriptions table referencing columns `provider`,
--             `apple_transaction_id`, `google_purchase_token` that were
--             never created in prod (init schema migrations 20260317*
--             never registered as applied). This migration is fully
--             idempotent — uses ADD COLUMN IF NOT EXISTS and DO blocks
--             for constraints so it is safe to re-run.
--
-- Schema target after this migration:
--   subscriptions:
--     - provider TEXT NOT NULL DEFAULT 'free'
--     - apple_transaction_id TEXT
--     - google_purchase_token TEXT
--     - provider CHECK includes 'promotional' (from 20260409)
-- =====================================================================

-- 1. Add provider with safe default so existing rows pass NOT NULL constraint
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider TEXT;

-- Backfill any existing NULL rows before tightening
UPDATE public.subscriptions
  SET provider = 'free'
  WHERE provider IS NULL;

-- Make NOT NULL + DEFAULT
ALTER TABLE public.subscriptions
  ALTER COLUMN provider SET DEFAULT 'free',
  ALTER COLUMN provider SET NOT NULL;

-- 2. Apple/Google transaction identifiers (for forensic lookup; webhook
--    does not currently write these, but mobile client + future S2S may)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS apple_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS google_purchase_token TEXT;

-- 3. CHECK constraint matching deployed webhook deriveProvider()
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_provider_check'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_provider_check;
  END IF;
  ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_provider_check
    CHECK (provider IN ('free', 'apple', 'google', 'stripe', 'promotional'));
END
$$;

-- 4. Index on stripe_customer_id partial (referenced in original schema)
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe
  ON public.subscriptions(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- 5. Index on provider for analytics filtering ("how many apple vs stripe paid?")
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider
  ON public.subscriptions(provider)
  WHERE provider <> 'free';

COMMENT ON COLUMN public.subscriptions.provider IS
  'Subscription source: free|apple|google|stripe|promotional. Written by revenuecat-webhook + stripe-webhook. Restored 2026-05-21 (P0 fix — column was missing in prod even though init migrations referenced it).';
