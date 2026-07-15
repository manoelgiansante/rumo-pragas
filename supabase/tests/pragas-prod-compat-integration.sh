#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="pragas-prod-compat-${RANDOM}"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql_file() {
  docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres \
    < "$repo_root/$1"
}

assert_sql_fails() {
  local label="$1"
  local sql="$2"
  if docker exec "$container" psql -qAt -v ON_ERROR_STOP=1 -U postgres \
      -c "$sql" >/dev/null 2>&1; then
    echo "expected SQL failure: $label" >&2
    return 1
  fi
}

assert_sql_equals() {
  local label="$1"
  local expected="$2"
  local sql="$3"
  local actual
  actual="$(docker exec "$container" psql -qAt -v ON_ERROR_STOP=1 \
    -U postgres -c "$sql")"
  if [[ "$actual" != "$expected" ]]; then
    echo "$label: expected '$expected', got '$actual'" >&2
    return 1
  fi
}

wait_for_postgres_final() {
  local ready="false"
  local _attempt
  for _attempt in $(seq 1 60); do
    # The image starts a temporary bootstrap server that can satisfy pg_isready
    # before shutting down. Require the init-complete marker and a real query so
    # the test only continues against the final server process.
    if docker logs "$container" 2>&1 \
        | grep -q 'PostgreSQL init process complete; ready for start up' \
       && docker exec "$container" psql -qAt -U postgres \
            -c 'SELECT 1' 2>/dev/null | grep -qx '1'; then
      ready="true"
      break
    fi
    sleep 1
  done
  if [[ "$ready" != "true" ]]; then
    echo "PostgreSQL 17 test container did not reach final ready state" >&2
    return 1
  fi
}

docker run --rm -d --name "$container" -e POSTGRES_PASSWORD=postgres \
  postgres:17-alpine >/dev/null
wait_for_postgres_final

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
      THEN (string_to_array(name, '/'))[
        1:array_length(string_to_array(name, '/'), 1) - 1
      ]
    ELSE ARRAY[]::text[]
  END
$$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;

CREATE TABLE public.pragas_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role text DEFAULT 'produtor',
  city text,
  state text,
  crops text[],
  avatar_url text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.pragas_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_profiles_select_own ON public.pragas_profiles
  FOR SELECT TO PUBLIC USING (auth.uid() = user_id);
CREATE POLICY legacy_profiles_insert_own ON public.pragas_profiles
  FOR INSERT TO PUBLIC WITH CHECK (auth.uid() = user_id);
CREATE POLICY legacy_profiles_update_own ON public.pragas_profiles
  FOR UPDATE TO PUBLIC USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.pragas_diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  crop text NOT NULL,
  pest_id text,
  pest_name text,
  confidence double precision,
  image_url text,
  notes text,
  location_lat double precision,
  location_lng double precision,
  location_name text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.pragas_diagnoses ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_diagnoses_select_own ON public.pragas_diagnoses
  FOR SELECT TO PUBLIC USING (auth.uid() = user_id);
CREATE POLICY legacy_diagnoses_insert_own ON public.pragas_diagnoses
  FOR INSERT TO PUBLIC WITH CHECK (auth.uid() = user_id);
CREATE POLICY legacy_diagnoses_delete_own ON public.pragas_diagnoses
  FOR DELETE TO PUBLIC USING (auth.uid() = user_id);

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  provider text NOT NULL DEFAULT 'free',
  app text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (user_id, app)
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_subscriptions_select_own ON public.subscriptions
  FOR SELECT TO PUBLIC USING (auth.uid() = user_id);

CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event text NOT NULL,
  properties jsonb DEFAULT '{}'::jsonb,
  platform text,
  timestamp timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_analytics_select_own ON public.analytics_events
  FOR SELECT TO PUBLIC USING (auth.uid() = user_id);

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_audit_select_own ON public.audit_log
  FOR SELECT TO PUBLIC USING (auth.uid() = user_id);

CREATE TABLE public.chat_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app text NOT NULL,
  year_month text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, app, year_month)
);
CREATE FUNCTION public.get_chat_usage_count(p_user_id uuid, p_app text)
RETURNS integer LANGUAGE sql AS $$
  SELECT coalesce(sum(count), 0)::integer
  FROM public.chat_usage WHERE user_id = p_user_id AND app = p_app
$$;
CREATE FUNCTION public.increment_chat_usage(p_user_id uuid, p_app text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO public.chat_usage (user_id, app, year_month, count)
  VALUES (p_user_id, p_app, to_char(current_date, 'YYYY-MM'), 1)
  ON CONFLICT (user_id, app, year_month) DO UPDATE
    SET count = public.chat_usage.count + 1
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

CREATE TABLE public.pragas_diagnosis_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  diagnosis_id text NOT NULL,
  pest_id text,
  pest_name text,
  feedback text NOT NULL DEFAULT 'positive',
  comment text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pragas_diagnosis_feedback_feedback_check
    CHECK (feedback IN ('positive', 'negative'))
);
ALTER TABLE public.pragas_diagnosis_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_feedback_select_own ON public.pragas_diagnosis_feedback
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY legacy_feedback_insert_own ON public.pragas_diagnosis_feedback
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.pragas_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text,
  expo_token text,
  platform text,
  device_info jsonb,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (user_id, token)
);
ALTER TABLE public.pragas_push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_push_select_own ON public.pragas_push_tokens
  FOR SELECT TO PUBLIC USING (auth.uid() = user_id);
CREATE POLICY legacy_push_insert_own ON public.pragas_push_tokens
  FOR INSERT TO PUBLIC WITH CHECK (auth.uid() = user_id);
CREATE POLICY legacy_push_update_own ON public.pragas_push_tokens
  FOR UPDATE TO PUBLIC USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY legacy_push_delete_own ON public.pragas_push_tokens
  FOR DELETE TO PUBLIC USING (auth.uid() = user_id);

CREATE TABLE public.pragas_push_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id text NOT NULL UNIQUE,
  sender text NOT NULL DEFAULT 'system',
  category text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  recipient_count integer NOT NULL DEFAULT 0,
  accepted_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.pragas_push_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_notif_service_role_all ON public.pragas_push_notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.pragas_notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL,
  title text,
  body text,
  data jsonb,
  sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.pragas_notification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_queue_service_all ON public.pragas_notification_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.pragas_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  platform text,
  product_id text,
  store_transaction_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  asaas_customer_id text,
  asaas_subscription_id text,
  asaas_last_payment_id text,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC, anon, authenticated, service_role;

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT md5('auth-' || n)::uuid, 'user-' || n || '@example.test',
       jsonb_build_object('full_name', 'Prod User ' || n)
FROM generate_series(1, 82) AS source(n);

INSERT INTO public.pragas_profiles (id, user_id, full_name)
SELECT md5('profile-' || n)::uuid, md5('auth-' || n)::uuid, 'Prod User ' || n
FROM generate_series(1, 82) AS source(n);

INSERT INTO public.pragas_subscriptions (user_id, plan, status)
SELECT md5('auth-' || n)::uuid, 'free', 'active'
FROM generate_series(1, 82) AS source(n);

INSERT INTO public.subscriptions (user_id, plan, status, provider, app)
VALUES (md5('auth-1')::uuid, 'enterprise', 'active', 'google', 'rumo-pragas');

INSERT INTO public.pragas_diagnoses (id, user_id, crop, pest_name)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', md5('auth-1')::uuid, 'soja', 'Lagarta'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', md5('auth-2')::uuid, 'milho', 'Percevejo');

INSERT INTO public.pragas_push_tokens (
  user_id, token, expo_token, platform, is_active
) VALUES
  (md5('auth-1')::uuid, 'ExponentPushToken[AAAAAAAAAAAAAAAAAAAA]',
    'ExponentPushToken[AAAAAAAAAAAAAAAAAAAA]', 'ios', true),
  (md5('auth-2')::uuid, 'ExponentPushToken[BBBBBBBBBBBBBBBBBBBB]',
    'ExponentPushToken[BBBBBBBBBBBBBBBBBBBB]', 'android', true);

INSERT INTO public.pragas_notification_queue (token, title, body)
VALUES ('ExponentPushToken[AAAAAAAAAAAAAAAAAAAA]', 'Legacy', 'Owned row');
SQL

psql_file supabase/migrations/20260714143000_pragas_backend_security.sql
psql_file supabase/migrations/20260714143000_pragas_backend_security.sql
psql_file supabase/migrations/20260714150000_pragas_export_consistency.sql
psql_file supabase/migrations/20260714150000_pragas_export_consistency.sql
psql_file supabase/migrations/20260715170000_pragas_link_account_prod_hotfix.sql
psql_file supabase/migrations/20260715170000_pragas_link_account_prod_hotfix.sql

# Inject a failure at the very end of 171000, immediately before COMMIT. This
# proves that PostgreSQL rolls back every earlier DDL statement in the file and
# that a retry starts from the intact 170000 hotfix state.
if {
  sed '$d' \
    "$repo_root/supabase/migrations/20260715171000_pragas_prod_compat_runtime.sql"
  printf '%s\n' \
    "DO \$pragas_atomicity_probe\$ BEGIN" \
    "  RAISE EXCEPTION 'intentional late migration failure';" \
    "END \$pragas_atomicity_probe\$;" \
    "COMMIT;"
} | docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres \
    >/dev/null 2>&1; then
  echo "expected late 171000 migration failure" >&2
  exit 1
fi

docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'public.pragas_profiles'::regclass
       AND attname = 'avatar_path' AND NOT attisdropped
  ) OR to_regclass('public.pragas_app_links') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_attribute
        WHERE attrelid = 'public.pragas_push_notifications'::regclass
          AND attname = 'request_hash' AND NOT attisdropped
     ) THEN
    RAISE EXCEPTION '171000 late failure left partial schema changes';
  END IF;
  IF position(
    'pragas_link_account_prod_hotfix_v1' IN
    pg_get_functiondef('public.pragas_link_account()'::regprocedure)
  ) = 0 THEN
    RAISE EXCEPTION '171000 late failure replaced the committed hotfix';
  END IF;
END
$$;
SQL

psql_file supabase/migrations/20260715171000_pragas_prod_compat_runtime.sql
psql_file supabase/migrations/20260715171000_pragas_prod_compat_runtime.sql
psql_file supabase/migrations/20260715172000_pragas_prod_compat_export.sql
psql_file supabase/migrations/20260715172000_pragas_prod_compat_export.sql

docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
DO $$
DECLARE
  v_profile_count bigint;
  v_mismatched_count bigint;
  v_link jsonb;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE id <> user_id)
    INTO v_profile_count, v_mismatched_count
    FROM public.pragas_profiles;
  IF v_profile_count <> 82 OR v_mismatched_count <> 82 THEN
    RAISE EXCEPTION 'live profile identity rows changed: %, %',
      v_profile_count, v_mismatched_count;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
     WHERE user_id = md5('auth-1')::uuid AND app = 'rumo-pragas'
       AND plan = 'enterprise' AND status = 'active' AND provider = 'google'
  ) THEN
    RAISE EXCEPTION 'existing entitlement changed';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', md5('auth-1')::uuid::text, true);
  v_link := public.pragas_link_account();
  IF v_link ->> 'code' <> 'linked' THEN
    RAISE EXCEPTION 'unexpected first link result: %', v_link;
  END IF;
  v_link := public.pragas_link_account();
  IF v_link ->> 'code' <> 'already_linked' THEN
    RAISE EXCEPTION 'unexpected replay link result: %', v_link;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
     WHERE user_id = md5('auth-1')::uuid AND app = 'rumo-pragas'
       AND plan = 'enterprise' AND status = 'active' AND provider = 'google'
  ) THEN
    RAISE EXCEPTION 'link rewrote entitlement';
  END IF;

  IF (SELECT count(*) FROM storage.buckets WHERE id = 'pragas-avatars'
        AND NOT public AND file_size_limit = 2097152) <> 1 THEN
    RAISE EXCEPTION 'avatar bucket contract missing';
  END IF;
END
$$;
SQL

docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
DO $$
DECLARE
  v_user uuid := md5('auth-3')::uuid;
  v_delete_user uuid := md5('auth-4')::uuid;
  v_link jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_conflict jsonb;
  v_reservation jsonb;
  v_lease uuid;
  v_job_id uuid;
  v_job_lease uuid;
  v_event_id uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  v_link := public.pragas_link_account();
  IF v_link ->> 'linked' <> 'true' THEN
    RAISE EXCEPTION 'active test user link failed: %', v_link;
  END IF;

  v_result := public.consume_pragas_api_rate_limit(
    v_user, 'diagnose', 2, 3600,
    '11111111-aaaa-4aaa-8aaa-111111111111', repeat('a', 64)
  );
  v_replay := public.consume_pragas_api_rate_limit(
    v_user, 'diagnose', 2, 3600,
    '11111111-aaaa-4aaa-8aaa-111111111111', repeat('a', 64)
  );
  v_conflict := public.consume_pragas_api_rate_limit(
    v_user, 'diagnose', 2, 3600,
    '11111111-aaaa-4aaa-8aaa-111111111111', repeat('b', 64)
  );
  IF v_result ->> 'allowed' <> 'true'
     OR v_replay ->> 'replayed' <> 'true'
     OR v_conflict ->> 'conflict' <> 'true'
     OR (SELECT request_count FROM public.pragas_api_rate_limit_counters
          WHERE user_id = v_user AND scope = 'diagnose') <> 1
  THEN
    RAISE EXCEPTION 'durable rate limit replay/conflict failed: %, %, %',
      v_result, v_replay, v_conflict;
  END IF;

  v_reservation := public.reserve_pragas_ai_idempotency(
    v_user, 'diagnosis', '22222222-aaaa-4aaa-8aaa-222222222222', repeat('c', 64)
  );
  v_lease := (v_reservation ->> 'lease_token')::uuid;
  IF v_reservation ->> 'state' <> 'reserved'
     OR public.reserve_pragas_ai_idempotency(
       v_user, 'diagnosis', '22222222-aaaa-4aaa-8aaa-222222222222', repeat('c', 64)
     ) ->> 'state' <> 'in_progress'
     OR public.reserve_pragas_ai_idempotency(
       v_user, 'diagnosis', '22222222-aaaa-4aaa-8aaa-222222222222', repeat('d', 64)
     ) ->> 'state' <> 'conflict'
  THEN
    RAISE EXCEPTION 'AI idempotency reservation contract failed';
  END IF;
  v_result := public.complete_pragas_ai_idempotency(
    v_user, 'diagnosis', '22222222-aaaa-4aaa-8aaa-222222222222',
    repeat('c', 64), v_lease, 200, '{"diagnosis":"ok"}'::jsonb, 3600
  );
  v_replay := public.reserve_pragas_ai_idempotency(
    v_user, 'diagnosis', '22222222-aaaa-4aaa-8aaa-222222222222', repeat('c', 64)
  );
  IF v_result ->> 'completed' <> 'true'
     OR v_replay ->> 'state' <> 'completed'
     OR v_replay -> 'response_body' ->> 'diagnosis' <> 'ok'
  THEN
    RAISE EXCEPTION 'AI idempotency completion replay failed: %, %',
      v_result, v_replay;
  END IF;

  v_reservation := public.reserve_pragas_ai_idempotency(
    v_user, 'chat', '33333333-aaaa-4aaa-8aaa-333333333333', repeat('e', 64)
  );
  v_lease := (v_reservation ->> 'lease_token')::uuid;
  IF NOT public.release_pragas_ai_idempotency(
    v_user, 'chat', '33333333-aaaa-4aaa-8aaa-333333333333',
    repeat('e', 64), v_lease
  ) THEN
    RAISE EXCEPTION 'AI pre-provider release failed';
  END IF;

  v_reservation := public.reserve_pragas_ai_idempotency(
    v_user, 'chat', '44444444-aaaa-4aaa-8aaa-444444444444', repeat('f', 64)
  );
  v_lease := (v_reservation ->> 'lease_token')::uuid;
  IF NOT public.mark_pragas_ai_provider_started(
      v_user, 'chat', '44444444-aaaa-4aaa-8aaa-444444444444',
      repeat('f', 64), v_lease
    ) OR NOT public.mark_pragas_ai_unknown_outcome(
      v_user, 'chat', '44444444-aaaa-4aaa-8aaa-444444444444',
      repeat('f', 64), v_lease
    ) OR public.reserve_pragas_ai_idempotency(
      v_user, 'chat', '44444444-aaaa-4aaa-8aaa-444444444444', repeat('f', 64)
    ) ->> 'state' <> 'unknown_outcome'
  THEN
    RAISE EXCEPTION 'AI unknown outcome contract failed';
  END IF;

  v_result := public.grant_pragas_ai_consent('diagnosis', '2026-07-14.1');
  IF v_result ->> 'granted' <> 'true'
     OR public.record_pragas_ai_consent(
       v_user, 'diagnosis', '2026-07-14.1'
     ) ->> 'accepted' <> 'true'
  THEN
    RAISE EXCEPTION 'AI consent grant/use failed';
  END IF;
  PERFORM public.revoke_pragas_ai_consent('diagnosis');
  IF public.record_pragas_ai_consent(
       v_user, 'diagnosis', '2026-07-14.1'
     ) ->> 'accepted' <> 'false'
  THEN
    RAISE EXCEPTION 'AI consent revoke failed';
  END IF;

  v_result := public.record_pragas_analytics_events(
    v_user,
    jsonb_build_array(jsonb_build_object(
      'event_id', v_event_id, 'event', 'diagnosis.completed',
      'platform', 'ios', 'properties', '{"source":"camera"}'::jsonb,
      'timestamp', clock_timestamp()
    ))
  );
  v_replay := public.record_pragas_analytics_events(
    v_user,
    jsonb_build_array(jsonb_build_object(
      'event_id', v_event_id, 'event', 'diagnosis.completed',
      'platform', 'ios', 'properties', '{"source":"camera"}'::jsonb,
      'timestamp', clock_timestamp()
    ))
  );
  IF v_result ->> 'inserted' <> '1' OR v_replay ->> 'inserted' <> '0' THEN
    RAISE EXCEPTION 'analytics dedup failed: %, %', v_result, v_replay;
  END IF;

  INSERT INTO public.pragas_diagnoses (id, user_id, crop, pest_name)
  VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', v_user, 'algodao', 'Bicudo');
  INSERT INTO public.pragas_diagnosis_feedback (
    user_id, diagnosis_id, verdict, selected_alternative, notes
  ) VALUES (
    v_user, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'incorrect',
    'Outra praga', 'Revisado no campo'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.pragas_diagnosis_feedback
     WHERE user_id = v_user AND feedback = 'negative'
       AND verdict = 'incorrect'
  ) THEN
    RAISE EXCEPTION 'legacy feedback bridge failed';
  END IF;

  IF jsonb_array_length(public.export_pragas_notification_queue_snapshot(
       md5('auth-1')::uuid, clock_timestamp(), 10001
     )) <> 1
  THEN
    RAISE EXCEPTION 'notification export snapshot failed';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_delete_user::text, true);
  PERFORM public.pragas_link_account();
  PERFORM public.touch_pragas_push_token(
    'ExponentPushToken[DDDDDDDDDDDDDDDDDDDD]', 'android', true
  );
  INSERT INTO public.pragas_notification_queue (token, title, body)
  VALUES ('ExponentPushToken[DDDDDDDDDDDDDDDDDDDD]', 'Delete', 'Delete me');
  PERFORM public.request_pragas_account_deletion(v_delete_user);
  SELECT id, lease_token INTO v_job_id, v_job_lease
    FROM public.claim_pragas_deletion_job(v_delete_user);
  IF v_job_id IS NULL OR v_job_lease IS NULL THEN
    RAISE EXCEPTION 'deletion job claim failed';
  END IF;
  PERFORM public.cleanup_pragas_user_rows(v_delete_user);
  IF EXISTS (
    SELECT 1 FROM public.pragas_notification_queue
     WHERE token = 'ExponentPushToken[DDDDDDDDDDDDDDDDDDDD]'
  ) OR NOT public.complete_pragas_deletion_job(v_job_id, v_job_lease) THEN
    RAISE EXCEPTION 'app-scoped deletion cleanup failed';
  END IF;
  IF public.pragas_link_account() ->> 'code' <> 'deleted_reactivation_required' THEN
    RAISE EXCEPTION 'deleted login gate failed';
  END IF;
  v_result := public.reactivate_pragas_account(
    v_delete_user,
    '55555555-aaaa-4aaa-8aaa-555555555555',
    '66666666-aaaa-4aaa-8aaa-666666666666'
  );
  IF v_result ->> 'reactivated' <> 'true'
     OR public.pragas_link_account() ->> 'linked' <> 'true'
  THEN
    RAISE EXCEPTION 'reactivation flow failed: %', v_result;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc AS procedure_row
      JOIN pg_namespace AS namespace_row
        ON namespace_row.oid = procedure_row.pronamespace
     WHERE namespace_row.nspname = 'public'
       AND procedure_row.prosecdef
       AND (
         procedure_row.proname LIKE 'pragas_%'
         OR procedure_row.proname LIKE '%_pragas_%'
       )
       AND NOT (
         coalesce(procedure_row.proconfig, ARRAY[]::text[])
           @> ARRAY['search_path=""']::text[]
       )
  ) THEN
    RAISE EXCEPTION 'security definer without empty search_path';
  END IF;

  IF has_table_privilege('anon', 'public.pragas_profiles', 'SELECT')
     OR has_table_privilege('anon', 'public.pragas_diagnoses', 'SELECT')
     OR has_table_privilege('anon', 'public.pragas_diagnosis_feedback', 'SELECT')
     OR has_table_privilege('anon', 'public.pragas_push_tokens', 'SELECT')
     OR has_table_privilege('authenticated', 'public.pragas_push_notifications', 'SELECT')
     OR has_table_privilege('authenticated', 'public.pragas_notification_queue', 'SELECT')
  THEN
    RAISE EXCEPTION 'app-specific ACL remains broad';
  END IF;
  IF has_function_privilege('anon', 'public.pragas_link_account()', 'EXECUTE')
     OR has_function_privilege(
       'authenticated',
       'public.consume_pragas_api_rate_limit(uuid,text,integer,integer,uuid,text)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.consume_pragas_api_rate_limit(uuid,text,integer,integer,uuid,text)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'function ACL contract failed';
  END IF;
END
$$;
SQL

docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
DO $$
DECLARE
  v_user uuid := md5('auth-3')::uuid;
  v_result jsonb;
  v_replay jsonb;
  v_lease uuid;
  v_scrubbed integer;
BEGIN
  v_result := public.claim_pragas_push_notification(
    '77777777-aaaa-4aaa-8aaa-777777777777', repeat('1', 64), 'transactional'
  );
  v_lease := (v_result ->> 'lease_token')::uuid;
  IF v_result ->> 'state' <> 'reserved'
     OR public.claim_pragas_push_notification(
       '77777777-aaaa-4aaa-8aaa-777777777777', repeat('1', 64), 'transactional'
     ) ->> 'state' <> 'in_progress'
     OR public.claim_pragas_push_notification(
       '77777777-aaaa-4aaa-8aaa-777777777777', repeat('2', 64), 'transactional'
     ) ->> 'state' <> 'conflict'
     OR NOT public.release_pragas_push_notification(
       '77777777-aaaa-4aaa-8aaa-777777777777', repeat('1', 64), v_lease
     )
  THEN
    RAISE EXCEPTION 'push pre-provider lease/release contract failed';
  END IF;

  v_result := public.claim_pragas_push_notification(
    '88888888-aaaa-4aaa-8aaa-888888888888', repeat('3', 64),
    'climate_risk_educational'
  );
  v_lease := (v_result ->> 'lease_token')::uuid;
  IF NOT public.mark_pragas_push_provider_started(
      '88888888-aaaa-4aaa-8aaa-888888888888', repeat('3', 64), v_lease
    ) OR NOT public.mark_pragas_push_unknown_outcome(
      '88888888-aaaa-4aaa-8aaa-888888888888', repeat('3', 64), v_lease,
      2, 1, 0
    ) OR public.claim_pragas_push_notification(
      '88888888-aaaa-4aaa-8aaa-888888888888', repeat('3', 64),
      'climate_risk_educational'
    ) ->> 'state' <> 'unknown_outcome'
  THEN
    RAISE EXCEPTION 'push unknown-outcome contract failed';
  END IF;

  v_result := public.claim_pragas_push_notification(
    '99999999-aaaa-4aaa-8aaa-999999999999', repeat('4', 64), 'transactional'
  );
  v_lease := (v_result ->> 'lease_token')::uuid;
  IF NOT public.mark_pragas_push_provider_started(
      '99999999-aaaa-4aaa-8aaa-999999999999', repeat('4', 64), v_lease
    ) OR NOT public.complete_pragas_push_notification(
      '99999999-aaaa-4aaa-8aaa-999999999999', repeat('4', 64), v_lease,
      'partial', 3, 2, 1
    )
  THEN
    RAISE EXCEPTION 'push completion contract failed';
  END IF;
  v_replay := public.claim_pragas_push_notification(
    '99999999-aaaa-4aaa-8aaa-999999999999', repeat('4', 64), 'transactional'
  );
  IF v_replay ->> 'state' <> 'completed'
     OR v_replay ->> 'status' <> 'partial'
     OR v_replay ->> 'accepted_count' <> '2'
  THEN
    RAISE EXCEPTION 'push completion replay failed: %', v_replay;
  END IF;

  -- Expired post-provider leases are terminal unknown outcomes, never resend.
  v_result := public.claim_pragas_push_notification(
    'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa', repeat('5', 64), 'transactional'
  );
  v_lease := (v_result ->> 'lease_token')::uuid;
  PERFORM public.mark_pragas_push_provider_started(
    'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa', repeat('5', 64), v_lease
  );
  UPDATE public.pragas_push_notifications
     SET lease_expires_at = clock_timestamp() - interval '1 second'
   WHERE notification_id = 'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa';
  IF public.claim_pragas_push_notification(
       'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa', repeat('5', 64), 'transactional'
     ) ->> 'state' <> 'unknown_outcome'
  THEN
    RAISE EXCEPTION 'push crash boundary could resend';
  END IF;

  v_result := public.reserve_pragas_ai_idempotency(
    v_user, 'chat', 'aaaaaaaa-cccc-4aaa-8aaa-aaaaaaaaaaaa', repeat('6', 64)
  );
  v_lease := (v_result ->> 'lease_token')::uuid;
  PERFORM public.complete_pragas_ai_idempotency(
    v_user, 'chat', 'aaaaaaaa-cccc-4aaa-8aaa-aaaaaaaaaaaa',
    repeat('6', 64), v_lease, 200, '{"answer":"temporary"}'::jsonb, 60
  );
  UPDATE public.pragas_ai_idempotency_records
     SET response_expires_at = clock_timestamp() - interval '1 second'
   WHERE user_id = v_user AND scope = 'chat'
     AND idempotency_key = 'aaaaaaaa-cccc-4aaa-8aaa-aaaaaaaaaaaa';
  v_scrubbed := public.scrub_expired_pragas_ai_idempotency(1000);
  IF v_scrubbed <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.pragas_ai_idempotency_records
        WHERE user_id = v_user AND scope = 'chat'
          AND idempotency_key = 'aaaaaaaa-cccc-4aaa-8aaa-aaaaaaaaaaaa'
          AND state = 'expired' AND response_body IS NULL
          AND response_status IS NULL
     )
  THEN
    RAISE EXCEPTION 'AI response scrub contract failed: %', v_scrubbed;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  v_result := public.consume_pragas_mcp_rate_limit(
    'bbbbbbbb-cccc-4bbb-8bbb-bbbbbbbbbbbb', repeat('7', 64)
  );
  v_replay := public.consume_pragas_mcp_rate_limit(
    'bbbbbbbb-cccc-4bbb-8bbb-bbbbbbbbbbbb', repeat('7', 64)
  );
  IF v_result ->> 'allowed' <> 'true' OR v_replay ->> 'replayed' <> 'true'
     OR NOT EXISTS (
       SELECT 1 FROM public.pragas_api_rate_limit_counters
        WHERE user_id = v_user AND scope = 'mcp' AND request_count = 1
     ) OR EXISTS (
       SELECT 1 FROM public.pragas_api_rate_limit_counters
        WHERE user_id = md5('auth-2')::uuid AND scope = 'mcp'
     )
  THEN
    RAISE EXCEPTION 'identity-derived MCP rate limit failed: %, %',
      v_result, v_replay;
  END IF;

  IF has_function_privilege(
       'anon', 'public.consume_pragas_mcp_rate_limit(uuid,text)', 'EXECUTE'
     ) OR has_function_privilege(
       'service_role', 'public.consume_pragas_mcp_rate_limit(uuid,text)', 'EXECUTE'
     ) OR NOT has_function_privilege(
       'authenticated', 'public.consume_pragas_mcp_rate_limit(uuid,text)', 'EXECUTE'
     ) OR EXISTS (
       SELECT 1 FROM pg_proc
        WHERE oid IN (
          'public.claim_pragas_push_notification(uuid,text,text)'::regprocedure,
          'public.mark_pragas_push_provider_started(uuid,text,uuid)'::regprocedure,
          'public.complete_pragas_push_notification(uuid,text,uuid,text,integer,integer,integer)'::regprocedure,
          'public.mark_pragas_push_unknown_outcome(uuid,text,uuid,integer,integer,integer)'::regprocedure,
          'public.release_pragas_push_notification(uuid,text,uuid)'::regprocedure,
          'public.scrub_expired_pragas_ai_idempotency(integer)'::regprocedure,
          'public.claim_pragas_deletion_jobs(integer)'::regprocedure
        ) AND (
          has_function_privilege('anon', oid, 'EXECUTE')
          OR has_function_privilege('authenticated', oid, 'EXECUTE')
          OR NOT has_function_privilege('service_role', oid, 'EXECUTE')
        )
     )
  THEN
    RAISE EXCEPTION 'new RPC ACL contract failed';
  END IF;
END
$$;
SQL

docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
DO $$
DECLARE
  v_expected record;
  v_oid regprocedure;
BEGIN
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('claim_pragas_deletion_job(uuid)', 'service_role'),
      ('claim_pragas_deletion_jobs(integer)', 'service_role'),
      ('claim_pragas_push_notification(uuid,text,text)', 'service_role'),
      ('cleanup_pragas_user_rows(uuid)', 'service_role'),
      ('complete_pragas_ai_idempotency(uuid,text,uuid,text,uuid,integer,jsonb,integer)', 'service_role'),
      ('complete_pragas_deletion_job(uuid,uuid)', 'service_role'),
      ('complete_pragas_push_notification(uuid,text,uuid,text,integer,integer,integer)', 'service_role'),
      ('consume_pragas_api_rate_limit(uuid,text,integer,integer,uuid,text)', 'service_role'),
      ('consume_pragas_mcp_rate_limit(uuid,text)', 'authenticated'),
      ('export_pragas_notification_queue_snapshot(uuid,timestamp with time zone,integer)', 'service_role'),
      ('grant_pragas_ai_consent(text,text)', 'authenticated'),
      ('mark_pragas_ai_provider_started(uuid,text,uuid,text,uuid)', 'service_role'),
      ('mark_pragas_ai_unknown_outcome(uuid,text,uuid,text,uuid)', 'service_role'),
      ('mark_pragas_push_provider_started(uuid,text,uuid)', 'service_role'),
      ('mark_pragas_push_unknown_outcome(uuid,text,uuid,integer,integer,integer)', 'service_role'),
      ('pragas_link_account()', 'authenticated'),
      ('reactivate_pragas_account(uuid,uuid,uuid)', 'service_role'),
      ('record_pragas_ai_consent(uuid,text,text)', 'service_role'),
      ('record_pragas_analytics_events(uuid,jsonb)', 'service_role'),
      ('release_pragas_ai_idempotency(uuid,text,uuid,text,uuid)', 'service_role'),
      ('release_pragas_push_notification(uuid,text,uuid)', 'service_role'),
      ('request_pragas_account_deletion(uuid)', 'service_role'),
      ('reserve_pragas_ai_idempotency(uuid,text,uuid,text)', 'service_role'),
      ('retry_pragas_deletion_job(uuid,uuid,text,timestamp with time zone)', 'service_role'),
      ('revoke_pragas_ai_consent(text)', 'authenticated'),
      ('scrub_expired_pragas_ai_idempotency(integer)', 'service_role'),
      ('set_pragas_location_consent(uuid,boolean,text,timestamp with time zone,bigint)', 'authenticated'),
      ('touch_pragas_push_token(text,text,boolean)', 'authenticated'),
      ('transition_pragas_ai_content_report(uuid,text,uuid,text)', 'service_role')
    ) AS expected(signature, execution_role)
  LOOP
    v_oid := to_regprocedure('public.' || v_expected.signature);
    IF v_oid IS NULL
       OR NOT has_function_privilege(v_expected.execution_role, v_oid, 'EXECUTE')
       OR has_function_privilege('anon', v_oid, 'EXECUTE')
       OR (
         v_expected.execution_role = 'service_role'
         AND has_function_privilege('authenticated', v_oid, 'EXECUTE')
       )
    THEN
      RAISE EXCEPTION 'RPC signature/ACL mismatch: % (%)',
        v_expected.signature, v_expected.execution_role;
    END IF;
  END LOOP;
END
$$;
SQL

user3_uuid="$(docker exec "$container" psql -qAt -U postgres \
  -c "SELECT md5('auth-3')::uuid")"
user2_uuid="$(docker exec "$container" psql -qAt -U postgres \
  -c "SELECT md5('auth-2')::uuid")"
user5_uuid="$(docker exec "$container" psql -qAt -U postgres \
  -c "SELECT md5('auth-5')::uuid")"

docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
DO $$
DECLARE v_user uuid := md5('auth-5')::uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM public.pragas_link_account();
  INSERT INTO public.pragas_diagnoses (id, user_id, crop, pest_name)
  VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', v_user, 'soja', 'Teste');
  INSERT INTO public.pragas_diagnosis_feedback (
    user_id, diagnosis_id, verdict
  ) VALUES (v_user, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', 'correct');
  PERFORM public.touch_pragas_push_token(
    'ExponentPushToken[EEEEEEEEEEEEEEEEEEEE]', 'ios', true
  );
  PERFORM public.request_pragas_account_deletion(v_user);
END
$$;
SQL

assert_sql_equals "deletion-pending restrictive read gate" "0|0|0|0" \
  "SET ROLE authenticated; SET request.jwt.claim.sub = '$user5_uuid'; SELECT (SELECT count(*) FROM public.pragas_profiles WHERE user_id = '$user5_uuid') || '|' || (SELECT count(*) FROM public.pragas_diagnoses WHERE user_id = '$user5_uuid') || '|' || (SELECT count(*) FROM public.pragas_diagnosis_feedback WHERE user_id = '$user5_uuid') || '|' || (SELECT count(*) FROM public.pragas_push_tokens WHERE user_id = '$user5_uuid')"
assert_sql_equals "deletion-pending restrictive update gate" "0" \
  "SET ROLE authenticated; SET request.jwt.claim.sub = '$user5_uuid'; WITH changed AS (UPDATE public.pragas_profiles SET city = 'blocked' WHERE user_id = '$user5_uuid' RETURNING 1) SELECT count(*) FROM changed"
assert_sql_equals "deletion-pending restrictive delete gate" "0" \
  "SET ROLE authenticated; SET request.jwt.claim.sub = '$user5_uuid'; WITH removed AS (DELETE FROM public.pragas_diagnoses WHERE user_id = '$user5_uuid' RETURNING 1) SELECT count(*) FROM removed"
assert_sql_fails "deletion-pending restrictive insert gate" \
  "SET ROLE authenticated; SET request.jwt.claim.sub = '$user5_uuid'; INSERT INTO public.pragas_diagnoses (user_id, crop) VALUES ('$user5_uuid', 'blocked')"

docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
DO $$
DECLARE
  v_user uuid := md5('auth-5')::uuid;
  v_job uuid;
  v_lease uuid;
BEGIN
  SELECT id, lease_token INTO v_job, v_lease
    FROM public.claim_pragas_deletion_job(v_user);
  PERFORM public.cleanup_pragas_user_rows(v_user);
  IF NOT public.complete_pragas_deletion_job(v_job, v_lease) THEN
    RAISE EXCEPTION 'restrictive gate deletion completion failed';
  END IF;
  PERFORM public.reactivate_pragas_account(
    v_user,
    'cccccccc-aaaa-4ccc-8ccc-cccccccccccc',
    'dddddddd-aaaa-4ddd-8ddd-dddddddddddd'
  );
END
$$;
SQL
assert_sql_equals "reactivation restores restrictive access" "1" \
  "SET ROLE authenticated; SET request.jwt.claim.sub = '$user5_uuid'; WITH inserted AS (INSERT INTO public.pragas_diagnoses (user_id, crop) VALUES ('$user5_uuid', 'restored') RETURNING 1) SELECT count(*) FROM inserted"
assert_sql_equals "restrictive policy inventory" "5|0" \
  "SELECT count(*) FILTER (WHERE permissive = 'RESTRICTIVE' AND policyname = 'pragas_active_link_restrict') || '|' || count(*) FILTER (WHERE permissive = 'PERMISSIVE' AND roles && ARRAY['public','anon','authenticated']::name[] AND ((cmd IN ('ALL','SELECT','UPDATE','DELETE') AND (qual IS NULL OR qual NOT ILIKE '%auth.uid%' OR qual NOT ILIKE '%user_id%')) OR (cmd IN ('ALL','INSERT','UPDATE') AND (with_check IS NULL OR with_check NOT ILIKE '%auth.uid%' OR with_check NOT ILIKE '%user_id%')))) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('pragas_profiles','pragas_diagnoses','pragas_diagnosis_feedback','pragas_push_tokens','pragas_user_preferences')"

assert_sql_fails "anonymous profile access" \
  "SET ROLE anon; SELECT count(*) FROM public.pragas_profiles"
assert_sql_equals "authenticated own profile RLS" "1" \
  "SET ROLE authenticated; SET request.jwt.claim.sub = '$user3_uuid'; SELECT count(*) FROM public.pragas_profiles"
assert_sql_equals "authenticated editable profile column" "1" \
  "SET ROLE authenticated; SET request.jwt.claim.sub = '$user3_uuid'; WITH changed AS (UPDATE public.pragas_profiles SET city = 'Permitida' WHERE user_id = '$user3_uuid' RETURNING 1) SELECT count(*) FROM changed"
assert_sql_fails "authenticated profile id is immutable" \
  "SET ROLE authenticated; SET request.jwt.claim.sub = '$user3_uuid'; UPDATE public.pragas_profiles SET id = md5('forged-profile-id')::uuid WHERE user_id = '$user3_uuid'"
assert_sql_fails "authenticated profile owner is immutable" \
  "SET ROLE authenticated; SET request.jwt.claim.sub = '$user3_uuid'; UPDATE public.pragas_profiles SET user_id = '$user2_uuid' WHERE user_id = '$user3_uuid'"
assert_sql_equals "profile update column ACL" "false|true|false|false" \
  "SELECT has_table_privilege('authenticated', 'public.pragas_profiles', 'UPDATE') || '|' || has_column_privilege('authenticated', 'public.pragas_profiles', 'city', 'UPDATE') || '|' || has_column_privilege('authenticated', 'public.pragas_profiles', 'id', 'UPDATE') || '|' || has_column_privilege('authenticated', 'public.pragas_profiles', 'user_id', 'UPDATE')"
assert_sql_fails "cross-user feedback ownership" \
  "SET ROLE authenticated; SET request.jwt.claim.sub = '$user3_uuid'; INSERT INTO public.pragas_diagnosis_feedback (user_id, diagnosis_id, verdict) VALUES ('$user3_uuid', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'correct')"
assert_sql_fails "cross-user avatar path" \
  "SET ROLE authenticated; SET request.jwt.claim.sub = '$user3_uuid'; INSERT INTO storage.objects (bucket_id, name) VALUES ('pragas-avatars', '$user2_uuid/avatar-cross.png')"
assert_sql_equals "own avatar insert" "1" \
  "SET ROLE authenticated; SET request.jwt.claim.sub = '$user3_uuid'; INSERT INTO storage.objects (bucket_id, name) VALUES ('pragas-avatars', '$user3_uuid/avatar-own.png'); SELECT count(*) FROM storage.objects WHERE name LIKE '%/avatar-own.png'"

docker exec "$container" psql -qAt -U postgres -c \
  "SELECT tablename || '|' || policyname || '|' || roles::text || '|' || cmd FROM pg_policies WHERE schemaname IN ('public', 'storage') AND tablename IN ('pragas_profiles', 'pragas_diagnoses', 'pragas_diagnosis_feedback', 'pragas_push_tokens', 'objects') ORDER BY tablename, policyname" \
  >/dev/null

echo "pragas prod compatibility live-shape: PASS"

docker rm -f "$container" >/dev/null
container="pragas-prod-compat-clean-${RANDOM}"
docker run --rm -d --name "$container" -e POSTGRES_PASSWORD=postgres \
  postgres:17-alpine >/dev/null
wait_for_postgres_final

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
      THEN (string_to_array(name, '/'))[
        1:array_length(string_to_array(name, '/'), 1) - 1
      ]
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

# PostgreSQL 17 removed the historical implicit name[]/text[] coercion used by
# the already-applied 202606 migration. The fixture-only operator keeps that
# immutable migration replayable without changing production history.
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
psql_file supabase/migrations/20260714143000_pragas_backend_security.sql
psql_file supabase/migrations/20260714150000_pragas_export_consistency.sql
psql_file supabase/migrations/20260715170000_pragas_link_account_prod_hotfix.sql
psql_file supabase/migrations/20260715171000_pragas_prod_compat_runtime.sql
psql_file supabase/migrations/20260715172000_pragas_prod_compat_export.sql

docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('33333333-3333-4333-8333-333333333333', 'legacy-trigger@example.test',
    '{"full_name":"Legacy Trigger"}'),
  ('44444444-4444-4444-8444-444444444444', 'generated-link@example.test',
    '{"full_name":"Generated Link"}');

-- Prove both paths: the shared legacy auth trigger uses id=user_id, while the
-- app RPC uses generated id + unique user_id after its trigger-created rows
-- are removed.
DELETE FROM public.subscriptions
 WHERE user_id = '44444444-4444-4444-8444-444444444444'
   AND app = 'rumo-pragas';
DELETE FROM public.pragas_profiles
 WHERE user_id = '44444444-4444-4444-8444-444444444444';

DO $$
DECLARE v_link jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pragas_profiles
     WHERE user_id = '33333333-3333-4333-8333-333333333333'
       AND id = user_id
  ) THEN
    RAISE EXCEPTION 'legacy profile trigger compatibility failed';
  END IF;
  PERFORM set_config(
    'request.jwt.claim.sub',
    '44444444-4444-4444-8444-444444444444', true
  );
  v_link := public.pragas_link_account();
  IF v_link ->> 'code' <> 'linked' OR NOT EXISTS (
    SELECT 1 FROM public.pragas_profiles
     WHERE user_id = '44444444-4444-4444-8444-444444444444'
       AND id <> user_id
  ) THEN
    RAISE EXCEPTION 'generated profile link compatibility failed: %', v_link;
  END IF;
END
$$;
SQL

# Replay every candidate after data exists. This covers the partial/retry path
# and proves the hotfix recognizes the stronger 171000 implementation.
psql_file supabase/migrations/20260715170000_pragas_link_account_prod_hotfix.sql
psql_file supabase/migrations/20260715171000_pragas_prod_compat_runtime.sql
psql_file supabase/migrations/20260715172000_pragas_prod_compat_export.sql

docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'public.pragas_profiles'::regclass
       AND attname = 'id' AND atthasdef AND attnotnull
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pragas_profiles'::regclass
       AND contype IN ('p', 'u')
       AND conkey = ARRAY[
         (SELECT attnum FROM pg_attribute
           WHERE attrelid = 'public.pragas_profiles'::regclass
             AND attname = 'user_id')
       ]::smallint[]
  ) THEN
    RAISE EXCEPTION 'clean replay profile contract incomplete';
  END IF;
  IF position(
    'pragas_link_account_prod_compat_v1' IN
    pg_get_functiondef('public.pragas_link_account()'::regprocedure)
  ) = 0 THEN
    RAISE EXCEPTION 'compat link function was replaced on replay';
  END IF;
END
$$;
SQL

psql_file supabase/rollback/20260715172000_pragas_prod_compat_export.down.sql
psql_file supabase/rollback/20260715171000_pragas_prod_compat_runtime.down.sql
docker exec -i "$container" psql -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
DO $$
DECLARE
  v_before bigint;
  v_link jsonb;
BEGIN
  SELECT count(*) INTO v_before FROM public.pragas_profiles;
  IF to_regprocedure(
    'public.export_pragas_notification_queue_snapshot(uuid,timestamp with time zone,integer)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION '172000 rollback retained candidate export';
  END IF;
  IF position(
    'pragas_link_account_prod_hotfix_v1' IN
    pg_get_functiondef('public.pragas_link_account()'::regprocedure)
  ) = 0 THEN
    RAISE EXCEPTION '171000 rollback did not restore hotfix';
  END IF;
  PERFORM set_config(
    'request.jwt.claim.sub',
    '44444444-4444-4444-8444-444444444444', true
  );
  v_link := public.pragas_link_account();
  IF v_link ->> 'linked' <> 'true'
     OR (SELECT count(*) FROM public.pragas_profiles) <> v_before THEN
    RAISE EXCEPTION 'rollback login/data preservation failed: %', v_link;
  END IF;
END
$$;
SQL
psql_file supabase/migrations/20260715171000_pragas_prod_compat_runtime.sql
psql_file supabase/migrations/20260715172000_pragas_prod_compat_export.sql

echo "pragas prod compatibility clean replay: PASS"
