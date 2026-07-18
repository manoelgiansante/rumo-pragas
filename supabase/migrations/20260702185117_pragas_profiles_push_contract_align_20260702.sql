-- Capturado VERBATIM de prod jxcnfyeemdltdfqtgbcl (supabase_migrations.schema_migrations) em 2026-07-18 [CR-05-REST].
-- md5 do corpo verbatim (da linha apos o marcador ate EOF, sem newline final extra) = c060bcebe8aef4626fcacec093cc73a3
--   = md5(array_to_string(statements, E';\n\n')) conferido em prod no momento da captura.
-- >>> corpo verbatim >>>
-- Pragas-only, additive: align prod schema with the shipped client + send-push contract
-- (DB-C1 / DB-A1 do mega-audit 02/jul; nenhum objeto compartilhado com outros apps)

ALTER TABLE public.pragas_profiles
  ADD COLUMN IF NOT EXISTS push_token text,
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS crops text[];

ALTER TABLE public.pragas_push_tokens
  ADD COLUMN IF NOT EXISTS expo_token text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS device_info jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

-- backfill defensivo (tabela tem 0 linhas hoje, mas mantém invariante expo_token=token)
UPDATE public.pragas_push_tokens SET expo_token = token WHERE expo_token IS NULL;

-- RPC que o binário 1.0.7 (lojas) JÁ chama e que nunca existiu em prod
CREATE OR REPLACE FUNCTION public.touch_push_token(
  p_expo_token text,
  p_platform text DEFAULT 'unknown',
  p_device_info jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_expo_token IS NULL OR length(p_expo_token) < 8 OR length(p_expo_token) > 512 THEN
    RAISE EXCEPTION 'invalid token' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.pragas_push_tokens
    (user_id, token, expo_token, platform, device_info, is_active, last_seen_at, updated_at)
  VALUES
    (v_uid, p_expo_token, p_expo_token, coalesce(p_platform, 'unknown'), p_device_info, true, now(), now())
  ON CONFLICT (user_id, token) DO UPDATE SET
    is_active   = true,
    expo_token  = EXCLUDED.expo_token,
    platform    = EXCLUDED.platform,
    device_info = EXCLUDED.device_info,
    last_seen_at = now(),
    updated_at  = now();
END;
$$;

REVOKE ALL ON FUNCTION public.touch_push_token(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_push_token(text, text, jsonb) TO authenticated;