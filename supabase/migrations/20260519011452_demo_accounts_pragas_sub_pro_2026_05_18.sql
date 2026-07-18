-- Capturado VERBATIM de prod jxcnfyeemdltdfqtgbcl (supabase_migrations.schema_migrations) em 2026-07-18 [CR-05-REST].
-- md5 do corpo verbatim (da linha apos o marcador ate EOF, sem newline final extra) = 17ffbfb48395dcb8a0bc7ee3fa783319
--   = md5(array_to_string(statements, E';\n\n')) conferido em prod no momento da captura.
-- >>> corpo verbatim >>>
-- Apple Review seed 2026-05-18: ativar pragas pro nas 4 demos restantes
-- Rollback: UPDATE pragas_subscriptions SET status='inactive', plan='basico', current_period_end=NULL WHERE user_id IN (...);
UPDATE pragas_subscriptions
SET
  status='active',
  plan='pro',
  current_period_end = now() + interval '1 year',
  updated_at = now()
WHERE user_id IN (
  '29d974ab-0a86-4a2b-a656-a634f971a88e', -- demo.finance@agrorumo.com
  '9d7bcdb9-f614-4908-af00-1121e3f1d3bf', -- demo@campovivo.agrorumo.com
  '54a086be-e186-467f-92ad-636ba0927635', -- demo@rumooperacional.com.br
  '8adaebdb-c4ca-48ae-86a7-ab9af7fcef72'  -- demo@rumovet.com.br
);