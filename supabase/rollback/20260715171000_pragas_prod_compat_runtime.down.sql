-- Runtime rollback for 20260715171000_pragas_prod_compat_runtime.
--
-- Data-bearing additive columns/tables, consent ledgers and security-hardening
-- ACLs are intentionally retained. Dropping them would destroy user data or
-- reopen anonymous access. The reversible release boundary is the account-link
-- RPC: restore the exact 170000 production shim so legacy login stays usable
-- while the nine candidate Edge Functions are rolled back.

BEGIN;

DO $pragas_prod_compat_runtime_rollback_guard$
DECLARE
  v_definition text;
BEGIN
  IF to_regprocedure('public.pragas_link_account()') IS NULL THEN
    RAISE EXCEPTION 'pragas_prod_compat_runtime_rollback_link_missing';
  END IF;
  IF to_regclass('public.pragas_app_links') IS NULL
     OR to_regclass('public.pragas_deletion_jobs') IS NULL
  THEN
    RAISE EXCEPTION 'pragas_prod_compat_runtime_rollback_state_missing';
  END IF;
  SELECT pg_get_functiondef('public.pragas_link_account()'::regprocedure)
    INTO v_definition;
  IF position('pragas_link_account_prod_compat_v1' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'pragas_prod_compat_runtime_rollback_refuses_foreign_function';
  END IF;
END
$pragas_prod_compat_runtime_rollback_guard$;

CREATE OR REPLACE FUNCTION public.pragas_link_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $pragas_link_account_prod_hotfix_v1$
DECLARE
  v_user_id uuid := auth.uid();
  v_status text;
  v_subscription_status text;
  v_full_name text;
  v_already_linked boolean;
BEGIN
  -- pragas_link_account_prod_hotfix_v1
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || v_user_id::text, 0)
  );

  SELECT status INTO v_status
    FROM public.pragas_deletion_jobs
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

  SELECT left(NULLIF(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''), 200)
    INTO v_full_name
    FROM auth.users AS auth_user
   WHERE auth_user.id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'auth_identity_not_found';
  END IF;

  INSERT INTO public.pragas_profiles (user_id, full_name)
  VALUES (v_user_id, v_full_name)
  ON CONFLICT (user_id) DO NOTHING;
  IF NOT EXISTS (
    SELECT 1 FROM public.pragas_profiles WHERE user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'pragas_profile_link_failed';
  END IF;

  INSERT INTO public.subscriptions (user_id, plan, status, provider, app)
  VALUES (v_user_id, 'free', 'active', 'free', 'rumo-pragas')
  ON CONFLICT (user_id, app) DO NOTHING;
  SELECT status INTO v_subscription_status
    FROM public.subscriptions
   WHERE user_id = v_user_id AND app = 'rumo-pragas';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pragas_subscription_link_failed';
  END IF;
  IF v_subscription_status <> 'active' THEN
    RETURN jsonb_build_object(
      'linked', false, 'app', 'rumo-pragas', 'code', 'subscription_inactive'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.pragas_app_links
     WHERE user_id = v_user_id AND active
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
    'linked', true,
    'app', 'rumo-pragas',
    'code', CASE WHEN v_already_linked THEN 'already_linked' ELSE 'linked' END
  );
END;
$pragas_link_account_prod_hotfix_v1$;

REVOKE ALL ON FUNCTION public.pragas_link_account()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pragas_link_account() TO authenticated;
COMMENT ON FUNCTION public.pragas_link_account() IS
  'Rumo Pragas production login compatibility RPC; preserves existing entitlements.';

COMMIT;
