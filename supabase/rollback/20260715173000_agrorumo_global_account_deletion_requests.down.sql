-- Rollback is intentionally refused after the first durable request exists.
-- A production queue/receipt is evidence owed to a data subject and must never
-- disappear as part of an application rollback.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

-- Hold the queue lock from the emptiness proof through every DROP. Without
-- this, a concurrent confirmed request could commit between the SELECT and
-- DROP TABLE and lose its legally significant receipt.
LOCK TABLE public.agrorumo_account_deletion_requests,
           public.agrorumo_account_deletion_challenges,
           public.agrorumo_account_deletion_apple_revocations,
           public.agrorumo_account_deletion_events,
           public.agrorumo_deletion_status_rate_limits
  IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.agrorumo_account_deletion_requests) THEN
    RAISE EXCEPTION 'global_deletion_rollback_refuses_durable_requests';
  END IF;
END
$$;

DO $drop_global_deletion_user_mutation_triggers$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'pragas_profiles', 'pragas_diagnoses', 'pragas_diagnosis_feedback',
    'pragas_diagnosis_usage', 'pragas_chat_messages', 'pragas_ai_consents',
    'pragas_ai_content_reports', 'pragas_location_consent_decisions',
    'pragas_user_preferences', 'pragas_analytics', 'pragas_community_posts',
    'pragas_community_likes', 'pragas_post_likes', 'pragas_post_replies',
    'pragas_post_comments', 'pragas_reply_likes', 'pragas_outbreaks',
    'pragas_outbreak_confirmations', 'pragas_subscriptions'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS block_global_deletion_user_mutation ON public.%I',
        v_table
      );
    END IF;
  END LOOP;
END
$drop_global_deletion_user_mutation_triggers$;
DROP TRIGGER IF EXISTS block_global_deletion_service_write
  ON public.pragas_ai_idempotency_records;
DROP TRIGGER IF EXISTS block_global_deletion_service_write
  ON public.analytics_events;
DROP FUNCTION IF EXISTS public.block_pragas_service_write_during_global_deletion();
DROP FUNCTION IF EXISTS public.block_pragas_user_mutation_during_global_deletion();
DROP TRIGGER IF EXISTS block_pragas_push_enable_during_global_deletion
  ON public.pragas_push_tokens;
DROP FUNCTION IF EXISTS public.block_pragas_push_enable_during_global_deletion();
DROP TRIGGER IF EXISTS block_pragas_reactivation_during_global_deletion
  ON public.pragas_app_links;
DROP FUNCTION IF EXISTS public.block_pragas_reactivation_during_global_deletion();

-- Restore the exact access gate installed by the 171000 runtime migration.
CREATE OR REPLACE FUNCTION public.pragas_current_link_allows_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.pragas_app_links
       WHERE user_id = auth.uid() AND active
    )
    AND EXISTS (
      SELECT 1 FROM public.pragas_profiles
       WHERE user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.subscriptions
       WHERE user_id = auth.uid() AND app = 'rumo-pragas' AND status = 'active'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.pragas_deletion_jobs
       WHERE user_id = auth.uid() AND status <> 'reactivated'
    )
$$;
REVOKE ALL ON FUNCTION public.pragas_current_link_allows_access()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pragas_current_link_allows_access()
  TO authenticated;

-- Restore the exact account-link behavior installed by migration 171000.
CREATE OR REPLACE FUNCTION public.pragas_link_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $pragas_link_account_prod_compat_v1$
DECLARE
  v_user_id uuid := auth.uid();
  v_status text;
  v_subscription_status text;
  v_full_name text;
  v_already_linked boolean;
BEGIN
  -- pragas_link_account_prod_compat_v1
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('pragas-account:' || v_user_id::text, 0));
  SELECT status INTO v_status FROM public.pragas_deletion_jobs
   WHERE user_id = v_user_id;
  IF v_status = 'blocked_global_decision' THEN
    RETURN jsonb_build_object(
      'linked', false, 'app', 'rumo-pragas',
      'code', 'deleted_reactivation_required'
    );
  ELSIF v_status IN ('requested', 'processing', 'retry') THEN
    RETURN jsonb_build_object(
      'linked', false, 'app', 'rumo-pragas', 'code', 'deletion_pending'
    );
  END IF;
  SELECT left(NULLIF(btrim(raw_user_meta_data ->> 'full_name'), ''), 200)
    INTO v_full_name FROM auth.users WHERE id = v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'auth_identity_not_found'; END IF;
  INSERT INTO public.pragas_profiles (user_id, full_name)
  VALUES (v_user_id, v_full_name)
  ON CONFLICT (user_id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.pragas_profiles WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'pragas_profile_link_failed';
  END IF;
  INSERT INTO public.subscriptions (user_id, plan, status, provider, app)
  VALUES (v_user_id, 'free', 'active', 'free', 'rumo-pragas')
  ON CONFLICT (user_id, app) DO NOTHING;
  SELECT status INTO v_subscription_status
    FROM public.subscriptions
   WHERE user_id = v_user_id AND app = 'rumo-pragas';
  IF NOT FOUND THEN RAISE EXCEPTION 'pragas_subscription_link_failed'; END IF;
  IF v_subscription_status <> 'active' THEN
    RETURN jsonb_build_object(
      'linked', false, 'app', 'rumo-pragas', 'code', 'subscription_inactive'
    );
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.pragas_app_links WHERE user_id = v_user_id AND active
  ) INTO v_already_linked;
  INSERT INTO public.pragas_app_links (
    user_id, link_version, active, linked_at, last_linked_at, deactivated_at
  ) VALUES (
    v_user_id, '2026-07-14.1', true, clock_timestamp(), clock_timestamp(), NULL
  )
  ON CONFLICT (user_id) DO UPDATE
    SET link_version = EXCLUDED.link_version,
        active = true,
        last_linked_at = clock_timestamp(),
        deactivated_at = NULL;
  RETURN jsonb_build_object(
    'linked', true, 'app', 'rumo-pragas',
    'code', CASE WHEN v_already_linked THEN 'already_linked' ELSE 'linked' END
  );
END;
$pragas_link_account_prod_compat_v1$;
REVOKE ALL ON FUNCTION public.pragas_link_account()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pragas_link_account() TO authenticated;

DROP FUNCTION IF EXISTS public.purge_agrorumo_account_deletion_ephemera(integer);
DROP FUNCTION IF EXISTS public.transition_agrorumo_account_deletion_request(
  uuid, text, text, text, uuid, text, text, text
);
DROP FUNCTION IF EXISTS public.resolve_agrorumo_account_deletion_subject(uuid);
DROP FUNCTION IF EXISTS public.list_agrorumo_account_deletion_queue(text, integer);
DROP FUNCTION IF EXISTS public.get_agrorumo_account_deletion_status(uuid);
DROP FUNCTION IF EXISTS public.consume_agrorumo_deletion_status_rate_limit(
  text, integer, integer
);
DROP FUNCTION IF EXISTS public.get_agrorumo_account_deletion_app_gate(uuid);
DROP FUNCTION IF EXISTS public.record_agrorumo_apple_revocation_result(
  uuid, uuid, uuid, text, text
);
DROP FUNCTION IF EXISTS public.claim_agrorumo_apple_revocation_token(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.store_agrorumo_apple_revocation_token(
  uuid, uuid, uuid, text, text
);
DROP FUNCTION IF EXISTS public.begin_agrorumo_apple_revocation_attempt(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.get_agrorumo_account_deletion_replay(uuid, uuid);
DROP FUNCTION IF EXISTS public.reserve_agrorumo_account_deletion_request(
  uuid, uuid, timestamptz, timestamptz, uuid, text, text, text,
  boolean, text, uuid, uuid
);
DROP FUNCTION IF EXISTS public.begin_agrorumo_account_deletion_challenge(
  uuid, uuid, uuid, text, text
);
DROP TRIGGER IF EXISTS agrorumo_deletion_events_immutable
  ON public.agrorumo_account_deletion_events;
DROP FUNCTION IF EXISTS public.agrorumo_deletion_events_immutable();
DROP TABLE IF EXISTS public.agrorumo_deletion_status_rate_limits;
DROP TABLE IF EXISTS public.agrorumo_account_deletion_events;
DROP TABLE IF EXISTS public.agrorumo_account_deletion_apple_revocations;
DROP TABLE IF EXISTS public.agrorumo_account_deletion_requests;
DROP TABLE IF EXISTS public.agrorumo_account_deletion_challenges;
DROP FUNCTION IF EXISTS public.agrorumo_deletion_session_ref(uuid);
DROP FUNCTION IF EXISTS public.agrorumo_deletion_subject_ref(uuid);
DROP TABLE IF EXISTS public.agrorumo_deletion_identity_keys;

COMMIT;
