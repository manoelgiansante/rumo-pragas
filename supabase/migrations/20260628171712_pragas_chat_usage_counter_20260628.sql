-- Capturado VERBATIM de prod jxcnfyeemdltdfqtgbcl (supabase_migrations.schema_migrations) em 2026-07-18 [CR-05-REST].
-- md5 do corpo verbatim (da linha apos o marcador ate EOF, sem newline final extra) = 629956a5237d28493b0127aa7d1dc0d1
--   = md5(array_to_string(statements, E';\n\n')) conferido em prod no momento da captura.
-- >>> corpo verbatim >>>
CREATE TABLE IF NOT EXISTS public.chat_usage (
  user_id    uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  app        text        NOT NULL DEFAULT 'rumo-pragas',
  year_month text        NOT NULL,
  count      integer     NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, app, year_month)
);

COMMENT ON TABLE public.chat_usage IS
  'Server-side monthly ai-chat message counter per (user, app). Mutated only by SECDEF RPCs via service_role. Added 2026-06-28.';

ALTER TABLE public.chat_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_usage_select_own ON public.chat_usage;
CREATE POLICY chat_usage_select_own ON public.chat_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_chat_usage_count(p_user_id uuid, p_app text)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT cu.count FROM public.chat_usage cu
      WHERE cu.user_id = p_user_id AND cu.app = p_app
        AND cu.year_month = to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM')), 0);
$$;

CREATE OR REPLACE FUNCTION public.increment_chat_usage(p_user_id uuid, p_app text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ym text := to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM'); v_count integer;
BEGIN
  INSERT INTO public.chat_usage (user_id, app, year_month, count, updated_at)
  VALUES (p_user_id, p_app, v_ym, 1, now())
  ON CONFLICT (user_id, app, year_month)
  DO UPDATE SET count = public.chat_usage.count + 1, updated_at = now()
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.get_chat_usage_count(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_chat_usage(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_usage_count(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_chat_usage(uuid, text) TO service_role;