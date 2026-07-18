-- Capturado VERBATIM de prod jxcnfyeemdltdfqtgbcl (supabase_migrations.schema_migrations) em 2026-07-18 [CR-05-REST].
-- md5 do corpo verbatim (da linha apos o marcador ate EOF, sem newline final extra) = 4904ff7fe83c20c5c48ff64d5e090d31
--   = md5(array_to_string(statements, E';\n\n')) conferido em prod no momento da captura.
-- >>> corpo verbatim >>>
-- Migration 02: Remove duplicate "Pragas:" prefixed RLS policies.
-- Risk: LOW (verified via pg_policies: "Pragas: Users..." policies cover all
-- CRUD ops on pragas_diagnoses with identical qual/with_check as the
-- generic "Users..." duplicates being dropped. On pragas_profiles, the
-- generic versions had a BUG (auth.uid()=id instead of =user_id), so
-- dropping them removes a broken policy. The SELECT policy "Users can view
-- own profile" with correct auth.uid()=user_id is NOT dropped.

DROP POLICY IF EXISTS "Users can delete own diagnoses" ON public.pragas_diagnoses;
DROP POLICY IF EXISTS "Users can insert own diagnoses" ON public.pragas_diagnoses;
DROP POLICY IF EXISTS "Users can view own diagnoses"   ON public.pragas_diagnoses;

DROP POLICY IF EXISTS "Users can insert own profile" ON public.pragas_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.pragas_profiles;