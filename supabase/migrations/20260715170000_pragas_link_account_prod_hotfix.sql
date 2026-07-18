-- Production-only compatibility hotfix for the Rumo Pragas login gate.
-- Target project: jxcnfyeemdltdfqtgbcl (shared portfolio database).
--
-- Production must receive this file from the hash-allowlisted sequence gate in
-- supabase/scripts/deploy-pragas-prod-compat.sh. Running a migration
-- command from the repository root would enqueue unrelated historical files
-- and is prohibited.
--
-- The live schema stores profile row identity in `id` and account ownership in
-- `user_id`. It also has the app-scoped `(user_id, app)` subscription key. This
-- hotfix preserves that contract, creates no tables, changes no policies, and
-- never updates an existing subscription or entitlement.
--
-- The superseded 20260714143000 candidate is intentionally inert. On a clean
-- repository replay this hotfix defers only when it proves the historical
-- profile table is empty and 20260715171000 can safely add the generated-id /
-- unique-user ownership contract. On live jxcn it still installs the shim;
-- after 171000 it recognizes the stronger replacement and becomes a no-op.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $pragas_link_hotfix_install$
DECLARE
  v_existing_definition text;
BEGIN
  IF to_regprocedure('public.pragas_link_account()') IS NOT NULL THEN
    SELECT pg_get_functiondef('public.pragas_link_account()'::regprocedure)
      INTO v_existing_definition;

    IF position('pragas_link_account_prod_hotfix_v1' IN v_existing_definition) > 0 THEN
      NULL; -- Idempotent hotfix replay; validate the live prerequisites below.
    ELSIF to_regclass('public.pragas_app_links') IS NOT NULL
       AND to_regclass('public.pragas_deletion_jobs') IS NOT NULL
       AND position('deleted_reactivation_required' IN v_existing_definition) > 0
       AND position('public.pragas_app_links' IN v_existing_definition) > 0
       AND position('public.pragas_deletion_jobs' IN v_existing_definition) > 0
       AND EXISTS (
         SELECT 1
           FROM pg_proc AS procedure_row
          WHERE procedure_row.oid =
                  'public.pragas_link_account()'::regprocedure
            AND procedure_row.prosecdef
            AND procedure_row.pronargs = 0
            AND procedure_row.prorettype = 'jsonb'::regtype
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
      -- The complete backend migration is already present and retains its
      -- hardened execution contract. Never replace it with the narrower
      -- emergency compatibility function.
      RETURN;
    ELSE
      RAISE EXCEPTION 'pragas_link_hotfix_refuses_foreign_function';
    END IF;
  END IF;

  IF to_regclass('auth.users') IS NULL
     OR to_regclass('public.pragas_profiles') IS NULL
     OR to_regclass('public.subscriptions') IS NULL
  THEN
    RAISE EXCEPTION 'pragas_link_hotfix_missing_required_relation';
  END IF;

  -- A byte-for-byte repository replay reaches this hotfix before the
  -- production-compat migration. That historical schema has an empty profile
  -- table whose id is the auth-owned primary key and no user_id column/default.
  -- It is the only contract on which this hotfix may defer installation:
  -- 171000 can then add the generated row id + unique ownership contract
  -- without rewriting a row. Any populated or ambiguous variant still fails
  -- closed and can never be mistaken for the live jxcn production contract.
  IF NOT EXISTS (
       SELECT 1
         FROM public.pragas_profiles
         LIMIT 1
     )
     AND EXISTS (
       SELECT 1
         FROM pg_attribute AS attribute_row
        WHERE attribute_row.attrelid = 'public.pragas_profiles'::regclass
          AND attribute_row.attname = 'id'
          AND attribute_row.atttypid = 'uuid'::regtype
          AND attribute_row.attnotnull
          AND NOT attribute_row.atthasdef
          AND NOT attribute_row.attisdropped
     )
     AND EXISTS (
       SELECT 1
         FROM pg_constraint AS constraint_row
        WHERE constraint_row.conrelid = 'public.pragas_profiles'::regclass
          AND constraint_row.contype = 'p'
          AND constraint_row.conkey = ARRAY[
            (
              SELECT attribute_row.attnum
                FROM pg_attribute AS attribute_row
               WHERE attribute_row.attrelid = constraint_row.conrelid
                 AND attribute_row.attname = 'id'
                 AND NOT attribute_row.attisdropped
            )
          ]::smallint[]
     )
     AND EXISTS (
       SELECT 1
         FROM information_schema.columns AS column_info
        WHERE column_info.table_schema = 'public'
          AND column_info.table_name = 'pragas_profiles'
          AND column_info.column_name = 'full_name'
          AND column_info.udt_name = 'text'
     )
     AND NOT EXISTS (
       SELECT 1
         FROM information_schema.columns AS column_info
        WHERE column_info.table_schema = 'public'
          AND column_info.table_name = 'pragas_profiles'
          AND column_info.column_name = 'user_id'
          AND column_info.udt_name <> 'uuid'
     )
     AND NOT EXISTS (
       SELECT 1
         FROM information_schema.columns AS column_info
        WHERE column_info.table_schema = 'public'
          AND column_info.table_name = 'pragas_profiles'
          AND column_info.column_name = 'id'
          AND column_info.udt_name <> 'uuid'
     )
     AND NOT EXISTS (
       SELECT 1
         FROM (VALUES
           ('user_id', 'uuid'), ('plan', 'text'), ('status', 'text'),
           ('provider', 'text'), ('app', 'text')
         ) AS required(column_name, udt_name)
        WHERE NOT EXISTS (
          SELECT 1
            FROM information_schema.columns AS column_info
           WHERE column_info.table_schema = 'public'
             AND column_info.table_name = 'subscriptions'
             AND column_info.column_name = required.column_name
             AND column_info.udt_name = required.udt_name
        )
     )
     AND EXISTS (
       SELECT 1
         FROM pg_constraint AS constraint_row
        WHERE constraint_row.conrelid = 'public.subscriptions'::regclass
          AND constraint_row.contype IN ('p', 'u')
          AND (
            SELECT array_agg(attribute_row.attname ORDER BY key_row.ordinality)
              FROM unnest(constraint_row.conkey) WITH ORDINALITY
                AS key_row(attnum, ordinality)
              JOIN pg_attribute AS attribute_row
                ON attribute_row.attrelid = constraint_row.conrelid
               AND attribute_row.attnum = key_row.attnum
          ) = ARRAY['user_id', 'app']::name[]
     )
  THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (
        VALUES
          ('pragas_profiles', 'id', 'uuid'),
          ('pragas_profiles', 'user_id', 'uuid'),
          ('pragas_profiles', 'full_name', 'text'),
          ('subscriptions', 'user_id', 'uuid'),
          ('subscriptions', 'plan', 'text'),
          ('subscriptions', 'status', 'text'),
          ('subscriptions', 'provider', 'text'),
          ('subscriptions', 'app', 'text')
      ) AS required(table_name, column_name, udt_name)
     WHERE NOT EXISTS (
       SELECT 1
         FROM information_schema.columns AS column_info
        WHERE column_info.table_schema = 'public'
          AND column_info.table_name = required.table_name
          AND column_info.column_name = required.column_name
          AND column_info.udt_name = required.udt_name
     )
  ) THEN
    RAISE EXCEPTION 'pragas_link_hotfix_schema_contract_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_attribute AS attribute_row
     WHERE attribute_row.attrelid = 'public.pragas_profiles'::regclass
       AND attribute_row.attname = 'id'
       AND attribute_row.attnotnull
       AND attribute_row.atthasdef
       AND NOT attribute_row.attisdropped
  ) THEN
    RAISE EXCEPTION 'pragas_link_hotfix_profile_id_default_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint AS constraint_row
     WHERE constraint_row.conrelid = 'public.pragas_profiles'::regclass
       AND constraint_row.contype IN ('p', 'u')
       AND (
         SELECT array_agg(attribute_row.attname ORDER BY key_row.ordinality)
           FROM unnest(constraint_row.conkey) WITH ORDINALITY
             AS key_row(attnum, ordinality)
           JOIN pg_attribute AS attribute_row
             ON attribute_row.attrelid = constraint_row.conrelid
            AND attribute_row.attnum = key_row.attnum
       ) = ARRAY['user_id']::name[]
  ) THEN
    RAISE EXCEPTION 'pragas_link_hotfix_profile_user_key_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint AS constraint_row
     WHERE constraint_row.conrelid = 'public.subscriptions'::regclass
       AND constraint_row.contype IN ('p', 'u')
       AND (
         SELECT array_agg(attribute_row.attname ORDER BY key_row.ordinality)
           FROM unnest(constraint_row.conkey) WITH ORDINALITY
             AS key_row(attnum, ordinality)
           JOIN pg_attribute AS attribute_row
             ON attribute_row.attrelid = constraint_row.conrelid
            AND attribute_row.attnum = key_row.attnum
       ) = ARRAY['user_id', 'app']::name[]
  ) THEN
    RAISE EXCEPTION 'pragas_link_hotfix_subscription_app_key_missing';
  END IF;

  EXECUTE $pragas_link_hotfix_function_ddl$
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

      -- The live schema deliberately uses a generated profile row id.
      -- Ownership is the unique user_id; forcing id=user_id rejects live rows.
      INSERT INTO public.pragas_profiles (user_id, full_name)
      VALUES (v_user_id, v_full_name)
      ON CONFLICT (user_id) DO NOTHING;

      IF NOT EXISTS (
        SELECT 1
          FROM public.pragas_profiles AS profile
         WHERE profile.user_id = v_user_id
      ) THEN
        RAISE EXCEPTION 'pragas_profile_link_failed';
      END IF;

      -- Existing paid, trial, canceled or webhook-owned rows are immutable.
      -- The login gate may create the initial free row, never rewrite it.
      INSERT INTO public.subscriptions (user_id, plan, status, provider, app)
      VALUES (v_user_id, 'free', 'active', 'free', 'rumo-pragas')
      ON CONFLICT (user_id, app) DO NOTHING;
      GET DIAGNOSTICS v_inserted_subscriptions = ROW_COUNT;

      IF NOT EXISTS (
        SELECT 1
          FROM public.subscriptions AS subscription
         WHERE subscription.user_id = v_user_id
           AND subscription.app = 'rumo-pragas'
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
  $pragas_link_hotfix_function_ddl$;

  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.pragas_link_account() '
    || 'FROM PUBLIC, anon, service_role';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.pragas_link_account() TO authenticated';
  EXECUTE 'COMMENT ON FUNCTION public.pragas_link_account() IS '
    || quote_literal(
      'Rumo Pragas production login compatibility RPC; preserves existing entitlements.'
    );
END
$pragas_link_hotfix_install$;

COMMIT;
