-- Capturado VERBATIM de prod jxcnfyeemdltdfqtgbcl (supabase_migrations.schema_migrations) em 2026-07-18 [CR-05-REST].
-- md5 do corpo verbatim (da linha apos o marcador ate EOF, sem newline final extra) = d7e025325ffdae3aebb8f2b87c197846
--   = md5(array_to_string(statements, E';\n\n')) conferido em prod no momento da captura.
-- >>> corpo verbatim >>>
-- Rumo Pragas — comeback de monetização (Modelo B / RM parity), 2026-07-05
-- 1) Colunas de trial + Asaas PIX (aditivas, backward-compatible)
ALTER TABLE public.pragas_subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE public.pragas_subscriptions ADD COLUMN IF NOT EXISTS asaas_customer_id text;
ALTER TABLE public.pragas_subscriptions ADD COLUMN IF NOT EXISTS asaas_subscription_id text;
ALTER TABLE public.pragas_subscriptions ADD COLUMN IF NOT EXISTS asaas_last_payment_id text;

-- 2) Signup passa a conceder 14d de trial do PRO (diagnóstico continua grátis sempre;
--    Pro = histórico ∞ + PDF/receituário + IA prioritária — gating é client-side na vNext).
--    Binários atuais não leem esta tabela para gating → zero mudança de comportamento hoje.
CREATE OR REPLACE FUNCTION public.handle_new_pragas_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.pragas_profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Trial 14d do Pro concedido pelo app (Modelo B — igual Rumo Máquinas).
  -- TRIAL_DAYS knob: 14 (alternativas consideradas: 7, 30).
  INSERT INTO public.pragas_subscriptions (user_id, status, plan, platform, trial_ends_at)
  VALUES (
    NEW.id,
    'trialing',
    'pro',
    'web',
    now() + interval '14 days'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 3) Backfill: usuários existentes (todos sem assinatura real) ganham 14d de trial a partir de HOJE.
--    Não toca nos comps promocionais (status='active').
UPDATE public.pragas_subscriptions
SET status = 'trialing',
    plan = 'pro',
    trial_ends_at = now() + interval '14 days',
    updated_at = now()
WHERE status = 'inactive'
  AND stripe_subscription_id IS NULL
  AND asaas_subscription_id IS NULL;

-- 4) Sweep de expiração (belt & suspenders — o client também honra trial_ends_at)
CREATE OR REPLACE FUNCTION public.pragas_expire_trials()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  updated_count int;
BEGIN
  UPDATE public.pragas_subscriptions
  SET status = 'inactive',
      plan = 'basico',
      updated_at = now()
  WHERE status = 'trialing'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < now();
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'pragas trial purge: % rows trialing->inactive', updated_count;
  RETURN updated_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.pragas_expire_trials() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('pragas-expire-trials', '20 * * * *', $$SELECT public.pragas_expire_trials();$$);