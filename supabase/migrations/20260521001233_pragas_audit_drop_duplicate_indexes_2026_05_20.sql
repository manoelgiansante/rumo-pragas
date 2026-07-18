-- Capturado VERBATIM de prod jxcnfyeemdltdfqtgbcl (supabase_migrations.schema_migrations) em 2026-07-18 [CR-05-REST].
-- md5 do corpo verbatim (da linha apos o marcador ate EOF, sem newline final extra) = 219baaa1684ad3969d404aca36392ae8
--   = md5(array_to_string(statements, E';\n\n')) conferido em prod no momento da captura.
-- >>> corpo verbatim >>>
-- Migration 01: Drop duplicate indexes flagged by Supabase advisor.
-- Risk: NONE (kept indexes are byte-identical to dropped ones).
DROP INDEX IF EXISTS public.idx_diagnoses_user_created;
DROP INDEX IF EXISTS public.idx_diagnosis_usage_user_date;
DROP INDEX IF EXISTS public.idx_profiles_user_id;
DROP INDEX IF EXISTS public.idx_diagnoses_user_id;