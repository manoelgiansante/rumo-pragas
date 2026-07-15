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
  v_full_name text;
  v_inserted_subscriptions integer := 0;
BEGIN
  -- pragas_link_account_prod_hotfix_v1
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-account:' || v_user_id::text, 0)
  );

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
  GET DIAGNOSTICS v_inserted_subscriptions = ROW_COUNT;
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
     WHERE user_id = v_user_id AND app = 'rumo-pragas'
  ) THEN
    RAISE EXCEPTION 'pragas_subscription_link_failed';
  END IF;

  RETURN jsonb_build_object(
    'linked', true,
    'app', 'rumo-pragas',
    'code', CASE
      WHEN v_inserted_subscriptions = 1 THEN 'linked'
      ELSE 'already_linked'
    END
  );
END;
$pragas_link_account_prod_hotfix_v1$;

REVOKE ALL ON FUNCTION public.pragas_link_account()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pragas_link_account() TO authenticated;
COMMENT ON FUNCTION public.pragas_link_account() IS
  'Rumo Pragas production login compatibility RPC; preserves existing entitlements.';

COMMIT;
