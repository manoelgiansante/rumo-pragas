-- =====================================================================
-- Migration: webhook_events persistent idempotency table
-- Created:    2026-05-13
-- Reason:     In-memory dedup (processedEvents Map) resets on cold start.
--             Stripe/RevenueCat retries can re-process the same event in
--             a fresh instance and trigger duplicate side-effects
--             (double subscription upserts, conflicting status flips,
--             duplicate notifications). Persistent table = source of truth.
--
-- Schema:
--   - event_id   (PK)         — Stripe event.id or RC event.id
--   - source                  — 'stripe' | 'revenuecat'
--   - event_type              — e.g. 'checkout.session.completed'
--   - received_at             — when webhook hit our edge fn
--   - processed_at            — when handler finished successfully
--   - payload_summary (JSONB) — minimal fields for forensic debugging
--
-- Cleanup: external cron should DELETE rows >90d old to bound size.
-- Access:  service_role only (RLS enabled, no policies = deny-by-default).
-- =====================================================================

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('stripe', 'revenuecat')),
  event_type TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  payload_summary JSONB
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_source_received
  ON webhook_events (source, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_unprocessed
  ON webhook_events (source, received_at)
  WHERE processed_at IS NULL;

-- Lock down: only service_role can read/write. No anon/authenticated access.
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Document intent (no policies = deny-by-default for non-service roles).
COMMENT ON TABLE webhook_events IS
  'Persistent webhook idempotency log. Stripe/RC event IDs deduplicated across cold starts. service_role only.';
