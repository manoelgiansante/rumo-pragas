-- Capturado VERBATIM de prod jxcnfyeemdltdfqtgbcl (supabase_migrations.schema_migrations) em 2026-07-18 [CR-05-REST].
-- md5 do corpo verbatim (da linha apos o marcador ate EOF, sem newline final extra) = 552e776b26d72f166c3334c647879a47
--   = md5(array_to_string(statements, E';\n\n')) conferido em prod no momento da captura.
-- >>> corpo verbatim >>>
-- W20-2 Stripe Webhook Dedup: rumo-pragas
-- Per-app webhook_events table for Stripe event_id dedup.
-- See: /Obsidian Vault/04 - Infra/W20-2 Stripe Webhook Dedup Migrations - 2026-05-22.md
CREATE TABLE IF NOT EXISTS public.rumo_pragas_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz DEFAULT now(),
  payload jsonb
);
CREATE INDEX IF NOT EXISTS idx_rumo_pragas_webhook_events_type
  ON public.rumo_pragas_webhook_events (event_type);
CREATE INDEX IF NOT EXISTS idx_rumo_pragas_webhook_events_processed_at
  ON public.rumo_pragas_webhook_events (processed_at DESC);
COMMENT ON TABLE public.rumo_pragas_webhook_events IS
  'Stripe webhook event_id dedup for rumo-pragas. PK on event_id enforces idempotency. W20-2.';