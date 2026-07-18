-- Capturado VERBATIM de prod jxcnfyeemdltdfqtgbcl (supabase_migrations.schema_migrations) em 2026-07-18 [CR-05-REST].
-- md5 do corpo verbatim (da linha apos o marcador ate EOF, sem newline final extra) = 180e743890a7f4a3a88697169f2f7ccd
--   = md5(array_to_string(statements, E';\n\n')) conferido em prod no momento da captura.
-- >>> corpo verbatim >>>
-- Migration 03: Wrap auth.uid()/auth.role() in subselects (RLS initplan fix).
-- Risk: NONE (pure perf; behavior identical).
-- pragas_diagnoses
ALTER POLICY "Pragas: Users can delete own diagnoses" ON public.pragas_diagnoses
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "Pragas: Users can insert own diagnoses" ON public.pragas_diagnoses
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "Pragas: Users can view own diagnoses" ON public.pragas_diagnoses
  USING ((SELECT auth.uid()) = user_id);

-- pragas_profiles
ALTER POLICY "Pragas: Users can insert own profile" ON public.pragas_profiles
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "Pragas: Users can update own profile" ON public.pragas_profiles
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "Users can view own profile" ON public.pragas_profiles
  USING ((SELECT auth.uid()) = user_id);

-- pragas_chat_messages
ALTER POLICY "Service role full access to chat" ON public.pragas_chat_messages
  USING ((SELECT auth.role()) = 'service_role');
ALTER POLICY "Users can delete own chat messages" ON public.pragas_chat_messages
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "Users can insert own chat messages" ON public.pragas_chat_messages
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "Users can read own chat messages" ON public.pragas_chat_messages
  USING ((SELECT auth.uid()) = user_id);

-- pragas_diagnosis_usage
ALTER POLICY "Users can view own usage" ON public.pragas_diagnosis_usage
  USING ((SELECT auth.uid()) = user_id);

-- pragas_diagnosis_feedback
ALTER POLICY "Users can insert own feedback" ON public.pragas_diagnosis_feedback
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "Users can read own feedback" ON public.pragas_diagnosis_feedback
  USING ((SELECT auth.uid()) = user_id);

-- pragas_push_tokens
ALTER POLICY "Pragas: Users can manage own tokens" ON public.pragas_push_tokens
  USING ((SELECT auth.uid()) = user_id);

-- pragas_subscriptions
ALTER POLICY "Users can view own subscription" ON public.pragas_subscriptions
  USING ((SELECT auth.uid()) = user_id);

-- pragas_analytics
ALTER POLICY "Users can insert own events" ON public.pragas_analytics
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- pragas_error_logs
ALTER POLICY "Users can insert own errors" ON public.pragas_error_logs
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- pragas_outbreaks
ALTER POLICY "Pragas: Authenticated users can insert outbreaks" ON public.pragas_outbreaks
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "Pragas: Users can update own outbreaks" ON public.pragas_outbreaks
  USING ((SELECT auth.uid()) = user_id);

-- pragas_outbreak_confirmations
ALTER POLICY "Pragas: Authenticated users can insert confirmations"
  ON public.pragas_outbreak_confirmations
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- pragas_community_posts
ALTER POLICY "Pragas: Authenticated users can insert posts" ON public.pragas_community_posts
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "Pragas: Users can update own posts" ON public.pragas_community_posts
  USING ((SELECT auth.uid()) = user_id);

-- pragas_post_comments
ALTER POLICY "Pragas: Authenticated users can insert comments" ON public.pragas_post_comments
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- pragas_post_likes
ALTER POLICY "Pragas: Authenticated users can insert likes" ON public.pragas_post_likes
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "Pragas: Users can delete own likes" ON public.pragas_post_likes
  USING ((SELECT auth.uid()) = user_id);

-- pragas_post_replies
ALTER POLICY "Pragas: Authenticated users can insert replies" ON public.pragas_post_replies
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "Pragas: Users can update own replies" ON public.pragas_post_replies
  USING ((SELECT auth.uid()) = user_id);

-- pragas_reply_likes
ALTER POLICY "Users can manage own reply likes" ON public.pragas_reply_likes
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- pragas_community_likes
ALTER POLICY "Users can manage own community likes" ON public.pragas_community_likes
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);