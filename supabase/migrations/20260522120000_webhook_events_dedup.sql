-- 2026-05-22 — Audit Wave 3-B P1: persistent Stripe webhook dedup
--
-- The rumo-pragas Stripe webhook (`supabase/functions/stripe-webhook/index.ts`)
-- previously relied on a process-local Map<string, number> with TTL 30min for
-- idempotency. That state is lost on every cold start, every deploy, every
-- function instance recycle — so a Stripe redelivery beyond the warm window
-- silently re-processes `checkout.session.completed` and double-toggles
-- `subscriptions.plan`/`status`.
--
-- This migration shipped the same table the rumo-pragas RevenueCat webhook
-- already inserts into (line 364 of revenuecat-webhook/index.ts) plus the
-- Rumo-Arroba/Rumo-CampoVivo Stripe webhooks. The Supabase project
-- `jxcnfyeemdltdfqtgbcl` is shared so the table likely exists in prod already
-- via Arroba's 20260520000000 migration — this is IF NOT EXISTS for safety.

CREATE TABLE IF NOT EXISTS public.webhook_events (
  event_id        TEXT PRIMARY KEY,
  event_type      TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'stripe',
  payload         JSONB,
  payload_summary JSONB,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS webhook_events_received_at_idx
  ON public.webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS webhook_events_type_idx
  ON public.webhook_events (event_type);

CREATE INDEX IF NOT EXISTS webhook_events_source_idx
  ON public.webhook_events (source);

-- RLS deny-all (service role only)
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.webhook_events IS
  'Webhook idempotency log (Stripe + RevenueCat). PK event_id deduplicates retries. Service-role only (RLS deny-all).';
