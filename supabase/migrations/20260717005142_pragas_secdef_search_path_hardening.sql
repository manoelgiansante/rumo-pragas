-- Capturado VERBATIM de prod jxcnfyeemdltdfqtgbcl (supabase_migrations.schema_migrations) em 2026-07-18 [CR-05-REST].
-- md5 do corpo verbatim (da linha apos o marcador ate EOF, sem newline final extra) = 1d4a5b9cccb95f14c7a46a041670bbf2
--   = md5(array_to_string(statements, E';\n\n')) conferido em prod no momento da captura.
-- >>> corpo verbatim >>>
-- Harden the two legacy Pragas SECURITY DEFINER functions to an empty
-- search_path. Both bodies already schema-qualify every reference
-- (public.pragas_profiles / public.pragas_subscriptions), so behaviour is
-- unchanged; this removes the search_path hijack surface and satisfies the
-- pragas prod-compat postflight contract.
ALTER FUNCTION public.handle_new_pragas_user() SET search_path = '';
ALTER FUNCTION public.pragas_expire_trials() SET search_path = '';