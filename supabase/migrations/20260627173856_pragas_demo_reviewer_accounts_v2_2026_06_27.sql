-- Capturado VERBATIM de prod jxcnfyeemdltdfqtgbcl (supabase_migrations.schema_migrations) em 2026-07-18 [CR-05-REST].
-- md5 do corpo verbatim (da linha apos o marcador ate EOF, sem newline final extra) = 73a796d5ea37dc6facd549d1f15ade7d
--   = md5(array_to_string(statements, E';\n\n')) conferido em prod no momento da captura.
-- ATENCAO [REDACTED]: as 2 senhas literais das contas demo de review foram substituidas por
--   <REDACTED-DEMO-PASSWORD-REVIEW-ACTIVE> e <REDACTED-DEMO-PASSWORD-REVIEW-EXPIRED> (repo remoto; gitleaks).
--   O md5 acima refere-se ao texto ORIGINAL de prod (pre-redacao); o corpo abaixo diverge SOMENTE nesses 2 literais.
-- >>> corpo (redigido) >>>
DO $$
DECLARE
  uid_a uuid := gen_random_uuid();
  uid_e uuid := gen_random_uuid();
BEGIN
  -- Conta demo ATIVA (Pro)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email)='pragas.review@agrorumo.com') THEN
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES ('00000000-0000-0000-0000-000000000000', uid_a, 'authenticated', 'authenticated',
      'pragas.review@agrorumo.com',
      extensions.crypt('<REDACTED-DEMO-PASSWORD-REVIEW-ACTIVE>', extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (uid_a::text, uid_a,
      jsonb_build_object('sub', uid_a::text, 'email','pragas.review@agrorumo.com','email_verified',true),
      'email', now(), now(), now());
    INSERT INTO public.pragas_subscriptions (user_id, status, platform, current_period_end, plan, created_at, updated_at)
    VALUES (uid_a, 'active', 'promotional', now() + interval '2 years', 'pro', now(), now())
    ON CONFLICT (user_id) DO UPDATE
      SET status='active', platform='promotional', current_period_end=now()+interval '2 years', plan='pro', updated_at=now();
  END IF;

  -- Conta demo EXPIRADA
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email)='pragas.review.expired@agrorumo.com') THEN
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES ('00000000-0000-0000-0000-000000000000', uid_e, 'authenticated', 'authenticated',
      'pragas.review.expired@agrorumo.com',
      extensions.crypt('<REDACTED-DEMO-PASSWORD-REVIEW-EXPIRED>', extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (uid_e::text, uid_e,
      jsonb_build_object('sub', uid_e::text, 'email','pragas.review.expired@agrorumo.com','email_verified',true),
      'email', now(), now(), now());
    INSERT INTO public.pragas_subscriptions (user_id, status, platform, current_period_end, plan, created_at, updated_at)
    VALUES (uid_e, 'expired', 'promotional', now() - interval '1 month', 'pro', now(), now())
    ON CONFLICT (user_id) DO UPDATE
      SET status='expired', platform='promotional', current_period_end=now()-interval '1 month', plan='pro', updated_at=now();
  END IF;
END $$;