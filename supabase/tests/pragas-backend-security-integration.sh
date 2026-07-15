#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="pragas-backend-security-$RANDOM"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql_file() {
  docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres < "$repo_root/$1"
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

docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE
AS $$ SELECT current_user::text $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$$;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL REFERENCES storage.buckets(id),
  name text NOT NULL
);
CREATE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN array_length(string_to_array(name, '/'), 1) > 1
      THEN (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
    ELSE ARRAY[]::text[]
  END
$$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
SQL

psql_file supabase/migrations/20260317123844_init_schema.sql
psql_file supabase/migrations/20260317154500_fix_trigger.sql
psql_file supabase/migrations/20260317155000_fix_trigger_v2.sql
psql_file supabase/migrations/20260317155500_fix_trigger_v3.sql
psql_file supabase/migrations/20260407000000_analytics_and_subscription_improvements.sql
psql_file supabase/migrations/20260414000000_user_preferences_lgpd.sql
psql_file supabase/migrations/20260627120000_pragas_push_notifications.sql
# PostgreSQL 17 removed the implicit array coercion relied on by the already
# applied 202606 migration. Keep that historical file byte-for-byte immutable
# and supply the old coercion only inside this disposable replay fixture.
docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
CREATE FUNCTION public.pg17_fixture_name_text_array_eq(name[], text[])
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT
AS $$
  SELECT array_to_string($1::text[], E'\x1f') OPERATOR(pg_catalog.=)
         array_to_string($2, E'\x1f')
$$;
CREATE OPERATOR public.= (
  LEFTARG = name[], RIGHTARG = text[],
  FUNCTION = public.pg17_fixture_name_text_array_eq
);
SQL
psql_file supabase/migrations/20260628120000_subscriptions_per_app_isolation.sql
docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
DROP OPERATOR public.= (name[], text[]);
DROP FUNCTION public.pg17_fixture_name_text_array_eq(name[], text[]);
SQL
psql_file supabase/migrations/20260628130000_pragas_chat_usage_counter.sql

docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-4111-8111-111111111111', 'first@example.test', '{"full_name":"First"}'),
  ('22222222-2222-4222-8222-222222222222', 'second@example.test', '{"full_name":"Second"}');

INSERT INTO public.pragas_diagnoses (
  id, user_id, crop, pest_name, location_lat, location_lng
) VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '11111111-1111-4111-8111-111111111111',
    'soja', 'Lagarta', -23.55052, -46.63331
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    '22222222-2222-4222-8222-222222222222',
    'milho', 'Percevejo', NULL, NULL
  );

INSERT INTO public.user_preferences (
  user_id, share_location, share_location_purpose, consented_at
) VALUES (
  '11111111-1111-4111-8111-111111111111', true,
  'Aprimorar o diagnóstico regional', clock_timestamp()
);

-- This sibling trigger proves that the new migration removes only functions
-- whose own body is Pragas-specific.
CREATE TABLE auth.sibling_signup_events (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
CREATE FUNCTION public.sibling_handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO auth.sibling_signup_events (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER sibling_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sibling_handle_new_user();

CREATE TABLE public.pragas_diagnosis_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  diagnosis_id uuid NOT NULL REFERENCES public.pragas_diagnoses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  feedback text,
  comment text,
  pest_id text
);
ALTER TABLE public.pragas_diagnosis_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_read_everything
  ON public.pragas_diagnosis_feedback FOR SELECT TO authenticated USING (true);
CREATE POLICY legacy_write_everything
  ON public.pragas_diagnosis_feedback FOR INSERT TO authenticated WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pragas_diagnosis_feedback TO authenticated;

INSERT INTO public.pragas_diagnosis_feedback (
  user_id, diagnosis_id, feedback, comment, pest_id
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'incorrect',
  'Parecia outra praga',
  'pest-alternativa'
);

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'pragas_reply_likes', 'pragas_post_replies', 'pragas_post_comments',
    'pragas_post_likes', 'pragas_community_likes', 'pragas_community_posts',
    'pragas_outbreak_confirmations', 'pragas_outbreaks',
    'pragas_diagnosis_usage', 'pragas_chat_messages', 'pragas_analytics',
    'pragas_error_logs', 'pragas_push_tokens', 'pragas_subscriptions'
  ] LOOP
    EXECUTE format(
      'CREATE TABLE public.%I ('
      || 'id uuid PRIMARY KEY DEFAULT gen_random_uuid(), '
      || 'user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE)',
      v_table
    );
  END LOOP;
END
$$;

CREATE TABLE public.pragas_notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL,
  title text,
  body text,
  data jsonb,
  sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Reproduce a pre-existing split profile identity. The candidate may retain
-- the row for explicit remediation, but neither RLS nor app linking may treat
-- it as a valid profile for either UUID.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('77777777-7777-4777-8777-777777777777', 'split-row@example.test', '{}'),
  ('88888888-8888-4888-8888-888888888888', 'split-owner@example.test', '{}');
ALTER TABLE public.pragas_profiles ADD COLUMN user_id uuid;
DELETE FROM public.pragas_profiles
 WHERE id = '88888888-8888-4888-8888-888888888888';
UPDATE public.pragas_profiles
   SET user_id = '88888888-8888-4888-8888-888888888888'
 WHERE id = '77777777-7777-4777-8777-777777777777';

-- Reproduce an interrupted development migration: the enum and queue exist,
-- but the enum contains only one state and the later lease/reactivation
-- columns do not. The production migration must normalize this in one PG17
-- transaction without ALTER TYPE/unsafe-new-enum-value behavior.
CREATE TYPE public.pragas_deletion_job_status AS ENUM ('requested');
CREATE TABLE public.pragas_deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.pragas_deletion_job_status NOT NULL DEFAULT 'requested',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code text,
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  app_cleanup_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
SQL

psql_file supabase/migrations/20260714143000_pragas_backend_security.sql
psql_file supabase/migrations/20260714143000_pragas_backend_security.sql
psql_file supabase/migrations/20260714150000_pragas_export_consistency.sql
psql_file supabase/migrations/20260714150000_pragas_export_consistency.sql

docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
DO $$
DECLARE
  v_feedback record;
  v_policies text[];
  v_first jsonb;
  v_replay jsonb;
  v_second jsonb;
  v_denied jsonb;
  v_reservation jsonb;
  v_result jsonb;
  v_scrubbed integer;
  v_lease_token uuid;
  v_reclaimed_lease_token uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'pragas_deletion_jobs'
       AND column_name = 'status'
       AND data_type = 'text'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.pragas_deletion_jobs'::regclass
       AND conname = 'pragas_deletion_jobs_status_check'
       AND pg_get_constraintdef(oid) LIKE '%requested%'
       AND pg_get_constraintdef(oid) LIKE '%processing%'
       AND pg_get_constraintdef(oid) LIKE '%retry%'
       AND pg_get_constraintdef(oid) LIKE '%blocked_global_decision%'
       AND pg_get_constraintdef(oid) LIKE '%reactivated%'
  ) OR (
    SELECT array_agg(enumlabel::text ORDER BY enumsortorder)
      FROM pg_enum
     WHERE enumtypid = 'public.pragas_deletion_job_status'::regtype
  ) <> ARRAY['requested']::text[]
  THEN
    RAISE EXCEPTION 'partial_enum_replay_not_normalized_safely';
  END IF;

  SELECT verdict, selected_alternative, notes, feedback, comment, pest_id
    INTO v_feedback
    FROM public.pragas_diagnosis_feedback
   WHERE user_id = '11111111-1111-4111-8111-111111111111';
  IF v_feedback.verdict <> 'incorrect'
     OR v_feedback.selected_alternative <> 'pest-alternativa'
     OR v_feedback.notes <> 'Parecia outra praga'
     OR v_feedback.feedback <> 'incorrect'
     OR v_feedback.comment <> 'Parecia outra praga'
     OR v_feedback.pest_id <> 'pest-alternativa'
  THEN
    RAISE EXCEPTION 'legacy_feedback_backfill_failed';
  END IF;

  SELECT array_agg(policyname ORDER BY policyname)
    INTO v_policies
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'pragas_diagnosis_feedback';
  IF v_policies <> ARRAY[
    'pragas_active_link_restrict', 'pragas_diagnosis_feedback_own'
  ] THEN
    RAISE EXCEPTION 'feedback_policy_drift_not_removed: %', v_policies;
  END IF;

  IF has_table_privilege('authenticated', 'public.pragas_ai_content_reports', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pragas_diagnosis_feedback', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pragas_user_preferences', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pragas_user_preferences', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.pragas_user_preferences', 'DELETE')
     OR NOT has_table_privilege('authenticated', 'public.pragas_user_preferences', 'SELECT')
  THEN
    RAISE EXCEPTION 'direct_edge_bypass_grant_present';
  END IF;
  IF coalesce(has_function_privilege(
    'authenticated', to_regprocedure(
      'public.consume_pragas_api_rate_limit(uuid,text,integer,integer,uuid)'
    ), 'EXECUTE'
  ), false) OR coalesce(has_function_privilege(
    'service_role', to_regprocedure(
      'public.consume_pragas_api_rate_limit(uuid,text,integer,integer,uuid)'
    ), 'EXECUTE'
  ), false) OR NOT has_function_privilege(
    'service_role',
    'public.consume_pragas_api_rate_limit(uuid,text,integer,integer,uuid,text)',
    'EXECUTE'
  ) OR coalesce(has_function_privilege(
    'authenticated', to_regprocedure('public.consume_pragas_mcp_rate_limit(uuid)'), 'EXECUTE'
  ), false)
  OR NOT has_function_privilege(
    'authenticated', 'public.consume_pragas_mcp_rate_limit(uuid,text)', 'EXECUTE'
  ) OR coalesce(has_function_privilege(
    'anon', to_regprocedure('public.consume_pragas_mcp_rate_limit(uuid)'), 'EXECUTE'
  ), false)
  OR NOT has_function_privilege(
    'authenticated', 'public.grant_pragas_ai_consent(text,text)', 'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated', 'public.revoke_pragas_ai_consent(text)', 'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated', 'public.touch_pragas_push_token(text,text,boolean)', 'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.set_pragas_location_consent(uuid,boolean,text,timestamp with time zone,bigint)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.set_pragas_location_consent(uuid,boolean,text,timestamp with time zone,bigint)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated', 'public.record_pragas_ai_consent(uuid,text,text)', 'EXECUTE'
  ) OR has_function_privilege(
    'authenticated', 'public.record_pragas_analytics_events(uuid,jsonb)', 'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role', 'public.record_pragas_analytics_events(uuid,jsonb)', 'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.export_pragas_notification_queue_snapshot(uuid,timestamp with time zone,integer)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.export_pragas_notification_queue_snapshot(uuid,timestamp with time zone,integer)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.export_pragas_notification_queue_snapshot(uuid,timestamp with time zone,integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'rate_limit_rpc_grant_failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
     WHERE id = 'pragas-avatars'
       AND public IS FALSE
       AND file_size_limit = 2097152
       AND allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  ) OR (
    SELECT array_agg(policyname::text ORDER BY policyname::text)
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND policyname LIKE 'pragas_avatars_%'
  ) <> ARRAY[
    'pragas_avatars_delete_own', 'pragas_avatars_insert_own',
    'pragas_avatars_select_own', 'pragas_avatars_update_own'
  ]::text[] THEN
    RAISE EXCEPTION 'private_avatar_bucket_or_policies_failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'on_auth_user_created'
       AND tgrelid = 'auth.users'::regclass
       AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'sibling_on_auth_user_created'
       AND tgrelid = 'auth.users'::regclass
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'shared_auth_trigger_was_mutated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pragas_user_preferences
     WHERE user_id = '11111111-1111-4111-8111-111111111111'
       AND share_location IS FALSE
       AND share_location_purpose IS NULL
       AND consented_at IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.user_preferences
     WHERE user_id = '11111111-1111-4111-8111-111111111111'
       AND share_location IS TRUE
  ) THEN
    RAISE EXCEPTION 'dedicated_preferences_backfill_failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pragas_diagnoses
     WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
       AND location_lat = -23.55052
       AND location_lng = -46.63331
  ) OR EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pragas_diagnoses'::regclass
       AND conname IN (
         'pragas_diagnoses_location_range_check',
         'pragas_diagnoses_location_precision_check'
       )
       AND convalidated
  ) THEN
    RAISE EXCEPTION 'historical_location_was_changed_or_constraint_validated';
  END IF;

  v_first := public.consume_pragas_api_rate_limit(
    '11111111-1111-4111-8111-111111111111', 'diagnose', 2, 3600,
    '10000000-0000-4000-8000-000000000001', repeat('a', 64)
  );
  v_replay := public.consume_pragas_api_rate_limit(
    '11111111-1111-4111-8111-111111111111', 'diagnose', 2, 3600,
    '10000000-0000-4000-8000-000000000001', repeat('a', 64)
  );
  v_second := public.consume_pragas_api_rate_limit(
    '11111111-1111-4111-8111-111111111111', 'diagnose', 2, 3600,
    '10000000-0000-4000-8000-000000000001', repeat('b', 64)
  );
  v_denied := public.consume_pragas_api_rate_limit(
    '11111111-1111-4111-8111-111111111111', 'diagnose', 2, 3600,
    '10000000-0000-4000-8000-000000000002', repeat('a', 64)
  );
  IF (v_first ->> 'allowed')::boolean IS NOT TRUE
     OR (v_first ->> 'replayed')::boolean IS NOT FALSE
     OR (v_replay ->> 'allowed')::boolean IS NOT TRUE
     OR (v_replay ->> 'replayed')::boolean IS NOT TRUE
     OR (v_second ->> 'allowed')::boolean IS NOT FALSE
     OR (v_second ->> 'conflict')::boolean IS NOT TRUE
     OR (v_denied ->> 'allowed')::boolean IS NOT FALSE
     OR (SELECT request_count FROM public.pragas_api_rate_limit_counters
          WHERE user_id = '11111111-1111-4111-8111-111111111111'
            AND scope = 'diagnose') <> 3
  THEN
    RAISE EXCEPTION 'rate_limit_hash_binding_or_replay_budget_failed';
  END IF;

  v_result := public.record_pragas_ai_consent(
    '11111111-1111-4111-8111-111111111111', 'diagnosis', '2026-07-14.1'
  );
  IF (v_result ->> 'accepted')::boolean IS NOT FALSE OR EXISTS (
    SELECT 1 FROM public.pragas_ai_consents
     WHERE user_id = '11111111-1111-4111-8111-111111111111'
       AND purpose = 'diagnosis'
       AND version = '2026-07-14.1'
  ) THEN
    RAISE EXCEPTION 'stale_header_unexpectedly_granted_ai_consent';
  END IF;

  -- Lost response/concurrency: a second request sees in_progress and cannot
  -- call the provider. Completion then makes every replay return cached output.
  v_reservation := public.reserve_pragas_ai_idempotency(
    '11111111-1111-4111-8111-111111111111', 'diagnosis',
    '50000000-0000-4000-8000-000000000001', repeat('a', 64)
  );
  IF v_reservation ->> 'state' <> 'reserved' THEN
    RAISE EXCEPTION 'idempotency_initial_reservation_failed';
  END IF;
  v_lease_token := (v_reservation ->> 'lease_token')::uuid;
  v_reservation := public.reserve_pragas_ai_idempotency(
    '11111111-1111-4111-8111-111111111111', 'diagnosis',
    '50000000-0000-4000-8000-000000000001', repeat('a', 64)
  );
  IF v_reservation ->> 'state' <> 'in_progress' THEN
    RAISE EXCEPTION 'idempotency_concurrent_request_not_blocked';
  END IF;
  v_reservation := public.reserve_pragas_ai_idempotency(
    '11111111-1111-4111-8111-111111111111', 'diagnosis',
    '50000000-0000-4000-8000-000000000001', repeat('b', 64)
  );
  IF v_reservation ->> 'state' <> 'conflict' THEN
    RAISE EXCEPTION 'idempotency_payload_conflict_not_blocked';
  END IF;
  IF NOT public.mark_pragas_ai_provider_started(
    '11111111-1111-4111-8111-111111111111', 'diagnosis',
    '50000000-0000-4000-8000-000000000001', repeat('a', 64), v_lease_token
  ) THEN
    RAISE EXCEPTION 'idempotency_provider_boundary_not_marked';
  END IF;
  PERFORM public.complete_pragas_ai_idempotency(
    '11111111-1111-4111-8111-111111111111', 'diagnosis',
    '50000000-0000-4000-8000-000000000001', repeat('a', 64),
    v_lease_token, 200, '{"diagnosis":"cached"}'::jsonb, 86400
  );
  v_reservation := public.reserve_pragas_ai_idempotency(
    '11111111-1111-4111-8111-111111111111', 'diagnosis',
    '50000000-0000-4000-8000-000000000001', repeat('a', 64)
  );
  IF v_reservation ->> 'state' <> 'completed'
     OR v_reservation #>> '{response_body,diagnosis}' <> 'cached'
  THEN
    RAISE EXCEPTION 'idempotency_completed_replay_failed';
  END IF;
  UPDATE public.pragas_ai_idempotency_records
     SET response_expires_at = clock_timestamp() - interval '1 second'
   WHERE user_id = '11111111-1111-4111-8111-111111111111'
     AND scope = 'diagnosis'
     AND idempotency_key = '50000000-0000-4000-8000-000000000001';
  v_scrubbed := public.scrub_expired_pragas_ai_idempotency(100);
  IF v_scrubbed <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.pragas_ai_idempotency_records
     WHERE user_id = '11111111-1111-4111-8111-111111111111'
       AND scope = 'diagnosis'
       AND idempotency_key = '50000000-0000-4000-8000-000000000001'
       AND state = 'expired'
       AND response_body IS NULL
       AND response_status IS NULL
  ) THEN
    SELECT to_jsonb(record)
      INTO v_result
      FROM public.pragas_ai_idempotency_records AS record
     WHERE record.user_id = '11111111-1111-4111-8111-111111111111'
       AND record.scope = 'diagnosis'
       AND record.idempotency_key = '50000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'expired_idempotency_content_not_scrubbed count=% row=%',
      v_scrubbed, v_result;
  END IF;
  v_reservation := public.reserve_pragas_ai_idempotency(
    '11111111-1111-4111-8111-111111111111', 'diagnosis',
    '50000000-0000-4000-8000-000000000001', repeat('a', 64)
  );
  IF v_reservation ->> 'state' <> 'expired' THEN
    RAISE EXCEPTION 'expired_tombstone_was_reusable';
  END IF;

  v_reservation := public.reserve_pragas_ai_idempotency(
    '11111111-1111-4111-8111-111111111111', 'chat',
    '50000000-0000-4000-8000-000000000002', repeat('c', 64)
  );
  v_lease_token := (v_reservation ->> 'lease_token')::uuid;
  IF v_reservation ->> 'state' <> 'reserved' OR NOT public.release_pragas_ai_idempotency(
    '11111111-1111-4111-8111-111111111111', 'chat',
    '50000000-0000-4000-8000-000000000002', repeat('c', 64), v_lease_token
  ) THEN
    RAISE EXCEPTION 'idempotency_safe_pre_provider_release_failed';
  END IF;

  -- Crash before provider start: the expired lease is reclaimable, its token
  -- rotates, and the stale worker can no longer release the new reservation.
  v_reservation := public.reserve_pragas_ai_idempotency(
    '11111111-1111-4111-8111-111111111111', 'chat',
    '50000000-0000-4000-8000-000000000003', repeat('d', 64)
  );
  v_lease_token := (v_reservation ->> 'lease_token')::uuid;
  UPDATE public.pragas_ai_idempotency_records
     SET lease_expires_at = clock_timestamp() - interval '1 second'
   WHERE user_id = '11111111-1111-4111-8111-111111111111'
     AND scope = 'chat'
     AND idempotency_key = '50000000-0000-4000-8000-000000000003';
  v_reservation := public.reserve_pragas_ai_idempotency(
    '11111111-1111-4111-8111-111111111111', 'chat',
    '50000000-0000-4000-8000-000000000003', repeat('d', 64)
  );
  v_reclaimed_lease_token := (v_reservation ->> 'lease_token')::uuid;
  IF v_reservation ->> 'state' <> 'reserved'
     OR (v_reservation ->> 'reclaimed')::boolean IS NOT TRUE
     OR v_reclaimed_lease_token = v_lease_token
     OR public.release_pragas_ai_idempotency(
       '11111111-1111-4111-8111-111111111111', 'chat',
       '50000000-0000-4000-8000-000000000003', repeat('d', 64), v_lease_token
     )
     OR NOT public.release_pragas_ai_idempotency(
       '11111111-1111-4111-8111-111111111111', 'chat',
       '50000000-0000-4000-8000-000000000003', repeat('d', 64),
       v_reclaimed_lease_token
     )
  THEN
    RAISE EXCEPTION 'idempotency_pre_provider_reclaim_token_failed';
  END IF;

  -- Crash after the provider boundary: expiry becomes a scrubbed, terminal
  -- unknown outcome. The key can never reserve another provider execution.
  v_reservation := public.reserve_pragas_ai_idempotency(
    '11111111-1111-4111-8111-111111111111', 'chat',
    '50000000-0000-4000-8000-000000000004', repeat('e', 64)
  );
  v_lease_token := (v_reservation ->> 'lease_token')::uuid;
  IF NOT public.mark_pragas_ai_provider_started(
    '11111111-1111-4111-8111-111111111111', 'chat',
    '50000000-0000-4000-8000-000000000004', repeat('e', 64), v_lease_token
  ) THEN
    RAISE EXCEPTION 'idempotency_crash_provider_boundary_not_marked';
  END IF;
  UPDATE public.pragas_ai_idempotency_records
     SET lease_expires_at = clock_timestamp() - interval '1 second'
   WHERE user_id = '11111111-1111-4111-8111-111111111111'
     AND scope = 'chat'
     AND idempotency_key = '50000000-0000-4000-8000-000000000004';
  v_reservation := public.reserve_pragas_ai_idempotency(
    '11111111-1111-4111-8111-111111111111', 'chat',
    '50000000-0000-4000-8000-000000000004', repeat('e', 64)
  );
  IF v_reservation ->> 'state' <> 'unknown_outcome' OR NOT EXISTS (
    SELECT 1 FROM public.pragas_ai_idempotency_records
     WHERE user_id = '11111111-1111-4111-8111-111111111111'
       AND scope = 'chat'
       AND idempotency_key = '50000000-0000-4000-8000-000000000004'
       AND state = 'unknown_outcome'
       AND lease_token IS NULL
       AND lease_expires_at IS NULL
       AND response_body IS NULL
       AND response_status IS NULL
       AND unknown_outcome_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'idempotency_post_provider_crash_not_terminal';
  END IF;
END
$$;

-- Establish the app link before exercising the authenticated location-consent
-- RPC. Both logical clients below observed revision 0.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
DO $$
DECLARE
  v_link jsonb;
BEGIN
  v_link := public.pragas_link_account();
  IF v_link ->> 'code' <> 'linked' THEN
    RAISE EXCEPTION 'location_consent_link_failed: %', v_link;
  END IF;
END
$$;
COMMIT;

-- Distributed consent CAS: the withdrawal reaches the server first and
-- advances even though the row was already false. The delayed grant carrying
-- observed revision 0 is rejected. A new grant after reading revision 1 works.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
DO $$
DECLARE
  v_withdrawal jsonb;
  v_replay jsonb;
  v_stale_grant jsonb;
  v_regrant jsonb;
BEGIN
  v_withdrawal := public.set_pragas_location_consent(
    '61000000-0000-4000-8000-000000000002', false,
    'rumo-pragas:approximate-location:open-meteo+diagnosis-context:2026-07-14.1',
    '2026-07-14T14:00:00Z', 0
  );
  IF (v_withdrawal ->> 'applied')::boolean IS NOT TRUE
     OR (v_withdrawal ->> 'current_revision')::bigint <> 1
  THEN
    RAISE EXCEPTION 'location_withdrawal_did_not_advance_revision: %', v_withdrawal;
  END IF;

  v_replay := public.set_pragas_location_consent(
    '61000000-0000-4000-8000-000000000002', false,
    'rumo-pragas:approximate-location:open-meteo+diagnosis-context:2026-07-14.1',
    '2026-07-14T14:00:00Z', 0
  );
  IF (v_replay ->> 'replayed')::boolean IS NOT TRUE
     OR (v_replay ->> 'current_revision')::bigint <> 1
  THEN
    RAISE EXCEPTION 'location_withdrawal_replay_not_idempotent: %', v_replay;
  END IF;

  v_stale_grant := public.set_pragas_location_consent(
    '61000000-0000-4000-8000-000000000001', true,
    'rumo-pragas:approximate-location:open-meteo+diagnosis-context:2026-07-14.1',
    '2026-07-14T13:00:00Z', 0
  );
  IF (v_stale_grant ->> 'applied')::boolean IS NOT FALSE
     OR v_stale_grant ->> 'code' <> 'stale_grant'
     OR (v_stale_grant ->> 'current_revision')::bigint <> 1
  THEN
    RAISE EXCEPTION 'delayed_location_grant_was_not_rejected: %', v_stale_grant;
  END IF;

  v_regrant := public.set_pragas_location_consent(
    '61000000-0000-4000-8000-000000000003', true,
    'rumo-pragas:approximate-location:open-meteo+diagnosis-context:2026-07-14.1',
    '2026-07-14T15:00:00Z', 1
  );
  IF (v_regrant ->> 'applied')::boolean IS NOT TRUE
     OR (v_regrant ->> 'current_revision')::bigint <> 2
  THEN
    RAISE EXCEPTION 'fresh_location_regrant_failed: %', v_regrant;
  END IF;
END
$$;
COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pragas_user_preferences
     WHERE user_id = '11111111-1111-4111-8111-111111111111'
       AND share_location IS TRUE
       AND location_consent_revision = 2
  ) OR (
    SELECT count(*) FROM public.pragas_location_consent_decisions
     WHERE user_id = '11111111-1111-4111-8111-111111111111'
  ) <> 3 THEN
    RAISE EXCEPTION 'location_consent_cas_final_state_failed';
  END IF;
END
$$;

-- The per-user ledger is a bounded 256-decision idempotency/audit window.
-- Pruning an old grant cannot make it fresh (its observed revision is stable),
-- while replaying a pruned withdrawal remains safely idempotent in effect.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
DO $$
DECLARE
  v_index integer;
  v_result jsonb;
BEGIN
  FOR v_index IN 1..260 LOOP
    v_result := public.set_pragas_location_consent(
      ('62000000-0000-4000-8000-' || lpad(v_index::text, 12, '0'))::uuid,
      true,
      'rumo-pragas:approximate-location:open-meteo+diagnosis-context:2026-07-14.1',
      '2026-07-14T15:30:00Z',
      0
    );
    IF v_result ->> 'code' <> 'stale_grant' THEN
      RAISE EXCEPTION 'location_ledger_fill_grant_not_stale: %', v_result;
    END IF;
  END LOOP;
END
$$;
COMMIT;

DO $$
BEGIN
  IF (
    SELECT count(*) FROM public.pragas_location_consent_decisions
     WHERE user_id = '11111111-1111-4111-8111-111111111111'
  ) <> 256 OR EXISTS (
    SELECT 1 FROM public.pragas_location_consent_decisions
     WHERE user_id = '11111111-1111-4111-8111-111111111111'
       AND decision_id IN (
         '61000000-0000-4000-8000-000000000001',
         '61000000-0000-4000-8000-000000000002'
       )
  ) THEN
    RAISE EXCEPTION 'location_ledger_retention_cap_or_prune_failed';
  END IF;
END
$$;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
DO $$
DECLARE
  v_old_grant jsonb;
  v_old_withdrawal jsonb;
  v_fresh_regrant jsonb;
BEGIN
  v_old_grant := public.set_pragas_location_consent(
    '61000000-0000-4000-8000-000000000001', true,
    'rumo-pragas:approximate-location:open-meteo+diagnosis-context:2026-07-14.1',
    '2026-07-14T13:00:00Z', 0
  );
  IF v_old_grant ->> 'code' <> 'stale_grant'
     OR (v_old_grant ->> 'current_revision')::bigint <> 2
  THEN
    RAISE EXCEPTION 'pruned_old_grant_was_rebased: %', v_old_grant;
  END IF;

  v_old_withdrawal := public.set_pragas_location_consent(
    '61000000-0000-4000-8000-000000000002', false,
    'rumo-pragas:approximate-location:open-meteo+diagnosis-context:2026-07-14.1',
    '2026-07-14T14:00:00Z', 0
  );
  IF (v_old_withdrawal ->> 'applied')::boolean IS NOT TRUE
     OR (v_old_withdrawal ->> 'current_revision')::bigint <> 3
     OR (v_old_withdrawal ->> 'current_share_location')::boolean IS NOT FALSE
  THEN
    RAISE EXCEPTION 'pruned_withdrawal_replay_not_fail_closed: %', v_old_withdrawal;
  END IF;

  v_fresh_regrant := public.set_pragas_location_consent(
    '61000000-0000-4000-8000-000000000004', true,
    'rumo-pragas:approximate-location:open-meteo+diagnosis-context:2026-07-14.1',
    '2026-07-14T16:00:00Z', 3
  );
  IF (v_fresh_regrant ->> 'applied')::boolean IS NOT TRUE
     OR (v_fresh_regrant ->> 'current_revision')::bigint <> 4
     OR (v_fresh_regrant ->> 'current_share_location')::boolean IS NOT TRUE
  THEN
    RAISE EXCEPTION 'post_prune_fresh_regrant_failed: %', v_fresh_regrant;
  END IF;
END
$$;
COMMIT;

DO $$
BEGIN
  IF (
    SELECT count(*) FROM public.pragas_location_consent_decisions
     WHERE user_id = '11111111-1111-4111-8111-111111111111'
  ) <> 256 THEN
    RAISE EXCEPTION 'location_ledger_retention_cap_not_stable';
  END IF;
END
$$;

-- Direct same-owner writes are denied even though own-row RLS would otherwise
-- match. Authenticated clients retain SELECT so a fresh grant can bind CAS.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
DO $$
DECLARE
  v_revision bigint;
BEGIN
  BEGIN
    UPDATE public.pragas_user_preferences
       SET share_location = false
     WHERE user_id = '11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'same_user_direct_location_preference_write_succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  SELECT location_consent_revision
    INTO v_revision
    FROM public.pragas_user_preferences
   WHERE user_id = '11111111-1111-4111-8111-111111111111';
  IF v_revision <> 4 THEN
    RAISE EXCEPTION 'authenticated_location_revision_read_failed';
  END IF;
END
$$;
ROLLBACK;

DO $$
DECLARE
  v_claim jsonb;
  v_lease_token uuid;
BEGIN
  v_claim := public.claim_pragas_push_notification(
    '90000000-0000-4000-8000-000000000001', repeat('a', 64), 'transactional'
  );
  v_lease_token := (v_claim ->> 'lease_token')::uuid;
  IF v_claim ->> 'state' <> 'reserved' THEN
    RAISE EXCEPTION 'push_initial_claim_failed';
  END IF;
  v_claim := public.claim_pragas_push_notification(
    '90000000-0000-4000-8000-000000000001', repeat('a', 64), 'transactional'
  );
  IF v_claim ->> 'state' <> 'in_progress' THEN
    RAISE EXCEPTION 'push_concurrent_claim_not_blocked';
  END IF;
  v_claim := public.claim_pragas_push_notification(
    '90000000-0000-4000-8000-000000000001', repeat('b', 64), 'transactional'
  );
  IF v_claim ->> 'state' <> 'conflict' OR NOT public.release_pragas_push_notification(
    '90000000-0000-4000-8000-000000000001', repeat('a', 64), v_lease_token
  ) THEN
    RAISE EXCEPTION 'push_hash_conflict_or_safe_release_failed';
  END IF;

  v_claim := public.claim_pragas_push_notification(
    '90000000-0000-4000-8000-000000000001', repeat('a', 64), 'transactional'
  );
  v_lease_token := (v_claim ->> 'lease_token')::uuid;
  IF v_claim ->> 'state' <> 'reserved' OR NOT public.mark_pragas_push_provider_started(
    '90000000-0000-4000-8000-000000000001', repeat('a', 64), v_lease_token
  ) THEN
    RAISE EXCEPTION 'push_provider_boundary_failed';
  END IF;
  UPDATE public.pragas_push_notifications
     SET lease_expires_at = clock_timestamp() - interval '1 second'
   WHERE notification_id = '90000000-0000-4000-8000-000000000001';
  v_claim := public.claim_pragas_push_notification(
    '90000000-0000-4000-8000-000000000001', repeat('a', 64), 'transactional'
  );
  IF v_claim ->> 'state' <> 'unknown_outcome'
     OR public.complete_pragas_push_notification(
       '90000000-0000-4000-8000-000000000001', repeat('a', 64), v_lease_token,
       'sent', 0, 0, 0
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.pragas_push_notifications
        WHERE notification_id = '90000000-0000-4000-8000-000000000001'
          AND status = 'unknown_outcome'
          AND lease_token IS NULL
          AND unknown_outcome_at IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'push_post_provider_crash_was_retriable';
  END IF;

  v_claim := public.claim_pragas_push_notification(
    '90000000-0000-4000-8000-000000000002', repeat('c', 64),
    'climate_risk_educational'
  );
  v_lease_token := (v_claim ->> 'lease_token')::uuid;
  IF NOT public.complete_pragas_push_notification(
    '90000000-0000-4000-8000-000000000002', repeat('c', 64), v_lease_token,
    'sent', 0, 0, 0
  ) OR (public.claim_pragas_push_notification(
    '90000000-0000-4000-8000-000000000002', repeat('c', 64),
    'climate_risk_educational'
  ) ->> 'state') <> 'completed'
  THEN
    RAISE EXCEPTION 'push_completed_replay_failed';
  END IF;
END
$$;

-- Only the authenticated, explicit UI RPC may grant/re-grant consent.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
DO $$
DECLARE
  v_link jsonb;
  v_result jsonb;
BEGIN
  v_link := public.pragas_link_account();
  IF v_link ->> 'code' NOT IN ('linked', 'already_linked') THEN
    RAISE EXCEPTION 'initial_explicit_link_failed: %', v_link;
  END IF;
  v_result := public.grant_pragas_ai_consent('diagnosis', '2026-07-14.1');
  IF (v_result ->> 'granted')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'explicit_ai_consent_grant_failed: %', v_result;
  END IF;
END
$$;
COMMIT;

DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.record_pragas_ai_consent(
    '11111111-1111-4111-8111-111111111111', 'diagnosis', '2026-07-14.1'
  );
  IF (v_result ->> 'accepted')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'active_ai_consent_not_recorded: %', v_result;
  END IF;
END
$$;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.revoke_pragas_ai_consent('diagnosis');
  IF (v_result ->> 'revoked')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'explicit_ai_consent_revoke_failed: %', v_result;
  END IF;
END
$$;
COMMIT;

DO $$
DECLARE v_result jsonb;
BEGIN
  -- Simulates a stale second device still sending the old consent headers.
  v_result := public.record_pragas_ai_consent(
    '11111111-1111-4111-8111-111111111111', 'diagnosis', '2026-07-14.1'
  );
  IF (v_result ->> 'accepted')::boolean IS NOT FALSE OR NOT EXISTS (
    SELECT 1 FROM public.pragas_ai_consents
     WHERE user_id = '11111111-1111-4111-8111-111111111111'
       AND purpose = 'diagnosis'
       AND revoked_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'stale_device_unrevoked_ai_consent: %', v_result;
  END IF;
END
$$;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
SELECT public.grant_pragas_ai_consent('diagnosis', '2026-07-14.1');
COMMIT;

INSERT INTO public.pragas_app_links (user_id, link_version)
VALUES ('88888888-8888-4888-8888-888888888888', '2026-07-14.1');
INSERT INTO public.subscriptions (user_id, plan, status, provider, app)
VALUES (
  '88888888-8888-4888-8888-888888888888', 'free', 'active', 'free', 'rumo-pragas'
)
ON CONFLICT (user_id, app) DO UPDATE SET status = 'active';

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '88888888-8888-4888-8888-888888888888';
DO $$
BEGIN
  IF public.pragas_current_link_allows_access() OR EXISTS (
    SELECT 1 FROM public.pragas_profiles
  ) THEN
    RAISE EXCEPTION 'preexisting_split_profile_authorized_access';
  END IF;
END
$$;
COMMIT;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (
  '33333333-3333-4333-8333-333333333333',
  'third@example.test',
  '{"full_name":"Third"}'
), (
  '44444444-4444-4444-8444-444444444444',
  'fourth@example.test',
  '{"full_name":"Fourth"}'
);

-- Exercise the explicit linker independently from the retained shared signup
-- hook. Disabling this one trigger leaves the sibling fixture active.
ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (
  '66666666-6666-4666-8666-666666666666',
  'sixth@example.test',
  '{"full_name":"Sixth"}'
);
ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
     WHERE user_id = '33333333-3333-4333-8333-333333333333'
       AND app = 'rumo-pragas'
  ) OR NOT EXISTS (
    SELECT 1 FROM auth.sibling_signup_events
     WHERE user_id = '33333333-3333-4333-8333-333333333333'
  ) OR EXISTS (
    SELECT 1 FROM public.pragas_app_links
     WHERE user_id = '33333333-3333-4333-8333-333333333333'
  ) THEN
    RAISE EXCEPTION 'retained_signup_or_sibling_trigger_contract_failed: subscription=%, sibling=%',
      EXISTS (
        SELECT 1 FROM public.subscriptions
         WHERE user_id = '33333333-3333-4333-8333-333333333333'
           AND app = 'rumo-pragas'
      ),
      EXISTS (
        SELECT 1 FROM auth.sibling_signup_events
         WHERE user_id = '33333333-3333-4333-8333-333333333333'
      );
  END IF;
END
$$;

GRANT INSERT ON public.pragas_diagnoses TO authenticated;
GRANT INSERT ON public.pragas_profiles TO authenticated;
SQL

# A split historical profile cannot be adopted silently by the explicit link
# RPC even if a stale link/subscription already exists.
if docker exec "$container" psql -q -v ON_ERROR_STOP=1 -U postgres -c "
  SET ROLE authenticated;
  SET request.jwt.claim.sub = '88888888-8888-4888-8888-888888888888';
  SELECT public.pragas_link_account();
" >/dev/null 2>&1; then
  printf '%s\n' 'split historical profile was adopted by app linker' >&2
  exit 91
fi

# The retained historical hook does not count as explicit app entry.
docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.pragas_link_account();
  IF v_result ->> 'code' <> 'linked' OR (v_result ->> 'linked')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'retained_signup_was_not_explicitly_linked: %', v_result;
  END IF;
  v_result := public.pragas_link_account();
  IF v_result ->> 'code' <> 'already_linked' THEN
    RAISE EXCEPTION 'explicit_link_after_retained_signup_not_idempotent: %', v_result;
  END IF;
END
$$;
COMMIT;
SQL

# Explicit account linking is parameterless and derives the authenticated user.
docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.pragas_link_account();
  IF v_result ->> 'code' <> 'linked' OR (v_result ->> 'linked')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'explicit_link_failed: %', v_result;
  END IF;
  v_result := public.pragas_link_account();
  IF v_result ->> 'code' <> 'already_linked' THEN
    RAISE EXCEPTION 'explicit_link_idempotency_failed: %', v_result;
  END IF;
END
$$;
COMMIT;
SQL

# A partial/sibling-style profile is never a complete Pragas link.
docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
DELETE FROM public.subscriptions
 WHERE user_id = '44444444-4444-4444-8444-444444444444'
   AND app = 'rumo-pragas';
UPDATE public.pragas_profiles
   SET full_name = 'Spurious profile only'
 WHERE user_id = '44444444-4444-4444-8444-444444444444';
SQL
if docker exec "$container" psql -q -v ON_ERROR_STOP=1 -U postgres -c "
  SET ROLE authenticated;
  SET request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
  SELECT public.consume_pragas_mcp_rate_limit(
    '61000000-0000-4000-8000-000000000001', repeat('1', 64)
  );
" >/dev/null 2>&1; then
  printf '%s\n' 'profile-only identity unexpectedly passed complete-link predicate' >&2
  exit 89
fi

# Link repairs a stale/inactive app subscription to the launch-free contract.
docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
UPDATE public.subscriptions
   SET status = 'canceled', plan = 'pro', provider = 'stripe'
 WHERE user_id = '33333333-3333-4333-8333-333333333333'
   AND app = 'rumo-pragas';
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.pragas_link_account();
  IF v_result ->> 'code' <> 'linked' THEN
    RAISE EXCEPTION 'inactive_subscription_not_repaired: %', v_result;
  END IF;
END
$$;
COMMIT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
     WHERE user_id = '33333333-3333-4333-8333-333333333333'
       AND app = 'rumo-pragas'
       AND status = 'active' AND plan = 'free' AND provider = 'free'
  ) THEN
    RAISE EXCEPTION 'inactive_subscription_row_not_repaired';
  END IF;
END
$$;
SQL

# Analytics are server-only, app-scoped and idempotent by client event UUID.
docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
DO $$
DECLARE
  v_result jsonb;
  v_events jsonb;
BEGIN
  v_events := jsonb_build_array(
    jsonb_build_object(
      'event_id', '62000000-0000-4000-8000-000000000001',
      'event', 'diagnosis.completed',
      'platform', 'integration',
      'properties', jsonb_build_object('source', 'test'),
      'timestamp', clock_timestamp()
    ),
    jsonb_build_object(
      'event_id', '62000000-0000-4000-8000-000000000001',
      'event', 'diagnosis.completed',
      'platform', 'integration',
      'properties', jsonb_build_object('source', 'test'),
      'timestamp', clock_timestamp()
    )
  );
  v_result := public.record_pragas_analytics_events(
    '33333333-3333-4333-8333-333333333333', v_events
  );
  IF (v_result ->> 'accepted')::integer <> 2
     OR (v_result ->> 'inserted')::integer <> 1
     OR (v_result ->> 'duplicates')::integer <> 1
     OR (SELECT count(*) FROM public.analytics_events
          WHERE user_id = '33333333-3333-4333-8333-333333333333'
            AND app = 'rumo-pragas'
            AND pragas_event_id = '62000000-0000-4000-8000-000000000001') <> 1
  THEN
    RAISE EXCEPTION 'analytics_idempotency_failed: %', v_result;
  END IF;
END
$$;
SQL

# Multi-device push registry stores only token/platform/consent state and
# supports explicit grant, revoke and fresh re-grant.
docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.touch_pragas_push_token(
    'ExponentPushToken[IntegrationToken_333333333333]', 'ios', true
  );
  IF (v_result ->> 'registered')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'push_registration_failed: %', v_result;
  END IF;
  v_result := public.touch_pragas_push_token(
    'ExponentPushToken[IntegrationToken_333333333333]', 'ios', false
  );
  IF (v_result ->> 'revoked')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'push_revocation_failed: %', v_result;
  END IF;
  v_result := public.touch_pragas_push_token(
    'ExponentPushToken[IntegrationToken_333333333333]', 'android', true
  );
  IF (v_result ->> 'registered')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'push_regrant_failed: %', v_result;
  END IF;
  UPDATE public.pragas_profiles
     SET avatar_path =
       '33333333-3333-4333-8333-333333333333/avatar-integration.webp'
   WHERE user_id = '33333333-3333-4333-8333-333333333333';
  INSERT INTO storage.objects (bucket_id, name) VALUES (
    'pragas-avatars',
    '33333333-3333-4333-8333-333333333333/avatar-integration.webp'
  );
END
$$;
COMMIT;
SQL
if docker exec "$container" psql -q -v ON_ERROR_STOP=1 -U postgres -c "
  SET ROLE authenticated;
  SET request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
  INSERT INTO storage.objects (bucket_id, name) VALUES (
    'pragas-avatars',
    '44444444-4444-4444-8444-444444444444/avatar-cross-account.webp'
  );
" >/dev/null 2>&1; then
  printf '%s\n' 'cross-account avatar path unexpectedly succeeded' >&2
  exit 88
fi

# Neither RLS nor the invariant trigger/constraint permits split profile identity.
if docker exec "$container" psql -q -v ON_ERROR_STOP=1 -U postgres -c "
  SET ROLE authenticated;
  SET request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
  INSERT INTO public.pragas_profiles (id, user_id, full_name)
  VALUES (
    '44444444-4444-4444-8444-444444444444',
    '33333333-3333-4333-8333-333333333333',
    'mismatch'
  );
" >/dev/null 2>&1; then
  printf '%s\n' 'split profile identity unexpectedly succeeded' >&2
  exit 90
fi

# The MCP wrapper fixes identity/scope/limit/window and allows exactly 30/min.
docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
DO $$
DECLARE
  v_index integer;
  v_result jsonb;
  v_key uuid;
BEGIN
  FOR v_index IN 1..31 LOOP
    v_key := (
      '60000000-0000-4000-8000-' || lpad(v_index::text, 12, '0')
    )::uuid;
    v_result := public.consume_pragas_mcp_rate_limit(v_key, repeat('2', 64));
    IF v_index <= 30 AND (v_result ->> 'allowed')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'mcp_rate_limit_denied_early_at_%', v_index;
    ELSIF v_index = 31 AND (v_result ->> 'allowed')::boolean IS NOT FALSE THEN
      RAISE EXCEPTION 'mcp_rate_limit_did_not_deny_31';
    END IF;
  END LOOP;
END
$$;
COMMIT;
SQL

docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
SELECT public.touch_pragas_push_token(
  'ExponentPushToken[IntegrationAOnly_666666666666]', 'ios', true
);
SELECT public.touch_pragas_push_token(
  'ExponentPushToken[IntegrationTransfer_666666666666]', 'ios', true
);
COMMIT;

INSERT INTO public.pragas_notification_queue (token, title) VALUES
  ('ExponentPushToken[IntegrationAOnly_666666666666]', 'A only'),
  ('ExponentPushToken[IntegrationTransfer_666666666666]', 'A stale before transfer');

-- A revoked historical token still proves ownership unless a different user
-- currently owns it. Rows surviving from the legacy queue must be exported,
-- and immutable-id keyset pages must neither duplicate nor skip them.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
SELECT public.touch_pragas_push_token(
  'ExponentPushToken[IntegrationAOnly_666666666666]', 'ios', false
);
COMMIT;

INSERT INTO public.pragas_notification_queue (
  id, token, title, created_at
) VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    'ExponentPushToken[IntegrationAOnly_666666666666]',
    'A historical inactive 1', clock_timestamp() - interval '2 minutes'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'ExponentPushToken[IntegrationAOnly_666666666666]',
    'A historical inactive 2', clock_timestamp() - interval '1 minute'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'ExponentPushToken[IntegrationAOnly_666666666666]',
    'A after snapshot', clock_timestamp() + interval '1 day'
  );

DO $$
DECLARE
  v_snapshot timestamptz := clock_timestamp();
  v_rows jsonb;
  v_titles text[] := ARRAY[]::text[];
  v_first_position bigint;
  v_second_position bigint;
BEGIN
  v_rows := public.export_pragas_notification_queue_snapshot(
    '66666666-6666-4666-8666-666666666666', v_snapshot, 10001
  );
  SELECT coalesce(array_agg(entry.value ->> 'title'), ARRAY[]::text[]),
         min(entry.ordinality) FILTER (
           WHERE entry.value ->> 'id' = '10000000-0000-4000-8000-000000000001'
         ),
         min(entry.ordinality) FILTER (
           WHERE entry.value ->> 'id' = '10000000-0000-4000-8000-000000000002'
         )
    INTO v_titles, v_first_position, v_second_position
    FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS entry(value, ordinality);

  IF NOT ('A historical inactive 1' = ANY (v_titles))
     OR NOT ('A historical inactive 2' = ANY (v_titles))
     OR 'A after snapshot' = ANY (v_titles)
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_rows) AS entry(value)
        WHERE entry.value ? 'token'
     )
     OR v_first_position IS NULL OR v_second_position IS NULL
     OR v_first_position >= v_second_position
  THEN
    RAISE EXCEPTION 'notification_export_history_snapshot_or_order_failed: %', v_titles;
  END IF;
END
$$;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
SELECT public.touch_pragas_push_token(
  'ExponentPushToken[IntegrationTransfer_666666666666]', 'android', true
);
COMMIT;

INSERT INTO public.pragas_notification_queue (token, title) VALUES
  ('ExponentPushToken[IntegrationTransfer_666666666666]', 'B after transfer'),
  ('ExponentPushToken[UnownedOrphan_000000000000]', 'Orphan');

DO $$
DECLARE
  v_a_titles text[];
  v_b_titles text[];
BEGIN
  SELECT coalesce(array_agg(page.value ->> 'title'), ARRAY[]::text[])
    INTO v_a_titles
    FROM jsonb_array_elements(
      public.export_pragas_notification_queue_snapshot(
        '66666666-6666-4666-8666-666666666666', clock_timestamp(), 10001
      )
    ) AS page(value);
  SELECT coalesce(array_agg(page.value ->> 'title'), ARRAY[]::text[])
    INTO v_b_titles
    FROM jsonb_array_elements(
      public.export_pragas_notification_queue_snapshot(
        '33333333-3333-4333-8333-333333333333', clock_timestamp(), 10001
      )
    ) AS page(value);
  IF 'B after transfer' = ANY (v_a_titles)
     OR NOT ('B after transfer' = ANY (v_b_titles))
  THEN
    RAISE EXCEPTION 'notification_export_transferred_owner_leak: A=%, B=%',
      v_a_titles, v_b_titles;
  END IF;
END
$$;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
SELECT public.touch_pragas_push_token(
  'ExponentPushToken[IntegrationOptOut_333333333333]', 'ios', true
);
COMMIT;

INSERT INTO public.pragas_notification_queue (token, title) VALUES
  ('ExponentPushToken[IntegrationOptOut_333333333333]', 'Must be revoked');

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
SELECT public.touch_pragas_push_token(
  'ExponentPushToken[IntegrationOptOut_333333333333]', 'ios', false
);
COMMIT;

SELECT public.cleanup_pragas_user_rows('66666666-6666-4666-8666-666666666666');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.pragas_notification_queue
     WHERE token = 'ExponentPushToken[IntegrationAOnly_666666666666]'
  ) OR EXISTS (
    SELECT 1 FROM public.pragas_notification_queue
     WHERE title = 'A stale before transfer'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.pragas_notification_queue
     WHERE token = 'ExponentPushToken[IntegrationTransfer_666666666666]'
       AND title = 'B after transfer'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.pragas_notification_queue
     WHERE token = 'ExponentPushToken[UnownedOrphan_000000000000]'
  ) OR EXISTS (
    SELECT 1 FROM public.pragas_notification_queue
     WHERE token = 'ExponentPushToken[IntegrationOptOut_333333333333]'
  ) THEN
    RAISE EXCEPTION 'notification_queue_token_transfer_cleanup_failed';
  END IF;
END
$$;
SQL

# The export RPC and token transfer share the exact advisory key. Hold an
# export transaction open after its page read and prove a concurrent transfer
# cannot cross the ownership check; it must wait, then atomically delete A's
# legacy queue rows before B can receive new ones.
docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
SELECT public.touch_pragas_push_token(
  'ExponentPushToken[IntegrationConcurrent_666666666666]', 'ios', true
);
COMMIT;
INSERT INTO public.pragas_notification_queue (token, title) VALUES (
  'ExponentPushToken[IntegrationConcurrent_666666666666]', 'A concurrent snapshot'
);
SQL

docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres >/dev/null <<'SQL' &
BEGIN;
SELECT jsonb_array_length(
  public.export_pragas_notification_queue_snapshot(
    '11111111-1111-4111-8111-111111111111', clock_timestamp(), 10001
  )
);
SELECT pg_sleep(3);
COMMIT;
SQL
export_lock_pid=$!

export_lock_observed=false
for _attempt in $(seq 1 30); do
  if [[ "$(docker exec "$container" psql -Atq -v ON_ERROR_STOP=1 -U postgres -c "
    SELECT NOT pg_try_advisory_lock(
      hashtextextended(
        'pragas-push-token:ExponentPushToken[IntegrationConcurrent_666666666666]', 0
      )
    );
  ")" == "t" ]]; then
    export_lock_observed=true
    break
  fi
  sleep 0.1
done
if [[ "$export_lock_observed" != true ]]; then
  wait "$export_lock_pid" || true
  printf '%s\n' 'notification export never acquired transfer lock' >&2
  exit 94
fi

if docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres >/dev/null 2>&1 <<'SQL'
SET statement_timeout = '500ms';
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
SELECT public.touch_pragas_push_token(
  'ExponentPushToken[IntegrationConcurrent_666666666666]', 'android', true
);
COMMIT;
SQL
then
  wait "$export_lock_pid" || true
  printf '%s\n' 'concurrent token transfer bypassed export ownership lock' >&2
  exit 95
fi
wait "$export_lock_pid"

docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
SELECT public.touch_pragas_push_token(
  'ExponentPushToken[IntegrationConcurrent_666666666666]', 'android', true
);
COMMIT;
INSERT INTO public.pragas_notification_queue (token, title) VALUES (
  'ExponentPushToken[IntegrationConcurrent_666666666666]', 'B concurrent after transfer'
);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(
        public.export_pragas_notification_queue_snapshot(
          '11111111-1111-4111-8111-111111111111', clock_timestamp(), 10001
        )
      ) AS page(value)
     WHERE page.value ->> 'title' = 'B concurrent after transfer'
  ) OR NOT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(
        public.export_pragas_notification_queue_snapshot(
          '33333333-3333-4333-8333-333333333333', clock_timestamp(), 10001
        )
      ) AS page(value)
     WHERE page.value ->> 'title' = 'B concurrent after transfer'
  ) THEN
    RAISE EXCEPTION 'concurrent_notification_export_owner_leak';
  END IF;
END
$$;
SQL

docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (
  '55555555-5555-4555-8555-555555555555',
  'lease@example.test',
  '{"full_name":"Lease"}'
);
DO $$
DECLARE
  v_request jsonb;
  v_first record;
  v_reclaimed record;
  v_final record;
  v_count integer;
  v_completed boolean;
BEGIN
  v_request := public.request_pragas_account_deletion(
    '55555555-5555-4555-8555-555555555555'
  );
  IF v_request ->> 'status' <> 'requested' THEN
    RAISE EXCEPTION 'deletion_request_contract_failed: %', v_request;
  END IF;

  SELECT * INTO v_first
    FROM public.claim_pragas_deletion_job(
      '55555555-5555-4555-8555-555555555555'
    );
  IF v_first.id IS NULL OR v_first.lease_token IS NULL OR v_first.attempts <> 1 THEN
    RAISE EXCEPTION 'deletion_initial_lease_failed: %', to_jsonb(v_first);
  END IF;

  SELECT count(*) INTO v_count
    FROM public.claim_pragas_deletion_job(
      '55555555-5555-4555-8555-555555555555'
    );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'active_deletion_lease_was_double_claimed';
  END IF;

  UPDATE public.pragas_deletion_jobs
     SET lease_expires_at = clock_timestamp() - interval '1 second'
   WHERE id = v_first.id;
  SELECT * INTO v_reclaimed
    FROM public.claim_pragas_deletion_job(
      '55555555-5555-4555-8555-555555555555'
    );
  IF v_reclaimed.lease_token IS NULL
     OR v_reclaimed.lease_token = v_first.lease_token
     OR v_reclaimed.attempts <> 2
  THEN
    RAISE EXCEPTION 'expired_deletion_lease_not_reclaimed: %', to_jsonb(v_reclaimed);
  END IF;
  IF public.complete_pragas_deletion_job(v_first.id, v_first.lease_token) THEN
    RAISE EXCEPTION 'stale_deletion_lease_completed_job';
  END IF;
  IF NOT public.retry_pragas_deletion_job(
    v_reclaimed.id,
    v_reclaimed.lease_token,
    'transient_storage_failure',
    clock_timestamp() + interval '1 second'
  ) THEN
    RAISE EXCEPTION 'deletion_retry_not_scheduled';
  END IF;

  UPDATE public.pragas_deletion_jobs
     SET next_attempt_at = clock_timestamp() - interval '1 second'
   WHERE id = v_reclaimed.id;
  SELECT * INTO v_final
    FROM public.claim_pragas_deletion_job(
      '55555555-5555-4555-8555-555555555555'
    );
  v_completed := public.complete_pragas_deletion_job(
    v_final.id, v_final.lease_token
  );
  IF v_final.lease_token IS NULL OR v_final.attempts <> 3
     OR v_completed IS NOT TRUE
     OR NOT EXISTS (
       SELECT 1 FROM public.pragas_deletion_jobs
        WHERE id = v_final.id
          AND status = 'blocked_global_decision'
          AND app_cleanup_completed_at IS NOT NULL
          AND lease_token IS NULL
          AND lease_expires_at IS NULL
     ) OR NOT EXISTS (
       SELECT 1 FROM auth.users
        WHERE id = '55555555-5555-4555-8555-555555555555'
     )
  THEN
    RAISE EXCEPTION 'deletion_success_or_global_identity_retention_failed';
  END IF;
END
$$;

DO $$
DECLARE
  v_table text;
  v_count bigint;
BEGIN
  INSERT INTO public.pragas_deletion_jobs (user_id)
  VALUES ('11111111-1111-4111-8111-111111111111');
  INSERT INTO public.pragas_deletion_jobs (user_id)
  VALUES ('22222222-2222-4222-8222-222222222222');

  -- Simulate shared legacy/sibling subscription rows. Only the Pragas row may
  -- be gated by the deletion marker; NULL and sibling apps must remain visible.
  ALTER TABLE public.subscriptions ALTER COLUMN app DROP NOT NULL;
  INSERT INTO public.subscriptions (user_id, plan, status, provider, app) VALUES
    ('22222222-2222-4222-8222-222222222222', 'free', 'active', 'free', NULL),
    ('22222222-2222-4222-8222-222222222222', 'free', 'active', 'free', 'sibling-app');
  GRANT SELECT ON public.subscriptions TO authenticated;

  FOREACH v_table IN ARRAY ARRAY[
    'pragas_reply_likes', 'pragas_post_replies', 'pragas_post_comments',
    'pragas_post_likes', 'pragas_community_likes', 'pragas_community_posts',
    'pragas_outbreak_confirmations', 'pragas_outbreaks',
    'pragas_diagnosis_usage', 'pragas_chat_messages', 'pragas_analytics',
    'pragas_error_logs', 'pragas_push_tokens', 'pragas_subscriptions'
  ] LOOP
    EXECUTE format('INSERT INTO public.%I (user_id) VALUES ($1)', v_table)
      USING '11111111-1111-4111-8111-111111111111'::uuid;
  END LOOP;

  INSERT INTO public.analytics_events (user_id, app, event, platform) VALUES
    ('11111111-1111-4111-8111-111111111111', 'rumo-pragas', 'scoped', 'test'),
    ('11111111-1111-4111-8111-111111111111', NULL, 'legacy', 'test');
  INSERT INTO public.audit_log (user_id, app, action) VALUES
    ('11111111-1111-4111-8111-111111111111', 'rumo-pragas', 'scoped'),
    ('11111111-1111-4111-8111-111111111111', NULL, 'legacy');

  PERFORM public.cleanup_pragas_user_rows('11111111-1111-4111-8111-111111111111');
  UPDATE public.pragas_deletion_jobs
     SET status = 'blocked_global_decision',
         app_cleanup_completed_at = clock_timestamp()
   WHERE user_id = '11111111-1111-4111-8111-111111111111';

  FOREACH v_table IN ARRAY ARRAY[
    'pragas_reply_likes', 'pragas_post_replies', 'pragas_post_comments',
    'pragas_post_likes', 'pragas_community_likes', 'pragas_community_posts',
    'pragas_outbreak_confirmations', 'pragas_outbreaks',
    'pragas_diagnosis_feedback', 'pragas_diagnosis_usage',
    'pragas_chat_messages', 'pragas_ai_content_reports', 'pragas_ai_consents',
    'pragas_ai_idempotency_records', 'pragas_location_consent_decisions',
    'pragas_analytics', 'pragas_error_logs',
    'pragas_api_rate_limit_events', 'pragas_api_rate_limit_counters',
    'pragas_diagnoses', 'pragas_push_tokens', 'pragas_subscriptions',
    'pragas_user_preferences', 'pragas_profiles'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = $1', v_table)
      INTO v_count
      USING '11111111-1111-4111-8111-111111111111'::uuid;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'cleanup_left_rows_in_%', v_table;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_preferences
     WHERE user_id = '11111111-1111-4111-8111-111111111111'
  ) OR EXISTS (
    SELECT 1 FROM public.subscriptions
     WHERE user_id = '11111111-1111-4111-8111-111111111111'
       AND app = 'rumo-pragas'
  ) OR (SELECT count(*) FROM public.analytics_events
         WHERE user_id = '11111111-1111-4111-8111-111111111111') <> 1
     OR (SELECT count(*) FROM public.audit_log
          WHERE user_id = '11111111-1111-4111-8111-111111111111') <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.pragas_deletion_jobs
        WHERE user_id = '11111111-1111-4111-8111-111111111111'
          AND status = 'blocked_global_decision'
     ) OR NOT EXISTS (
       SELECT 1 FROM auth.users
        WHERE id = '11111111-1111-4111-8111-111111111111'
     )
  THEN
    RAISE EXCEPTION 'shared_scope_cleanup_or_marker_failed';
  END IF;
END
$$;
SQL

# NULL and sibling-app rows are not collateral damage from Pragas unlink RLS.
docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.subscriptions WHERE app IS NULL) <> 1
     OR (SELECT count(*) FROM public.subscriptions WHERE app = 'sibling-app') <> 1
     OR (SELECT count(*) FROM public.subscriptions WHERE app = 'rumo-pragas') <> 0
  THEN
    RAISE EXCEPTION 'shared_subscription_null_or_sibling_policy_regressed';
  END IF;
END
$$;
COMMIT;
SQL

# Deleted and pending identities cannot silently relink.
docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.pragas_link_account();
  IF v_result ->> 'code' <> 'deleted_reactivation_required' THEN
    RAISE EXCEPTION 'deleted_link_was_not_blocked: %', v_result;
  END IF;
END
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.pragas_link_account();
  IF v_result ->> 'code' <> 'deletion_pending' THEN
    RAISE EXCEPTION 'pending_link_was_not_blocked: %', v_result;
  END IF;
END
$$;
COMMIT;
SQL

# Restrictive RLS blocks legacy direct writes while a deletion marker is active.
if docker exec "$container" psql -q -v ON_ERROR_STOP=1 -U postgres -c "
  SET ROLE authenticated;
  SET request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
  INSERT INTO public.pragas_diagnoses (user_id, crop)
  VALUES ('22222222-2222-4222-8222-222222222222', 'blocked');
" >/dev/null 2>&1; then
  printf '%s\n' 'unlink RLS unexpectedly allowed a new diagnosis' >&2
  exit 91
fi

# New precise coordinates are rejected without modifying historical data.
if docker exec "$container" psql -q -v ON_ERROR_STOP=1 -U postgres -c "
  INSERT INTO public.pragas_diagnoses (user_id, crop, location_lat, location_lng)
  VALUES ('33333333-3333-4333-8333-333333333333', 'soja', -23.551, -46.633);
" >/dev/null 2>&1; then
  printf '%s\n' 'future high-precision coordinates unexpectedly succeeded' >&2
  exit 92
fi

docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
INSERT INTO public.pragas_diagnoses (user_id, crop, location_lat, location_lng)
VALUES ('33333333-3333-4333-8333-333333333333', 'soja', -23.55, -46.63);

DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.reactivate_pragas_account(
    '11111111-1111-4111-8111-111111111111',
    '70000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000002'
  );
  IF (v_result ->> 'reactivated')::boolean IS NOT TRUE
     OR (v_result ->> 'data_restored')::boolean IS NOT FALSE
     OR NOT EXISTS (
       SELECT 1 FROM public.pragas_profiles
        WHERE user_id = '11111111-1111-4111-8111-111111111111'
     ) OR NOT EXISTS (
       SELECT 1 FROM public.subscriptions
        WHERE user_id = '11111111-1111-4111-8111-111111111111'
          AND app = 'rumo-pragas' AND plan = 'free'
     ) OR NOT EXISTS (
       SELECT 1 FROM public.pragas_deletion_jobs
        WHERE user_id = '11111111-1111-4111-8111-111111111111'
          AND status = 'reactivated' AND reactivated_at IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'reactivation_contract_failed: %', v_result;
  END IF;
END
$$;
SQL

# Reactivation restores only a fresh link; RLS/MCP work again and relink is idempotent.
docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
DO $$
DECLARE v_result jsonb;
BEGIN
  v_result := public.pragas_link_account();
  IF v_result ->> 'code' <> 'already_linked' THEN
    RAISE EXCEPTION 'reactivated_link_failed: %', v_result;
  END IF;
  v_result := public.consume_pragas_mcp_rate_limit(
    '80000000-0000-4000-8000-000000000001', repeat('3', 64)
  );
  IF (v_result ->> 'allowed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'mcp_not_restored_after_reactivation';
  END IF;
  INSERT INTO public.pragas_diagnoses (user_id, crop)
  VALUES ('11111111-1111-4111-8111-111111111111', 'reactivated');
END
$$;
COMMIT;
SQL

# A new deletion request after reactivation activates restrictive RLS again.
docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
UPDATE public.pragas_deletion_jobs
   SET status = 'requested', reactivated_at = NULL
 WHERE user_id = '11111111-1111-4111-8111-111111111111';
SQL
if docker exec "$container" psql -q -v ON_ERROR_STOP=1 -U postgres -c "
  SET ROLE authenticated;
  SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
  INSERT INTO public.pragas_diagnoses (user_id, crop)
  VALUES ('11111111-1111-4111-8111-111111111111', 'blocked-again');
" >/dev/null 2>&1; then
  printf '%s\n' 'second deletion marker unexpectedly allowed a write' >&2
  exit 93
fi

docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
INSERT INTO public.pragas_ai_content_reports (
  id, user_id, submission_key, message_id, content, reason
) VALUES (
  '91000000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',
  '91000000-0000-4000-8000-000000000002',
  'rollback-sentinel', 'retain this report', 'other'
);
INSERT INTO public.pragas_user_preferences (user_id)
VALUES ('22222222-2222-4222-8222-222222222222')
ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.pragas_location_consent_decisions (
  user_id, decision_id, observed_revision, applied_revision,
  share_location, purpose, consented_at, outcome,
  resulting_share_location
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  '91000000-0000-4000-8000-000000000005', 0, 0, false,
  'rumo-pragas:approximate-location:open-meteo+diagnosis-context:2026-07-14.1',
  '2026-07-14T16:00:00Z', 'applied', false
);
INSERT INTO public.pragas_ai_consents (
  user_id, purpose, version, accepted_at, last_used_at
) VALUES (
  '22222222-2222-4222-8222-222222222222', 'chat', '2026-07-14.1',
  clock_timestamp(), clock_timestamp()
);
INSERT INTO public.pragas_ai_idempotency_records (
  user_id, scope, idempotency_key, request_hash, lease_token, lease_expires_at
) VALUES (
  '22222222-2222-4222-8222-222222222222', 'chat',
  '91000000-0000-4000-8000-000000000003', repeat('9', 64),
  '91000000-0000-4000-8000-000000000004', clock_timestamp() + interval '5 minutes'
);
SQL

psql_file supabase/rollback/20260714150000_pragas_export_consistency.down.sql
psql_file supabase/rollback/20260714143000_pragas_backend_security.down.sql
docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
DO $$
BEGIN
  IF to_regclass('public.pragas_ai_content_reports') IS NULL
     OR to_regclass('public.pragas_api_rate_limit_counters') IS NULL
     OR to_regclass('public.pragas_deletion_jobs') IS NULL
     OR to_regclass('public.pragas_ai_consents') IS NULL
     OR to_regclass('public.pragas_ai_idempotency_records') IS NULL
     OR to_regclass('public.pragas_app_links') IS NULL
     OR to_regclass('public.pragas_location_consent_decisions') IS NULL
     OR to_regclass('public.pragas_push_notifications') IS NULL
  THEN
    RAISE EXCEPTION 'rollback_dropped_data_bearing_objects';
  END IF;
  IF to_regprocedure('public.grant_pragas_ai_consent(text,text)') IS NOT NULL
     OR to_regprocedure('public.touch_pragas_push_token(text,text,boolean)') IS NOT NULL
     OR to_regprocedure('public.record_pragas_analytics_events(uuid,jsonb)') IS NOT NULL
     OR to_regprocedure('public.complete_pragas_deletion_job(uuid,uuid)') IS NOT NULL
     OR to_regprocedure(
       'public.claim_pragas_push_notification(uuid,text,text)'
     ) IS NOT NULL
     OR to_regprocedure(
       'public.mark_pragas_ai_provider_started(uuid,text,uuid,text,uuid)'
     ) IS NOT NULL
     OR to_regprocedure(
       'public.set_pragas_location_consent(uuid,boolean,text,timestamp with time zone,bigint)'
     ) IS NOT NULL
     OR to_regprocedure('public.retry_pragas_deletion_job(uuid,uuid,text,timestamp with time zone)')
        IS NOT NULL
  THEN
    RAISE EXCEPTION 'rollback_left_runtime_objects';
  END IF;
  IF to_regclass('public.pragas_diagnosis_feedback') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pragas_diagnosis_feedback'
          AND column_name = 'feedback'
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pragas_diagnosis_feedback'
          AND column_name = 'verdict'
     )
  THEN
    RAISE EXCEPTION 'rollback_destroyed_legacy_feedback';
  END IF;
  IF to_regclass('public.pragas_push_tokens') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM storage.buckets
        WHERE id = 'pragas-avatars' AND public IS FALSE
     ) OR EXISTS (
       SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname LIKE 'pragas_avatars_%'
     )
  THEN
    RAISE EXCEPTION 'rollback_destroyed_private_data_or_left_dependent_policy';
  END IF;
  IF to_regtype('public.pragas_deletion_job_status') IS NULL OR (
    SELECT array_agg(enumlabel::text ORDER BY enumsortorder)
      FROM pg_enum
     WHERE enumtypid = 'public.pragas_deletion_job_status'::regtype
  ) <> ARRAY['requested']::text[] THEN
    RAISE EXCEPTION 'rollback_destroyed_preexisting_partial_enum';
  END IF;
  IF to_regtype('public.pragas_ai_report_status') IS NULL
     OR to_regtype('public.pragas_ai_report_reason') IS NULL
     OR to_regprocedure('public.pragas_touch_updated_at()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.pragas_ai_content_reports
        WHERE id = '91000000-0000-4000-8000-000000000001'
          AND content = 'retain this report'
     ) OR NOT EXISTS (
       SELECT 1 FROM public.pragas_user_preferences
        WHERE user_id = '22222222-2222-4222-8222-222222222222'
     ) OR NOT EXISTS (
       SELECT 1 FROM public.pragas_location_consent_decisions
        WHERE user_id = '22222222-2222-4222-8222-222222222222'
          AND decision_id = '91000000-0000-4000-8000-000000000005'
     ) OR NOT EXISTS (
       SELECT 1 FROM public.pragas_ai_consents
        WHERE user_id = '22222222-2222-4222-8222-222222222222'
          AND purpose = 'chat'
     ) OR NOT EXISTS (
       SELECT 1 FROM public.pragas_ai_idempotency_records
        WHERE user_id = '22222222-2222-4222-8222-222222222222'
          AND idempotency_key = '91000000-0000-4000-8000-000000000003'
     ) OR NOT EXISTS (
       SELECT 1 FROM public.pragas_push_notifications
        WHERE notification_id = '90000000-0000-4000-8000-000000000001'
          AND status = 'unknown_outcome'
     )
  THEN
    RAISE EXCEPTION 'rollback_lost_user_consent_audit_or_ledger_rows';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.pragas_user_preferences', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.pragas_user_preferences', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.pragas_user_preferences', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.pragas_user_preferences', 'DELETE')
  THEN
    RAISE EXCEPTION 'rollback_did_not_restore_location_preference_grants';
  END IF;
END
$$;
SQL

# A truly clean installation has no historical deletion-status enum. Prove
# that both forward replay and the data-preserving rollback use the migration's
# real TEXT + CHECK contract instead of depending on the optional drift enum.
docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
DROP TYPE public.pragas_deletion_job_status;
SQL
psql_file supabase/migrations/20260714143000_pragas_backend_security.sql
psql_file supabase/migrations/20260714150000_pragas_export_consistency.sql
psql_file supabase/rollback/20260714150000_pragas_export_consistency.down.sql
psql_file supabase/rollback/20260714143000_pragas_backend_security.down.sql
docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
DO $$
BEGIN
  IF to_regtype('public.pragas_deletion_job_status') IS NOT NULL THEN
    RAISE EXCEPTION 'clean_replay_recreated_unused_deletion_enum';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'pragas_deletion_jobs'
       AND column_name = 'status'
       AND data_type = 'text'
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.pragas_deletion_jobs'::regclass
       AND conname = 'pragas_deletion_jobs_status_check'
       AND pg_get_constraintdef(oid) LIKE '%requested%'
       AND pg_get_constraintdef(oid) LIKE '%processing%'
       AND pg_get_constraintdef(oid) LIKE '%retry%'
       AND pg_get_constraintdef(oid) LIKE '%blocked_global_decision%'
       AND pg_get_constraintdef(oid) LIKE '%reactivated%'
  ) THEN
    RAISE EXCEPTION 'clean_replay_lost_deletion_state_contract';
  END IF;
  IF to_regprocedure('public.claim_pragas_deletion_jobs(integer)') IS NOT NULL
     OR to_regprocedure('public.request_pragas_account_deletion(uuid)') IS NOT NULL
  THEN
    RAISE EXCEPTION 'clean_replay_rollback_left_deletion_runtime';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.pragas_ai_content_reports
     WHERE id = '91000000-0000-4000-8000-000000000001'
       AND content = 'retain this report'
  ) THEN
    RAISE EXCEPTION 'clean_replay_rollback_lost_retained_data';
  END IF;
END
$$;
SQL

printf '%s\n' 'PostgreSQL 17 migration/drift/RLS/rate-limit/cleanup/rollback: PASS'
