-- Capturado VERBATIM de prod jxcnfyeemdltdfqtgbcl (supabase_migrations.schema_migrations) em 2026-07-18 [CR-05-REST].
-- md5 do corpo verbatim (da linha apos o marcador ate EOF, sem newline final extra) = 2be3deeb8c346eeb858ebfe088f1183b
--   = md5(array_to_string(statements, E';\n\n')) conferido em prod no momento da captura.
-- NOTA: variante SAFE aplicada em prod (handle_new_user intencionalmente NAO modificado).
--       A proposta original (com redefinicao de handle_new_user) diverge e foi movida para
--       supabase/migrations-proposals/20260628120000_subscriptions_per_app_isolation.sql.
-- >>> corpo verbatim >>>
-- SAFE variant of pragas per-app subscriptions isolation.
-- Verified live: public.subscriptions has 0 rows, 0 FKs reference it, and Pragas
-- is the ONLY jxcn writer. handle_new_user intentionally NOT modified.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS app text NOT NULL DEFAULT 'rumo-pragas';

UPDATE public.subscriptions SET app = 'rumo-pragas' WHERE app IS NULL;

DO $$
DECLARE con RECORD;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'subscriptions' AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
      ) = ARRAY['user_id']
  LOOP
    EXECUTE format('ALTER TABLE public.subscriptions DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_user_app_unique'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_user_app_unique UNIQUE (user_id, app);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_app
  ON public.subscriptions (user_id, app);