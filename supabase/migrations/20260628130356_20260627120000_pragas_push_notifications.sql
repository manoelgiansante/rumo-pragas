-- =============================================================================
-- pragas_push_notifications — audit / idempotency table for the send-push fn
-- =============================================================================
-- WHY: the deployed edge function `supabase/functions/send-push/index.ts`
-- performs SELECT / INSERT / UPDATE against `public.pragas_push_notifications`
-- (idempotency reserve + audit of fan-out results). That table was never
-- created in the shared prod DB (only `pragas_push_tokens` exists), so every
-- invocation failed with 42P01 ("relation does not exist") -> the reserve
-- INSERT errored -> the function returned 500 `reserve_failed` and NO push was
-- ever delivered. This migration creates the missing table.
--
-- Project: jxcnfyeemdltdfqtgbcl (Agrorumo projetos — NOT Rumo Maquinas).
-- Column names below are validated 1:1 against the edge function:
--   INSERT (reserve): notification_id, sender, category, payload, status
--   SELECT (dedup):   notification_id, status, recipient_count, accepted_count, error_count
--   UPDATE (audit):   recipient_count, accepted_count, error_count, status
--
-- SECURITY: this is a server-to-server table written ONLY by the send-push
-- edge function via the service_role key. RLS is enabled and the only policy
-- grants full access to service_role; anon/authenticated have NO access.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pragas_push_notifications (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id text        NOT NULL UNIQUE,
  sender          text        NOT NULL DEFAULT 'system',
  category        text,
  payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'sent', 'partial', 'failed')),
  recipient_count int         NOT NULL DEFAULT 0,
  accepted_count  int         NOT NULL DEFAULT 0,
  error_count     int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Recent-first listing of the audit log (admin / observability).
CREATE INDEX IF NOT EXISTS idx_pragas_push_notifications_created_at
  ON public.pragas_push_notifications (created_at DESC);

-- Lock the table down. No mobile/anon access — service_role only.
ALTER TABLE public.pragas_push_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_notif_service_role_all ON public.pragas_push_notifications;
CREATE POLICY push_notif_service_role_all
  ON public.pragas_push_notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
