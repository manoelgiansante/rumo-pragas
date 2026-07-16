#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="pragas-link-account-hotfix-$RANDOM"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql_file() {
  docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres \
    < "$repo_root/$1"
}

psql_exec() {
  docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres
}

docker run --rm -d --name "$container" -e POSTGRES_PASSWORD=postgres postgres:17-alpine \
  >/dev/null
for _attempt in $(seq 1 30); do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$container" pg_isready -U postgres >/dev/null

psql_exec <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Exact ownership shape observed read-only in jxcn on 2026-07-15:
-- generated profile row id, unique auth user_id, app-scoped subscriptions.
CREATE TABLE public.pragas_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text
);
ALTER TABLE public.pragas_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  provider text NOT NULL DEFAULT 'free',
  app text NOT NULL DEFAULT 'rumo-pragas',
  UNIQUE (user_id, app)
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;

INSERT INTO auth.users (id, raw_user_meta_data) VALUES
  ('11111111-1111-4111-8111-111111111111', '{"full_name":"Existing Paid"}'),
  ('22222222-2222-4222-8222-222222222222', '{"full_name":"New Link"}'),
  ('33333333-3333-4333-8333-333333333333', '{"full_name":"Canceled Paid"}');

INSERT INTO public.pragas_profiles (id, user_id, full_name) VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '11111111-1111-4111-8111-111111111111',
    'Existing Paid'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    '33333333-3333-4333-8333-333333333333',
    'Canceled Paid'
  );

INSERT INTO public.subscriptions (user_id, plan, status, provider, app) VALUES
  ('11111111-1111-4111-8111-111111111111', 'pro', 'active', 'apple', 'rumo-pragas'),
  ('33333333-3333-4333-8333-333333333333', 'pro', 'canceled', 'stripe', 'rumo-pragas');
SQL

psql_file supabase/migrations/20260715170000_pragas_link_account_prod_hotfix.sql
psql_file supabase/migrations/20260715170000_pragas_link_account_prod_hotfix.sql

psql_exec <<'SQL'
DO $$
DECLARE
  v_result jsonb;
  v_profile_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc AS procedure_row
     WHERE procedure_row.oid = 'public.pragas_link_account()'::regprocedure
       AND procedure_row.prosecdef
       AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
  ) THEN
    RAISE EXCEPTION 'hotfix_function_security_contract_failed';
  END IF;
  IF has_function_privilege('anon', 'public.pragas_link_account()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.pragas_link_account()', 'EXECUTE')
     OR NOT has_function_privilege(
       'authenticated', 'public.pragas_link_account()', 'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'hotfix_function_grant_contract_failed';
  END IF;

  PERFORM set_config(
    'request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false
  );
  v_result := public.pragas_link_account();
  IF v_result <> '{"app":"rumo-pragas","code":"already_linked","linked":true}'::jsonb
  THEN
    RAISE EXCEPTION 'existing_account_result_failed: %', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
     WHERE user_id = '11111111-1111-4111-8111-111111111111'
       AND app = 'rumo-pragas'
       AND plan = 'pro'
       AND status = 'active'
       AND provider = 'apple'
  ) OR (
    SELECT id FROM public.pragas_profiles
     WHERE user_id = '11111111-1111-4111-8111-111111111111'
  ) <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid
  THEN
    RAISE EXCEPTION 'existing_paid_entitlement_or_profile_was_mutated';
  END IF;

  PERFORM set_config(
    'request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false
  );
  v_result := public.pragas_link_account();
  IF v_result ->> 'code' <> 'already_linked' OR NOT EXISTS (
    SELECT 1 FROM public.subscriptions
     WHERE user_id = '33333333-3333-4333-8333-333333333333'
       AND app = 'rumo-pragas'
       AND plan = 'pro'
       AND status = 'canceled'
       AND provider = 'stripe'
  ) THEN
    RAISE EXCEPTION 'canceled_entitlement_was_reactivated_or_rewritten';
  END IF;

  PERFORM set_config(
    'request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false
  );
  v_result := public.pragas_link_account();
  IF v_result <> '{"app":"rumo-pragas","code":"linked","linked":true}'::jsonb
  THEN
    RAISE EXCEPTION 'new_account_result_failed: %', v_result;
  END IF;
  SELECT id INTO v_profile_id
    FROM public.pragas_profiles
   WHERE user_id = '22222222-2222-4222-8222-222222222222';
  IF v_profile_id IS NULL
     OR v_profile_id = '22222222-2222-4222-8222-222222222222'::uuid
     OR NOT EXISTS (
       SELECT 1 FROM public.subscriptions
        WHERE user_id = '22222222-2222-4222-8222-222222222222'
          AND app = 'rumo-pragas'
          AND plan = 'free'
          AND status = 'active'
          AND provider = 'free'
     )
  THEN
    RAISE EXCEPTION 'new_account_link_contract_failed';
  END IF;

  v_result := public.pragas_link_account();
  IF v_result ->> 'code' <> 'already_linked'
     OR (SELECT count(*) FROM public.pragas_profiles
          WHERE user_id = '22222222-2222-4222-8222-222222222222') <> 1
     OR (SELECT count(*) FROM public.subscriptions
          WHERE user_id = '22222222-2222-4222-8222-222222222222'
            AND app = 'rumo-pragas') <> 1
  THEN
    RAISE EXCEPTION 'hotfix_replay_not_idempotent';
  END IF;
END
$$;

SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false
);
SELECT public.pragas_link_account();
RESET ROLE;
SQL

if psql_exec >/dev/null 2>&1 <<'SQL'
SET ROLE anon;
SELECT set_config(
  'request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false
);
SELECT public.pragas_link_account();
SQL
then
  echo "anon unexpectedly executed pragas_link_account" >&2
  exit 1
fi

psql_file supabase/rollback/20260715170000_pragas_link_account_prod_hotfix.down.sql

psql_exec <<'SQL'
DO $$
BEGIN
  IF to_regprocedure('public.pragas_link_account()') IS NOT NULL
     OR (SELECT count(*) FROM public.pragas_profiles) <> 3
     OR (SELECT count(*) FROM public.subscriptions) <> 3
  THEN
    RAISE EXCEPTION 'hotfix_rollback_removed_data_or_kept_function';
  END IF;
END
$$;
SQL

psql_file supabase/migrations/20260715170000_pragas_link_account_prod_hotfix.sql

psql_exec <<'SQL'
CREATE OR REPLACE FUNCTION public.pragas_link_account()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$ SELECT '{"linked":false,"app":"foreign","code":"foreign"}'::jsonb $$;
SQL

if psql_file supabase/rollback/20260715170000_pragas_link_account_prod_hotfix.down.sql \
  >/dev/null 2>&1
then
  echo "rollback unexpectedly removed a foreign replacement" >&2
  exit 1
fi

psql_exec <<'SQL'
DO $$
BEGIN
  IF to_regprocedure('public.pragas_link_account()') IS NULL THEN
    RAISE EXCEPTION 'rollback_foreign_function_guard_failed';
  END IF;
END
$$;
SQL

psql_exec <<'SQL'
DROP FUNCTION public.pragas_link_account();
CREATE TABLE public.pragas_app_links (user_id uuid PRIMARY KEY);
CREATE TABLE public.pragas_deletion_jobs (user_id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION public.pragas_link_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $complete_backend$
BEGIN
  PERFORM 1 FROM public.pragas_app_links WHERE false;
  PERFORM 1 FROM public.pragas_deletion_jobs WHERE false;
  RETURN jsonb_build_object(
    'linked', false,
    'app', 'rumo-pragas',
    'code', 'deleted_reactivation_required'
  );
END;
$complete_backend$;
SQL

if psql_file supabase/migrations/20260715170000_pragas_link_account_prod_hotfix.sql \
  >/dev/null 2>&1
then
  echo "hotfix unexpectedly trusted an insecure complete-backend function" >&2
  exit 1
fi

psql_exec <<'SQL'
REVOKE EXECUTE ON FUNCTION public.pragas_link_account()
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.pragas_link_account() TO authenticated;
SQL

psql_file supabase/migrations/20260715170000_pragas_link_account_prod_hotfix.sql

psql_exec <<'SQL'
DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.pragas_link_account()'::regprocedure)
    INTO v_definition;
  IF position('deleted_reactivation_required' IN v_definition) = 0
     OR position('public.pragas_app_links' IN v_definition) = 0
     OR position('public.pragas_deletion_jobs' IN v_definition) = 0
     OR position('pragas_link_account_prod_hotfix_v1' IN v_definition) > 0
     OR NOT EXISTS (
       SELECT 1
         FROM pg_proc AS procedure_row
        WHERE procedure_row.oid = 'public.pragas_link_account()'::regprocedure
          AND procedure_row.prosecdef
          AND procedure_row.proconfig = ARRAY['search_path=""']::text[]
          AND NOT has_function_privilege(
            'anon', procedure_row.oid, 'EXECUTE'
          )
          AND NOT has_function_privilege(
            'service_role', procedure_row.oid, 'EXECUTE'
          )
          AND has_function_privilege(
            'authenticated', procedure_row.oid, 'EXECUTE'
          )
     )
  THEN
    RAISE EXCEPTION 'complete_backend_function_was_replaced_by_hotfix';
  END IF;
END
$$;
SQL

echo "pragas link account hotfix integration: PASS"
