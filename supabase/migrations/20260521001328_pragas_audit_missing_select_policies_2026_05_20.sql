-- Capturado VERBATIM de prod jxcnfyeemdltdfqtgbcl (supabase_migrations.schema_migrations) em 2026-07-18 [CR-05-REST].
-- md5 do corpo verbatim (da linha apos o marcador ate EOF, sem newline final extra) = 2d844bcf657c6b5baa078c392ccac810
--   = md5(array_to_string(statements, E';\n\n')) conferido em prod no momento da captura.
-- >>> corpo verbatim >>>
-- Migration 04: Add MISSING SELECT/DELETE policies blocking community features.
-- Risk: LOW (only ADDING permissive read policies).
CREATE POLICY "Pragas: Authenticated users can view active outbreaks"
  ON public.pragas_outbreaks FOR SELECT
  TO authenticated
  USING (status IN ('active', 'contained'));

CREATE POLICY "Pragas: service_role full outbreaks"
  ON public.pragas_outbreaks FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Pragas: Authenticated users can view all confirmations"
  ON public.pragas_outbreak_confirmations FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "Pragas: Users can delete own confirmations"
  ON public.pragas_outbreak_confirmations FOR DELETE
  TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Pragas: Authenticated users can view posts"
  ON public.pragas_community_posts FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "Pragas: Users can delete own posts"
  ON public.pragas_community_posts FOR DELETE
  TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Pragas: Authenticated users can view comments"
  ON public.pragas_post_comments FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "Pragas: Users can update own comments"
  ON public.pragas_post_comments FOR UPDATE
  TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Pragas: Users can delete own comments"
  ON public.pragas_post_comments FOR DELETE
  TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Pragas: Authenticated users can view replies"
  ON public.pragas_post_replies FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "Pragas: Users can delete own replies"
  ON public.pragas_post_replies FOR DELETE
  TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Pragas: Authenticated users can view likes"
  ON public.pragas_post_likes FOR SELECT
  TO authenticated USING (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='pragas_analytics' AND policyname='Pragas: service_role full analytics'
  ) THEN
    CREATE POLICY "Pragas: service_role full analytics"
      ON public.pragas_analytics FOR ALL
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;