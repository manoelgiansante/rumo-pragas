-- Rumo Pragas production compatibility runtime.
-- Target: jxcnfyeemdltdfqtgbcl only, through deploy-pragas-prod-compat.sh.
--
-- This migration preserves existing payload rows. Its only data backfill labels
-- legacy notification-queue ownership after an unambiguous fail-closed check;
-- it never rewrites queue content or DELETEs existing rows. Runtime mutation is
-- exposed only through identity-derived or service-role-only functions.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- The reviewed Supabase CLI applies a migration file through one transactional
-- pipeline, so CREATE INDEX CONCURRENTLY cannot safely live in this file. The
-- production gate must prepare these shared relations in short, separately
-- bounded sessions before db push. Reject a missing or drifted bootstrap before
-- this transaction mutates any Rumo Pragas-owned relation.
-- PRAGAS_SHARED_ANALYTICS_INDEX_PREFLIGHT_BEGIN
DO $shared_analytics_index_preflight$
DECLARE
  v_index record;
BEGIN
  IF to_regclass('public.analytics_events') IS NULL
     OR to_regclass('public.audit_log') IS NULL
  THEN
    RAISE EXCEPTION 'pragas_shared_analytics_relation_missing';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (VALUES
        ('analytics_events', 'app', 'text'),
        ('analytics_events', 'pragas_event_id', 'uuid'),
        ('audit_log', 'app', 'text')
      ) AS required(table_name, column_name, udt_name)
     WHERE NOT EXISTS (
       SELECT 1
         FROM information_schema.columns AS column_info
        WHERE column_info.table_schema = 'public'
          AND column_info.table_name = required.table_name
          AND column_info.column_name = required.column_name
          AND column_info.udt_name = required.udt_name
          AND column_info.is_nullable = 'YES'
          AND column_info.is_generated = 'NEVER'
          AND column_info.is_identity = 'NO'
          AND column_info.column_default IS NULL
     )
  ) THEN
    RAISE EXCEPTION 'pragas_shared_analytics_column_contract_mismatch';
  END IF;

  FOR v_index IN
    SELECT *
      FROM (VALUES
        (
          'idx_analytics_events_user_app',
          'analytics_events',
          false,
          ARRAY['user_id', 'app']::text[],
          NULL::text
        ),
        (
          'idx_audit_log_user_app',
          'audit_log',
          false,
          ARRAY['user_id', 'app']::text[],
          NULL::text
        ),
        (
          'idx_analytics_events_pragas_event_id',
          'analytics_events',
          true,
          ARRAY['user_id', 'pragas_event_id']::text[],
          'app=''rumo-pragas''::textandpragas_event_idisnotnull'::text
        )
      ) AS expected(
        index_name,
        table_name,
        is_unique,
        key_columns,
        normalized_predicate
      )
  LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_index AS index_row
        JOIN pg_class AS index_class
          ON index_class.oid = index_row.indexrelid
        JOIN pg_namespace AS index_namespace
          ON index_namespace.oid = index_class.relnamespace
        JOIN pg_am AS access_method
          ON access_method.oid = index_class.relam
       WHERE index_row.indexrelid = to_regclass(
               format('public.%I', v_index.index_name)
             )
         AND index_row.indrelid = to_regclass(
               format('public.%I', v_index.table_name)
             )
         AND index_namespace.nspname = 'public'
         AND index_class.relname = v_index.index_name
         AND access_method.amname = 'btree'
         AND index_row.indisvalid
         AND index_row.indisready
         AND index_row.indislive
         AND index_row.indisunique = v_index.is_unique
         AND NOT index_row.indisprimary
         AND NOT index_row.indisexclusion
         AND index_row.indnkeyatts = cardinality(v_index.key_columns)
         AND index_row.indnatts = cardinality(v_index.key_columns)
         AND index_row.indexprs IS NULL
         AND (
           SELECT array_agg(
                    attribute_row.attname::text ORDER BY key_row.ordinality
                  )
             FROM unnest(index_row.indkey::smallint[]) WITH ORDINALITY
                    AS key_row(attnum, ordinality)
             JOIN pg_attribute AS attribute_row
               ON attribute_row.attrelid = index_row.indrelid
              AND attribute_row.attnum = key_row.attnum
            WHERE key_row.ordinality <= index_row.indnkeyatts
         ) = v_index.key_columns
         AND (
           (
             v_index.normalized_predicate IS NULL
             AND index_row.indpred IS NULL
           )
           OR (
             v_index.normalized_predicate IS NOT NULL
             AND index_row.indpred IS NOT NULL
             AND lower(regexp_replace(
                   pg_get_expr(index_row.indpred, index_row.indrelid),
                   '[[:space:]()]',
                   '',
                   'g'
                 )) = v_index.normalized_predicate
           )
         )
    ) THEN
      RAISE EXCEPTION
        'pragas_shared_analytics_index_contract_mismatch_%',
        v_index.index_name;
    END IF;
  END LOOP;
END
$shared_analytics_index_preflight$;
-- PRAGAS_SHARED_ANALYTICS_INDEX_PREFLIGHT_END

DO $preflight$
DECLARE
  v_has_profile_user_id boolean;
  v_bad_profile_rows bigint;
BEGIN
  IF to_regclass('auth.users') IS NULL
     OR to_regclass('public.pragas_profiles') IS NULL
     OR to_regclass('public.pragas_diagnoses') IS NULL
     OR to_regclass('public.subscriptions') IS NULL
     OR to_regclass('public.analytics_events') IS NULL
     OR to_regclass('public.audit_log') IS NULL
     OR to_regclass('public.chat_usage') IS NULL
     OR to_regclass('storage.buckets') IS NULL
     OR to_regclass('storage.objects') IS NULL
  THEN
    RAISE EXCEPTION 'pragas_prod_compat_required_relation_missing';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (VALUES
        ('pragas_profiles', 'id', 'uuid'),
        ('pragas_profiles', 'full_name', 'text'),
        ('pragas_profiles', 'city', 'text'),
        ('pragas_profiles', 'state', 'text'),
        ('pragas_profiles', 'crops', '_text'),
        ('pragas_diagnoses', 'id', 'uuid'),
        ('pragas_diagnoses', 'user_id', 'uuid'),
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
    RAISE EXCEPTION 'pragas_prod_compat_schema_contract_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint AS constraint_row
     WHERE constraint_row.conrelid = 'public.pragas_profiles'::regclass
       AND constraint_row.contype = 'p'
       AND (
         SELECT array_agg(attribute_row.attname ORDER BY key_row.ordinality)
           FROM unnest(constraint_row.conkey) WITH ORDINALITY
             AS key_row(attnum, ordinality)
           JOIN pg_attribute AS attribute_row
             ON attribute_row.attrelid = constraint_row.conrelid
            AND attribute_row.attnum = key_row.attnum
       ) = ARRAY['id']::name[]
  ) THEN
    RAISE EXCEPTION 'pragas_prod_compat_profile_primary_key_missing';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM information_schema.columns AS column_info
     WHERE column_info.table_schema = 'public'
       AND column_info.table_name = 'pragas_profiles'
       AND column_info.column_name = 'user_id'
  ) INTO v_has_profile_user_id;

  IF NOT v_has_profile_user_id THEN
    IF EXISTS (SELECT 1 FROM public.pragas_profiles LIMIT 1) THEN
      RAISE EXCEPTION 'pragas_prod_compat_profile_owner_missing_with_rows';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1
        FROM information_schema.columns AS column_info
       WHERE column_info.table_schema = 'public'
         AND column_info.table_name = 'pragas_profiles'
         AND column_info.column_name = 'user_id'
         AND column_info.udt_name = 'uuid'
    ) THEN
      RAISE EXCEPTION 'pragas_prod_compat_profile_owner_type_mismatch';
    END IF;
    EXECUTE $profile_ambiguity$
      SELECT count(*)
        FROM public.pragas_profiles AS profile
       WHERE profile.user_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM auth.users AS auth_user
             WHERE auth_user.id = profile.user_id
          )
          OR EXISTS (
            SELECT 1 FROM public.pragas_profiles AS sibling
             WHERE sibling.user_id = profile.user_id
               AND sibling.id <> profile.id
          )
    $profile_ambiguity$ INTO v_bad_profile_rows;
    IF v_bad_profile_rows <> 0 THEN
      RAISE EXCEPTION 'pragas_prod_compat_profile_owner_ambiguous';
    END IF;
  END IF;

  IF to_regclass('public.pragas_push_tokens') IS NOT NULL AND (
    EXISTS (
      SELECT 1
        FROM (VALUES ('id', 'uuid'), ('user_id', 'uuid'))
          AS required(column_name, udt_name)
       WHERE NOT EXISTS (
         SELECT 1
           FROM information_schema.columns AS column_info
          WHERE column_info.table_schema = 'public'
            AND column_info.table_name = 'pragas_push_tokens'
            AND column_info.column_name = required.column_name
            AND column_info.udt_name = required.udt_name
       )
    ) OR EXISTS (
      SELECT 1
        FROM information_schema.columns AS column_info
       WHERE column_info.table_schema = 'public'
         AND column_info.table_name = 'pragas_push_tokens'
         AND (
           (column_info.column_name IN ('token', 'expo_token', 'platform')
             AND column_info.udt_name <> 'text')
           OR (column_info.column_name = 'is_active'
             AND column_info.udt_name <> 'bool')
         )
    )
  ) THEN
    RAISE EXCEPTION 'pragas_prod_compat_push_schema_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.columns AS column_info
     WHERE column_info.table_schema = 'public'
       AND column_info.table_name = 'pragas_profiles'
       AND (
         (column_info.column_name IN (
           'phone', 'avatar_path', 'avatar_url'
         ) AND column_info.udt_name <> 'text')
       )
  ) THEN
    RAISE EXCEPTION 'pragas_prod_compat_profile_edit_schema_mismatch';
  END IF;

  IF to_regclass('public.pragas_diagnosis_feedback') IS NOT NULL AND EXISTS (
    SELECT 1
      FROM (VALUES ('id', 'uuid'), ('user_id', 'uuid'))
        AS required(column_name, udt_name)
     WHERE NOT EXISTS (
       SELECT 1
         FROM information_schema.columns AS column_info
        WHERE column_info.table_schema = 'public'
          AND column_info.table_name = 'pragas_diagnosis_feedback'
          AND column_info.column_name = required.column_name
          AND column_info.udt_name = required.udt_name
     )
  ) THEN
    RAISE EXCEPTION 'pragas_prod_compat_feedback_schema_mismatch';
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
    RAISE EXCEPTION 'pragas_prod_compat_ownership_key_missing';
  END IF;
END
$preflight$;

DO $$
BEGIN
  CREATE TYPE public.pragas_ai_report_reason AS ENUM (
    'unsafe_recommendation', 'incorrect_information', 'harmful_content', 'privacy', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.pragas_ai_report_status AS ENUM (
    'received', 'reviewing', 'resolved', 'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.pragas_diagnosis_feedback_verdict AS ENUM (
    'correct', 'incorrect', 'unsure'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

CREATE OR REPLACE FUNCTION public.pragas_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.pragas_touch_updated_at()
  FROM PUBLIC, anon, authenticated;

-- Convert only the empty historical replay shape, or validate the existing
-- live ownership column. The preflight above has already rejected null,
-- orphaned and duplicate ownership before any schema mutation occurs.
ALTER TABLE public.pragas_profiles
  ADD COLUMN IF NOT EXISTS user_id uuid;

DO $profile_identity_contract$
DECLARE
  v_constraint_name name;
BEGIN
  FOR v_constraint_name IN
    SELECT constraint_row.conname
      FROM pg_constraint AS constraint_row
      JOIN pg_attribute AS attribute_row
        ON attribute_row.attrelid = constraint_row.conrelid
       AND attribute_row.attnum = ANY (constraint_row.conkey)
     WHERE constraint_row.conrelid = 'public.pragas_profiles'::regclass
       AND constraint_row.confrelid = 'auth.users'::regclass
       AND constraint_row.contype = 'f'
       AND cardinality(constraint_row.conkey) = 1
       AND attribute_row.attname = 'id'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.pragas_profiles DROP CONSTRAINT %I',
      v_constraint_name
    );
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint AS constraint_row
      JOIN pg_attribute AS attribute_row
        ON attribute_row.attrelid = constraint_row.conrelid
       AND attribute_row.attnum = ANY (constraint_row.conkey)
     WHERE constraint_row.conrelid = 'public.pragas_profiles'::regclass
       AND constraint_row.confrelid = 'auth.users'::regclass
       AND constraint_row.contype = 'f'
       AND cardinality(constraint_row.conkey) = 1
       AND attribute_row.attname = 'user_id'
  ) THEN
    ALTER TABLE public.pragas_profiles
      ADD CONSTRAINT pragas_profiles_user_id_prod_compat_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
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
    ALTER TABLE public.pragas_profiles
      ADD CONSTRAINT pragas_profiles_user_id_prod_compat_key UNIQUE (user_id);
  END IF;
END
$profile_identity_contract$;

ALTER TABLE public.pragas_profiles
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.pragas_profiles
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS phone text;

-- Remove only the obsolete identity invariant left by an already-applied
-- historical candidate. Existing generated ids remain untouched.
DROP TRIGGER IF EXISTS pragas_profiles_sync_user_id ON public.pragas_profiles;
ALTER TABLE public.pragas_profiles
  DROP CONSTRAINT IF EXISTS pragas_profiles_identity_match_check;
DROP FUNCTION IF EXISTS public.pragas_profiles_sync_user_id();

CREATE OR REPLACE FUNCTION public.pragas_profiles_fill_legacy_user_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- A legacy shared auth trigger explicitly supplies id=auth.users.id and no
  -- owner. Modern app linking supplies user_id and receives a generated id.
  IF NEW.user_id IS NULL THEN
    NEW.user_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.pragas_profiles_fill_legacy_user_id()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS pragas_profiles_fill_legacy_user_id
  ON public.pragas_profiles;
CREATE TRIGGER pragas_profiles_fill_legacy_user_id
  BEFORE INSERT ON public.pragas_profiles
  FOR EACH ROW EXECUTE FUNCTION public.pragas_profiles_fill_legacy_user_id();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pragas_profiles'::regclass
       AND conname = 'pragas_profiles_avatar_path_check'
  ) THEN
    ALTER TABLE public.pragas_profiles
      ADD CONSTRAINT pragas_profiles_avatar_path_check CHECK (
        avatar_path IS NULL OR avatar_path ~ (
          '^' || user_id::text ||
          '/avatar-[A-Za-z0-9-]{1,80}[.](jpg|jpeg|png|webp)$'
        )
      ) NOT VALID;
  END IF;
END
$$;

-- Preserve every legacy generated profile id. Ownership is user_id only.
ALTER TABLE public.pragas_profiles ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pragas_profiles'
       AND policyname = 'pragas_prod_compat_select_own'
  ) THEN
    CREATE POLICY pragas_prod_compat_select_own
      ON public.pragas_profiles FOR SELECT TO authenticated
      USING ((SELECT auth.uid()) = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pragas_profiles'
       AND policyname = 'pragas_prod_compat_insert_own'
  ) THEN
    CREATE POLICY pragas_prod_compat_insert_own
      ON public.pragas_profiles FOR INSERT TO authenticated
      WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pragas_profiles'
       AND policyname = 'pragas_prod_compat_update_own'
  ) THEN
    CREATE POLICY pragas_prod_compat_update_own
      ON public.pragas_profiles FOR UPDATE TO authenticated
      USING ((SELECT auth.uid()) = user_id)
      WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;
END
$$;
GRANT SELECT, INSERT ON TABLE public.pragas_profiles TO authenticated;
REVOKE UPDATE ON TABLE public.pragas_profiles FROM authenticated;
GRANT UPDATE (
  full_name, city, state, phone, crops, avatar_path, avatar_url
) ON TABLE public.pragas_profiles TO authenticated;

CREATE TABLE IF NOT EXISTS public.pragas_app_links (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  link_version text NOT NULL CHECK (link_version = '2026-07-14.1'),
  active boolean NOT NULL DEFAULT true,
  linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deactivated_at timestamptz,
  CHECK (
    (active AND deactivated_at IS NULL)
    OR (NOT active AND deactivated_at IS NOT NULL)
  )
);
ALTER TABLE public.pragas_app_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_app_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pragas_app_links FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_app_links TO service_role;

CREATE TABLE IF NOT EXISTS public.pragas_user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  share_location boolean NOT NULL DEFAULT false,
  share_location_purpose text CHECK (
    share_location_purpose IS NULL OR char_length(share_location_purpose) <= 500
  ),
  consented_at timestamptz,
  location_consent_revision bigint NOT NULL DEFAULT 0 CHECK (location_consent_revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (NOT share_location OR consented_at IS NOT NULL)
);
ALTER TABLE public.pragas_user_preferences
  ADD COLUMN IF NOT EXISTS location_consent_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.pragas_user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_user_preferences FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pragas_user_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pragas_user_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_user_preferences TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pragas_user_preferences'
       AND policyname = 'pragas_user_preferences_select_own'
  ) THEN
    CREATE POLICY pragas_user_preferences_select_own
      ON public.pragas_user_preferences FOR SELECT TO authenticated
      USING ((SELECT auth.uid()) = user_id);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.pragas_location_consent_decisions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL,
  observed_revision bigint,
  applied_revision bigint NOT NULL CHECK (applied_revision >= 0),
  share_location boolean NOT NULL,
  purpose text NOT NULL CHECK (char_length(purpose) BETWEEN 1 AND 500),
  consented_at timestamptz NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('applied', 'stale_grant')),
  resulting_share_location boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, decision_id),
  CHECK (observed_revision IS NULL OR observed_revision >= 0)
);
ALTER TABLE public.pragas_location_consent_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_location_consent_decisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pragas_location_consent_decisions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_location_consent_decisions
  TO service_role;
CREATE INDEX IF NOT EXISTS idx_pragas_location_consent_decisions_retention
  ON public.pragas_location_consent_decisions (user_id, created_at DESC, decision_id DESC);

DROP TRIGGER IF EXISTS pragas_user_preferences_touch_updated_at
  ON public.pragas_user_preferences;
CREATE TRIGGER pragas_user_preferences_touch_updated_at
  BEFORE UPDATE ON public.pragas_user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.pragas_touch_updated_at();

CREATE OR REPLACE FUNCTION public.set_pragas_location_consent(
  p_decision_id uuid,
  p_share_location boolean,
  p_purpose text,
  p_consented_at timestamptz,
  p_observed_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_current_revision bigint;
  v_current_share boolean;
  v_new_revision bigint;
  v_existing public.pragas_location_consent_decisions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'location_consent_unauthorized'; END IF;
  IF p_decision_id IS NULL OR p_share_location IS NULL OR p_purpose IS NULL
     OR p_purpose <> 'rumo-pragas:approximate-location:open-meteo+diagnosis-context:2026-07-14.1'
     OR p_consented_at IS NULL OR p_observed_revision < 0
     OR (p_share_location AND p_observed_revision IS NULL)
  THEN
    RAISE EXCEPTION 'invalid_location_consent_decision';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pragas_app_links AS link
     WHERE link.user_id = v_user_id AND link.active
  ) THEN
    RAISE EXCEPTION 'pragas_app_link_inactive';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('pragas-location:' || v_user_id::text, 0));
  INSERT INTO public.pragas_user_preferences (user_id)
  VALUES (v_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT location_consent_revision, share_location
    INTO v_current_revision, v_current_share
    FROM public.pragas_user_preferences
   WHERE user_id = v_user_id FOR UPDATE;

  SELECT * INTO v_existing
    FROM public.pragas_location_consent_decisions
   WHERE user_id = v_user_id AND decision_id = p_decision_id;
  IF FOUND THEN
    IF v_existing.observed_revision IS DISTINCT FROM p_observed_revision
       OR v_existing.share_location IS DISTINCT FROM p_share_location
       OR v_existing.purpose IS DISTINCT FROM p_purpose
       OR v_existing.consented_at IS DISTINCT FROM p_consented_at
    THEN
      RAISE EXCEPTION 'location_consent_decision_reuse';
    END IF;
    RETURN jsonb_build_object(
      'applied', v_existing.outcome = 'applied', 'replayed', true,
      'code', v_existing.outcome, 'decision_id', p_decision_id,
      'decision_revision', v_existing.applied_revision,
      'current_revision', v_current_revision,
      'current_share_location', v_current_share
    );
  END IF;

  IF p_share_location AND p_observed_revision <> v_current_revision THEN
    INSERT INTO public.pragas_location_consent_decisions (
      user_id, decision_id, observed_revision, applied_revision, share_location,
      purpose, consented_at, outcome, resulting_share_location
    ) VALUES (
      v_user_id, p_decision_id, p_observed_revision, v_current_revision, true,
      p_purpose, p_consented_at, 'stale_grant', v_current_share
    );
    RETURN jsonb_build_object(
      'applied', false, 'replayed', false, 'code', 'stale_grant',
      'decision_id', p_decision_id, 'decision_revision', v_current_revision,
      'current_revision', v_current_revision,
      'current_share_location', v_current_share
    );
  END IF;

  v_new_revision := v_current_revision + 1;
  UPDATE public.pragas_user_preferences
     SET share_location = p_share_location,
         share_location_purpose = p_purpose,
         consented_at = p_consented_at,
         location_consent_revision = v_new_revision
   WHERE user_id = v_user_id;
  INSERT INTO public.pragas_location_consent_decisions (
    user_id, decision_id, observed_revision, applied_revision, share_location,
    purpose, consented_at, outcome, resulting_share_location
  ) VALUES (
    v_user_id, p_decision_id, p_observed_revision, v_new_revision,
    p_share_location, p_purpose, p_consented_at, 'applied', p_share_location
  );
  RETURN jsonb_build_object(
    'applied', true, 'replayed', false, 'code', 'applied',
    'decision_id', p_decision_id, 'decision_revision', v_new_revision,
    'current_revision', v_new_revision,
    'current_share_location', p_share_location
  );
END;
$$;
REVOKE ALL ON FUNCTION public.set_pragas_location_consent(
  uuid, boolean, text, timestamptz, bigint
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_pragas_location_consent(
  uuid, boolean, text, timestamptz, bigint
) TO authenticated;

CREATE TABLE IF NOT EXISTS public.pragas_ai_consents (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('diagnosis', 'chat')),
  version text NOT NULL CHECK (version = '2026-07-14.1'),
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_used_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  PRIMARY KEY (user_id, purpose, version),
  CHECK (last_used_at >= accepted_at),
  CHECK (revoked_at IS NULL OR revoked_at >= accepted_at)
);
ALTER TABLE public.pragas_ai_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_ai_consents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pragas_ai_consents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_ai_consents TO service_role;

CREATE OR REPLACE FUNCTION public.record_pragas_ai_consent(
  p_user_id uuid,
  p_purpose text,
  p_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_accepted_at timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_purpose NOT IN ('diagnosis', 'chat')
     OR p_version <> '2026-07-14.1'
  THEN
    RAISE EXCEPTION 'invalid_pragas_ai_consent';
  END IF;
  UPDATE public.pragas_ai_consents AS consent
     SET last_used_at = v_now
   WHERE consent.user_id = p_user_id
     AND consent.purpose = p_purpose
     AND consent.version = p_version
     AND consent.revoked_at IS NULL
  RETURNING consent.accepted_at INTO v_accepted_at;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'accepted', false, 'purpose', p_purpose, 'version', p_version,
      'code', 'ai_consent_inactive'
    );
  END IF;
  RETURN jsonb_build_object(
    'accepted', true, 'purpose', p_purpose, 'version', p_version,
    'accepted_at', v_accepted_at, 'last_used_at', v_now
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_pragas_ai_consent(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_pragas_ai_consent(uuid, text, text)
  TO service_role;

CREATE TABLE IF NOT EXISTS public.pragas_api_rate_limit_counters (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN (
    'diagnose', 'ai_chat', 'report_ai_content', 'diagnosis_feedback',
    'admin_ai_reports', 'export_user_data', 'delete_user_account',
    'reactivate_user_account', 'analytics', 'mcp'
  )),
  window_started_at timestamptz NOT NULL,
  window_seconds integer NOT NULL CHECK (window_seconds BETWEEN 1 AND 86400),
  request_count integer NOT NULL CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, scope)
);
CREATE TABLE IF NOT EXISTS public.pragas_api_rate_limit_events (
  user_id uuid NOT NULL,
  scope text NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, scope, idempotency_key),
  FOREIGN KEY (user_id, scope)
    REFERENCES public.pragas_api_rate_limit_counters(user_id, scope)
    ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pragas_rate_limit_events_expiry
  ON public.pragas_api_rate_limit_events (expires_at);
ALTER TABLE public.pragas_api_rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_api_rate_limit_counters FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_api_rate_limit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_api_rate_limit_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pragas_api_rate_limit_counters
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pragas_api_rate_limit_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_api_rate_limit_counters
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_api_rate_limit_events
  TO service_role;

CREATE OR REPLACE FUNCTION public.consume_pragas_api_rate_limit(
  p_user_id uuid,
  p_scope text,
  p_limit integer,
  p_window_seconds integer,
  p_idempotency_key uuid,
  p_request_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_started timestamptz;
  v_seconds integer;
  v_count integer;
  v_reset timestamptz;
  v_result jsonb;
  v_existing_hash text;
BEGIN
  IF p_user_id IS NULL OR p_idempotency_key IS NULL
     OR p_request_hash !~ '^[0-9a-f]{64}$'
     OR p_scope NOT IN (
       'diagnose', 'ai_chat', 'report_ai_content', 'diagnosis_feedback',
       'admin_ai_reports', 'export_user_data', 'delete_user_account',
       'reactivate_user_account', 'analytics', 'mcp'
     )
     OR p_limit NOT BETWEEN 1 AND 10000
     OR p_window_seconds NOT BETWEEN 1 AND 86400
  THEN
    RAISE EXCEPTION 'invalid_rate_limit_request';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-rate:' || p_user_id::text || ':' || p_scope, 0)
  );
  SELECT event.request_hash, event.result
    INTO v_existing_hash, v_result
    FROM public.pragas_api_rate_limit_events AS event
   WHERE event.user_id = p_user_id AND event.scope = p_scope
     AND event.idempotency_key = p_idempotency_key
     AND event.expires_at > v_now;
  IF FOUND THEN
    IF v_existing_hash <> p_request_hash THEN
      RETURN jsonb_build_object(
        'allowed', false, 'replayed', false, 'conflict', true,
        'remaining', 0, 'reset_at', v_now,
        'retry_after_seconds', 0
      );
    END IF;
    RETURN v_result || jsonb_build_object('replayed', true);
  END IF;

  SELECT window_started_at, window_seconds, request_count
    INTO v_started, v_seconds, v_count
    FROM public.pragas_api_rate_limit_counters
   WHERE user_id = p_user_id AND scope = p_scope FOR UPDATE;
  IF NOT FOUND THEN
    v_started := v_now; v_seconds := p_window_seconds; v_count := 1;
    INSERT INTO public.pragas_api_rate_limit_counters (
      user_id, scope, window_started_at, window_seconds, request_count
    ) VALUES (p_user_id, p_scope, v_started, v_seconds, v_count);
  ELSIF v_seconds <> p_window_seconds
     OR v_started + make_interval(secs => v_seconds) <= v_now
  THEN
    v_started := v_now; v_seconds := p_window_seconds; v_count := 1;
    UPDATE public.pragas_api_rate_limit_counters
       SET window_started_at = v_started, window_seconds = v_seconds,
           request_count = v_count, updated_at = v_now
     WHERE user_id = p_user_id AND scope = p_scope;
  ELSE
    UPDATE public.pragas_api_rate_limit_counters
       SET request_count = request_count + 1, updated_at = v_now
     WHERE user_id = p_user_id AND scope = p_scope
    RETURNING request_count INTO v_count;
  END IF;
  v_reset := v_started + make_interval(secs => v_seconds);
  v_result := jsonb_build_object(
    'allowed', v_count <= p_limit, 'replayed', false, 'conflict', false,
    'remaining', greatest(p_limit - v_count, 0), 'reset_at', v_reset,
    'retry_after_seconds', greatest(0, ceil(extract(epoch FROM (v_reset - v_now)))::integer)
  );
  INSERT INTO public.pragas_api_rate_limit_events (
    user_id, scope, idempotency_key, request_hash, result, created_at, expires_at
  ) VALUES (
    p_user_id, p_scope, p_idempotency_key, p_request_hash, v_result, v_now,
    CASE WHEN v_count <= p_limit THEN v_now + interval '24 hours' ELSE v_reset END
  )
  ON CONFLICT (user_id, scope, idempotency_key) DO UPDATE
    SET request_hash = EXCLUDED.request_hash, result = EXCLUDED.result,
        created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_pragas_api_rate_limit(
  uuid, text, integer, integer, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_pragas_api_rate_limit(
  uuid, text, integer, integer, uuid, text
) TO service_role;

CREATE TABLE IF NOT EXISTS public.pragas_ai_idempotency_records (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('diagnosis', 'chat')),
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'processing' CHECK (
    state IN ('processing', 'completed', 'expired', 'unknown_outcome')
  ),
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_started_at timestamptz,
  unknown_outcome_at timestamptz,
  response_status integer CHECK (
    response_status IS NULL OR response_status BETWEEN 200 AND 599
  ),
  response_body jsonb,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  response_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, scope, idempotency_key),
  CHECK (
    (state = 'processing' AND lease_token IS NOT NULL
      AND lease_expires_at IS NOT NULL AND completed_at IS NULL
      AND unknown_outcome_at IS NULL AND response_status IS NULL
      AND response_body IS NULL AND response_expires_at IS NULL)
    OR (state = 'completed' AND completed_at IS NOT NULL
      AND response_status IS NOT NULL AND response_body IS NOT NULL
      AND response_expires_at IS NOT NULL AND lease_token IS NULL
      AND lease_expires_at IS NULL AND unknown_outcome_at IS NULL)
    OR (state = 'expired' AND completed_at IS NOT NULL
      AND response_status IS NULL AND response_body IS NULL
      AND response_expires_at IS NOT NULL AND lease_token IS NULL
      AND lease_expires_at IS NULL AND unknown_outcome_at IS NULL)
    OR (state = 'unknown_outcome' AND provider_started_at IS NOT NULL
      AND unknown_outcome_at IS NOT NULL AND completed_at IS NULL
      AND response_status IS NULL AND response_body IS NULL
      AND response_expires_at IS NULL AND lease_token IS NULL
      AND lease_expires_at IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_pragas_ai_idempotency_response_expiry
  ON public.pragas_ai_idempotency_records (response_expires_at)
  WHERE state = 'completed';
ALTER TABLE public.pragas_ai_idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_ai_idempotency_records FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pragas_ai_idempotency_records
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_ai_idempotency_records
  TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_pragas_ai_idempotency(
  p_user_id uuid,
  p_scope text,
  p_idempotency_key uuid,
  p_request_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_record public.pragas_ai_idempotency_records%ROWTYPE;
  v_lease uuid;
BEGIN
  IF p_user_id IS NULL OR p_scope NOT IN ('diagnosis', 'chat')
     OR p_idempotency_key IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'invalid_pragas_ai_idempotency_request';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'pragas-ai:' || p_user_id::text || ':' || p_scope || ':' || p_idempotency_key::text,
    0
  ));
  SELECT * INTO v_record
    FROM public.pragas_ai_idempotency_records
   WHERE user_id = p_user_id AND scope = p_scope
     AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_record.request_hash <> p_request_hash THEN
      RETURN jsonb_build_object('state', 'conflict');
    END IF;
    IF v_record.state = 'completed' THEN
      IF v_record.response_expires_at > v_now THEN
        RETURN jsonb_build_object(
          'state', 'completed', 'response_status', v_record.response_status,
          'response_body', v_record.response_body
        );
      END IF;
      UPDATE public.pragas_ai_idempotency_records
         SET state = 'expired', response_status = NULL, response_body = NULL,
             updated_at = v_now
       WHERE user_id = p_user_id AND scope = p_scope
         AND idempotency_key = p_idempotency_key;
      RETURN jsonb_build_object('state', 'expired');
    END IF;
    IF v_record.state = 'expired' THEN
      RETURN jsonb_build_object('state', 'expired');
    END IF;
    IF v_record.state = 'unknown_outcome' THEN
      RETURN jsonb_build_object('state', 'unknown_outcome');
    END IF;
    IF v_record.lease_expires_at > v_now THEN
      RETURN jsonb_build_object(
        'state', 'in_progress',
        'retry_after_seconds', greatest(
          1, ceil(extract(epoch FROM (v_record.lease_expires_at - v_now)))::integer
        )
      );
    END IF;
    IF v_record.provider_started_at IS NOT NULL THEN
      UPDATE public.pragas_ai_idempotency_records
         SET state = 'unknown_outcome', unknown_outcome_at = v_now,
             lease_token = NULL, lease_expires_at = NULL, updated_at = v_now
       WHERE user_id = p_user_id AND scope = p_scope
         AND idempotency_key = p_idempotency_key;
      RETURN jsonb_build_object('state', 'unknown_outcome');
    END IF;
    v_lease := gen_random_uuid();
    UPDATE public.pragas_ai_idempotency_records
       SET lease_token = v_lease, lease_expires_at = v_now + interval '5 minutes',
           updated_at = v_now
     WHERE user_id = p_user_id AND scope = p_scope
       AND idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object(
      'state', 'reserved', 'lease_token', v_lease, 'reclaimed', true
    );
  END IF;

  v_lease := gen_random_uuid();
  INSERT INTO public.pragas_ai_idempotency_records (
    user_id, scope, idempotency_key, request_hash, state,
    lease_token, lease_expires_at
  ) VALUES (
    p_user_id, p_scope, p_idempotency_key, p_request_hash, 'processing',
    v_lease, v_now + interval '5 minutes'
  );
  RETURN jsonb_build_object(
    'state', 'reserved', 'lease_token', v_lease, 'reclaimed', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_pragas_ai_idempotency(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_pragas_ai_idempotency(uuid, text, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.mark_pragas_ai_provider_started(
  p_user_id uuid, p_scope text, p_idempotency_key uuid,
  p_request_hash text, p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated integer;
BEGIN
  UPDATE public.pragas_ai_idempotency_records
     SET provider_started_at = coalesce(provider_started_at, clock_timestamp()),
         updated_at = clock_timestamp()
   WHERE user_id = p_user_id AND scope = p_scope
     AND idempotency_key = p_idempotency_key AND request_hash = p_request_hash
     AND state = 'processing' AND lease_token = p_lease_token
     AND lease_expires_at > clock_timestamp();
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_pragas_ai_provider_started(
  uuid, text, uuid, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_pragas_ai_provider_started(
  uuid, text, uuid, text, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_pragas_ai_idempotency(
  p_user_id uuid, p_scope text, p_idempotency_key uuid, p_request_hash text,
  p_lease_token uuid, p_response_status integer, p_response_body jsonb,
  p_response_ttl_seconds integer DEFAULT 86400
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated integer;
BEGIN
  IF p_response_status NOT BETWEEN 200 AND 599 OR p_response_body IS NULL
     OR jsonb_typeof(p_response_body) <> 'object'
     OR octet_length(p_response_body::text) > 1048576
     OR p_response_ttl_seconds NOT BETWEEN 60 AND 86400
  THEN
    RAISE EXCEPTION 'invalid_pragas_ai_completion';
  END IF;
  UPDATE public.pragas_ai_idempotency_records
     SET state = 'completed', response_status = p_response_status,
         response_body = p_response_body, completed_at = clock_timestamp(),
         response_expires_at = clock_timestamp()
           + make_interval(secs => p_response_ttl_seconds),
         lease_token = NULL, lease_expires_at = NULL, updated_at = clock_timestamp()
   WHERE user_id = p_user_id AND scope = p_scope
     AND idempotency_key = p_idempotency_key AND request_hash = p_request_hash
     AND state = 'processing' AND lease_token = p_lease_token;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('completed', v_updated = 1);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_pragas_ai_idempotency(
  uuid, text, uuid, text, uuid, integer, jsonb, integer
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_pragas_ai_idempotency(
  uuid, text, uuid, text, uuid, integer, jsonb, integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.release_pragas_ai_idempotency(
  p_user_id uuid, p_scope text, p_idempotency_key uuid,
  p_request_hash text, p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM public.pragas_ai_idempotency_records
   WHERE user_id = p_user_id AND scope = p_scope
     AND idempotency_key = p_idempotency_key AND request_hash = p_request_hash
     AND state = 'processing' AND lease_token = p_lease_token
     AND provider_started_at IS NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.release_pragas_ai_idempotency(
  uuid, text, uuid, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_pragas_ai_idempotency(
  uuid, text, uuid, text, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_pragas_ai_unknown_outcome(
  p_user_id uuid, p_scope text, p_idempotency_key uuid,
  p_request_hash text, p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated integer;
BEGIN
  UPDATE public.pragas_ai_idempotency_records
     SET state = 'unknown_outcome', unknown_outcome_at = clock_timestamp(),
         lease_token = NULL, lease_expires_at = NULL, updated_at = clock_timestamp()
   WHERE user_id = p_user_id AND scope = p_scope
     AND idempotency_key = p_idempotency_key AND request_hash = p_request_hash
     AND state = 'processing' AND lease_token = p_lease_token
     AND provider_started_at IS NOT NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_pragas_ai_unknown_outcome(
  uuid, text, uuid, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_pragas_ai_unknown_outcome(
  uuid, text, uuid, text, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.scrub_expired_pragas_ai_idempotency(
  p_limit integer DEFAULT 500
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_scrubbed integer;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'invalid_pragas_ai_scrub_limit';
  END IF;
  WITH candidates AS (
    SELECT record.user_id, record.scope, record.idempotency_key
      FROM public.pragas_ai_idempotency_records AS record
     WHERE record.state = 'completed'
       AND record.response_expires_at <= clock_timestamp()
     ORDER BY record.response_expires_at
     FOR UPDATE SKIP LOCKED
     LIMIT p_limit
  )
  UPDATE public.pragas_ai_idempotency_records AS record
     SET state = 'expired', response_status = NULL, response_body = NULL,
         updated_at = clock_timestamp()
    FROM candidates
   WHERE record.user_id = candidates.user_id
     AND record.scope = candidates.scope
     AND record.idempotency_key = candidates.idempotency_key;
  GET DIAGNOSTICS v_scrubbed = ROW_COUNT;
  RETURN v_scrubbed;
END;
$$;
REVOKE ALL ON FUNCTION public.scrub_expired_pragas_ai_idempotency(integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.scrub_expired_pragas_ai_idempotency(integer)
  TO service_role;

CREATE TABLE IF NOT EXISTS public.pragas_deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested', 'processing', 'retry', 'blocked_global_decision', 'reactivated'
  )),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code text CHECK (
    last_error_code IS NULL OR char_length(last_error_code) <= 100
  ),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  app_cleanup_completed_at timestamptz,
  reactivated_at timestamptz,
  reactivation_request_id uuid,
  reactivation_idempotency_key uuid,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_pragas_deletion_jobs_queue
  ON public.pragas_deletion_jobs (status, next_attempt_at);
ALTER TABLE public.pragas_deletion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_deletion_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pragas_deletion_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_deletion_jobs TO service_role;
DROP TRIGGER IF EXISTS pragas_deletion_jobs_touch_updated_at
  ON public.pragas_deletion_jobs;
CREATE TRIGGER pragas_deletion_jobs_touch_updated_at
  BEFORE UPDATE ON public.pragas_deletion_jobs
  FOR EACH ROW EXECUTE FUNCTION public.pragas_touch_updated_at();

CREATE OR REPLACE FUNCTION public.record_pragas_analytics_events(
  p_user_id uuid,
  p_events jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_event_id uuid;
  v_event text;
  v_platform text;
  v_properties jsonb;
  v_timestamp timestamptz;
  v_total integer;
  v_inserted integer := 0;
  v_count integer;
BEGIN
  IF p_user_id IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'invalid_analytics_batch';
  END IF;
  v_total := jsonb_array_length(p_events);
  IF v_total NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_analytics_batch_size';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pragas_app_links
     WHERE user_id = p_user_id AND active
  ) OR NOT EXISTS (
    SELECT 1 FROM public.pragas_profiles WHERE user_id = p_user_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.subscriptions
     WHERE user_id = p_user_id AND app = 'rumo-pragas' AND status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.pragas_deletion_jobs
     WHERE user_id = p_user_id AND status <> 'reactivated'
  ) THEN
    RAISE EXCEPTION 'pragas_app_link_inactive';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_events)
  LOOP
    BEGIN
      v_event_id := (v_item ->> 'event_id')::uuid;
      v_timestamp := (v_item ->> 'timestamp')::timestamptz;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
      RAISE EXCEPTION 'invalid_analytics_event';
    END;
    v_event := v_item ->> 'event';
    v_platform := v_item ->> 'platform';
    v_properties := coalesce(v_item -> 'properties', '{}'::jsonb);
    IF v_event_id IS NULL OR v_event !~ '^[A-Za-z0-9_.:-]{1,120}$'
       OR v_platform !~ '^[A-Za-z0-9_.-]{1,32}$'
       OR jsonb_typeof(v_properties) <> 'object'
       OR octet_length(v_properties::text) > 10000
       OR v_timestamp < clock_timestamp() - interval '30 days'
       OR v_timestamp > clock_timestamp() + interval '5 minutes'
    THEN
      RAISE EXCEPTION 'invalid_analytics_event';
    END IF;
    INSERT INTO public.analytics_events (
      user_id, app, pragas_event_id, event, properties, platform, timestamp
    ) VALUES (
      p_user_id, 'rumo-pragas', v_event_id, v_event,
      v_properties, v_platform, v_timestamp
    ) ON CONFLICT (user_id, pragas_event_id)
      WHERE app = 'rumo-pragas' AND pragas_event_id IS NOT NULL
      DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_inserted := v_inserted + v_count;
  END LOOP;
  RETURN jsonb_build_object(
    'accepted', v_total, 'inserted', v_inserted,
    'duplicates', v_total - v_inserted
  );
END;
$$;
REVOKE ALL ON FUNCTION public.record_pragas_analytics_events(uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_pragas_analytics_events(uuid, jsonb)
  TO service_role;

-- Push delivery idempotency. The live queue was empty at read-only preflight.
-- If legacy rows appear without a durable request hash, fail closed instead
-- of guessing whether Expo already accepted an external side effect.
DO $push_notification_preflight$
DECLARE
  v_has_request_hash boolean;
  v_has_null_request_hash boolean := false;
BEGIN
  IF to_regclass('public.pragas_push_notifications') IS NULL THEN
    RAISE EXCEPTION 'pragas_push_notification_relation_missing';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'pragas_push_notifications'
       AND column_name = 'request_hash'
       AND udt_name = 'text'
  ) INTO v_has_request_hash;
  IF EXISTS (SELECT 1 FROM public.pragas_push_notifications LIMIT 1) THEN
    IF NOT v_has_request_hash THEN
      RAISE EXCEPTION 'pragas_push_notification_legacy_rows_require_review';
    END IF;
    EXECUTE 'SELECT EXISTS (SELECT 1 '
      || 'FROM public.pragas_push_notifications WHERE request_hash IS NULL)'
      INTO v_has_null_request_hash;
    IF v_has_null_request_hash THEN
      RAISE EXCEPTION 'pragas_push_notification_legacy_rows_require_review';
    END IF;
  END IF;
END
$push_notification_preflight$;

ALTER TABLE public.pragas_push_notifications
  ADD COLUMN IF NOT EXISTS request_hash text,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS unknown_outcome_at timestamptz;
ALTER TABLE public.pragas_push_notifications
  ALTER COLUMN request_hash SET NOT NULL;

DO $push_notification_constraints$
DECLARE
  v_constraint_name name;
BEGIN
  FOR v_constraint_name IN
    SELECT constraint_row.conname
      FROM pg_constraint AS constraint_row
     WHERE constraint_row.conrelid = 'public.pragas_push_notifications'::regclass
       AND constraint_row.contype = 'c'
       AND pg_get_constraintdef(constraint_row.oid) ILIKE '%status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.pragas_push_notifications DROP CONSTRAINT %I',
      v_constraint_name
    );
  END LOOP;
END
$push_notification_constraints$;
ALTER TABLE public.pragas_push_notifications
  DROP CONSTRAINT IF EXISTS pragas_push_notifications_request_hash_check,
  DROP CONSTRAINT IF EXISTS pragas_push_notifications_lease_state_check;
ALTER TABLE public.pragas_push_notifications
  ADD CONSTRAINT pragas_push_notifications_request_hash_check
    CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT pragas_push_notifications_status_check
    CHECK (status IN ('pending', 'sent', 'partial', 'failed', 'unknown_outcome')),
  ADD CONSTRAINT pragas_push_notifications_lease_state_check CHECK (
    (status = 'pending' AND lease_token IS NOT NULL
      AND lease_expires_at IS NOT NULL AND unknown_outcome_at IS NULL)
    OR (status IN ('sent', 'partial', 'failed') AND lease_token IS NULL
      AND lease_expires_at IS NULL AND unknown_outcome_at IS NULL)
    OR (status = 'unknown_outcome' AND provider_started_at IS NOT NULL
      AND unknown_outcome_at IS NOT NULL AND lease_token IS NULL
      AND lease_expires_at IS NULL)
  );

CREATE OR REPLACE FUNCTION public.claim_pragas_push_notification(
  p_notification_id uuid,
  p_request_hash text,
  p_category text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_record public.pragas_push_notifications%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_lease_token uuid;
BEGIN
  IF p_notification_id IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$'
     OR p_category NOT IN ('transactional', 'climate_risk_educational')
  THEN
    RAISE EXCEPTION 'invalid_pragas_push_claim';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('pragas-push:' || p_notification_id::text, 0)
  );
  SELECT notification.* INTO v_record
    FROM public.pragas_push_notifications AS notification
   WHERE notification.notification_id = p_notification_id::text
   FOR UPDATE;
  IF FOUND THEN
    IF v_record.request_hash <> p_request_hash THEN
      RETURN jsonb_build_object('state', 'conflict');
    END IF;
    IF v_record.status = 'unknown_outcome' THEN
      RETURN jsonb_build_object('state', 'unknown_outcome');
    END IF;
    IF v_record.status <> 'pending' THEN
      RETURN jsonb_build_object(
        'state', 'completed', 'notification_id', v_record.notification_id,
        'status', v_record.status, 'recipient_count', v_record.recipient_count,
        'accepted_count', v_record.accepted_count,
        'error_count', v_record.error_count
      );
    END IF;
    IF v_record.lease_expires_at > v_now THEN
      RETURN jsonb_build_object(
        'state', 'in_progress',
        'retry_after_seconds', greatest(
          1, ceil(extract(epoch FROM (v_record.lease_expires_at - v_now)))::integer
        )
      );
    END IF;
    IF v_record.provider_started_at IS NOT NULL THEN
      UPDATE public.pragas_push_notifications
         SET status = 'unknown_outcome', unknown_outcome_at = v_now,
             lease_token = NULL, lease_expires_at = NULL, updated_at = v_now
       WHERE notification_id = p_notification_id::text;
      RETURN jsonb_build_object('state', 'unknown_outcome');
    END IF;
    v_lease_token := gen_random_uuid();
    UPDATE public.pragas_push_notifications
       SET lease_token = v_lease_token,
           lease_expires_at = v_now + interval '5 minutes', updated_at = v_now
     WHERE notification_id = p_notification_id::text;
    RETURN jsonb_build_object(
      'state', 'reserved', 'lease_token', v_lease_token, 'reclaimed', true
    );
  END IF;
  v_lease_token := gen_random_uuid();
  INSERT INTO public.pragas_push_notifications (
    notification_id, sender, category, payload, status, request_hash,
    lease_token, lease_expires_at
  ) VALUES (
    p_notification_id::text, 'system', p_category,
    '{"schema_version":1}'::jsonb, 'pending', p_request_hash,
    v_lease_token, v_now + interval '5 minutes'
  );
  RETURN jsonb_build_object(
    'state', 'reserved', 'lease_token', v_lease_token, 'reclaimed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_pragas_push_provider_started(
  p_notification_id uuid, p_request_hash text, p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated integer;
BEGIN
  UPDATE public.pragas_push_notifications
     SET provider_started_at = coalesce(provider_started_at, clock_timestamp()),
         updated_at = clock_timestamp()
   WHERE notification_id = p_notification_id::text
     AND request_hash = p_request_hash AND status = 'pending'
     AND lease_token = p_lease_token AND lease_expires_at > clock_timestamp();
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_pragas_push_notification(
  p_notification_id uuid, p_request_hash text, p_lease_token uuid,
  p_status text, p_recipient_count integer, p_accepted_count integer,
  p_error_count integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated integer;
BEGIN
  IF p_status NOT IN ('sent', 'partial', 'failed')
     OR p_recipient_count < 0 OR p_accepted_count < 0 OR p_error_count < 0
     OR p_accepted_count + p_error_count <> p_recipient_count
  THEN
    RAISE EXCEPTION 'invalid_pragas_push_completion';
  END IF;
  UPDATE public.pragas_push_notifications
     SET status = p_status, recipient_count = p_recipient_count,
         accepted_count = p_accepted_count, error_count = p_error_count,
         lease_token = NULL, lease_expires_at = NULL,
         updated_at = clock_timestamp()
   WHERE notification_id = p_notification_id::text
     AND request_hash = p_request_hash AND status = 'pending'
     AND lease_token = p_lease_token;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_pragas_push_unknown_outcome(
  p_notification_id uuid, p_request_hash text, p_lease_token uuid,
  p_recipient_count integer, p_accepted_count integer, p_error_count integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated integer;
BEGIN
  IF p_recipient_count < 0 OR p_accepted_count < 0 OR p_error_count < 0
     OR p_accepted_count + p_error_count > p_recipient_count
  THEN
    RAISE EXCEPTION 'invalid_pragas_push_unknown_outcome';
  END IF;
  UPDATE public.pragas_push_notifications
     SET status = 'unknown_outcome', recipient_count = p_recipient_count,
         accepted_count = p_accepted_count, error_count = p_error_count,
         unknown_outcome_at = clock_timestamp(), lease_token = NULL,
         lease_expires_at = NULL, updated_at = clock_timestamp()
   WHERE notification_id = p_notification_id::text
     AND request_hash = p_request_hash AND status = 'pending'
     AND lease_token = p_lease_token AND provider_started_at IS NOT NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_pragas_push_notification(
  p_notification_id uuid, p_request_hash text, p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM public.pragas_push_notifications
   WHERE notification_id = p_notification_id::text
     AND request_hash = p_request_hash AND status = 'pending'
     AND lease_token = p_lease_token AND provider_started_at IS NULL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pragas_push_notification(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_pragas_push_provider_started(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_pragas_push_notification(
  uuid, text, uuid, text, integer, integer, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_pragas_push_unknown_outcome(
  uuid, text, uuid, integer, integer, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.release_pragas_push_notification(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_pragas_push_notification(uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_pragas_push_provider_started(uuid, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_pragas_push_notification(
  uuid, text, uuid, text, integer, integer, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_pragas_push_unknown_outcome(
  uuid, text, uuid, integer, integer, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_pragas_push_notification(uuid, text, uuid)
  TO service_role;

CREATE TABLE IF NOT EXISTS public.pragas_ai_content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  submission_key uuid NOT NULL,
  message_id text NOT NULL CHECK (char_length(message_id) BETWEEN 1 AND 128),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 8000),
  reason public.pragas_ai_report_reason NOT NULL,
  details text CHECK (details IS NULL OR char_length(details) <= 2000),
  status public.pragas_ai_report_status NOT NULL DEFAULT 'received',
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 2000),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (user_id, submission_key),
  CHECK (
    (status = 'received' AND reviewed_by IS NULL AND reviewed_at IS NULL
      AND resolved_at IS NULL)
    OR (status = 'reviewing' AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL AND resolved_at IS NULL)
    OR (status IN ('resolved', 'dismissed') AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL AND resolved_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_pragas_ai_reports_status_created
  ON public.pragas_ai_content_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pragas_ai_reports_user_created
  ON public.pragas_ai_content_reports (user_id, created_at DESC);
ALTER TABLE public.pragas_ai_content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pragas_ai_content_reports FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pragas_ai_content_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_ai_content_reports
  TO service_role;
DROP TRIGGER IF EXISTS pragas_ai_reports_touch_updated_at
  ON public.pragas_ai_content_reports;
CREATE TRIGGER pragas_ai_reports_touch_updated_at
  BEFORE UPDATE ON public.pragas_ai_content_reports
  FOR EACH ROW EXECUTE FUNCTION public.pragas_touch_updated_at();

CREATE OR REPLACE FUNCTION public.transition_pragas_ai_content_report(
  p_report_id uuid,
  p_new_status text,
  p_actor_id uuid,
  p_review_note text DEFAULT NULL
)
RETURNS SETOF public.pragas_ai_content_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current public.pragas_ai_report_status;
BEGIN
  IF p_report_id IS NULL OR p_actor_id IS NULL
     OR p_new_status NOT IN ('reviewing', 'resolved', 'dismissed')
     OR char_length(coalesce(p_review_note, '')) > 2000
  THEN
    RAISE EXCEPTION 'invalid_report_transition';
  END IF;
  SELECT status INTO v_current FROM public.pragas_ai_content_reports
   WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND OR NOT (
    (v_current = 'received' AND p_new_status = 'reviewing')
    OR (v_current = 'reviewing' AND p_new_status IN ('resolved', 'dismissed'))
  ) THEN
    RAISE EXCEPTION 'invalid_report_transition';
  END IF;
  RETURN QUERY
    UPDATE public.pragas_ai_content_reports
       SET status = p_new_status::public.pragas_ai_report_status,
           review_note = p_review_note,
           reviewed_by = p_actor_id,
           reviewed_at = coalesce(reviewed_at, clock_timestamp()),
           resolved_at = CASE WHEN p_new_status IN ('resolved', 'dismissed')
             THEN clock_timestamp() ELSE NULL END
     WHERE id = p_report_id RETURNING *;
END;
$$;
REVOKE ALL ON FUNCTION public.transition_pragas_ai_content_report(
  uuid, text, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transition_pragas_ai_content_report(
  uuid, text, uuid, text
) TO service_role;

-- A clean repository replay has no feedback table; production has the legacy
-- text diagnosis_id/feedback shape. Creating that exact superset keeps both
-- paths compatible without rewriting a production row.
CREATE TABLE IF NOT EXISTS public.pragas_diagnosis_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  diagnosis_id text NOT NULL,
  pest_id text,
  pest_name text,
  feedback text NOT NULL DEFAULT 'unsure'
    CHECK (feedback IN ('positive', 'negative', 'unsure')),
  comment text,
  verdict public.pragas_diagnosis_feedback_verdict,
  selected_alternative text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Extend the legacy feedback table without rewriting its history.
ALTER TABLE public.pragas_diagnosis_feedback
  ADD COLUMN IF NOT EXISTS verdict public.pragas_diagnosis_feedback_verdict,
  ADD COLUMN IF NOT EXISTS selected_alternative text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE public.pragas_diagnosis_feedback
  ALTER COLUMN feedback SET DEFAULT 'unsure';
ALTER TABLE public.pragas_diagnosis_feedback
  DROP CONSTRAINT IF EXISTS pragas_diagnosis_feedback_feedback_check;
ALTER TABLE public.pragas_diagnosis_feedback
  ADD CONSTRAINT pragas_diagnosis_feedback_feedback_check
  CHECK (feedback IN ('positive', 'negative', 'unsure')) NOT VALID;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.pragas_diagnosis_feedback
     GROUP BY user_id, diagnosis_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'pragas_feedback_duplicate_preflight';
  END IF;
END
$$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pragas_feedback_user_diagnosis
  ON public.pragas_diagnosis_feedback (user_id, diagnosis_id);
DROP TRIGGER IF EXISTS pragas_feedback_touch_updated_at
  ON public.pragas_diagnosis_feedback;
CREATE TRIGGER pragas_feedback_touch_updated_at
  BEFORE UPDATE ON public.pragas_diagnosis_feedback
  FOR EACH ROW EXECUTE FUNCTION public.pragas_touch_updated_at();

CREATE OR REPLACE FUNCTION public.pragas_feedback_legacy_bridge()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_feedback_changed boolean := false;
  v_verdict_changed boolean := false;
  v_expected_feedback text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_feedback_changed := NEW.feedback IS DISTINCT FROM OLD.feedback;
    v_verdict_changed := NEW.verdict IS DISTINCT FROM OLD.verdict;
  END IF;
  -- A legacy caller can write only feedback, while the current Edge writes
  -- verdict. Whichever side changed alone is authoritative. If both arrive,
  -- require one coherent pair (treating the legacy default `unsure` as absent).
  IF TG_OP = 'UPDATE' AND v_feedback_changed AND NOT v_verdict_changed THEN
    NEW.verdict := CASE NEW.feedback
      WHEN 'positive' THEN 'correct'::public.pragas_diagnosis_feedback_verdict
      WHEN 'negative' THEN 'incorrect'::public.pragas_diagnosis_feedback_verdict
      ELSE 'unsure'::public.pragas_diagnosis_feedback_verdict
    END;
    RETURN NEW;
  END IF;

  IF NEW.verdict IS NULL THEN
    NEW.verdict := CASE NEW.feedback
      WHEN 'positive' THEN 'correct'::public.pragas_diagnosis_feedback_verdict
      WHEN 'negative' THEN 'incorrect'::public.pragas_diagnosis_feedback_verdict
      ELSE 'unsure'::public.pragas_diagnosis_feedback_verdict
    END;
  END IF;
  v_expected_feedback := CASE NEW.verdict
      WHEN 'correct' THEN 'positive'
      WHEN 'incorrect' THEN 'negative'
      ELSE 'unsure'
    END;

  IF TG_OP = 'UPDATE' AND v_verdict_changed AND NOT v_feedback_changed THEN
    NEW.feedback := v_expected_feedback;
  ELSIF NEW.feedback IS NULL
     OR (NEW.feedback = 'unsure' AND NEW.verdict <> 'unsure')
  THEN
    NEW.feedback := v_expected_feedback;
  ELSIF NEW.feedback <> v_expected_feedback THEN
    RAISE EXCEPTION 'pragas_feedback_contract_mismatch';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.pragas_feedback_legacy_bridge()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS pragas_feedback_legacy_bridge
  ON public.pragas_diagnosis_feedback;
CREATE TRIGGER pragas_feedback_legacy_bridge
  BEFORE INSERT OR UPDATE OF feedback, verdict
  ON public.pragas_diagnosis_feedback
  FOR EACH ROW EXECUTE FUNCTION public.pragas_feedback_legacy_bridge();

CREATE OR REPLACE FUNCTION public.pragas_validate_feedback_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.pragas_diagnoses AS diagnosis
     WHERE diagnosis.id::text = NEW.diagnosis_id::text
       AND diagnosis.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'diagnosis_not_owned';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.pragas_validate_feedback_owner()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS pragas_feedback_validate_owner
  ON public.pragas_diagnosis_feedback;
CREATE TRIGGER pragas_feedback_validate_owner
  BEFORE INSERT OR UPDATE OF user_id, diagnosis_id
  ON public.pragas_diagnosis_feedback
  FOR EACH ROW EXECUTE FUNCTION public.pragas_validate_feedback_owner();

ALTER TABLE public.pragas_diagnosis_feedback ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'pragas_diagnosis_feedback'
       AND policyname = 'pragas_prod_compat_feedback_select_own'
  ) THEN
    CREATE POLICY pragas_prod_compat_feedback_select_own
      ON public.pragas_diagnosis_feedback FOR SELECT TO authenticated
      USING ((SELECT auth.uid()) = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'pragas_diagnosis_feedback'
       AND policyname = 'pragas_prod_compat_feedback_insert_own'
  ) THEN
    CREATE POLICY pragas_prod_compat_feedback_insert_own
      ON public.pragas_diagnosis_feedback FOR INSERT TO authenticated
      WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.pragas_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text,
  expo_token text,
  platform text,
  device_info jsonb,
  is_active boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.pragas_push_tokens
  ADD COLUMN IF NOT EXISTS token text,
  ADD COLUMN IF NOT EXISTS expo_token text,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS device_info jsonb,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consented_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pragas_push_tokens_active_expo
  ON public.pragas_push_tokens (expo_token)
  WHERE expo_token IS NOT NULL AND is_active AND notifications_enabled;
DROP TRIGGER IF EXISTS pragas_push_tokens_touch_updated_at
  ON public.pragas_push_tokens;
CREATE TRIGGER pragas_push_tokens_touch_updated_at
  BEFORE UPDATE ON public.pragas_push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.pragas_touch_updated_at();
ALTER TABLE public.pragas_push_tokens ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pragas_push_tokens'
       AND policyname = 'pragas_prod_compat_push_select_own'
  ) THEN
    CREATE POLICY pragas_prod_compat_push_select_own
      ON public.pragas_push_tokens FOR SELECT TO authenticated
      USING ((SELECT auth.uid()) = user_id);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.pragas_notification_queue_owner_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_candidate_owner uuid;
  v_locked_owner uuid;
  v_owner_count integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.token IS DISTINCT FROM OLD.token
       OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
    THEN
      RAISE EXCEPTION 'pragas_notification_queue_owner_immutable';
    END IF;
    RETURN NEW;
  END IF;

  SELECT (array_agg(owner.user_id ORDER BY owner.user_id))[1], count(*)::integer
    INTO v_candidate_owner, v_owner_count
    FROM (
      SELECT DISTINCT token_row.user_id
        FROM public.pragas_push_tokens AS token_row
       WHERE token_row.is_active
         AND token_row.notifications_enabled
         AND (token_row.token = NEW.token OR token_row.expo_token = NEW.token)
    ) AS owner;
  IF v_owner_count <> 1 OR v_candidate_owner IS NULL THEN
    RAISE EXCEPTION 'pragas_notification_queue_active_owner_missing_or_ambiguous';
  END IF;

  -- Keep lock order aligned with deletion cleanup: account first, token second.
  -- Re-read after both locks so a concurrent token transfer fails for retry
  -- instead of stamping the row with stale ownership.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'pragas-account:' || v_candidate_owner::text, 0
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'pragas-push-token:' || NEW.token, 0
  ));
  SELECT (array_agg(owner.user_id ORDER BY owner.user_id))[1], count(*)::integer
    INTO v_locked_owner, v_owner_count
    FROM (
      SELECT DISTINCT token_row.user_id
        FROM public.pragas_push_tokens AS token_row
       WHERE token_row.is_active
         AND token_row.notifications_enabled
         AND (token_row.token = NEW.token OR token_row.expo_token = NEW.token)
    ) AS owner;
  IF v_owner_count <> 1 OR v_locked_owner IS DISTINCT FROM v_candidate_owner THEN
    RAISE EXCEPTION 'pragas_notification_queue_owner_changed_retry';
  END IF;
  IF NEW.owner_user_id IS NOT NULL
     AND NEW.owner_user_id IS DISTINCT FROM v_locked_owner
  THEN
    RAISE EXCEPTION 'pragas_notification_queue_owner_mismatch';
  END IF;
  NEW.owner_user_id := v_locked_owner;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.pragas_notification_queue_owner_guard()
  FROM PUBLIC, anon, authenticated;

DO $notification_queue_owner_contract$
DECLARE
  v_bad_rows bigint;
  v_owner_attnum smallint;
  v_auth_id_attnum smallint;
BEGIN
  IF to_regclass('public.pragas_notification_queue') IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns AS column_info
     WHERE column_info.table_schema = 'public'
       AND column_info.table_name = 'pragas_notification_queue'
       AND column_info.column_name = 'token'
       AND column_info.data_type = 'text'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns AS column_info
     WHERE column_info.table_schema = 'public'
       AND column_info.table_name = 'pragas_notification_queue'
       AND column_info.column_name = 'created_at'
       AND column_info.data_type IN (
         'timestamp with time zone', 'timestamp without time zone'
       )
  ) THEN
    RAISE EXCEPTION 'pragas_notification_queue_owner_schema_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns AS column_info
     WHERE column_info.table_schema = 'public'
       AND column_info.table_name = 'pragas_notification_queue'
       AND column_info.column_name = 'owner_user_id'
       AND (
         column_info.udt_name <> 'uuid'
         OR column_info.is_generated <> 'NEVER'
         OR column_info.is_identity <> 'NO'
         OR column_info.column_default IS NOT NULL
       )
  ) THEN
    RAISE EXCEPTION 'pragas_notification_queue_owner_schema_mismatch';
  END IF;

  ALTER TABLE public.pragas_notification_queue
    ADD COLUMN IF NOT EXISTS owner_user_id uuid;

  SELECT count(*) INTO v_bad_rows
    FROM public.pragas_notification_queue AS queue_row
   WHERE queue_row.owner_user_id IS NULL
     AND (
       SELECT count(DISTINCT token_row.user_id)
         FROM public.pragas_push_tokens AS token_row
        WHERE (
          token_row.token = queue_row.token
          OR token_row.expo_token = queue_row.token
        )
          AND token_row.created_at <= queue_row.created_at
     ) <> 1;
  IF v_bad_rows <> 0 THEN
    RAISE EXCEPTION 'pragas_notification_queue_legacy_owner_ambiguous';
  END IF;

  UPDATE public.pragas_notification_queue AS queue_row
     SET owner_user_id = (
       SELECT owner.user_id
         FROM (
           SELECT DISTINCT token_row.user_id
             FROM public.pragas_push_tokens AS token_row
            WHERE (
              token_row.token = queue_row.token
              OR token_row.expo_token = queue_row.token
            )
              AND token_row.created_at <= queue_row.created_at
         ) AS owner
        LIMIT 1
     )
   WHERE queue_row.owner_user_id IS NULL;

  SELECT count(*) INTO v_bad_rows
    FROM public.pragas_notification_queue AS queue_row
   WHERE queue_row.owner_user_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.pragas_push_tokens AS token_row
         WHERE token_row.user_id = queue_row.owner_user_id
           AND (
             token_row.token = queue_row.token
             OR token_row.expo_token = queue_row.token
           )
           AND token_row.created_at <= queue_row.created_at
      );
  IF v_bad_rows <> 0 THEN
    RAISE EXCEPTION 'pragas_notification_queue_owner_backfill_failed';
  END IF;

  ALTER TABLE public.pragas_notification_queue
    ALTER COLUMN owner_user_id SET NOT NULL;

  SELECT attnum INTO v_owner_attnum
    FROM pg_attribute
   WHERE attrelid = 'public.pragas_notification_queue'::regclass
     AND attname = 'owner_user_id' AND NOT attisdropped;
  SELECT attnum INTO v_auth_id_attnum
    FROM pg_attribute
   WHERE attrelid = 'auth.users'::regclass
     AND attname = 'id' AND NOT attisdropped;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pragas_notification_queue'::regclass
       AND conname = 'pragas_notification_queue_owner_user_id_fkey'
  ) THEN
    ALTER TABLE public.pragas_notification_queue
      ADD CONSTRAINT pragas_notification_queue_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES auth.users(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint AS constraint_row
     WHERE constraint_row.conrelid =
             'public.pragas_notification_queue'::regclass
       AND constraint_row.conname =
             'pragas_notification_queue_owner_user_id_fkey'
       AND constraint_row.contype = 'f'
       AND constraint_row.confrelid = 'auth.users'::regclass
       AND constraint_row.conkey = ARRAY[v_owner_attnum]::smallint[]
       AND constraint_row.confkey = ARRAY[v_auth_id_attnum]::smallint[]
       AND constraint_row.confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'pragas_notification_queue_owner_fk_mismatch';
  END IF;
  ALTER TABLE public.pragas_notification_queue
    VALIDATE CONSTRAINT pragas_notification_queue_owner_user_id_fkey;

  CREATE INDEX IF NOT EXISTS idx_pragas_notification_queue_owner_created
    ON public.pragas_notification_queue (owner_user_id, created_at, id);
  IF NOT EXISTS (
    SELECT 1 FROM pg_index AS index_row
     WHERE index_row.indexrelid =
             to_regclass('public.idx_pragas_notification_queue_owner_created')
       AND index_row.indrelid = 'public.pragas_notification_queue'::regclass
       AND index_row.indisvalid AND index_row.indisready
       AND NOT index_row.indisunique
       AND index_row.indpred IS NULL AND index_row.indexprs IS NULL
       AND index_row.indnkeyatts = 3 AND index_row.indnatts = 3
       AND (
         SELECT array_agg(attribute_row.attname::text ORDER BY key_row.ordinality)
           FROM unnest(index_row.indkey::smallint[]) WITH ORDINALITY
                  AS key_row(attnum, ordinality)
           JOIN pg_attribute AS attribute_row
             ON attribute_row.attrelid = index_row.indrelid
            AND attribute_row.attnum = key_row.attnum
       ) = ARRAY['owner_user_id', 'created_at', 'id']::text[]
  ) THEN
    RAISE EXCEPTION 'pragas_notification_queue_owner_index_mismatch';
  END IF;

  DROP TRIGGER IF EXISTS pragas_notification_queue_owner_guard
    ON public.pragas_notification_queue;
  CREATE TRIGGER pragas_notification_queue_owner_guard
    BEFORE INSERT OR UPDATE OF id, token, owner_user_id
    ON public.pragas_notification_queue
    FOR EACH ROW EXECUTE FUNCTION public.pragas_notification_queue_owner_guard();
  ALTER TABLE public.pragas_notification_queue ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.pragas_notification_queue FORCE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public.pragas_notification_queue
    FROM PUBLIC, anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.pragas_notification_queue TO service_role;
END
$notification_queue_owner_contract$;

-- Exact table/column contract consumed by the nine candidate Edge Functions.
-- Type drift is rejected inside the migration transaction, so every preceding
-- statement rolls back atomically and no partially compatible API can ship.
DO $edge_schema_contract$
DECLARE
  v_required record;
BEGIN
  FOR v_required IN
    SELECT * FROM (VALUES
      ('pragas_profiles', 'id', ARRAY['uuid']::text[]),
      ('pragas_profiles', 'user_id', ARRAY['uuid']::text[]),
      ('pragas_profiles', 'full_name', ARRAY['text']::text[]),
      ('pragas_profiles', 'city', ARRAY['text']::text[]),
      ('pragas_profiles', 'state', ARRAY['text']::text[]),
      ('pragas_profiles', 'crops', ARRAY['_text']::text[]),
      ('pragas_profiles', 'avatar_path', ARRAY['text']::text[]),
      ('pragas_profiles', 'avatar_url', ARRAY['text']::text[]),
      ('pragas_profiles', 'phone', ARRAY['text']::text[]),
      ('pragas_profiles', 'created_at', ARRAY['timestamptz']::text[]),
      ('pragas_profiles', 'updated_at', ARRAY['timestamptz']::text[]),
      ('pragas_diagnoses', 'id', ARRAY['uuid']::text[]),
      ('pragas_diagnoses', 'user_id', ARRAY['uuid']::text[]),
      ('pragas_diagnoses', 'crop', ARRAY['text']::text[]),
      ('pragas_diagnoses', 'pest_id', ARRAY['text']::text[]),
      ('pragas_diagnoses', 'pest_name', ARRAY['text']::text[]),
      ('pragas_diagnoses', 'confidence', ARRAY['float8','numeric']::text[]),
      ('pragas_diagnoses', 'notes', ARRAY['text']::text[]),
      ('pragas_diagnoses', 'location_lat', ARRAY['float8','numeric']::text[]),
      ('pragas_diagnoses', 'location_lng', ARRAY['float8','numeric']::text[]),
      ('pragas_diagnoses', 'location_name', ARRAY['text']::text[]),
      ('pragas_diagnoses', 'created_at', ARRAY['timestamptz']::text[]),
      ('subscriptions', 'user_id', ARRAY['uuid']::text[]),
      ('subscriptions', 'app', ARRAY['text']::text[]),
      ('subscriptions', 'plan', ARRAY['text']::text[]),
      ('subscriptions', 'status', ARRAY['text']::text[]),
      ('subscriptions', 'provider', ARRAY['text']::text[]),
      ('subscriptions', 'updated_at', ARRAY['timestamptz']::text[]),
      ('chat_usage', 'user_id', ARRAY['uuid']::text[]),
      ('chat_usage', 'app', ARRAY['text']::text[]),
      ('chat_usage', 'year_month', ARRAY['text']::text[]),
      ('chat_usage', 'count', ARRAY['int4']::text[]),
      ('chat_usage', 'updated_at', ARRAY['timestamptz']::text[]),
      ('analytics_events', 'id', ARRAY['uuid']::text[]),
      ('analytics_events', 'user_id', ARRAY['uuid']::text[]),
      ('analytics_events', 'app', ARRAY['text']::text[]),
      ('analytics_events', 'pragas_event_id', ARRAY['uuid']::text[]),
      ('analytics_events', 'event', ARRAY['text']::text[]),
      ('analytics_events', 'properties', ARRAY['jsonb']::text[]),
      ('analytics_events', 'platform', ARRAY['text']::text[]),
      ('analytics_events', 'timestamp', ARRAY['timestamptz']::text[]),
      ('analytics_events', 'created_at', ARRAY['timestamptz']::text[]),
      ('audit_log', 'id', ARRAY['uuid']::text[]),
      ('audit_log', 'user_id', ARRAY['uuid']::text[]),
      ('audit_log', 'app', ARRAY['text']::text[]),
      ('audit_log', 'action', ARRAY['text']::text[]),
      ('audit_log', 'details', ARRAY['jsonb']::text[]),
      ('audit_log', 'ip_address', ARRAY['inet']::text[]),
      ('audit_log', 'created_at', ARRAY['timestamptz']::text[]),
      ('pragas_user_preferences', 'user_id', ARRAY['uuid']::text[]),
      ('pragas_user_preferences', 'share_location', ARRAY['bool']::text[]),
      ('pragas_user_preferences', 'share_location_purpose', ARRAY['text']::text[]),
      ('pragas_user_preferences', 'consented_at', ARRAY['timestamptz']::text[]),
      ('pragas_user_preferences', 'location_consent_revision', ARRAY['int8']::text[]),
      ('pragas_user_preferences', 'updated_at', ARRAY['timestamptz']::text[]),
      ('pragas_location_consent_decisions', 'decision_id', ARRAY['uuid']::text[]),
      ('pragas_location_consent_decisions', 'observed_revision', ARRAY['int8']::text[]),
      ('pragas_location_consent_decisions', 'applied_revision', ARRAY['int8']::text[]),
      ('pragas_location_consent_decisions', 'outcome', ARRAY['text']::text[]),
      ('pragas_ai_content_reports', 'id', ARRAY['uuid']::text[]),
      ('pragas_ai_content_reports', 'submission_key', ARRAY['uuid']::text[]),
      ('pragas_ai_content_reports', 'message_id', ARRAY['text']::text[]),
      ('pragas_ai_content_reports', 'content', ARRAY['text']::text[]),
      ('pragas_ai_content_reports', 'status', ARRAY['pragas_ai_report_status']::text[]),
      ('pragas_diagnosis_feedback', 'id', ARRAY['uuid']::text[]),
      ('pragas_diagnosis_feedback', 'user_id', ARRAY['uuid']::text[]),
      ('pragas_diagnosis_feedback', 'diagnosis_id', ARRAY['text','uuid']::text[]),
      ('pragas_diagnosis_feedback', 'verdict', ARRAY['pragas_diagnosis_feedback_verdict']::text[]),
      ('pragas_diagnosis_feedback', 'created_at', ARRAY['timestamptz']::text[]),
      ('pragas_diagnosis_feedback', 'updated_at', ARRAY['timestamptz']::text[]),
      ('pragas_push_tokens', 'id', ARRAY['uuid']::text[]),
      ('pragas_push_tokens', 'user_id', ARRAY['uuid']::text[]),
      ('pragas_push_tokens', 'token', ARRAY['text']::text[]),
      ('pragas_push_tokens', 'expo_token', ARRAY['text']::text[]),
      ('pragas_push_tokens', 'platform', ARRAY['text']::text[]),
      ('pragas_push_tokens', 'device_info', ARRAY['jsonb']::text[]),
      ('pragas_push_tokens', 'notifications_enabled', ARRAY['bool']::text[]),
      ('pragas_push_tokens', 'is_active', ARRAY['bool']::text[]),
      ('pragas_push_tokens', 'created_at', ARRAY['timestamptz']::text[]),
      ('pragas_push_notifications', 'notification_id', ARRAY['text']::text[]),
      ('pragas_push_notifications', 'category', ARRAY['text']::text[]),
      ('pragas_push_notifications', 'status', ARRAY['text']::text[]),
      ('pragas_push_notifications', 'request_hash', ARRAY['text']::text[]),
      ('pragas_push_notifications', 'lease_token', ARRAY['uuid']::text[]),
      ('pragas_push_notifications', 'lease_expires_at', ARRAY['timestamptz']::text[]),
      ('pragas_push_notifications', 'provider_started_at', ARRAY['timestamptz']::text[]),
      ('pragas_push_notifications', 'unknown_outcome_at', ARRAY['timestamptz']::text[]),
      ('pragas_app_links', 'user_id', ARRAY['uuid']::text[]),
      ('pragas_deletion_jobs', 'user_id', ARRAY['uuid']::text[]),
      ('pragas_deletion_jobs', 'status', ARRAY['text']::text[]),
      ('pragas_deletion_jobs', 'app_cleanup_completed_at', ARRAY['timestamptz']::text[])
    ) AS required(table_name, column_name, accepted_udt_names)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns AS column_info
       WHERE column_info.table_schema = 'public'
         AND column_info.table_name = v_required.table_name
         AND column_info.column_name = v_required.column_name
         AND column_info.udt_name = ANY (v_required.accepted_udt_names)
    ) THEN
      RAISE EXCEPTION 'pragas_edge_schema_contract_mismatch_%.%',
        v_required.table_name, v_required.column_name;
    END IF;
  END LOOP;
END
$edge_schema_contract$;

-- Optional legacy datasets are skipped only when their relation is absent.
-- If present, every column used by the LGPD export must exist.
DO $optional_export_schema_contract$
DECLARE
  v_required record;
BEGIN
  FOR v_required IN
    SELECT * FROM (VALUES
      ('pragas_subscriptions', 'id'), ('pragas_subscriptions', 'user_id'),
      ('pragas_subscriptions', 'plan'), ('pragas_subscriptions', 'status'),
      ('pragas_subscriptions', 'platform'), ('pragas_subscriptions', 'product_id'),
      ('pragas_subscriptions', 'store_transaction_id'),
      ('pragas_subscriptions', 'stripe_customer_id'),
      ('pragas_subscriptions', 'stripe_subscription_id'),
      ('pragas_subscriptions', 'asaas_customer_id'),
      ('pragas_subscriptions', 'asaas_subscription_id'),
      ('pragas_subscriptions', 'asaas_last_payment_id'),
      ('pragas_subscriptions', 'trial_ends_at'),
      ('pragas_subscriptions', 'current_period_start'),
      ('pragas_subscriptions', 'current_period_end'),
      ('pragas_subscriptions', 'cancel_at_period_end'),
      ('pragas_subscriptions', 'created_at'), ('pragas_subscriptions', 'updated_at'),
      ('pragas_chat_messages', 'id'), ('pragas_chat_messages', 'user_id'),
      ('pragas_chat_messages', 'role'), ('pragas_chat_messages', 'content'),
      ('pragas_chat_messages', 'created_at'),
      ('pragas_community_posts', 'id'), ('pragas_community_posts', 'user_id'),
      ('pragas_community_posts', 'title'), ('pragas_community_posts', 'content'),
      ('pragas_community_posts', 'category'), ('pragas_community_posts', 'crop'),
      ('pragas_community_posts', 'tags'), ('pragas_community_posts', 'image_url'),
      ('pragas_community_posts', 'diagnosis_id'),
      ('pragas_community_posts', 'author_name'),
      ('pragas_community_posts', 'author_badge'),
      ('pragas_community_posts', 'is_answered'),
      ('pragas_community_posts', 'is_solved'), ('pragas_community_posts', 'solved'),
      ('pragas_community_posts', 'like_count'),
      ('pragas_community_posts', 'comments_count'),
      ('pragas_community_posts', 'reply_count'),
      ('pragas_community_posts', 'upvotes'),
      ('pragas_community_posts', 'created_at'),
      ('pragas_community_posts', 'updated_at'),
      ('pragas_outbreak_confirmations', 'id'),
      ('pragas_outbreak_confirmations', 'user_id'),
      ('pragas_outbreak_confirmations', 'outbreak_id'),
      ('pragas_outbreak_confirmations', 'confirmed'),
      ('pragas_outbreak_confirmations', 'notes'),
      ('pragas_outbreak_confirmations', 'created_at'),
      ('pragas_post_likes', 'id'), ('pragas_post_likes', 'user_id'),
      ('pragas_post_likes', 'post_id'), ('pragas_post_likes', 'created_at'),
      ('pragas_community_likes', 'id'), ('pragas_community_likes', 'user_id'),
      ('pragas_community_likes', 'post_id'), ('pragas_community_likes', 'created_at'),
      ('pragas_diagnosis_usage', 'id'), ('pragas_diagnosis_usage', 'user_id'),
      ('pragas_diagnosis_usage', 'type'), ('pragas_diagnosis_usage', 'crop'),
      ('pragas_diagnosis_usage', 'plan'), ('pragas_diagnosis_usage', 'result'),
      ('pragas_diagnosis_usage', 'created_at'),
      ('pragas_post_replies', 'id'), ('pragas_post_replies', 'user_id'),
      ('pragas_post_replies', 'post_id'), ('pragas_post_replies', 'content'),
      ('pragas_post_replies', 'author_name'),
      ('pragas_post_replies', 'author_badge'),
      ('pragas_post_replies', 'is_accepted'),
      ('pragas_post_replies', 'like_count'), ('pragas_post_replies', 'upvotes'),
      ('pragas_post_replies', 'created_at'), ('pragas_post_replies', 'updated_at'),
      ('pragas_post_comments', 'id'), ('pragas_post_comments', 'user_id'),
      ('pragas_post_comments', 'post_id'), ('pragas_post_comments', 'content'),
      ('pragas_post_comments', 'is_answer'), ('pragas_post_comments', 'upvotes'),
      ('pragas_post_comments', 'created_at'),
      ('pragas_reply_likes', 'id'), ('pragas_reply_likes', 'user_id'),
      ('pragas_reply_likes', 'reply_id'), ('pragas_reply_likes', 'created_at'),
      ('pragas_outbreaks', 'id'), ('pragas_outbreaks', 'user_id'),
      ('pragas_outbreaks', 'pest_id'), ('pragas_outbreaks', 'pest_name'),
      ('pragas_outbreaks', 'crop'), ('pragas_outbreaks', 'description'),
      ('pragas_outbreaks', 'severity'), ('pragas_outbreaks', 'status'),
      ('pragas_outbreaks', 'verified'), ('pragas_outbreaks', 'verified_by'),
      ('pragas_outbreaks', 'confirmed_count'), ('pragas_outbreaks', 'upvotes'),
      ('pragas_outbreaks', 'city'), ('pragas_outbreaks', 'state'),
      ('pragas_outbreaks', 'region'), ('pragas_outbreaks', 'location_name'),
      ('pragas_outbreaks', 'latitude'), ('pragas_outbreaks', 'longitude'),
      ('pragas_outbreaks', 'location_lat'), ('pragas_outbreaks', 'location_lng'),
      ('pragas_outbreaks', 'image_url'), ('pragas_outbreaks', 'created_at'),
      ('pragas_outbreaks', 'updated_at'),
      ('pragas_analytics', 'id'), ('pragas_analytics', 'user_id'),
      ('pragas_analytics', 'event_name'), ('pragas_analytics', 'event_data'),
      ('pragas_analytics', 'screen'), ('pragas_analytics', 'platform'),
      ('pragas_analytics', 'created_at'),
      ('pragas_error_logs', 'id'), ('pragas_error_logs', 'user_id'),
      ('pragas_error_logs', 'error_message'), ('pragas_error_logs', 'error_stack'),
      ('pragas_error_logs', 'component'), ('pragas_error_logs', 'platform'),
      ('pragas_error_logs', 'app_version'), ('pragas_error_logs', 'created_at'),
      ('pragas_notification_queue', 'id'), ('pragas_notification_queue', 'token'),
      ('pragas_notification_queue', 'owner_user_id'),
      ('pragas_notification_queue', 'title'), ('pragas_notification_queue', 'body'),
      ('pragas_notification_queue', 'data'), ('pragas_notification_queue', 'sent'),
      ('pragas_notification_queue', 'created_at')
    ) AS required(table_name, column_name)
  LOOP
    IF to_regclass(format('public.%I', v_required.table_name)) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM information_schema.columns AS column_info
          WHERE column_info.table_schema = 'public'
            AND column_info.table_name = v_required.table_name
            AND column_info.column_name = v_required.column_name
       )
    THEN
      RAISE EXCEPTION 'pragas_optional_export_schema_mismatch_%.%',
        v_required.table_name, v_required.column_name;
    END IF;
  END LOOP;
END
$optional_export_schema_contract$;

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

-- Legacy ownership policies are permissive and are OR-combined. Keep them for
-- compatibility, then add one restrictive app-state gate so direct PostgREST
-- access also stops while unlinked, deletion-pending or globally blocked.
DROP POLICY IF EXISTS pragas_active_link_restrict ON public.pragas_profiles;
CREATE POLICY pragas_active_link_restrict
  ON public.pragas_profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.pragas_current_link_allows_access())
  WITH CHECK (public.pragas_current_link_allows_access());
DROP POLICY IF EXISTS pragas_active_link_restrict ON public.pragas_diagnoses;
CREATE POLICY pragas_active_link_restrict
  ON public.pragas_diagnoses AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.pragas_current_link_allows_access())
  WITH CHECK (public.pragas_current_link_allows_access());
DROP POLICY IF EXISTS pragas_active_link_restrict
  ON public.pragas_diagnosis_feedback;
CREATE POLICY pragas_active_link_restrict
  ON public.pragas_diagnosis_feedback AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.pragas_current_link_allows_access())
  WITH CHECK (public.pragas_current_link_allows_access());
DROP POLICY IF EXISTS pragas_active_link_restrict ON public.pragas_push_tokens;
CREATE POLICY pragas_active_link_restrict
  ON public.pragas_push_tokens AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.pragas_current_link_allows_access())
  WITH CHECK (public.pragas_current_link_allows_access());
DROP POLICY IF EXISTS pragas_active_link_restrict
  ON public.pragas_user_preferences;
CREATE POLICY pragas_active_link_restrict
  ON public.pragas_user_preferences AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.pragas_current_link_allows_access())
  WITH CHECK (public.pragas_current_link_allows_access());

-- Authenticated MCP callers cannot choose another identity, scope, limit or
-- time window. The request hash binds idempotency to the HTTP payload.
CREATE OR REPLACE FUNCTION public.consume_pragas_mcp_rate_limit(
  p_idempotency_key uuid,
  p_request_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR p_idempotency_key IS NULL
     OR p_request_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF NOT public.pragas_current_link_allows_access() THEN
    RAISE EXCEPTION 'pragas_app_link_inactive';
  END IF;
  RETURN public.consume_pragas_api_rate_limit(
    v_user_id, 'mcp', 30, 60, p_idempotency_key, p_request_hash
  );
END;
$$;
REVOKE ALL ON FUNCTION public.consume_pragas_mcp_rate_limit(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_pragas_mcp_rate_limit(uuid, text)
  TO authenticated;
DO $legacy_mcp_acl$
BEGIN
  IF to_regprocedure('public.consume_pragas_mcp_rate_limit(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION '
      || 'public.consume_pragas_mcp_rate_limit(uuid) '
      || 'FROM PUBLIC, anon, authenticated, service_role';
  END IF;
END
$legacy_mcp_acl$;

CREATE OR REPLACE FUNCTION public.touch_pragas_push_token(
  p_token text,
  p_platform text,
  p_notifications_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_row public.pragas_push_tokens%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_token IS NULL OR char_length(p_token) NOT BETWEEN 20 AND 512
     OR p_token !~ '^(ExponentPushToken|ExpoPushToken)[[][A-Za-z0-9_-]+[]]$'
     OR p_platform NOT IN ('ios', 'android') OR p_notifications_enabled IS NULL
  THEN
    RAISE EXCEPTION 'invalid_pragas_push_registration';
  END IF;
  IF NOT public.pragas_current_link_allows_access() THEN
    RAISE EXCEPTION 'pragas_app_link_inactive';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('pragas-push-token:' || p_token, 0));
  IF NOT p_notifications_enabled THEN
    UPDATE public.pragas_push_tokens
       SET notifications_enabled = false, is_active = false,
           revoked_at = coalesce(revoked_at, v_now), last_seen_at = v_now,
           updated_at = v_now
     WHERE user_id = v_user_id AND (token = p_token OR expo_token = p_token)
    RETURNING * INTO v_row;
    RETURN jsonb_build_object(
      'registered', false, 'revoked', true, 'platform', p_platform,
      'revoked_at', coalesce(v_row.revoked_at, v_now)
    );
  END IF;
  UPDATE public.pragas_push_tokens
     SET token = p_token, expo_token = p_token, platform = p_platform,
         notifications_enabled = true, is_active = true,
         consented_at = CASE WHEN notifications_enabled AND is_active
           THEN consented_at ELSE v_now END,
         revoked_at = NULL, last_seen_at = v_now, updated_at = v_now
   WHERE user_id = v_user_id AND (token = p_token OR expo_token = p_token)
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    INSERT INTO public.pragas_push_tokens (
      user_id, token, expo_token, platform, notifications_enabled,
      is_active, consented_at, revoked_at, last_seen_at
    ) VALUES (
      v_user_id, p_token, p_token, p_platform, true, true, v_now, NULL, v_now
    ) RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object(
    'registered', true, 'revoked', false, 'platform', v_row.platform,
    'consented_at', v_row.consented_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.touch_pragas_push_token(text, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_pragas_push_token(text, text, boolean)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_pragas_ai_consent(
  p_purpose text,
  p_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_accepted timestamptz;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_purpose NOT IN ('diagnosis', 'chat') OR p_version <> '2026-07-14.1' THEN
    RAISE EXCEPTION 'invalid_pragas_ai_consent';
  END IF;
  IF NOT public.pragas_current_link_allows_access() THEN
    RAISE EXCEPTION 'pragas_app_link_inactive';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'pragas-ai-consent:' || v_user_id::text || ':' || p_purpose, 0
  ));
  INSERT INTO public.pragas_ai_consents (
    user_id, purpose, version, accepted_at, last_used_at, revoked_at
  ) VALUES (v_user_id, p_purpose, p_version, v_now, v_now, NULL)
  ON CONFLICT (user_id, purpose, version) DO UPDATE
    SET accepted_at = CASE
          WHEN public.pragas_ai_consents.revoked_at IS NULL
            THEN public.pragas_ai_consents.accepted_at ELSE v_now END,
        last_used_at = v_now,
        revoked_at = NULL
  RETURNING accepted_at INTO v_accepted;
  RETURN jsonb_build_object(
    'granted', true, 'purpose', p_purpose, 'version', p_version,
    'accepted_at', v_accepted
  );
END;
$$;
REVOKE ALL ON FUNCTION public.grant_pragas_ai_consent(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.grant_pragas_ai_consent(text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_pragas_ai_consent(p_purpose text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF p_purpose NOT IN ('diagnosis', 'chat') THEN
    RAISE EXCEPTION 'invalid_pragas_ai_consent_purpose';
  END IF;
  UPDATE public.pragas_ai_consents
     SET revoked_at = coalesce(revoked_at, v_now)
   WHERE user_id = v_user_id AND purpose = p_purpose;
  RETURN jsonb_build_object(
    'revoked', true, 'purpose', p_purpose, 'revoked_at', v_now
  );
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_pragas_ai_consent(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_pragas_ai_consent(text)
  TO authenticated;

DO $link_function_preflight$
DECLARE v_definition text;
BEGIN
  IF to_regprocedure('public.pragas_link_account()') IS NULL THEN RETURN; END IF;
  SELECT pg_get_functiondef('public.pragas_link_account()'::regprocedure)
    INTO v_definition;
  IF position('pragas_link_account_prod_compat_v1' IN v_definition) = 0
     AND position('pragas_link_account_prod_hotfix_v1' IN v_definition) = 0
     AND NOT (
       position('deleted_reactivation_required' IN v_definition) > 0
       AND position('public.pragas_app_links' IN v_definition) > 0
       AND position('public.pragas_deletion_jobs' IN v_definition) > 0
     )
  THEN
    RAISE EXCEPTION 'pragas_prod_compat_refuses_foreign_link_function';
  END IF;
END
$link_function_preflight$;

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
  IF NOT EXISTS (
    SELECT 1 FROM public.pragas_profiles WHERE user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'pragas_profile_link_failed';
  END IF;

  -- Never UPDATE an existing entitlement, including canceled/paid rows.
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
    'linked', true, 'app', 'rumo-pragas',
    'code', CASE WHEN v_already_linked THEN 'already_linked' ELSE 'linked' END
  );
END;
$pragas_link_account_prod_compat_v1$;
REVOKE ALL ON FUNCTION public.pragas_link_account()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pragas_link_account() TO authenticated;

CREATE OR REPLACE FUNCTION public.request_pragas_account_deletion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.pragas_deletion_jobs%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'invalid_deletion_identity'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('pragas-account:' || p_user_id::text, 0));
  SELECT * INTO v_job FROM public.pragas_deletion_jobs
   WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.pragas_deletion_jobs (user_id, status, next_attempt_at)
    VALUES (p_user_id, 'requested', v_now) RETURNING * INTO v_job;
  ELSIF v_job.status = 'reactivated' THEN
    UPDATE public.pragas_deletion_jobs
       SET status = 'requested', attempts = 0, last_error_code = NULL,
           next_attempt_at = v_now, requested_at = v_now,
           app_cleanup_completed_at = NULL, reactivated_at = NULL,
           reactivation_request_id = NULL, reactivation_idempotency_key = NULL,
           lease_token = NULL, lease_expires_at = NULL
     WHERE id = v_job.id RETURNING * INTO v_job;
  END IF;
  UPDATE public.pragas_app_links
     SET active = false, deactivated_at = coalesce(deactivated_at, v_now),
         last_linked_at = v_now
   WHERE user_id = p_user_id;
  RETURN jsonb_build_object(
    'id', v_job.id, 'status', v_job.status,
    'app_cleanup_completed_at', v_job.app_cleanup_completed_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.request_pragas_account_deletion(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_pragas_account_deletion(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_pragas_deletion_jobs(
  p_limit integer DEFAULT 25
)
RETURNS TABLE (
  id uuid, user_id uuid, attempts integer,
  lease_token uuid, lease_expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH candidates AS (
    SELECT job.id
      FROM public.pragas_deletion_jobs AS job
     WHERE (
       job.status IN ('requested', 'retry')
       AND job.next_attempt_at <= clock_timestamp()
     ) OR (
       job.status = 'processing'
       AND job.lease_expires_at <= clock_timestamp()
     )
     ORDER BY job.requested_at
     FOR UPDATE SKIP LOCKED
     LIMIT greatest(1, least(coalesce(p_limit, 25), 100))
  )
  UPDATE public.pragas_deletion_jobs AS job
     SET status = 'processing', attempts = job.attempts + 1,
         last_error_code = NULL, lease_token = gen_random_uuid(),
         lease_expires_at = clock_timestamp() + interval '10 minutes'
    FROM candidates
   WHERE job.id = candidates.id
  RETURNING job.id, job.user_id, job.attempts,
            job.lease_token, job.lease_expires_at
$$;
REVOKE ALL ON FUNCTION public.claim_pragas_deletion_jobs(integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_pragas_deletion_jobs(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_pragas_deletion_job(p_user_id uuid)
RETURNS TABLE (
  id uuid, user_id uuid, attempts integer,
  lease_token uuid, lease_expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.pragas_deletion_jobs AS job
     SET status = 'processing', attempts = job.attempts + 1,
         last_error_code = NULL, lease_token = gen_random_uuid(),
         lease_expires_at = clock_timestamp() + interval '10 minutes'
   WHERE job.user_id = p_user_id
     AND ((job.status IN ('requested', 'retry')
       AND job.next_attempt_at <= clock_timestamp())
       OR (job.status = 'processing'
         AND job.lease_expires_at <= clock_timestamp()))
  RETURNING job.id, job.user_id, job.attempts,
            job.lease_token, job.lease_expires_at
$$;
REVOKE ALL ON FUNCTION public.claim_pragas_deletion_job(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_pragas_deletion_job(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_pragas_deletion_job(
  p_job_id uuid, p_lease_token uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH completed AS (
    UPDATE public.pragas_deletion_jobs
       SET status = 'blocked_global_decision',
           app_cleanup_completed_at = coalesce(
             app_cleanup_completed_at, clock_timestamp()
           ),
           last_error_code = 'global_identity_and_unscoped_history_retained',
           lease_token = NULL, lease_expires_at = NULL
     WHERE id = p_job_id AND status = 'processing'
       AND lease_token = p_lease_token
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM completed)
$$;
REVOKE ALL ON FUNCTION public.complete_pragas_deletion_job(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_pragas_deletion_job(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.retry_pragas_deletion_job(
  p_job_id uuid, p_lease_token uuid, p_error_code text,
  p_next_attempt_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated integer;
BEGIN
  IF p_error_code !~ '^[a-z0-9_]{1,100}$'
     OR p_next_attempt_at < clock_timestamp()
     OR p_next_attempt_at > clock_timestamp() + interval '2 days'
  THEN
    RAISE EXCEPTION 'invalid_deletion_retry';
  END IF;
  UPDATE public.pragas_deletion_jobs
     SET status = 'retry', last_error_code = p_error_code,
         next_attempt_at = p_next_attempt_at,
         lease_token = NULL, lease_expires_at = NULL
   WHERE id = p_job_id AND status = 'processing'
     AND lease_token = p_lease_token;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.retry_pragas_deletion_job(
  uuid, uuid, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.retry_pragas_deletion_job(
  uuid, uuid, text, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_pragas_user_rows(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_table text;
  v_count bigint;
  v_deleted jsonb := '{}'::jsonb;
  v_owned_tokens text[] := ARRAY[]::text[];
  v_token text;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'invalid_cleanup_identity'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('pragas-account:' || p_user_id::text, 0));
  IF to_regclass('public.pragas_notification_queue') IS NOT NULL THEN
    SELECT coalesce(
      array_agg(DISTINCT candidate.token_value ORDER BY candidate.token_value),
      ARRAY[]::text[]
    ) INTO v_owned_tokens
    FROM (
      SELECT token AS token_value FROM public.pragas_push_tokens
       WHERE user_id = p_user_id AND token IS NOT NULL
      UNION
      SELECT expo_token FROM public.pragas_push_tokens
       WHERE user_id = p_user_id AND expo_token IS NOT NULL
    ) AS candidate;
    FOREACH v_token IN ARRAY v_owned_tokens LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('pragas-push-token:' || v_token, 0));
    END LOOP;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns AS column_info
       WHERE column_info.table_schema = 'public'
         AND column_info.table_name = 'pragas_notification_queue'
         AND column_info.column_name = 'owner_user_id'
         AND column_info.udt_name = 'uuid'
         AND column_info.is_nullable = 'NO'
    ) THEN
      RAISE EXCEPTION 'pragas_notification_queue_owner_schema_mismatch';
    END IF;
    DELETE FROM public.pragas_notification_queue
     WHERE owner_user_id = p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object('pragas_notification_queue', v_count);
  END IF;
  FOREACH v_table IN ARRAY ARRAY[
    'pragas_reply_likes', 'pragas_post_replies', 'pragas_post_comments',
    'pragas_post_likes', 'pragas_community_likes', 'pragas_community_posts',
    'pragas_outbreak_confirmations', 'pragas_outbreaks',
    'pragas_diagnosis_feedback', 'pragas_diagnosis_usage',
    'pragas_chat_messages', 'pragas_ai_content_reports', 'pragas_ai_consents',
    'pragas_ai_idempotency_records', 'pragas_location_consent_decisions',
    'pragas_analytics', 'pragas_error_logs', 'pragas_api_rate_limit_events',
    'pragas_api_rate_limit_counters', 'pragas_diagnoses', 'pragas_push_tokens',
    'pragas_subscriptions', 'pragas_user_preferences', 'pragas_app_links'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = v_table
         AND column_name = 'user_id'
    ) THEN
      RAISE EXCEPTION 'pragas_cleanup_schema_mismatch_%', v_table;
    END IF;
    EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', v_table)
      USING p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object(v_table, v_count);
  END LOOP;
  DELETE FROM public.subscriptions
   WHERE user_id = p_user_id AND app = 'rumo-pragas';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('subscriptions', v_count);
  DELETE FROM public.chat_usage
   WHERE user_id = p_user_id AND app = 'rumo-pragas';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('chat_usage', v_count);
  DELETE FROM public.analytics_events
   WHERE user_id = p_user_id AND app = 'rumo-pragas';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('analytics_events', v_count);
  DELETE FROM public.audit_log
   WHERE user_id = p_user_id AND app = 'rumo-pragas';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('audit_log', v_count);
  DELETE FROM public.pragas_profiles WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('pragas_profiles', v_count);
  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'retained_shared_unscoped',
    jsonb_build_array('analytics_events', 'audit_log', 'user_preferences')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_pragas_user_rows(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_pragas_user_rows(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.reactivate_pragas_account(
  p_user_id uuid,
  p_request_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.pragas_deletion_jobs%ROWTYPE;
  v_full_name text;
  v_now timestamptz := clock_timestamp();
  v_was_reactivated boolean;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'invalid_reactivation_request';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('pragas-account:' || p_user_id::text, 0));
  SELECT * INTO v_job FROM public.pragas_deletion_jobs
   WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reactivation_not_required'; END IF;
  IF v_job.status IN ('requested', 'processing', 'retry') THEN
    RAISE EXCEPTION 'deletion_pending';
  END IF;
  IF v_job.status NOT IN ('blocked_global_decision', 'reactivated') THEN
    RAISE EXCEPTION 'invalid_reactivation_state';
  END IF;
  IF v_job.status = 'reactivated'
     AND (v_job.reactivation_request_id IS DISTINCT FROM p_request_id
       OR v_job.reactivation_idempotency_key IS DISTINCT FROM p_idempotency_key)
  THEN
    RAISE EXCEPTION 'reactivation_idempotency_conflict';
  END IF;
  v_was_reactivated := v_job.status = 'reactivated';
  SELECT left(NULLIF(btrim(raw_user_meta_data ->> 'full_name'), ''), 200)
    INTO v_full_name FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'auth_identity_not_found'; END IF;

  INSERT INTO public.pragas_profiles (user_id, full_name)
  VALUES (p_user_id, v_full_name) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.subscriptions (user_id, plan, status, provider, app)
  VALUES (p_user_id, 'free', 'active', 'free', 'rumo-pragas')
  ON CONFLICT (user_id, app) DO NOTHING;
  INSERT INTO public.pragas_app_links (
    user_id, link_version, active, linked_at, last_linked_at, deactivated_at
  ) VALUES (p_user_id, '2026-07-14.1', true, v_now, v_now, NULL)
  ON CONFLICT (user_id) DO UPDATE
    SET link_version = EXCLUDED.link_version, active = true,
        last_linked_at = v_now, deactivated_at = NULL;
  UPDATE public.pragas_deletion_jobs
     SET status = 'reactivated', reactivated_at = coalesce(reactivated_at, v_now),
         reactivation_request_id = coalesce(reactivation_request_id, p_request_id),
         reactivation_idempotency_key = coalesce(
           reactivation_idempotency_key, p_idempotency_key
         ),
         last_error_code = NULL, next_attempt_at = v_now,
         lease_token = NULL, lease_expires_at = NULL
   WHERE user_id = p_user_id;
  RETURN jsonb_build_object(
    'reactivated', true, 'already_reactivated', v_was_reactivated,
    'data_restored', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.reactivate_pragas_account(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reactivate_pragas_account(uuid, uuid, uuid)
  TO service_role;

-- Private avatar bucket: creation only. A pre-existing drift is rejected, not
-- silently rewritten, so a public bucket can never be normalized unnoticed.
DO $avatar_bucket$
DECLARE
  v_public boolean;
  v_limit bigint;
  v_mimes text[];
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'pragas_avatar_storage_schema_missing';
  END IF;
  SELECT public, file_size_limit, allowed_mime_types
    INTO v_public, v_limit, v_mimes
    FROM storage.buckets WHERE id = 'pragas-avatars';
  IF FOUND THEN
    IF v_public IS DISTINCT FROM false OR v_limit IS DISTINCT FROM 2097152
       OR v_mimes IS DISTINCT FROM ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
    THEN
      RAISE EXCEPTION 'pragas_avatar_bucket_contract_mismatch';
    END IF;
  ELSE
    INSERT INTO storage.buckets (
      id, name, public, file_size_limit, allowed_mime_types
    ) VALUES (
      'pragas-avatars', 'pragas-avatars', false, 2097152,
      ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
    );
  END IF;
END
$avatar_bucket$;

DROP POLICY IF EXISTS pragas_avatars_select_own ON storage.objects;
CREATE POLICY pragas_avatars_select_own
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pragas-avatars'
    AND public.pragas_current_link_allows_access()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
DROP POLICY IF EXISTS pragas_avatars_insert_own ON storage.objects;
CREATE POLICY pragas_avatars_insert_own
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pragas-avatars'
    AND public.pragas_current_link_allows_access()
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND name ~ ('^' || auth.uid()::text
      || '/avatar-[A-Za-z0-9-]{1,80}[.](jpg|jpeg|png|webp)$')
  );
DROP POLICY IF EXISTS pragas_avatars_update_own ON storage.objects;
CREATE POLICY pragas_avatars_update_own
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'pragas-avatars'
    AND public.pragas_current_link_allows_access()
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'pragas-avatars'
    AND public.pragas_current_link_allows_access()
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND name ~ ('^' || auth.uid()::text
      || '/avatar-[A-Za-z0-9-]{1,80}[.](jpg|jpeg|png|webp)$')
  );
DROP POLICY IF EXISTS pragas_avatars_delete_own ON storage.objects;
CREATE POLICY pragas_avatars_delete_own
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pragas-avatars'
    AND public.pragas_current_link_allows_access()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Remove default broad ACLs from Pragas-owned tables, then restore only the
-- authenticated operations used by current and legacy clients. Shared tables
-- (subscriptions/analytics/audit/chat_usage) are intentionally untouched.
REVOKE ALL ON TABLE public.pragas_profiles FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.pragas_diagnoses FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.pragas_diagnosis_feedback FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.pragas_push_tokens FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.pragas_profiles TO authenticated;
REVOKE UPDATE ON TABLE public.pragas_profiles FROM authenticated;
GRANT UPDATE (
  full_name, city, state, phone, crops, avatar_path, avatar_url
) ON TABLE public.pragas_profiles TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.pragas_diagnoses TO authenticated;
GRANT SELECT, INSERT ON TABLE public.pragas_diagnosis_feedback TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_push_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_diagnoses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_diagnosis_feedback
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pragas_push_tokens TO service_role;

DO $$
BEGIN
  IF to_regclass('public.pragas_push_notifications') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.pragas_push_notifications
      FROM PUBLIC, anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE public.pragas_push_notifications TO service_role;
  END IF;
  IF to_regclass('public.pragas_notification_queue') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.pragas_notification_queue
      FROM PUBLIC, anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE public.pragas_notification_queue TO service_role;
  END IF;
END
$$;

DO $legacy_chat_usage_acl$
DECLARE v_signature regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    to_regprocedure('public.get_chat_usage_count(uuid,text)'),
    to_regprocedure('public.increment_chat_usage(uuid,text)')
  ]
  LOOP
    IF v_signature IS NULL THEN CONTINUE; END IF;
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      v_signature
    );
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
  END LOOP;
END
$legacy_chat_usage_acl$;

COMMENT ON TABLE public.pragas_app_links IS
  'Explicit Rumo Pragas app-entry ledger; generated profile ids are preserved.';
COMMENT ON TABLE public.pragas_deletion_jobs IS
  'App-scoped cleanup queue; global shared identity deletion remains externally gated.';

COMMIT;
