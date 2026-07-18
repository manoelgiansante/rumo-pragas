-- Capturado VERBATIM de prod jxcnfyeemdltdfqtgbcl (supabase_migrations.schema_migrations) em 2026-07-18 [CR-05-REST].
-- md5 do corpo verbatim (da linha apos o marcador ate EOF, sem newline final extra) = 68711565d4e96e86c50796ff06ac99c2
--   = md5(array_to_string(statements, E';\n\n')) conferido em prod no momento da captura.
-- >>> corpo verbatim >>>
-- Migration 11: webhook_events explicit policies (was RLS-on with no policies).
-- Risk: NONE (additive; narrower than service_role bypass).
CREATE POLICY "webhook_events: service_role full access"
  ON public.webhook_events FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "webhook_events: dashboard_user read"
  ON public.webhook_events FOR SELECT
  TO dashboard_user
  USING (true);

COMMENT ON TABLE public.webhook_events IS
  'Persistent dedup log for Stripe + RevenueCat webhooks. PK on event_id prevents reprocessing on retry. Insert by service_role only.';