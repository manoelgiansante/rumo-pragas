-- ============================================================================
-- PRAGAS — DDL VERBATIM DAS 14 TABELAS FANTASMA DE PROD (jxcnfyeemdltdfqtgbcl)
-- Captura READ-ONLY em 2026-07-18 (Mega Trabalho CROSS rodada 2, CR-05-pragas).
--
-- ⚠️ NÃO APLICAR ESTE ARQUIVO. As tabelas JÁ EXISTEM em prod; este arquivo é
-- baseline de schema pra fechar o drift repo↔prod (as tabelas existiam em prod
-- sem NENHUM arquivo de migration no repo). Vive em supabase/schema-baseline/
-- (fora de supabase/migrations/) exatamente pra nunca entrar no `db push`.
--
-- Fonte: information_schema.columns + pg_constraint + pg_policies +
-- pg_indexes + pg_get_triggerdef + role/column grants, extraídos ao vivo de
-- prod em 2026-07-18. Expressões de policy/constraint/trigger transcritas
-- verbatim do catálogo.
--
-- Dependências de FUNÇÃO que EXISTEM em prod e NÃO são definidas aqui:
--   - block_pragas_user_mutation_during_global_deletion(text)
--   - update_updated_at_column()
--   - notify_outbreak_reported()
--   - pragas_notification_queue_owner_guard()
--   - update_pragas_subscription_updated_at()
--
-- Ordem das tabelas respeita dependências de FK:
--   analytics, chat_messages, community_posts, community_likes,
--   post_comments, post_likes, post_replies, reply_likes, diagnosis_usage,
--   error_logs, notification_queue, outbreaks, outbreak_confirmations,
--   subscriptions
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. pragas_analytics
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pragas_analytics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  event_name text NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  screen text,
  platform text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT pragas_analytics_pkey PRIMARY KEY (id),
  CONSTRAINT pragas_analytics_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.pragas_analytics ENABLE ROW LEVEL SECURITY;

-- ⚠️ prod tem PAR DUPLICADO de policies service_role (cosmético — documentado, não corrigir aqui)
CREATE POLICY "Pragas: service_role full analytics" ON public.pragas_analytics
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.pragas_analytics
  FOR ALL TO service_role USING (true);
CREATE POLICY "Users can insert own events" ON public.pragas_analytics
  FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE INDEX idx_analytics_event ON public.pragas_analytics USING btree (event_name, created_at DESC);
CREATE INDEX idx_analytics_user ON public.pragas_analytics USING btree (user_id, created_at DESC);

CREATE TRIGGER block_global_deletion_user_mutation BEFORE INSERT OR UPDATE ON public.pragas_analytics FOR EACH ROW EXECUTE FUNCTION block_pragas_user_mutation_during_global_deletion('user_id');

GRANT ALL ON TABLE public.pragas_analytics TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. pragas_chat_messages
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pragas_chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT pragas_chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT pragas_chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT pragas_chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);
ALTER TABLE public.pragas_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to chat" ON public.pragas_chat_messages
  FOR ALL TO public USING ((( SELECT auth.role() AS role) = 'service_role'::text));
CREATE POLICY "Users can delete own chat messages" ON public.pragas_chat_messages
  FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can insert own chat messages" ON public.pragas_chat_messages
  FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users can read own chat messages" ON public.pragas_chat_messages
  FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE INDEX idx_chat_messages_created_at ON public.pragas_chat_messages USING btree (created_at);
CREATE INDEX idx_chat_messages_user_id ON public.pragas_chat_messages USING btree (user_id);
CREATE INDEX idx_chat_messages_user_role ON public.pragas_chat_messages USING btree (user_id, role, created_at);

CREATE TRIGGER block_global_deletion_user_mutation BEFORE INSERT OR UPDATE ON public.pragas_chat_messages FOR EACH ROW EXECUTE FUNCTION block_pragas_user_mutation_during_global_deletion('user_id');

GRANT ALL ON TABLE public.pragas_chat_messages TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. pragas_community_posts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pragas_community_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  image_url text,
  category text DEFAULT 'general'::text,
  tags text[],
  upvotes integer DEFAULT 0,
  comments_count integer DEFAULT 0,
  is_answered boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_solved boolean DEFAULT false,
  crop text,
  diagnosis_id uuid,
  author_name text,
  author_badge text,
  like_count integer DEFAULT 0,
  reply_count integer DEFAULT 0,
  solved boolean DEFAULT false,
  CONSTRAINT pragas_community_posts_pkey PRIMARY KEY (id),
  CONSTRAINT pragas_community_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.pragas_community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pragas: Authenticated users can insert posts" ON public.pragas_community_posts
  FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Pragas: Authenticated users can view posts" ON public.pragas_community_posts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Pragas: Users can delete own posts" ON public.pragas_community_posts
  FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Pragas: Users can update own posts" ON public.pragas_community_posts
  FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE INDEX idx_pragas_community_posts_created ON public.pragas_community_posts USING btree (created_at DESC);
CREATE INDEX idx_pragas_community_posts_user_id ON public.pragas_community_posts USING btree (user_id);

CREATE TRIGGER block_global_deletion_user_mutation BEFORE INSERT OR UPDATE ON public.pragas_community_posts FOR EACH ROW EXECUTE FUNCTION block_pragas_user_mutation_during_global_deletion('user_id');
CREATE TRIGGER trg_pragas_community_posts_updated_at BEFORE UPDATE ON public.pragas_community_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT ALL ON TABLE public.pragas_community_posts TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. pragas_community_likes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pragas_community_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT pragas_community_likes_pkey PRIMARY KEY (id),
  CONSTRAINT pragas_community_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.pragas_community_posts(id) ON DELETE CASCADE,
  CONSTRAINT pragas_community_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT pragas_community_likes_post_id_user_id_key UNIQUE (post_id, user_id)
);
ALTER TABLE public.pragas_community_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view community likes" ON public.pragas_community_likes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage own community likes" ON public.pragas_community_likes
  FOR ALL TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE INDEX idx_pragas_community_likes_user_id ON public.pragas_community_likes USING btree (user_id);

CREATE TRIGGER block_global_deletion_user_mutation BEFORE INSERT OR UPDATE ON public.pragas_community_likes FOR EACH ROW EXECUTE FUNCTION block_pragas_user_mutation_during_global_deletion('user_id');

GRANT ALL ON TABLE public.pragas_community_likes TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. pragas_post_comments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pragas_post_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  is_answer boolean DEFAULT false,
  upvotes integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT pragas_post_comments_pkey PRIMARY KEY (id),
  CONSTRAINT pragas_post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.pragas_community_posts(id) ON DELETE CASCADE,
  CONSTRAINT pragas_post_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.pragas_post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pragas: Authenticated users can insert comments" ON public.pragas_post_comments
  FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Pragas: Authenticated users can view comments" ON public.pragas_post_comments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Pragas: Users can delete own comments" ON public.pragas_post_comments
  FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Pragas: Users can update own comments" ON public.pragas_post_comments
  FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE INDEX idx_pragas_post_comments_post_id ON public.pragas_post_comments USING btree (post_id);
CREATE INDEX idx_pragas_post_comments_user_id ON public.pragas_post_comments USING btree (user_id);

CREATE TRIGGER block_global_deletion_user_mutation BEFORE INSERT OR UPDATE ON public.pragas_post_comments FOR EACH ROW EXECUTE FUNCTION block_pragas_user_mutation_during_global_deletion('user_id');

GRANT ALL ON TABLE public.pragas_post_comments TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. pragas_post_likes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pragas_post_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT pragas_post_likes_pkey PRIMARY KEY (id),
  CONSTRAINT pragas_post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.pragas_community_posts(id) ON DELETE CASCADE,
  CONSTRAINT pragas_post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT pragas_post_likes_post_id_user_id_key UNIQUE (post_id, user_id)
);
ALTER TABLE public.pragas_post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pragas: Authenticated users can insert likes" ON public.pragas_post_likes
  FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Pragas: Authenticated users can view likes" ON public.pragas_post_likes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Pragas: Users can delete own likes" ON public.pragas_post_likes
  FOR DELETE TO public USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE INDEX idx_pragas_post_likes_user_id ON public.pragas_post_likes USING btree (user_id);

CREATE TRIGGER block_global_deletion_user_mutation BEFORE INSERT OR UPDATE ON public.pragas_post_likes FOR EACH ROW EXECUTE FUNCTION block_pragas_user_mutation_during_global_deletion('user_id');

GRANT ALL ON TABLE public.pragas_post_likes TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. pragas_post_replies
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pragas_post_replies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  is_accepted boolean DEFAULT false,
  upvotes integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  author_name text,
  author_badge text,
  like_count integer DEFAULT 0,
  CONSTRAINT pragas_post_replies_pkey PRIMARY KEY (id),
  CONSTRAINT pragas_post_replies_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.pragas_community_posts(id) ON DELETE CASCADE,
  CONSTRAINT pragas_post_replies_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.pragas_post_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pragas: Authenticated users can insert replies" ON public.pragas_post_replies
  FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Pragas: Authenticated users can view replies" ON public.pragas_post_replies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Pragas: Users can delete own replies" ON public.pragas_post_replies
  FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Pragas: Users can update own replies" ON public.pragas_post_replies
  FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE INDEX idx_pragas_post_replies_post_id ON public.pragas_post_replies USING btree (post_id);
CREATE INDEX idx_pragas_post_replies_user_id ON public.pragas_post_replies USING btree (user_id);

CREATE TRIGGER block_global_deletion_user_mutation BEFORE INSERT OR UPDATE ON public.pragas_post_replies FOR EACH ROW EXECUTE FUNCTION block_pragas_user_mutation_during_global_deletion('user_id');
CREATE TRIGGER trg_pragas_post_replies_updated_at BEFORE UPDATE ON public.pragas_post_replies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT ALL ON TABLE public.pragas_post_replies TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. pragas_reply_likes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pragas_reply_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reply_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT pragas_reply_likes_pkey PRIMARY KEY (id),
  CONSTRAINT pragas_reply_likes_reply_id_fkey FOREIGN KEY (reply_id) REFERENCES public.pragas_post_replies(id) ON DELETE CASCADE,
  CONSTRAINT pragas_reply_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT pragas_reply_likes_reply_id_user_id_key UNIQUE (reply_id, user_id)
);
ALTER TABLE public.pragas_reply_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reply likes" ON public.pragas_reply_likes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage own reply likes" ON public.pragas_reply_likes
  FOR ALL TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE INDEX idx_pragas_reply_likes_user_id ON public.pragas_reply_likes USING btree (user_id);

CREATE TRIGGER block_global_deletion_user_mutation BEFORE INSERT OR UPDATE ON public.pragas_reply_likes FOR EACH ROW EXECUTE FUNCTION block_pragas_user_mutation_during_global_deletion('user_id');

GRANT ALL ON TABLE public.pragas_reply_likes TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9. pragas_diagnosis_usage
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pragas_diagnosis_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan text NOT NULL DEFAULT 'basico'::text,
  type text NOT NULL DEFAULT 'diagnosis'::text,
  crop text,
  result jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT pragas_diagnosis_usage_pkey PRIMARY KEY (id),
  CONSTRAINT pragas_diagnosis_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.pragas_diagnosis_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage usage" ON public.pragas_diagnosis_usage
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can view own usage" ON public.pragas_diagnosis_usage
  FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE INDEX idx_diagnosis_usage_type ON public.pragas_diagnosis_usage USING btree (user_id, type, created_at DESC);
CREATE INDEX idx_pragas_diagnosis_usage_user_created ON public.pragas_diagnosis_usage USING btree (user_id, created_at DESC);

CREATE TRIGGER block_global_deletion_user_mutation BEFORE INSERT OR UPDATE ON public.pragas_diagnosis_usage FOR EACH ROW EXECUTE FUNCTION block_pragas_user_mutation_during_global_deletion('user_id');

GRANT ALL ON TABLE public.pragas_diagnosis_usage TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 10. pragas_error_logs (sem triggers em prod)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pragas_error_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  error_message text NOT NULL,
  error_stack text,
  component text,
  platform text,
  app_version text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT pragas_error_logs_pkey PRIMARY KEY (id),
  CONSTRAINT pragas_error_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.pragas_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.pragas_error_logs
  FOR ALL TO service_role USING (true);
CREATE POLICY "Users can insert own errors" ON public.pragas_error_logs
  FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE INDEX idx_errors_created ON public.pragas_error_logs USING btree (created_at DESC);
CREATE INDEX idx_pragas_error_logs_user_id ON public.pragas_error_logs USING btree (user_id);

GRANT ALL ON TABLE public.pragas_error_logs TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 11. pragas_notification_queue (grants: SÓ service_role em prod)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pragas_notification_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  token text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  owner_user_id uuid NOT NULL,
  CONSTRAINT pragas_notification_queue_pkey PRIMARY KEY (id),
  CONSTRAINT pragas_notification_queue_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.pragas_notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_notification_queue FORCE ROW LEVEL SECURITY;

CREATE POLICY "notif_queue_service" ON public.pragas_notification_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_pragas_notification_queue_owner_created ON public.pragas_notification_queue USING btree (owner_user_id, created_at, id);

CREATE TRIGGER pragas_notification_queue_owner_guard BEFORE INSERT OR UPDATE OF id, token, owner_user_id ON public.pragas_notification_queue FOR EACH ROW EXECUTE FUNCTION pragas_notification_queue_owner_guard();

-- Em prod, anon/authenticated foram REVOGADOS desta tabela (só service_role):
GRANT ALL ON TABLE public.pragas_notification_queue TO service_role;

-- ----------------------------------------------------------------------------
-- 12. pragas_outbreaks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pragas_outbreaks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pest_id text NOT NULL,
  pest_name text NOT NULL,
  crop text NOT NULL,
  severity text DEFAULT 'medium'::text,
  description text,
  image_url text,
  location_lat numeric NOT NULL,
  location_lng numeric NOT NULL,
  location_name text,
  city text,
  state text,
  verified boolean DEFAULT false,
  verified_by uuid,
  upvotes integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  latitude numeric,
  longitude numeric,
  region text,
  confirmed_count integer DEFAULT 0,
  status text DEFAULT 'active'::text,
  CONSTRAINT pragas_outbreaks_pkey PRIMARY KEY (id),
  CONSTRAINT pragas_outbreaks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT pragas_outbreaks_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
  CONSTRAINT pragas_outbreaks_status_check CHECK ((status = ANY (ARRAY['active'::text, 'contained'::text, 'resolved'::text])))
);
ALTER TABLE public.pragas_outbreaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pragas: Authenticated users can insert outbreaks" ON public.pragas_outbreaks
  FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Pragas: Authenticated users can view active outbreaks" ON public.pragas_outbreaks
  FOR SELECT TO authenticated USING ((status = ANY (ARRAY['active'::text, 'contained'::text])));
CREATE POLICY "Pragas: Users can update own outbreaks" ON public.pragas_outbreaks
  FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Pragas: service_role full outbreaks" ON public.pragas_outbreaks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_pragas_outbreaks_lat_lng ON public.pragas_outbreaks USING btree (latitude, longitude);
CREATE INDEX idx_pragas_outbreaks_location ON public.pragas_outbreaks USING btree (location_lat, location_lng);
CREATE INDEX idx_pragas_outbreaks_state ON public.pragas_outbreaks USING btree (state);
CREATE INDEX idx_pragas_outbreaks_status ON public.pragas_outbreaks USING btree (status);
CREATE INDEX idx_pragas_outbreaks_user_id ON public.pragas_outbreaks USING btree (user_id);

CREATE TRIGGER block_global_deletion_user_mutation BEFORE INSERT OR UPDATE ON public.pragas_outbreaks FOR EACH ROW EXECUTE FUNCTION block_pragas_user_mutation_during_global_deletion('user_id');
CREATE TRIGGER on_outbreak_notify AFTER INSERT ON public.pragas_outbreaks FOR EACH ROW EXECUTE FUNCTION notify_outbreak_reported();
CREATE TRIGGER trg_pragas_outbreaks_updated_at BEFORE UPDATE ON public.pragas_outbreaks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT ALL ON TABLE public.pragas_outbreaks TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 13. pragas_outbreak_confirmations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pragas_outbreak_confirmations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  outbreak_id uuid NOT NULL,
  user_id uuid NOT NULL,
  confirmed boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT pragas_outbreak_confirmations_pkey PRIMARY KEY (id),
  CONSTRAINT pragas_outbreak_confirmations_outbreak_id_fkey FOREIGN KEY (outbreak_id) REFERENCES public.pragas_outbreaks(id) ON DELETE CASCADE,
  CONSTRAINT pragas_outbreak_confirmations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT pragas_outbreak_confirmations_outbreak_id_user_id_key UNIQUE (outbreak_id, user_id)
);
ALTER TABLE public.pragas_outbreak_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pragas: Authenticated users can insert confirmations" ON public.pragas_outbreak_confirmations
  FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Pragas: Authenticated users can view all confirmations" ON public.pragas_outbreak_confirmations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Pragas: Users can delete own confirmations" ON public.pragas_outbreak_confirmations
  FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE INDEX idx_pragas_outbreak_confirmations_user_id ON public.pragas_outbreak_confirmations USING btree (user_id);

CREATE TRIGGER block_global_deletion_user_mutation BEFORE INSERT OR UPDATE ON public.pragas_outbreak_confirmations FOR EACH ROW EXECUTE FUNCTION block_pragas_user_mutation_during_global_deletion('user_id');

GRANT ALL ON TABLE public.pragas_outbreak_confirmations TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 14. pragas_subscriptions (ZERO-AD compliant: nenhuma policy de INSERT/UPDATE
--     pra usuário — entitlement só muda via service_role/webhook)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pragas_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'inactive'::text,
  platform text NOT NULL DEFAULT 'web'::text,
  product_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  store_transaction_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  plan text DEFAULT 'basico'::text,
  trial_ends_at timestamptz,
  asaas_customer_id text,
  asaas_subscription_id text,
  asaas_last_payment_id text,
  CONSTRAINT pragas_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT pragas_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT pragas_subscriptions_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text, 'promotional'::text, 'stripe'::text]))),
  CONSTRAINT pragas_subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'canceled'::text, 'expired'::text, 'past_due'::text, 'trialing'::text, 'inactive'::text])))
);
ALTER TABLE public.pragas_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription" ON public.pragas_subscriptions
  FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "deprecated_select_only_own" ON public.pragas_subscriptions
  FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE INDEX idx_pragas_subscriptions_stripe_customer ON public.pragas_subscriptions USING btree (stripe_customer_id);
CREATE UNIQUE INDEX idx_pragas_subscriptions_user_id ON public.pragas_subscriptions USING btree (user_id);

CREATE TRIGGER block_global_deletion_user_mutation BEFORE INSERT OR UPDATE ON public.pragas_subscriptions FOR EACH ROW EXECUTE FUNCTION block_pragas_user_mutation_during_global_deletion('user_id');
CREATE TRIGGER trigger_update_pragas_subscription BEFORE UPDATE ON public.pragas_subscriptions FOR EACH ROW EXECUTE FUNCTION update_pragas_subscription_updated_at();

GRANT ALL ON TABLE public.pragas_subscriptions TO anon, authenticated, service_role;

-- ============================================================================
-- FIM — 14 tabelas · 40 policies · 27 indexes (+1 UNIQUE em subscriptions
-- listado acima) · 18 triggers · grants (13 tabelas full / notification_queue
-- só service_role, com FORCE ROW LEVEL SECURITY). Baseline read-only; NÃO aplicar.
-- ============================================================================
