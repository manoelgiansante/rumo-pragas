#!/usr/bin/env bash
set -euo pipefail

readonly TARGET_REF="jxcnfyeemdltdfqtgbcl"
readonly REVIEWED_SUPABASE_CLI_VERSION="2.98.2"
readonly REVIEWED_SUPABASE_CLI_SHA256="0412442a84b5b85af85ee540dd445e961b4cd1818ddc5365aa0ac298d908bd87"
readonly REVIEWED_EDGE_RUNTIME_IMAGE="supabase/edge-runtime:v1.73.13"
readonly REVIEWED_EDGE_RUNTIME_IMAGE_ID="sha256:cfa86b9ad11f349aa4b930f3ab295d6ad923f2e43c5513c08d79c1f3b990b486"
readonly REVIEWED_PG_BACKUP_IMAGE="public.ecr.aws/supabase/postgres@sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426"
readonly REVIEWED_PG_BACKUP_DIGEST="sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426"
readonly TARGET_VERSIONS=(
  "20260715170000"
  "20260715171000"
  "20260715172000"
)
readonly EDGE_SLUGS=(
  "diagnose-pragas"
  "ai-chat-pragas"
  "pragas-delete-user-account"
  "pragas-export-user-data"
  "pragas-reactivate-account"
  "pragas-analytics"
  "report-ai-content"
  "report-diagnosis-feedback"
  "admin-ai-content-reports"
  "pragas-process-deletions"
  "pragas-process-ai-idempotency"
  "pragas-send-push"
)
readonly NEW_EDGE_SLUGS=(
  "diagnose-pragas"
  "ai-chat-pragas"
  "pragas-delete-user-account"
  "pragas-export-user-data"
  "pragas-reactivate-account"
  "pragas-analytics"
  "report-ai-content"
  "report-diagnosis-feedback"
  "admin-ai-content-reports"
  "pragas-process-deletions"
  "pragas-process-ai-idempotency"
)
readonly EDGE_DEPLOY_ORDER=(
  "pragas-process-deletions"
  "pragas-process-ai-idempotency"
  "pragas-send-push"
  "diagnose-pragas"
  "ai-chat-pragas"
  "pragas-delete-user-account"
  "pragas-export-user-data"
  "pragas-reactivate-account"
  "pragas-analytics"
  "report-ai-content"
  "report-diagnosis-feedback"
  "admin-ai-content-reports"
)
readonly EXISTING_EDGE_SLUG="pragas-send-push"
readonly EXISTING_EDGE_VERSION="18"
readonly EXISTING_EDGE_EZBR="2138ada8ec877822216eff72cdf957754257d9373579d6e437124ac16e3f284a"
readonly EXISTING_EDGE_VERIFY_JWT="true"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mode="${1:---dry-run}"
# The source path is anchored to the resolved repository.
# shellcheck disable=SC1091
source "$repo_root/supabase/scripts/pragas-prod-compat-lib.sh"

usage() {
  echo "usage: $0 [--dry-run|--prepare|--apply]" >&2
}

migration_name() {
  case "$1" in
    20260715170000) echo "20260715170000_pragas_link_account_prod_hotfix.sql" ;;
    20260715171000) echo "20260715171000_pragas_prod_compat_runtime.sql" ;;
    20260715172000) echo "20260715172000_pragas_prod_compat_export.sql" ;;
    *) return 1 ;;
  esac
}

expected_hash() {
  case "$1" in
    20260715170000) echo "e75f0ea10b80d8021aaa1ddccd0307098cb313b67b1042a777311d1d038b64d5" ;;
    20260715171000) echo "6166cb7282e4e5f16300b29404cec218dcca81255ca09202f2e094658077c9bb" ;;
    20260715172000) echo "46ab43a60bf9adf52ec99aed85eaee22010132e6afc4364fd6d47589ed4b087e" ;;
    *) return 1 ;;
  esac
}

expected_edge_verify_jwt() {
  case "$1" in
    pragas-process-deletions|pragas-process-ai-idempotency|pragas-send-push)
      echo "false"
      ;;
    *) echo "true" ;;
  esac
}

expected_edge_hash() {
  case "$1" in
    _shared) echo "87878b97d40918ff46599602ecf8d387e54c570819fb3e928c7759a8287c1c03" ;;
    diagnose-pragas) echo "4e8293678b98cb6e2b3061fef6a8483aa4d1450efa3c8a9991e1a33b5bd2447b" ;;
    ai-chat-pragas) echo "b07ef59e6857ac131b5df00691d14f0fe94581d9396ee8e5a3fdc52b3f867b5f" ;;
    pragas-delete-user-account) echo "5a8601bf3d8caa6200f983d65cd4cd66e0801deb4cccbbadd6d54d9b117b0513" ;;
    pragas-export-user-data) echo "c37964b4e4194a9add2188e4e0dc2207dbed0bd4b5aa5239ea56e6274dc8cfd4" ;;
    pragas-reactivate-account) echo "3d820118cfc36160511d161c9d22ad5bd67d0af80cac8912d4926110b64e5d08" ;;
    pragas-analytics) echo "fa031fd68caf3bd58ee21d39c1696d8d09108afcacfdca388fea48d7f9a7b386" ;;
    report-ai-content) echo "4120e5aa54137cea56118a42047689996d1f3b8f3f0f592488a496a0d312e1bf" ;;
    report-diagnosis-feedback) echo "2bbed865bf4420eae7ec98108af22a82de91b9c4731eb75f43111cc0a179c93e" ;;
    admin-ai-content-reports) echo "d9ecd60ed0e6d31748263e3762fe33afa7b33e93fb724f278a0fa4868f77ccb9" ;;
    pragas-process-deletions) echo "9dcfd5b9cb2e14bc4a075c71acd9315d17bf3fa6254f8f24166d29a3e1b66a38" ;;
    pragas-process-ai-idempotency) echo "fc896e878917c441c3f622c5b568599cf0ceaab84aaed246185417db2654c185" ;;
    pragas-send-push) echo "d04928d8981664ec6c588ab9f0c5a03a864e19f144f1f2ef80acf4d3b19f0444" ;;
    *) return 1 ;;
  esac
}

directory_hash() {
  pragas_directory_hash "$1"
}

if [[ "$mode" != "--dry-run" && "$mode" != "--prepare" \
      && "$mode" != "--apply" ]]; then
  usage
  exit 2
fi
for dependency in supabase jq deno docker shasum rg perl tar openssl; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    echo "$dependency is required" >&2
    exit 1
  fi
done
if ! db_sslrootcert_source="$(pragas_validate_db_sslrootcert \
    "${PRAGAS_PROD_DB_SSLROOTCERT:-}")"; then
  echo "verified database TLS root CA preflight failed" >&2
  exit 1
fi
if ! db_sslrootcert_hash="$(
  shasum -a 256 "$db_sslrootcert_source" 2>/dev/null | awk '{print $1}'
)" || [[ ! "$db_sslrootcert_hash" =~ ^[0-9a-f]{64}$ ]]; then
  echo "verified database TLS root CA fingerprint failed" >&2
  exit 1
fi
if ! installed_supabase_cli_version="$(supabase --version 2>/dev/null)"; then
  echo "failed to read the Supabase CLI version" >&2
  exit 1
fi
if ! pragas_assert_supabase_cli_version \
    "$REVIEWED_SUPABASE_CLI_VERSION" "$installed_supabase_cli_version"; then
  echo "refusing all remote access with an unreviewed Supabase CLI" >&2
  exit 1
fi
supabase_cli_path="$(command -v supabase)"
if [[ ! -f "$supabase_cli_path" \
      || "$(shasum -a 256 "$supabase_cli_path" | awk '{print $1}')" \
         != "$REVIEWED_SUPABASE_CLI_SHA256" ]]; then
  echo "refusing all remote access with an unreviewed Supabase CLI binary" >&2
  exit 1
fi
if ! installed_edge_runtime_image_id="$(docker image inspect \
      "$REVIEWED_EDGE_RUNTIME_IMAGE" --format '{{.Id}}' 2>/dev/null)" \
    || [[ "$installed_edge_runtime_image_id" \
         != "$REVIEWED_EDGE_RUNTIME_IMAGE_ID" ]]; then
  echo "reviewed local Edge bundler image is missing or changed" >&2
  exit 1
fi
if ! pragas_assert_pinned_docker_image \
    "$REVIEWED_PG_BACKUP_IMAGE" "$REVIEWED_PG_BACKUP_DIGEST" \
    >/dev/null 2>&1; then
  echo "reviewed PostgreSQL backup image is missing or changed" >&2
  exit 1
fi
if [[ ! -f "$repo_root/supabase/.temp/project-ref" ]]; then
  echo "Supabase project is not linked" >&2
  exit 1
fi

bash "$repo_root/supabase/tests/pragas-prod-compat-gate-static.sh"
bash "$repo_root/supabase/tests/pragas-prod-compat-integration.sh"

if [[ "$(shasum -a 256 "$repo_root/supabase/config.toml" | awk '{print $1}')" \
      != "d2f956c4d5e18bc74c3126e841bc9fd30db0c2a5537e21eb6808a5983cc48661" ]]; then
  echo "Supabase function configuration hash mismatch" >&2
  exit 1
fi
if [[ "$(shasum -a 256 "$repo_root/supabase/functions/deno.json" | awk '{print $1}')" \
      != "e7d9f82e1847be6003f15b2bceacfaea0f7756e4eddd09a082e3781fb7de1dd9" ]]; then
  echo "Edge Deno configuration hash mismatch" >&2
  exit 1
fi
if [[ "$(shasum -a 256 "$repo_root/supabase/functions/deno.lock" | awk '{print $1}')" \
      != "331337935052fdcb6ff8bdce86f9c1abe9d9cb19d5b5af4c4e886144794ae5fd" ]]; then
  echo "Edge Deno lock hash mismatch" >&2
  exit 1
fi
for slug in _shared "${EDGE_SLUGS[@]}"; do
  actual_edge_hash="$(directory_hash "$repo_root/supabase/functions/$slug")"
  if [[ "$actual_edge_hash" != "$(expected_edge_hash "$slug")" ]]; then
    echo "Edge source hash mismatch: $slug" >&2
    exit 1
  fi
done
for slug in "${EDGE_SLUGS[@]}"; do
  deno check --config "$repo_root/supabase/functions/deno.json" \
    "$repo_root/supabase/functions/$slug/index.ts"
done

linked_ref="$(tr -d '[:space:]' < "$repo_root/supabase/.temp/project-ref")"
if [[ "$linked_ref" != "$TARGET_REF" ]]; then
  echo "refusing project ref: expected $TARGET_REF, got $linked_ref" >&2
  exit 1
fi

for version in "${TARGET_VERSIONS[@]}"; do
  migration="$repo_root/supabase/migrations/$(migration_name "$version")"
  if [[ ! -f "$migration" ]]; then
    echo "allowlisted migration missing: $version" >&2
    exit 1
  fi
  actual_hash="$(shasum -a 256 "$migration" | awk '{print $1}')"
  if [[ "$actual_hash" != "$(expected_hash "$version")" ]]; then
    echo "allowlisted migration hash mismatch: $version" >&2
    exit 1
  fi
done

if [[ "$mode" == "--apply" ]]; then
  if [[ "${PRAGAS_PROD_COMPAT_APPLY_CONFIRM:-}" != "$TARGET_REF" ]]; then
    echo "production apply is blocked" >&2
    echo "set PRAGAS_PROD_COMPAT_APPLY_CONFIRM=$TARGET_REF after approval" >&2
    exit 1
  fi
  if [[ "${PRAGAS_PROD_COMPAT_BACKUP_CONFIRM:-}" != "$TARGET_REF" \
        || "${PRAGAS_PROD_COMPAT_RESTORE_CONFIRM:-}" != "$TARGET_REF" \
        || -z "${PRAGAS_PROD_COMPAT_BACKUP_DIR:-}" ]]; then
    echo "production apply requires a fresh authenticated backup and restore test" >&2
    echo "set PRAGAS_PROD_COMPAT_BACKUP_CONFIRM=$TARGET_REF," >&2
    echo "PRAGAS_PROD_COMPAT_RESTORE_CONFIRM=$TARGET_REF and PRAGAS_PROD_COMPAT_BACKUP_DIR" >&2
    exit 1
  fi
fi
if [[ "$mode" == "--prepare" \
      && -z "${PRAGAS_PROD_COMPAT_BACKUP_DIR:-}" ]]; then
  echo "prepare requires PRAGAS_PROD_COMPAT_BACKUP_DIR" >&2
  exit 1
fi

tmp="$(mktemp -d /tmp/rumo-pragas-prod-compat.XXXXXX)"
restore_container=""
cleanup() {
  if [[ -n "$restore_container" ]]; then
    docker rm -f "$restore_container" >/dev/null 2>&1 || true
  fi
  chmod -R u+w "$tmp" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
db_sslrootcert="$tmp/db-root-ca.pem"
if ! pragas_copy_verified_file \
    "$db_sslrootcert_source" "$db_sslrootcert" "$db_sslrootcert_hash" \
    >/dev/null 2>&1; then
  echo "verified database TLS root CA snapshot failed" >&2
  exit 1
fi
mkdir -p "$tmp/supabase/.temp" "$tmp/supabase/migrations"
cp "$repo_root/supabase/config.toml" "$tmp/supabase/config.toml"

# Snapshot every reviewed Edge input before any remote access. The deploy CLI
# later receives only this private read-only tree, so edits in the shared
# worktree cannot cross the hash-check/bundle boundary.
edge_candidate_work="$tmp/edge-candidate-work"
mkdir -p "$edge_candidate_work/supabase/functions"
pragas_copy_verified_file \
  "$repo_root/supabase/config.toml" \
  "$edge_candidate_work/supabase/config.toml" \
  "d2f956c4d5e18bc74c3126e841bc9fd30db0c2a5537e21eb6808a5983cc48661"
pragas_copy_verified_file \
  "$repo_root/supabase/functions/deno.json" \
  "$edge_candidate_work/supabase/functions/deno.json" \
  "e7d9f82e1847be6003f15b2bceacfaea0f7756e4eddd09a082e3781fb7de1dd9"
pragas_copy_verified_file \
  "$repo_root/supabase/functions/deno.lock" \
  "$edge_candidate_work/supabase/functions/deno.lock" \
  "331337935052fdcb6ff8bdce86f9c1abe9d9cb19d5b5af4c4e886144794ae5fd"
for slug in _shared "${EDGE_SLUGS[@]}"; do
  pragas_copy_verified_tree \
    "$repo_root/supabase/functions/$slug" \
    "$edge_candidate_work/supabase/functions/$slug" \
    "$(expected_edge_hash "$slug")"
done
chmod -R u=rX,go= "$edge_candidate_work"

assert_edge_candidate_snapshot() {
  local slug="$1"

  [[ "$(shasum -a 256 "$edge_candidate_work/supabase/config.toml" | awk '{print $1}')" \
      == "d2f956c4d5e18bc74c3126e841bc9fd30db0c2a5537e21eb6808a5983cc48661" \
    && "$(shasum -a 256 "$edge_candidate_work/supabase/functions/deno.json" | awk '{print $1}')" \
      == "e7d9f82e1847be6003f15b2bceacfaea0f7756e4eddd09a082e3781fb7de1dd9" \
    && "$(shasum -a 256 "$edge_candidate_work/supabase/functions/deno.lock" | awk '{print $1}')" \
      == "331337935052fdcb6ff8bdce86f9c1abe9d9cb19d5b5af4c4e886144794ae5fd" \
    && "$(directory_hash "$edge_candidate_work/supabase/functions/_shared")" \
      == "$(expected_edge_hash _shared)" \
    && "$(directory_hash "$edge_candidate_work/supabase/functions/$slug")" \
      == "$(expected_edge_hash "$slug")" ]]
}

readonly SHARED_RELATION_MAX_BYTES=67108864
readonly SHARED_LONG_XACT_LIMIT_SECONDS=30
readonly SHARED_INDEX_CLIENT_TIMEOUT_SECONDS=330

# PRAGAS_SHARED_RELATION_BOOTSTRAP_BEGIN
shared_relation_guard_sql="$(cat <<SQL
DO \$pragas_shared_relation_guard\$
DECLARE
  v_analytics_bytes bigint;
  v_audit_bytes bigint;
  v_long_transactions integer;
BEGIN
  IF to_regclass('public.analytics_events') IS NULL
     OR to_regclass('public.audit_log') IS NULL
  THEN
    RAISE EXCEPTION 'pragas_shared_relation_missing';
  END IF;

  SELECT pg_relation_size('public.analytics_events'::regclass),
         pg_relation_size('public.audit_log'::regclass)
    INTO v_analytics_bytes, v_audit_bytes;
  IF v_analytics_bytes > $SHARED_RELATION_MAX_BYTES
     OR v_audit_bytes > $SHARED_RELATION_MAX_BYTES
  THEN
    RAISE EXCEPTION
      'pragas_shared_relation_size_guard analytics_bytes=% audit_bytes=% limit=%',
      v_analytics_bytes, v_audit_bytes, $SHARED_RELATION_MAX_BYTES;
  END IF;

  SELECT count(*)::integer
    INTO v_long_transactions
    FROM pg_stat_activity
   WHERE datname = current_database()
     AND pid <> pg_backend_pid()
     AND backend_type = 'client backend'
     AND xact_start IS NOT NULL
     AND xact_start < clock_timestamp()
       - make_interval(secs => $SHARED_LONG_XACT_LIMIT_SECONDS);
  IF v_long_transactions <> 0 THEN
    RAISE EXCEPTION
      'pragas_shared_relation_load_guard long_transactions=% limit_seconds=%',
      v_long_transactions, $SHARED_LONG_XACT_LIMIT_SECONDS;
  END IF;
END
\$pragas_shared_relation_guard\$;
SQL
)"

shared_column_bootstrap_sql="$(cat <<'SQL'
DO $pragas_shared_column_bootstrap$
BEGIN
  PERFORM set_config('lock_timeout', '2s', true);
  PERFORM set_config('statement_timeout', '30s', true);
  EXECUTE 'LOCK TABLE public.analytics_events, public.audit_log '
    || 'IN ACCESS EXCLUSIVE MODE NOWAIT';

  IF EXISTS (
    SELECT 1
      FROM (VALUES
        ('analytics_events', 'app', 'text'),
        ('analytics_events', 'pragas_event_id', 'uuid'),
        ('audit_log', 'app', 'text')
      ) AS expected(table_name, column_name, udt_name)
      JOIN information_schema.columns AS column_info
        ON column_info.table_schema = 'public'
       AND column_info.table_name = expected.table_name
       AND column_info.column_name = expected.column_name
     WHERE column_info.udt_name <> expected.udt_name
        OR column_info.is_nullable <> 'YES'
        OR column_info.is_generated <> 'NEVER'
        OR column_info.is_identity <> 'NO'
        OR column_info.column_default IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'pragas_shared_analytics_column_contract_mismatch';
  END IF;

  EXECUTE 'ALTER TABLE public.analytics_events '
    || 'ADD COLUMN IF NOT EXISTS app text, '
    || 'ADD COLUMN IF NOT EXISTS pragas_event_id uuid';
  EXECUTE 'ALTER TABLE public.audit_log '
    || 'ADD COLUMN IF NOT EXISTS app text';
END
$pragas_shared_column_bootstrap$;
SQL
)"

shared_index_statements=(
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_user_app ON public.analytics_events (user_id, app)"
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_user_app ON public.audit_log (user_id, app)"
  "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_pragas_event_id ON public.analytics_events (user_id, pragas_event_id) WHERE app = 'rumo-pragas' AND pragas_event_id IS NOT NULL"
)
# PRAGAS_SHARED_RELATION_BOOTSTRAP_END

for metadata in \
  linked-project.json pooler-url postgres-version project-ref rest-version \
  gotrue-version storage-version storage-migration
do
  if [[ -f "$repo_root/supabase/.temp/$metadata" ]]; then
    cp "$repo_root/supabase/.temp/$metadata" "$tmp/supabase/.temp/$metadata"
  fi
done

if [[ ! -f "$tmp/supabase/.temp/pooler-url" ]]; then
  echo "Supabase pooler identity is missing" >&2
  exit 1
fi
pooler_url="$(tr -d '\r\n' < "$tmp/supabase/.temp/pooler-url")"
if ! pooler_identity="$(pragas_parse_pooler_url \
    "$pooler_url" "$TARGET_REF" 2>/dev/null)"; then
  echo "Supabase pooler identity is malformed" >&2
  exit 1
fi
IFS=$'\t' read -r pooler_host pooler_port pooler_username pooler_database \
  <<<"$pooler_identity"
if [[ -z "$pooler_host" || -z "$pooler_port" \
      || "$pooler_username" != "postgres.$TARGET_REF" \
      || "$pooler_database" != "postgres" ]]; then
  echo "Supabase pooler project identity mismatch" >&2
  exit 1
fi

preflight_sql="$(cat <<'SQL'
SELECT
  count(*) AS profile_count,
  count(*) FILTER (WHERE id <> user_id) AS generated_profile_count,
  count(*) FILTER (
    WHERE user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM auth.users AS auth_user
       WHERE auth_user.id = pragas_profiles.user_id
    )
  ) AS invalid_profile_owner_count,
  count(*) - count(DISTINCT user_id) AS duplicate_profile_owner_count,
  (SELECT count(*) FROM (
    SELECT user_id, diagnosis_id FROM public.pragas_diagnosis_feedback
     GROUP BY user_id, diagnosis_id HAVING count(*) > 1
  ) AS duplicate_feedback) AS duplicate_feedback_count,
  (SELECT count(*) FROM public.subscriptions
    WHERE app = 'rumo-pragas') AS app_subscription_count,
  (SELECT count(*) FROM public.subscriptions
    WHERE app = 'rumo-pragas' AND status <> 'active')
    AS inactive_app_subscription_count,
  (SELECT count(*) FROM public.pragas_push_notifications)
    AS push_notification_count,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'pragas_profiles', 'pragas_diagnoses',
        'pragas_diagnosis_feedback', 'pragas_push_tokens',
        'pragas_user_preferences'
      )
      AND permissive = 'PERMISSIVE'
      AND roles && ARRAY['public','anon','authenticated']::name[])
    AS applicable_policy_count,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'pragas_profiles', 'pragas_diagnoses',
        'pragas_diagnosis_feedback', 'pragas_push_tokens',
        'pragas_user_preferences'
      )
      AND permissive = 'PERMISSIVE'
      AND roles && ARRAY['public','anon','authenticated']::name[]
      AND (
        (cmd IN ('SELECT','DELETE') AND (
          position('auth.uid' IN lower(coalesce(qual, ''))) = 0
          OR position('user_id' IN lower(coalesce(qual, ''))) = 0
        ))
        OR (cmd = 'INSERT' AND (
          position('auth.uid' IN lower(coalesce(with_check, qual, ''))) = 0
          OR position('user_id' IN lower(coalesce(with_check, qual, ''))) = 0
        ))
        OR (cmd IN ('UPDATE','ALL') AND (
          position('auth.uid' IN lower(coalesce(qual, ''))) = 0
          OR position('user_id' IN lower(coalesce(qual, ''))) = 0
          OR position('auth.uid' IN lower(coalesce(with_check, qual, ''))) = 0
          OR position('user_id' IN lower(coalesce(with_check, qual, ''))) = 0
        ))
      )) AS unsafe_policy_count,
  CASE WHEN
    EXISTS (
      SELECT 1 FROM pg_attribute
       WHERE attrelid = 'public.pragas_profiles'::regclass
         AND attname = 'id' AND atthasdef AND attnotnull
    )
    AND EXISTS (
      SELECT 1 FROM pg_constraint AS constraint_row
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
    )
    AND EXISTS (
      SELECT 1 FROM pg_constraint AS constraint_row
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
    AND NOT EXISTS (
      SELECT 1
        FROM (VALUES
          ('pragas_profiles', 'id', ARRAY['uuid']::text[]),
          ('pragas_profiles', 'user_id', ARRAY['uuid']::text[]),
          ('pragas_profiles', 'full_name', ARRAY['text']::text[]),
          ('pragas_profiles', 'city', ARRAY['text']::text[]),
          ('pragas_profiles', 'state', ARRAY['text']::text[]),
          ('pragas_profiles', 'crops', ARRAY['_text']::text[]),
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
          ('analytics_events', 'event', ARRAY['text']::text[]),
          ('analytics_events', 'properties', ARRAY['jsonb']::text[]),
          ('analytics_events', 'platform', ARRAY['text']::text[]),
          ('analytics_events', 'timestamp', ARRAY['timestamptz']::text[]),
          ('analytics_events', 'created_at', ARRAY['timestamptz']::text[]),
          ('audit_log', 'id', ARRAY['uuid']::text[]),
          ('audit_log', 'user_id', ARRAY['uuid']::text[]),
          ('audit_log', 'action', ARRAY['text']::text[]),
          ('audit_log', 'details', ARRAY['jsonb']::text[]),
          ('audit_log', 'ip_address', ARRAY['inet']::text[]),
          ('audit_log', 'created_at', ARRAY['timestamptz']::text[]),
          ('pragas_diagnosis_feedback', 'id', ARRAY['uuid']::text[]),
          ('pragas_diagnosis_feedback', 'user_id', ARRAY['uuid']::text[]),
          ('pragas_diagnosis_feedback', 'diagnosis_id', ARRAY['text','uuid']::text[]),
          ('pragas_diagnosis_feedback', 'created_at', ARRAY['timestamptz']::text[]),
          ('pragas_push_tokens', 'id', ARRAY['uuid']::text[]),
          ('pragas_push_tokens', 'user_id', ARRAY['uuid']::text[]),
          ('pragas_push_tokens', 'token', ARRAY['text']::text[]),
          ('pragas_push_tokens', 'expo_token', ARRAY['text']::text[]),
          ('pragas_push_tokens', 'platform', ARRAY['text']::text[]),
          ('pragas_push_tokens', 'device_info', ARRAY['jsonb']::text[]),
          ('pragas_push_tokens', 'is_active', ARRAY['bool']::text[]),
          ('pragas_push_tokens', 'created_at', ARRAY['timestamptz']::text[]),
          ('pragas_push_notifications', 'notification_id', ARRAY['text']::text[]),
          ('pragas_push_notifications', 'category', ARRAY['text']::text[]),
          ('pragas_push_notifications', 'status', ARRAY['text']::text[])
        ) AS required(table_name, column_name, accepted_udt_names)
       WHERE NOT EXISTS (
         SELECT 1 FROM information_schema.columns AS column_info
          WHERE column_info.table_schema = 'public'
            AND column_info.table_name = required.table_name
            AND column_info.column_name = required.column_name
            AND column_info.udt_name = ANY (required.accepted_udt_names)
       )
    )
  THEN 'PRAGAS_PREFLIGHT_OK' ELSE 'PRAGAS_PREFLIGHT_FAILED' END AS contract
FROM public.pragas_profiles;
SQL
)"

preflight_csv="$tmp/preflight.csv"
if ! supabase db query --linked --workdir "$tmp" --agent=no --output csv \
    "$preflight_sql" >"$preflight_csv"; then
  echo "read-only production preflight failed" >&2
  exit 1
fi
preflight_row="$(sed -n '2p' "$preflight_csv" | tr -d '"\r')"
IFS=',' read -r profile_count generated_profile_count invalid_owner_count \
  duplicate_owner_count duplicate_feedback_count app_subscription_count \
  inactive_app_subscription_count push_notification_count policy_count \
  unsafe_policy_count preflight_contract \
  <<< "$preflight_row"
for aggregate in "$profile_count" "$generated_profile_count" \
  "$invalid_owner_count" "$duplicate_owner_count" "$duplicate_feedback_count" \
  "$app_subscription_count" "$inactive_app_subscription_count" \
  "$push_notification_count" "$policy_count" "$unsafe_policy_count"
do
  if [[ ! "$aggregate" =~ ^[0-9]+$ ]]; then
    echo "production preflight returned an invalid aggregate" >&2
    exit 1
  fi
done
if [[ "$preflight_contract" != "PRAGAS_PREFLIGHT_OK" \
      || "$invalid_owner_count" != "0" \
      || "$duplicate_owner_count" != "0" \
      || "$duplicate_feedback_count" != "0" \
      || "$app_subscription_count" != "0" \
      || "$inactive_app_subscription_count" != "0" \
      || "$push_notification_count" != "0" \
      || "$policy_count" == "0" \
      || "$unsafe_policy_count" != "0" ]]; then
  echo "production preflight contract failed" >&2
  exit 1
fi

policy_inventory="$tmp/pragas-policy-inventory.json"
if ! supabase db query --linked --workdir "$tmp" --agent=no --output json \
    "SELECT tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('pragas_profiles','pragas_diagnoses','pragas_diagnosis_feedback','pragas_push_tokens','pragas_user_preferences') ORDER BY tablename, policyname" \
    >"$policy_inventory"; then
  echo "failed to record the RLS policy inventory" >&2
  exit 1
fi
if ! jq -e 'type == "array" and length > 0' "$policy_inventory" >/dev/null; then
  echo "RLS policy inventory is empty or malformed" >&2
  exit 1
fi

extension_inventory="$tmp/remote-extension-inventory.csv"
if ! supabase db query --linked --workdir "$tmp" --agent=no --output csv \
    "SELECT e.extname || '|' || n.nspname || '|' || e.extversion AS extension_contract FROM pg_extension AS e JOIN pg_namespace AS n ON n.oid = e.extnamespace ORDER BY e.extname" \
    >"$extension_inventory"; then
  echo "failed to record the database extension inventory" >&2
  exit 1
fi
expected_extension_inventory="$(printf '%s\n' \
  'citext|public|1.6' \
  'pg_cron|pg_catalog|1.6.4' \
  'pg_net|extensions|0.19.5' \
  'pg_stat_statements|extensions|1.11' \
  'pg_trgm|public|1.6' \
  'pgcrypto|extensions|1.3' \
  'plpgsql|pg_catalog|1.0' \
  'supabase_vault|vault|0.3.1' \
  'uuid-ossp|extensions|1.1' \
  'vector|extensions|0.8.0')"
actual_extension_inventory="$(
  sed -E '/^extension_contract$/d; /^[[:space:]]*$/d' \
    "$extension_inventory" | tr -d '"\r'
)"
if [[ "$actual_extension_inventory" != "$expected_extension_inventory" ]]; then
  echo "database extension inventory differs from the restore allowlist" >&2
  exit 1
fi

remote_functions="$tmp/remote-functions-before.json"
if ! supabase functions list --project-ref "$TARGET_REF" --output json \
    --workdir "$repo_root" --agent=no >"$remote_functions"; then
  echo "failed to read the remote Edge Function inventory" >&2
  exit 1
fi
if ! jq -e 'type == "array" and length > 0' "$remote_functions" >/dev/null; then
  echo "remote Edge Function inventory is empty or malformed" >&2
  exit 1
fi
for slug in "${NEW_EDGE_SLUGS[@]}"; do
  if [[ "$(jq --arg slug "$slug" '[.[] | select(.slug == $slug)] | length' \
      "$remote_functions")" != "0" ]]; then
    echo "new Edge baseline is no longer absent: $slug" >&2
    exit 1
  fi
done
if ! jq -e \
    --arg slug "$EXISTING_EDGE_SLUG" \
    --arg status "ACTIVE" \
    --argjson version "$EXISTING_EDGE_VERSION" \
    --argjson verify "$EXISTING_EDGE_VERIFY_JWT" \
    --arg ezbr "$EXISTING_EDGE_EZBR" \
    '[.[] | select(.slug == $slug)] as $rows
     | ($rows | length) == 1
       and $rows[0].status == $status
       and $rows[0].version == $version
       and $rows[0].verify_jwt == $verify
       and $rows[0].ezbr_sha256 == $ezbr' \
    "$remote_functions" >/dev/null; then
  echo "existing pragas-send-push baseline changed; refusing overwrite" >&2
  exit 1
fi

secret_names="$tmp/remote-secret-names.txt"
if ! supabase secrets list --project-ref "$TARGET_REF" --output json \
    --workdir "$repo_root" --agent=no \
    | jq -r '.[].name' | LC_ALL=C sort -u >"$secret_names"; then
  echo "failed to read remote Edge secret names" >&2
  exit 1
fi
required_secret_names=(
  AGRIO_API_KEY
  CLAUDE_API_KEY
  EXPO_ACCESS_TOKEN
  GEMINI_API_KEY
  SENTRY_DSN
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_URL
)
for secret_name in "${required_secret_names[@]}"; do
  if ! grep -qx "$secret_name" "$secret_names"; then
    echo "required Edge secret is absent: $secret_name" >&2
    exit 1
  fi
done

history_csv="$tmp/remote-history.csv"
if ! supabase db query --linked --workdir "$tmp" --agent=no --output csv \
    "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version" \
    >"$history_csv"; then
  echo "failed to read remote migration history" >&2
  exit 1
fi

history_count=0
remote_versions="$tmp/remote-versions.txt"
: > "$remote_versions"
while IFS= read -r version; do
  version="${version//\"/}"
  version="${version//$'\r'/}"
  [[ "$version" == "version" || -z "$version" ]] && continue
  if [[ ! "$version" =~ ^[0-9]{14}$ ]]; then
    echo "invalid remote migration version received" >&2
    exit 1
  fi
  : > "$tmp/supabase/migrations/${version}_remote_history.sql"
  printf '%s\n' "$version" >> "$remote_versions"
  history_count=$((history_count + 1))
done < "$history_csv"
if (( history_count == 0 )); then
  echo "remote migration history unexpectedly empty" >&2
  exit 1
fi

assert_remote_migration_history_unchanged() {
  local label="$1"
  local history_recheck_csv="$tmp/remote-history-$label.csv"
  local history_recheck_versions="$tmp/remote-versions-$label.txt"
  local version

  if ! supabase db query --linked --workdir "$tmp" --agent=no --output csv \
      "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version" \
      >"$history_recheck_csv"; then
    echo "failed to re-read remote migration history: $label" >&2
    return 1
  fi
  : >"$history_recheck_versions"
  while IFS= read -r version; do
    version="${version//\"/}"
    version="${version//$'\r'/}"
    [[ "$version" == "version" || -z "$version" ]] && continue
    if [[ ! "$version" =~ ^[0-9]{14}$ ]]; then
      echo "invalid remote migration version during recheck: $label" >&2
      return 1
    fi
    printf '%s\n' "$version" >>"$history_recheck_versions"
  done <"$history_recheck_csv"
  if ! cmp -s "$remote_versions" "$history_recheck_versions"; then
    echo "remote migration history changed concurrently: $label" >&2
    diff -u "$remote_versions" "$history_recheck_versions" >&2 || true
    return 1
  fi
}

expected_planned="$tmp/expected-planned.txt"
: > "$expected_planned"
for version in "${TARGET_VERSIONS[@]}"; do
  migration_name_value="$(migration_name "$version")"
  cp "$repo_root/supabase/migrations/$migration_name_value" \
    "$tmp/supabase/migrations/$migration_name_value"
  copied_hash="$(shasum -a 256 \
    "$tmp/supabase/migrations/$migration_name_value" | awk '{print $1}')"
  if [[ "$copied_hash" != "$(expected_hash "$version")" ]]; then
    echo "copied migration hash mismatch: $version" >&2
    exit 1
  fi
  if ! grep -qx "$version" "$remote_versions"; then
    printf '%s\n' "$version" >> "$expected_planned"
  fi
done

# The dollar-delimited marker is an intentional literal source contract.
# shellcheck disable=SC2016
shared_contract_validation_sql="$(sed -n \
  '/^DO \$shared_analytics_index_preflight\$/,/^\$shared_analytics_index_preflight\$;/p' \
  "$tmp/supabase/migrations/20260715171000_pragas_prod_compat_runtime.sql")"
if [[ -z "$shared_contract_validation_sql" \
      || "$(printf '%s\n' "$shared_contract_validation_sql" \
        | rg -c '^DO \$shared_analytics_index_preflight\$$')" != "1" \
      || "$(printf '%s\n' "$shared_contract_validation_sql" \
        | rg -c '^\$shared_analytics_index_preflight\$;$')" != "1" ]]; then
  echo "shared analytics validation SQL extraction failed" >&2
  exit 1
fi

run_shared_bootstrap_on_clone() {
  local index_statement

  docker exec -e PGPASSWORD="$restore_password" "$restore_container" \
    psql -q -X -v ON_ERROR_STOP=1 -h 127.0.0.1 \
      -U supabase_admin -d postgres -c "$shared_relation_guard_sql" \
      >/dev/null || return 1
  docker exec -e PGPASSWORD="$restore_password" "$restore_container" \
    psql -q -X -v ON_ERROR_STOP=1 -h 127.0.0.1 \
      -U supabase_admin -d postgres -c "$shared_column_bootstrap_sql" \
      >/dev/null || return 1
  for index_statement in "${shared_index_statements[@]}"; do
    docker exec -e PGPASSWORD="$restore_password" \
      -e "PGOPTIONS=-c lock_timeout=2s -c statement_timeout=5min" \
      "$restore_container" psql -q -X -v ON_ERROR_STOP=1 \
        -h 127.0.0.1 -U supabase_admin -d postgres \
        -c "$index_statement" >/dev/null || return 1
  done
  docker exec -e PGPASSWORD="$restore_password" "$restore_container" \
    psql -q -X -v ON_ERROR_STOP=1 -h 127.0.0.1 \
      -U supabase_admin -d postgres -c "$shared_contract_validation_sql" \
      >/dev/null
}

run_shared_bootstrap_on_linked_project() {
  local index_statement

  supabase db query --linked --workdir "$tmp" --agent=no \
    --output json "$shared_relation_guard_sql" >/dev/null || return 1
  supabase db query --linked --workdir "$tmp" --agent=no \
    --output json "$shared_column_bootstrap_sql" >/dev/null || return 1
  for index_statement in "${shared_index_statements[@]}"; do
    # Recheck relation size and long transactions for every standalone build;
    # the client deadline bounds a Management API request if the server-side
    # concurrent index build cannot finish promptly.
    supabase db query --linked --workdir "$tmp" --agent=no \
      --output json "$shared_relation_guard_sql" >/dev/null || return 1
    pragas_run_with_timeout "$SHARED_INDEX_CLIENT_TIMEOUT_SECONDS" \
      supabase db query --linked --workdir "$tmp" --agent=no \
        --output json "$index_statement" >/dev/null || return 1
  done
  supabase db query --linked --workdir "$tmp" --agent=no \
    --output json "$shared_contract_validation_sql" >/dev/null
}

candidate_file_count="$(find "$tmp/supabase/migrations" -type f \
  ! -name '*_remote_history.sql' | wc -l | tr -d '[:space:]')"
if [[ "$candidate_file_count" != "3" ]]; then
  echo "isolated bundle contains a non-allowlisted candidate" >&2
  exit 1
fi

dry_run_output="$(
  PGSSLMODE=verify-full PGSSLROOTCERT="$db_sslrootcert" \
    supabase db push --linked --dry-run --workdir "$tmp" --yes 2>&1
)" || {
  echo "production migration dry-run failed under verified TLS" >&2
  exit 1
}
echo "$dry_run_output"
planned_versions="$tmp/planned-versions.txt"
printf '%s\n' "$dry_run_output" | grep -Eo '[0-9]{14}' | sort -u \
  > "$planned_versions" || true
sort -u "$expected_planned" -o "$expected_planned"
if ! cmp -s "$planned_versions" "$expected_planned"; then
  echo "refusing unexpected migration plan" >&2
  echo "expected: $(tr '\n' ' ' < "$expected_planned")" >&2
  echo "planned: $(tr '\n' ' ' < "$planned_versions")" >&2
  exit 1
fi

if [[ "$mode" == "--dry-run" ]]; then
  echo "prod-compat DB + 12 Edge gate: DRY RUN PASS"
  echo "target=$TARGET_REF profiles=$profile_count generated_ids=$generated_profile_count"
  echo "allowlist=${TARGET_VERSIONS[*]}"
  echo "edge_new_absent=11 edge_restore_baseline=pragas-send-push@18"
  echo "apply remains blocked until authenticated backups and restore tests succeed"
  exit 0
fi

if ! backup_root="$(pragas_validate_backup_root \
    "$repo_root" "$PRAGAS_PROD_COMPAT_BACKUP_DIR")"; then
  echo "backup preparation refused before creating any artifact" >&2
  exit 1
fi
backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
if ! backup_dir="$(pragas_create_private_backup_leaf "$backup_root" \
    "pragas-${TARGET_REF}-${backup_stamp}")"; then
  echo "failed to create a private backup leaf" >&2
  exit 1
fi
# Keep every sensitive artifact private as it is created, not only the 0700
# parent directory. Child processes (Supabase CLI, tar and Deno) inherit this.
umask 077
cp "$policy_inventory" "$backup_dir/policies-before.json"
cp "$extension_inventory" "$backup_dir/extensions-before.csv"
cp "$remote_functions" "$backup_dir/edge-functions-before.json"
cp "$secret_names" "$backup_dir/edge-secret-names-before.txt"

# Archive and compile the exact existing Function before any database or Edge
# mutation. This is the only overwritten slug; every other candidate is absent
# and therefore rolls back by an exact slug delete.
edge_snapshot_work="$backup_dir/edge-restore-work"
mkdir -p "$edge_snapshot_work/supabase"
cp "$repo_root/supabase/config.toml" "$edge_snapshot_work/supabase/config.toml"
if ! supabase functions download "$EXISTING_EDGE_SLUG" \
    --project-ref "$TARGET_REF" --workdir "$edge_snapshot_work" \
    --use-api --agent=no; then
  echo "existing Edge snapshot failed; no production mutation occurred" >&2
  exit 1
fi
snapshot_entry="$edge_snapshot_work/supabase/functions/$EXISTING_EDGE_SLUG/index.ts"
if [[ ! -s "$snapshot_entry" ]]; then
  echo "existing Edge snapshot is empty; no production mutation occurred" >&2
  exit 1
fi
if ! deno check "$snapshot_entry"; then
  echo "existing Edge snapshot does not compile; no production mutation occurred" >&2
  exit 1
fi

# The restore deploy must reproduce the original gateway setting (true), even
# though the new candidate intentionally changes this slug to false.
snapshot_config_tmp="$edge_snapshot_work/supabase/config.toml.tmp"
awk -v section="[functions.$EXISTING_EDGE_SLUG]" \
    -v verify="$EXISTING_EDGE_VERIFY_JWT" '
  $0 == section { active = 1; found = 1; print; next }
  active && /^\[/ { active = 0 }
  active && /^[[:space:]]*verify_jwt[[:space:]]*=/ {
    print "verify_jwt = " verify
    active = 0
    next
  }
  { print }
  END { if (!found) exit 2 }
' "$edge_snapshot_work/supabase/config.toml" >"$snapshot_config_tmp"
mv "$snapshot_config_tmp" "$edge_snapshot_work/supabase/config.toml"
snapshot_verify_setting="$(awk -v section="[functions.$EXISTING_EDGE_SLUG]" '
  $0 == section { active = 1; next }
  active && /^\[/ { exit }
  active && /^[[:space:]]*verify_jwt[[:space:]]*=/ {
    gsub(/[[:space:]]/, "", $0)
    sub(/^verify_jwt=/, "", $0)
    print
    exit
  }
' "$edge_snapshot_work/supabase/config.toml")"
if [[ "$snapshot_verify_setting" != "$EXISTING_EDGE_VERIFY_JWT" ]]; then
  echo "Edge restore gateway configuration mismatch" >&2
  exit 1
fi

edge_archive="$backup_dir/pragas-send-push-v18-restore.tgz"
tar -C "$backup_dir" -czf "$edge_archive" "edge-restore-work"
edge_archive_hash="$(shasum -a 256 "$edge_archive" | awk '{print $1}')"
edge_extract="$tmp/edge-archive-restore-probe"
mkdir -p "$edge_extract"
tar -C "$edge_extract" -xzf "$edge_archive"
extracted_entry="$edge_extract/edge-restore-work/supabase/functions/$EXISTING_EDGE_SLUG/index.ts"
if [[ ! -s "$extracted_entry" \
      || "$(shasum -a 256 "$extracted_entry" | awk '{print $1}')" \
         != "$(shasum -a 256 "$snapshot_entry" | awk '{print $1}')" \
      || "$(directory_hash "$edge_extract/edge-restore-work/supabase/functions")" \
         != "$(directory_hash "$edge_snapshot_work/supabase/functions")" \
      || ! -s "$edge_extract/edge-restore-work/supabase/config.toml" \
      || "$(shasum -a 256 "$edge_extract/edge-restore-work/supabase/config.toml" | awk '{print $1}')" \
         != "$(shasum -a 256 "$edge_snapshot_work/supabase/config.toml" | awk '{print $1}')" ]]; then
  echo "Edge snapshot archive restore mismatch; no production mutation occurred" >&2
  exit 1
fi
deno check "$extracted_entry"

# PRAGAS_VERIFIED_BACKUP_BEGIN
roles_backup="$backup_dir/roles.sql"
extensions_schema_backup="$backup_dir/extensions-schema.sql"
vault_schema_backup="$backup_dir/vault-schema.sql"
auth_schema_backup="$backup_dir/auth-schema.sql"
storage_schema_backup="$backup_dir/storage-schema.sql"
schema_backup="$backup_dir/public-schema.sql"
data_backup="$backup_dir/auth-storage-public-data.sql"
backup_pgpass="$tmp/prod-backup.pgpass"
if ! pragas_write_private_pgpass \
    "$backup_pgpass" "$pooler_host" "$pooler_port" "$pooler_database" \
    "$pooler_username" "${SUPABASE_DB_PASSWORD:-}" >/dev/null 2>&1; then
  echo "private production backup credential preflight failed" >&2
  exit 1
fi
backup_raw_dir="$tmp/verified-backup-raw"
mkdir -m 700 "$backup_raw_dir"

capture_verified_backup_raw() {
  local tool="$1"
  local raw_output="$2"
  shift 2

  if [[ -e "$raw_output" || -L "$raw_output" ]]; then
    return 1
  fi
  if ! pragas_run_pinned_pg_backup \
      "$REVIEWED_PG_BACKUP_IMAGE" "$REVIEWED_PG_BACKUP_DIGEST" \
      "$tool" "$db_sslrootcert" "$backup_pgpass" \
      "$pooler_host" "$pooler_port" "$pooler_username" \
      "$pooler_database" bridge "$@" >"$raw_output" 2>/dev/null; then
    rm -f "$raw_output"
    return 1
  fi
  chmod 400 "$raw_output"
  [[ -s "$raw_output" ]]
}

write_verified_role_backup() {
  local raw_output="$backup_raw_dir/roles.raw"

  capture_verified_backup_raw pg_dumpall "$raw_output" \
    --roles-only --role postgres --quote-all-identifiers \
    --no-role-passwords --no-comments || return 1
  if ! {
    sed -E 's/^\\(un)?restrict .*$/-- &/' "$raw_output" \
      | sed -E 's/^CREATE ROLE "(anon|authenticated|authenticator|cli_login_.*|dashboard_user|pgbouncer|postgres|service_role|supabase_.*|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin)"/-- &/' \
      | sed -E 's/^ALTER ROLE "(anon|authenticated|authenticator|cli_login_.*|dashboard_user|pgbouncer|postgres|service_role|supabase_.*|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin)"/-- &/' \
      | sed -E 's/ (NOSUPERUSER|NOREPLICATION)//g' \
      | sed -E 's/^-- (.* SET "(pgaudit.*|pgrst.*|session_replication_role|statement_timeout|track_io_timing)" .*)/\1/' \
      | sed -E 's/GRANT ".*" TO "(anon|authenticated|authenticator|cli_login_.*|dashboard_user|pgbouncer|postgres|service_role|supabase_.*|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin)"/-- &/' \
      | sed -E '/^--/d' \
      | uniq
    printf '%s\n' 'RESET ALL;'
  } >"$roles_backup"; then
    rm -f "$raw_output" "$roles_backup"
    return 1
  fi
  rm -f "$raw_output"
  chmod 400 "$roles_backup"
}

write_verified_schema_backup() {
  local schema="$1"
  local output="$2"
  local raw_output="$backup_raw_dir/$schema.raw"

  case "$schema" in
    extensions|vault|auth|storage|public) ;;
    *) return 1 ;;
  esac
  capture_verified_backup_raw pg_dump "$raw_output" \
    --schema-only --quote-all-identifiers --role postgres \
    --exclude-schema '' --schema="$schema" || return 1
  if ! sed -E 's/^\\(un)?restrict .*$/-- &/' "$raw_output" \
      | sed -E 's/^CREATE SCHEMA "/CREATE SCHEMA IF NOT EXISTS "/' \
      | sed -E 's/^CREATE TABLE "/CREATE TABLE IF NOT EXISTS "/' \
      | sed -E 's/^CREATE SEQUENCE "/CREATE SEQUENCE IF NOT EXISTS "/' \
      | sed -E 's/^CREATE VIEW "/CREATE OR REPLACE VIEW "/' \
      | sed -E 's/^CREATE FUNCTION "/CREATE OR REPLACE FUNCTION "/' \
      | sed -E 's/^CREATE TRIGGER "/CREATE OR REPLACE TRIGGER "/' \
      | sed -E 's/^CREATE PUBLICATION "supabase_realtime/-- &/' \
      | sed -E 's/^CREATE EVENT TRIGGER /-- &/' \
      | sed -E 's/^         WHEN TAG IN /-- &/' \
      | sed -E 's/^   EXECUTE FUNCTION /-- &/' \
      | sed -E 's/^ALTER EVENT TRIGGER /-- &/' \
      | sed -E 's/^ALTER PUBLICATION "supabase_realtime_/-- &/' \
      | sed -E 's/^ALTER FOREIGN DATA WRAPPER (.+) OWNER TO /-- &/' \
      | sed -E 's/^ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"/-- &/' \
      | sed -E 's/^GRANT ALL ON FOREIGN DATA WRAPPER (.+) TO "postgres" WITH GRANT OPTION/-- &/' \
      | sed -E 's/^GRANT (.+) ON (.+) "()"/-- &/' \
      | sed -E 's/^REVOKE (.+) ON (.+) "()"/-- &/' \
      | sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pg_tle").+/\1;/' \
      | sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pgsodium").+/\1;/' \
      | sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pgmq").+/\1;/' \
      | sed -E 's/^COMMENT ON EXTENSION (.+)/-- &/' \
      | sed -E 's/^CREATE POLICY "cron_job_/-- &/' \
      | sed -E 's/^ALTER TABLE "cron"/-- &/' \
      | sed -E 's/^SET transaction_timeout = 0;/-- &/' \
      | sed -E '/^--/d' >"$output"; then
    rm -f "$raw_output" "$output"
    return 1
  fi
  rm -f "$raw_output"
  chmod 400 "$output"
}

write_verified_data_backup() {
  local raw_output="$backup_raw_dir/auth-storage-public-data.raw"

  capture_verified_backup_raw pg_dump "$raw_output" \
    --data-only --quote-all-identifiers --role postgres \
    --exclude-schema '' \
    --exclude-table auth.schema_migrations \
    --exclude-table storage.migrations \
    --exclude-table supabase_functions.migrations \
    --schema 'auth|storage|public' || return 1
  if ! {
    printf '%s\n\n' 'SET session_replication_role = replica;'
    sed -E 's/^\\(un)?restrict .*$/-- &/' "$raw_output"
    printf '\n%s\n' 'RESET ALL;'
  } >"$data_backup"; then
    rm -f "$raw_output" "$data_backup"
    return 1
  fi
  rm -f "$raw_output"
  chmod 400 "$data_backup"
}

if ! write_verified_role_backup 2>/dev/null; then
  echo "authenticated role backup failed; no migration was applied" >&2
  exit 1
fi
if ! write_verified_schema_backup extensions \
    "$extensions_schema_backup" 2>/dev/null; then
  echo "authenticated extensions-schema backup failed; no migration was applied" >&2
  exit 1
fi
if ! write_verified_schema_backup vault "$vault_schema_backup" \
    2>/dev/null; then
  echo "authenticated vault-schema backup failed; no migration was applied" >&2
  exit 1
fi
if ! write_verified_schema_backup auth "$auth_schema_backup" \
    2>/dev/null; then
  echo "authenticated auth-schema backup failed; no migration was applied" >&2
  exit 1
fi
if ! write_verified_schema_backup storage "$storage_schema_backup" \
    2>/dev/null; then
  echo "authenticated storage-schema backup failed; no migration was applied" >&2
  exit 1
fi
if ! write_verified_schema_backup public "$schema_backup" \
    2>/dev/null; then
  echo "authenticated schema backup failed; no migration was applied" >&2
  exit 1
fi
# One pg_dump invocation provides one MVCC snapshot for all identity, storage
# and public rows. Separate schema-specific data dumps can describe different
# moments and are not a valid rollback point for cross-schema foreign keys.
if ! write_verified_data_backup 2>/dev/null; then
  echo "authenticated multi-schema data backup failed; no migration was applied" >&2
  exit 1
fi
# PRAGAS_VERIFIED_BACKUP_END

# Derive complete table row-count evidence from the dump artifacts themselves.
# This avoids expensive production-wide COUNT queries and proves every COPY
# payload, including empty tables, after the disposable restore.
auth_row_manifest="$backup_dir/auth-data-row-counts.manifest"
storage_row_manifest="$backup_dir/storage-data-row-counts.manifest"
public_row_manifest="$backup_dir/public-data-row-counts.manifest"
data_row_manifest="$backup_dir/all-data-row-counts.manifest"
if ! awk -v expected_schemas=auth,storage,public \
      -f "$repo_root/supabase/scripts/pragas-copy-row-manifest.awk" \
      "$data_backup" | LC_ALL=C sort >"$data_row_manifest"; then
  echo "multi-schema COPY manifest generation failed; no migration was applied" >&2
  exit 1
fi
awk -F '|' '$1 == "auth"' "$data_row_manifest" >"$auth_row_manifest"
awk -F '|' '$1 == "storage"' "$data_row_manifest" >"$storage_row_manifest"
awk -F '|' '$1 == "public"' "$data_row_manifest" >"$public_row_manifest"
for schema_manifest in \
  "$auth_row_manifest" "$storage_row_manifest" "$public_row_manifest"
do
  if [[ ! -s "$schema_manifest" ]]; then
    echo "multi-schema COPY manifest omitted an expected schema" >&2
    exit 1
  fi
done
if ! awk -F '|' '
    NF != 3 || $1 !~ /^[A-Za-z_][A-Za-z0-9_]*$/ \
      || $2 !~ /^[A-Za-z_][A-Za-z0-9_$]*$/ || $3 !~ /^[0-9]+$/ { exit 1 }
    { key = $1 "|" $2; if (seen[key]++) exit 1; rows++ }
    END { if (rows == 0) exit 1 }
  ' "$data_row_manifest"; then
  echo "combined COPY manifest is malformed or duplicated; no migration was applied" >&2
  exit 1
fi
auth_user_count="$(awk -F '|' \
  '$1 == "auth" && $2 == "users" { print $3 }' "$data_row_manifest")"
storage_object_count="$(awk -F '|' \
  '$1 == "storage" && $2 == "objects" { print $3 }' "$data_row_manifest")"
if [[ ! "$auth_user_count" =~ ^[0-9]+$ \
      || ! "$storage_object_count" =~ ^[0-9]+$ ]]; then
  echo "identity table counts are absent from the COPY manifest" >&2
  exit 1
fi
dump_table_count="$(wc -l <"$data_row_manifest" | tr -d '[:space:]')"

for backup_artifact in "$roles_backup" "$extensions_schema_backup" \
  "$vault_schema_backup" "$auth_schema_backup" \
  "$storage_schema_backup" "$schema_backup" "$data_backup" "$auth_row_manifest" \
  "$storage_row_manifest" "$public_row_manifest" "$data_row_manifest" \
  "$edge_archive"
do
  if [[ ! -s "$backup_artifact" ]]; then
    echo "backup artifact is empty; no migration was applied" >&2
    exit 1
  fi
done

checksum_manifest="$backup_dir/SHA256SUMS"
for backup_artifact in "$roles_backup" "$extensions_schema_backup" \
  "$vault_schema_backup" "$auth_schema_backup" \
  "$storage_schema_backup" "$schema_backup" "$data_backup" "$auth_row_manifest" \
  "$storage_row_manifest" "$public_row_manifest" "$data_row_manifest" \
  "$edge_archive"
do
  artifact_hash="$(shasum -a 256 "$backup_artifact" | awk '{print $1}')"
  printf '%s  %s\n' "$artifact_hash" "$(basename "$backup_artifact")" \
    >>"$checksum_manifest"
done
if [[ ! -s "$checksum_manifest" ]]; then
  echo "backup artifacts are empty; no migration was applied" >&2
  exit 1
fi
if ! (cd "$backup_dir" && shasum -a 256 -c SHA256SUMS >/dev/null); then
  echo "backup checksum verification failed; no migration was applied" >&2
  exit 1
fi
if ! pragas_assert_private_backup_leaf \
    "$backup_root" "$backup_dir" >/dev/null; then
  echo "backup leaf privacy changed; no migration was applied" >&2
  exit 1
fi

# Restore every backup into a disposable PostgreSQL 17/Supabase image. A
# successful parse is insufficient: roles, managed schemas/data and public
# schemas/data must all load, and the two identity invariants must match.
restore_container="pragas-prod-restore-${RANDOM}"
restore_password="pragas-restore-only"
docker run -d --name "$restore_container" \
  -e POSTGRES_PASSWORD="$restore_password" \
  "$REVIEWED_PG_BACKUP_IMAGE" >/dev/null
restore_ready="false"
for _attempt in $(seq 1 60); do
  # The image exposes a temporary bootstrap server before restarting. Require
  # both its init-complete marker and a successful query to the final server.
  if docker logs "$restore_container" 2>&1 \
      | grep -q 'PostgreSQL init process complete; ready for start up' \
     && docker exec -e PGPASSWORD="$restore_password" "$restore_container" \
          psql -qAt -X -h 127.0.0.1 -U supabase_admin -d postgres \
            -c 'SELECT 1' 2>/dev/null | grep -qx '1'; then
    restore_ready="true"
    break
  fi
  sleep 1
done
if [[ "$restore_ready" != "true" ]]; then
  echo "disposable restore database did not become ready; no migration was applied" >&2
  exit 1
fi

# The image's default database contains platform seed rows. Recreate that same
# database name from template0 so pg_cron remains valid while the restore target
# itself is empty and cannot collide with image-provided data.
docker exec -e PGPASSWORD="$restore_password" "$restore_container" \
  dropdb -h 127.0.0.1 -U supabase_admin --maintenance-db=template1 \
    --force postgres
docker exec -e PGPASSWORD="$restore_password" "$restore_container" \
  createdb -h 127.0.0.1 -U supabase_admin --maintenance-db=template1 \
    -T template0 -O supabase_admin postgres

for platform_schema_artifact in "$roles_backup" "$extensions_schema_backup" \
  "$vault_schema_backup"
do
  if ! docker exec -e PGPASSWORD="$restore_password" -i \
      "$restore_container" psql -q -X -v ON_ERROR_STOP=1 \
      --single-transaction -h 127.0.0.1 \
      -U supabase_admin -d postgres <"$platform_schema_artifact"; then
    echo "backup restore failed at $(basename "$platform_schema_artifact"); no migration was applied" >&2
    exit 1
  fi
done

docker exec -e PGPASSWORD="$restore_password" -i "$restore_container" \
  psql -q -X -v ON_ERROR_STOP=1 -h 127.0.0.1 \
    -U supabase_admin -d postgres <<'SQL'
CREATE EXTENSION citext WITH SCHEMA public VERSION '1.6';
CREATE EXTENSION pg_cron WITH SCHEMA pg_catalog VERSION '1.6.4';
CREATE EXTENSION pg_net WITH SCHEMA extensions VERSION '0.19.5';
CREATE EXTENSION pg_stat_statements WITH SCHEMA extensions VERSION '1.11';
CREATE EXTENSION pg_trgm WITH SCHEMA public VERSION '1.6';
CREATE EXTENSION pgcrypto WITH SCHEMA extensions VERSION '1.3';
CREATE EXTENSION supabase_vault WITH SCHEMA vault VERSION '0.3.1';
CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions VERSION '1.1';
CREATE EXTENSION vector WITH SCHEMA extensions VERSION '0.8.0';
CREATE PUBLICATION supabase_realtime;
SQL
restored_extension_inventory="$(
  docker exec -e PGPASSWORD="$restore_password" "$restore_container" \
    psql -qAt -X -v ON_ERROR_STOP=1 -h 127.0.0.1 \
      -U supabase_admin -d postgres -c \
      "SELECT e.extname || '|' || n.nspname || '|' || e.extversion FROM pg_extension AS e JOIN pg_namespace AS n ON n.oid = e.extnamespace ORDER BY e.extname"
)"
if [[ "$restored_extension_inventory" != "$expected_extension_inventory" ]]; then
  echo "restored extension inventory differs from production" >&2
  exit 1
fi

# Managed-schema dumps contain cross-schema dependencies in both directions:
# auth triggers call public functions, while public objects depend on auth; and
# storage policies call public functions, while public objects depend on the
# storage base schema. Split only those deferred DDL statements, validate a
# lossless split, and restore them after public.
auth_schema_base="$tmp/auth-schema-base.sql"
auth_public_triggers="$tmp/auth-public-triggers.sql"
awk -v deferred="$auth_public_triggers" '
  /^CREATE OR REPLACE TRIGGER .*EXECUTE FUNCTION "public"[.]/ {
    print > deferred
    next
  }
  { print }
' "$auth_schema_backup" >"$auth_schema_base"
auth_trigger_source_count="$(
  rg -c '^CREATE OR REPLACE TRIGGER .*EXECUTE FUNCTION "public"[.]' \
    "$auth_schema_backup" || true
)"
auth_trigger_deferred_count="$(
  rg -c '^CREATE OR REPLACE TRIGGER' "$auth_public_triggers" || true
)"
if [[ -z "$auth_trigger_source_count" || "$auth_trigger_source_count" == "0" \
      || "$auth_trigger_source_count" != "$auth_trigger_deferred_count" ]]; then
  echo "auth trigger dependency split is incomplete; no migration was applied" >&2
  exit 1
fi

storage_schema_base="$tmp/storage-schema-base.sql"
storage_policies="$tmp/storage-policies.sql"
perl -0777 -e '
  $source = <>;
  open my $deferred, ">", $ARGV[0] or die $!;
  while ($source =~ s/(^CREATE POLICY .*?;\n)//ms) {
    print {$deferred} $1;
  }
  print $source;
' "$storage_schema_backup" "$storage_policies" >"$storage_schema_base"
storage_policy_source_count="$(rg -c '^CREATE POLICY' "$storage_schema_backup" || true)"
storage_policy_deferred_count="$(rg -c '^CREATE POLICY' "$storage_policies" || true)"
if [[ -z "$storage_policy_source_count" || "$storage_policy_source_count" == "0" \
      || "$storage_policy_source_count" != "$storage_policy_deferred_count" ]]; then
  echo "storage policy dependency split is incomplete; no migration was applied" >&2
  exit 1
fi

restore_artifacts=(
  "$auth_schema_base"
  "$storage_schema_base"
  "$schema_backup"
  "$auth_public_triggers"
  "$storage_policies"
)
for restore_artifact in "${restore_artifacts[@]}"
do
  if ! docker exec -e PGPASSWORD="$restore_password" -i \
      "$restore_container" psql -q -X -v ON_ERROR_STOP=1 \
      --single-transaction -h 127.0.0.1 \
      -U supabase_admin -d postgres <"$restore_artifact"; then
    echo "backup restore failed at $(basename "$restore_artifact"); no migration was applied" >&2
    exit 1
  fi
done

# Extensions may seed public tables while the schema is installed. The backup,
# not those image defaults, must be the sole source of restored table data.
docker exec -e PGPASSWORD="$restore_password" "$restore_container" \
  psql -q -X -v ON_ERROR_STOP=1 -h 127.0.0.1 \
    -U supabase_admin -d postgres -c \
    "DO \$\$ DECLARE tables_sql text; BEGIN SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO tables_sql FROM pg_tables WHERE schemaname = 'public'; IF tables_sql IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ' || tables_sql || ' CASCADE'; END IF; END \$\$"

if ! {
  printf '%s\n' 'SET session_replication_role = replica;'
  sed '/^\\restrict /d; /^\\unrestrict /d' "$data_backup"
  printf '%s\n' 'SET session_replication_role = origin;'
} | docker exec -e PGPASSWORD="$restore_password" -i \
    "$restore_container" psql -q -X -v ON_ERROR_STOP=1 \
    --single-transaction -h 127.0.0.1 \
    -U supabase_admin -d postgres; then
  echo "multi-schema data restore failed; no migration was applied" >&2
  exit 1
fi

# session_replication_role is required to load cyclic managed-schema data, but
# it also suppresses FK triggers. Prove the restored MVCC snapshot contains no
# orphan for every validated FK owned by auth/storage/public before accepting
# the backup as a recovery point.
# PRAGAS_RESTORED_FOREIGN_KEY_SCAN_BEGIN
if ! restored_fk_result="$(docker exec -e PGPASSWORD="$restore_password" -i \
  "$restore_container" psql -qAt -X -v ON_ERROR_STOP=1 \
  -h 127.0.0.1 -U supabase_admin -d postgres <<'SQL'
DO $restored_foreign_key_verification$
DECLARE
  fk_row record;
  join_predicate text;
  all_child_null text;
  all_child_nonnull text;
  invalid_predicate text;
  orphan_exists boolean;
BEGIN
  FOR fk_row IN
    SELECT constraint_row.oid,
           constraint_row.conname,
           constraint_row.conrelid,
           constraint_row.confrelid,
           constraint_row.confmatchtype,
           child_namespace.nspname AS child_schema,
           child_relation.relname AS child_table,
           parent_namespace.nspname AS parent_schema,
           parent_relation.relname AS parent_table,
           constraint_row.conkey,
           constraint_row.confkey
      FROM pg_constraint AS constraint_row
      JOIN pg_class AS child_relation
        ON child_relation.oid = constraint_row.conrelid
      JOIN pg_namespace AS child_namespace
        ON child_namespace.oid = child_relation.relnamespace
      JOIN pg_class AS parent_relation
        ON parent_relation.oid = constraint_row.confrelid
      JOIN pg_namespace AS parent_namespace
        ON parent_namespace.oid = parent_relation.relnamespace
     WHERE constraint_row.contype = 'f'
       AND constraint_row.convalidated
       AND child_namespace.nspname IN ('auth', 'storage', 'public')
     ORDER BY constraint_row.oid
  LOOP
    SELECT string_agg(
             format('child_row.%I = parent_row.%I',
               child_attribute.attname, parent_attribute.attname),
             ' AND ' ORDER BY key_row.ordinality
           ),
           string_agg(
             format('child_row.%I IS NULL', child_attribute.attname),
             ' AND ' ORDER BY key_row.ordinality
           ),
           string_agg(
             format('child_row.%I IS NOT NULL', child_attribute.attname),
             ' AND ' ORDER BY key_row.ordinality
           )
      INTO join_predicate, all_child_null, all_child_nonnull
      FROM unnest(fk_row.conkey, fk_row.confkey) WITH ORDINALITY
             AS key_row(child_attnum, parent_attnum, ordinality)
      JOIN pg_attribute AS child_attribute
        ON child_attribute.attrelid = fk_row.conrelid
       AND child_attribute.attnum = key_row.child_attnum
       AND NOT child_attribute.attisdropped
      JOIN pg_attribute AS parent_attribute
        ON parent_attribute.attrelid = fk_row.confrelid
       AND parent_attribute.attnum = key_row.parent_attnum
       AND NOT parent_attribute.attisdropped;
    IF join_predicate IS NULL OR all_child_null IS NULL
       OR all_child_nonnull IS NULL THEN
      RAISE EXCEPTION 'restored FK metadata is incomplete: %', fk_row.conname;
    END IF;

    IF fk_row.confmatchtype = 'f' THEN
      invalid_predicate := format(
        'NOT (%s) AND (NOT (%s) OR NOT EXISTS ('
        || 'SELECT 1 FROM %I.%I AS parent_row WHERE %s))',
        all_child_null, all_child_nonnull,
        fk_row.parent_schema, fk_row.parent_table, join_predicate
      );
    ELSE
      invalid_predicate := format(
        '(%s) AND NOT EXISTS ('
        || 'SELECT 1 FROM %I.%I AS parent_row WHERE %s)',
        all_child_nonnull,
        fk_row.parent_schema, fk_row.parent_table, join_predicate
      );
    END IF;

    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I.%I AS child_row WHERE %s)',
      fk_row.child_schema, fk_row.child_table, invalid_predicate
    ) INTO orphan_exists;
    IF orphan_exists THEN
      RAISE EXCEPTION 'restored foreign key has orphan rows: %.%.%',
        fk_row.child_schema, fk_row.child_table, fk_row.conname;
    END IF;
  END LOOP;
END
$restored_foreign_key_verification$;
SELECT 'PRAGAS_RESTORED_FOREIGN_KEYS_OK';
SQL
)"; then
  echo "restored foreign-key scan failed; no migration was applied" >&2
  exit 1
fi
if [[ "$restored_fk_result" != "PRAGAS_RESTORED_FOREIGN_KEYS_OK" ]]; then
  echo "restored foreign-key verification failed; no migration was applied" >&2
  exit 1
fi
# PRAGAS_RESTORED_FOREIGN_KEY_SCAN_END

# Count every table represented by the combined COPY dump inside the restored
# database. Missing relations and any nonempty restored table absent from the
# dumps are hard failures; the sorted actual manifest must then match exactly.
restored_row_manifest="$backup_dir/restored-data-row-counts.manifest"
restored_row_manifest_unsorted="$tmp/restored-data-row-counts.unsorted"
if ! {
  cat <<'SQL'
CREATE TEMP TABLE expected_dump_rows (
  schema_name text NOT NULL,
  relation_name text NOT NULL,
  expected_count bigint NOT NULL CHECK (expected_count >= 0),
  PRIMARY KEY (schema_name, relation_name)
);
COPY expected_dump_rows (schema_name, relation_name, expected_count)
  FROM STDIN WITH (FORMAT csv, DELIMITER '|');
SQL
  cat "$data_row_manifest"
  cat <<'SQL'
\.
CREATE TEMP TABLE restored_dump_rows (
  schema_name text NOT NULL,
  relation_name text NOT NULL,
  actual_count bigint NOT NULL,
  PRIMARY KEY (schema_name, relation_name)
);
DO $manifest_verification$
DECLARE
  relation_row record;
  actual_rows bigint;
  relation_oid oid;
  relation_kind "char";
BEGIN
  IF NOT EXISTS (SELECT 1 FROM expected_dump_rows) THEN
    RAISE EXCEPTION 'COPY row manifest is empty';
  END IF;

  FOR relation_row IN
    SELECT schema_name, relation_name, expected_count
      FROM expected_dump_rows
     ORDER BY schema_name, relation_name
  LOOP
    SELECT relation.oid, relation.relkind
      INTO relation_oid, relation_kind
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace_row
        ON namespace_row.oid = relation.relnamespace
     WHERE namespace_row.nspname = relation_row.schema_name
       AND relation.relname = relation_row.relation_name;
    IF relation_oid IS NULL OR relation_kind NOT IN ('r', 'p') THEN
      RAISE EXCEPTION 'dumped table %.% is missing after restore',
        relation_row.schema_name, relation_row.relation_name;
    END IF;

    EXECUTE format('SELECT count(*) FROM %I.%I',
      relation_row.schema_name, relation_row.relation_name)
      INTO actual_rows;
    INSERT INTO restored_dump_rows
      VALUES (relation_row.schema_name, relation_row.relation_name, actual_rows);
  END LOOP;

  FOR relation_row IN
    SELECT namespace_row.nspname AS schema_name,
           relation.relname AS relation_name
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace_row
        ON namespace_row.oid = relation.relnamespace
     WHERE namespace_row.nspname IN ('auth', 'storage', 'public')
       AND relation.relkind IN ('r', 'p')
       AND NOT EXISTS (
         SELECT 1 FROM expected_dump_rows AS expected
          WHERE expected.schema_name = namespace_row.nspname
            AND expected.relation_name = relation.relname
       )
  LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I',
      relation_row.schema_name, relation_row.relation_name)
      INTO actual_rows;
    IF actual_rows <> 0 THEN
      RAISE EXCEPTION 'nonempty restored table %.% is absent from COPY dumps',
        relation_row.schema_name, relation_row.relation_name;
    END IF;
  END LOOP;
END
$manifest_verification$;
COPY (
  SELECT schema_name || '|' || relation_name || '|' || actual_count
    FROM restored_dump_rows
   ORDER BY schema_name, relation_name
) TO STDOUT;
SQL
} | docker exec -e PGPASSWORD="$restore_password" -i \
      "$restore_container" psql -qAt -X -v ON_ERROR_STOP=1 \
      -h 127.0.0.1 -U supabase_admin -d postgres \
      >"$restored_row_manifest_unsorted"; then
  echo "restored COPY manifest verification failed; no migration was applied" >&2
  exit 1
fi
# PostgreSQL ORDER BY follows the database collation while the dump manifest is
# normalized byte-for-byte. Use one explicit shell collation for both sides.
LC_ALL=C sort "$restored_row_manifest_unsorted" >"$restored_row_manifest"
if ! pragas_compare_row_manifests \
    "$data_row_manifest" "$restored_row_manifest"; then
  echo "database restore is not lossless; no migration was applied" >&2
  exit 1
fi
restored_manifest_hash="$(shasum -a 256 \
  "$restored_row_manifest" | awk '{print $1}')"
printf '%s  %s\n' "$restored_manifest_hash" \
  "$(basename "$restored_row_manifest")" >>"$checksum_manifest"

restored_invariants="$(docker exec -e PGPASSWORD="$restore_password" \
  "$restore_container" psql -qAt -X -v ON_ERROR_STOP=1 \
  -h 127.0.0.1 -U supabase_admin -d postgres -c \
  "SELECT (SELECT count(*) FROM public.pragas_profiles) || '|' || (SELECT count(*) FROM public.pragas_profiles WHERE id <> user_id)")"
if [[ "$restored_invariants" != \
      "$profile_count|$generated_profile_count" ]]; then
  echo "restored profile invariants differ from production; no migration was applied" >&2
  exit 1
fi

# Apply the exact allowlisted bundle to the restored production clone before
# production sees any DDL. This is a real shape rehearsal, not only a dump
# parse or a synthetic fixture test.
# PRAGAS_PRODUCTION_CLONE_MIGRATION_REHEARSAL_BEGIN
if ! run_shared_bootstrap_on_clone; then
  echo "shared relation bootstrap failed on the production clone; no production mutation occurred" >&2
  exit 1
fi
for version in "${TARGET_VERSIONS[@]}"; do
  migration_name_value="$(migration_name "$version")"
  if ! docker exec -e PGPASSWORD="$restore_password" -i \
      "$restore_container" psql -q -X -v ON_ERROR_STOP=1 \
      -h 127.0.0.1 -U supabase_admin -d postgres \
      <"$tmp/supabase/migrations/$migration_name_value"; then
    echo "allowlisted migration failed on the production clone: $version" >&2
    exit 1
  fi
done
clone_postflight_result="$(docker exec -e PGPASSWORD="$restore_password" \
  "$restore_container" psql -qAt -X -v ON_ERROR_STOP=1 \
  -h 127.0.0.1 -U supabase_admin -d postgres -c \
  "SELECT CASE WHEN
     (SELECT count(*) FROM public.pragas_profiles) = $profile_count
     AND (SELECT count(*) FROM public.pragas_profiles WHERE id <> user_id)
       = $generated_profile_count
     AND (SELECT count(*) FROM public.subscriptions WHERE app = 'rumo-pragas') = 0
     AND (SELECT count(*) FROM public.pragas_push_notifications) = 0
     AND to_regclass('public.pragas_app_links') IS NOT NULL
     AND to_regclass('public.pragas_deletion_jobs') IS NOT NULL
     AND to_regclass('public.pragas_ai_idempotency_records') IS NOT NULL
     AND position('pragas_link_account_prod_compat_v1' IN
       pg_get_functiondef('public.pragas_link_account()'::regprocedure)) > 0
     AND position('pragas_prod_compat_export_v1' IN pg_get_functiondef(
       'public.export_pragas_notification_queue_snapshot(uuid,timestamp with time zone,integer)'::regprocedure)) > 0
   THEN 'PRAGAS_PRODUCTION_CLONE_REHEARSAL_OK'
   ELSE 'PRAGAS_PRODUCTION_CLONE_REHEARSAL_FAILED' END")"
if [[ "$clone_postflight_result" != "PRAGAS_PRODUCTION_CLONE_REHEARSAL_OK" ]]; then
  echo "allowlisted production-clone postflight failed; no production mutation occurred" >&2
  exit 1
fi
# PRAGAS_PRODUCTION_CLONE_MIGRATION_REHEARSAL_END
docker rm -f "$restore_container" >/dev/null
restore_container=""

printf '%s\n' \
  "target=$TARGET_REF" \
  "backup_stamp=$backup_stamp" \
  "profiles=$profile_count" \
  "generated_profile_ids=$generated_profile_count" \
  "auth_users=$auth_user_count" \
  "storage_objects=$storage_object_count" \
  "dump_tables=$dump_table_count" \
  "restored_manifest_sha256=$restored_manifest_hash" \
  "extensions=10" \
  "edge_restore_version=$EXISTING_EDGE_VERSION" \
  "edge_restore_verify_jwt=$EXISTING_EDGE_VERIFY_JWT" \
  "edge_restore_ezbr=$EXISTING_EDGE_EZBR" \
  "edge_archive_sha256=$edge_archive_hash" \
  "database_restore_test=pass" \
  "restored_foreign_keys=pass" \
  "all_dumped_table_row_counts=pass" \
  "production_clone_migration_rehearsal=pass" \
  "shared_relation_bootstrap=concurrent" \
  "edge_archive_restore_test=pass" \
  >"$backup_dir/restore-evidence.txt"
if ! pragas_assert_private_backup_leaf \
    "$backup_root" "$backup_dir" >/dev/null \
   || ! (cd "$backup_dir" && shasum -a 256 -c SHA256SUMS >/dev/null); then
  echo "backup evidence privacy or checksums changed; no migration was applied" >&2
  exit 1
fi

if [[ "$mode" == "--prepare" ]]; then
  echo "prod-compat authenticated backup + restore preparation: PASS"
  echo "no production mutation was performed"
  echo "backup_and_restore_evidence=$backup_dir"
  exit 0
fi

# Close the race window introduced by backup time. All data-sensitive zero
# assumptions and the exact targeted Edge baseline are re-read immediately
# before the first production mutation.
mutation_recheck_csv="$tmp/mutation-recheck.csv"
# PRAGAS_MUTATION_RECHECK_SINGLE_SELECT_BEGIN
mutation_recheck_sql="$(cat <<'SQL'
SELECT
  (SELECT count(*) FROM public.pragas_profiles) AS profile_count,
  (SELECT count(*) FROM public.pragas_profiles WHERE id <> user_id)
    AS generated_profile_count,
  (SELECT count(*) FROM public.subscriptions WHERE app = 'rumo-pragas')
    AS app_subscription_count,
  (SELECT count(*) FROM public.pragas_push_notifications)
    AS push_notification_count;
SQL
)"
# PRAGAS_MUTATION_RECHECK_SINGLE_SELECT_END
if ! supabase db query --linked --workdir "$tmp" --agent=no --output csv \
    "$mutation_recheck_sql" \
    >"$mutation_recheck_csv"; then
  echo "immediate production recheck failed; no migration was applied" >&2
  exit 1
fi
if ! pragas_parse_mutation_recheck_csv "$mutation_recheck_csv" \
    "$profile_count" "$generated_profile_count" >/dev/null; then
  echo "immediate production data contract changed; no migration was applied" >&2
  exit 1
fi

remote_functions_recheck="$tmp/remote-functions-mutation-recheck.json"
if ! supabase functions list --project-ref "$TARGET_REF" --output json \
    --workdir "$edge_candidate_work" --agent=no >"$remote_functions_recheck"; then
  echo "immediate Edge baseline recheck failed; no migration was applied" >&2
  exit 1
fi
target_slug_json="$(printf '%s\n' "${EDGE_SLUGS[@]}" | jq -Rsc 'split("\n")[:-1]')"
if ! pragas_write_target_edge_inventory \
    "$remote_functions" "$target_slug_json" \
    >"$tmp/target-edge-before.json"; then
  echo "initial targeted Edge baseline is malformed; no migration was applied" >&2
  exit 1
fi
if ! pragas_write_target_edge_inventory \
    "$remote_functions_recheck" "$target_slug_json" \
    >"$tmp/target-edge-recheck.json"; then
  echo "immediate targeted Edge baseline is malformed; no migration was applied" >&2
  exit 1
fi
if ! pragas_assert_target_edge_inventory \
    "$tmp/target-edge-before.json" "$remote_functions_recheck" \
    "$target_slug_json"; then
  echo "targeted Edge baseline changed during backup; no migration was applied" >&2
  exit 1
fi

if ! assert_remote_migration_history_unchanged "before-shared-bootstrap"; then
  echo "production migration history changed during backup; no mutation was performed by this gate" >&2
  exit 1
fi
if ! run_shared_bootstrap_on_linked_project; then
  echo "shared relation bootstrap stopped before db push" >&2
  echo "only additive columns/concurrent indexes from a partial bootstrap may exist; no migration or Edge Function was applied" >&2
  exit 1
fi
if ! assert_remote_migration_history_unchanged "after-shared-bootstrap"; then
  echo "production migration history changed during shared bootstrap" >&2
  echo "additive shared bootstrap objects may exist; no migration or Edge Function was applied by this gate" >&2
  exit 1
fi

if ! db_push_output="$(
  PGSSLMODE=verify-full PGSSLROOTCERT="$db_sslrootcert" \
    supabase db push --linked --workdir "$tmp" --yes 2>&1
)"; then
  echo "production migration push failed under verified TLS" >&2
  exit 1
fi
printf '%s\n' "$db_push_output"

postflight_sql="$(cat <<SQL
SELECT CASE WHEN
  (SELECT count(*) FROM public.pragas_profiles) = $profile_count
  AND (SELECT count(*) FROM public.pragas_profiles WHERE id <> user_id)
      = $generated_profile_count
  AND to_regclass('public.pragas_app_links') IS NOT NULL
  AND to_regclass('public.pragas_deletion_jobs') IS NOT NULL
  AND to_regclass('public.pragas_ai_idempotency_records') IS NOT NULL
  AND to_regclass('public.pragas_api_rate_limit_counters') IS NOT NULL
  AND to_regprocedure('public.pragas_link_account()') IS NOT NULL
  AND position(
    'pragas_link_account_prod_compat_v1' IN
    pg_get_functiondef('public.pragas_link_account()'::regprocedure)
  ) > 0
  AND to_regprocedure(
    'public.export_pragas_notification_queue_snapshot(uuid,timestamp with time zone,integer)'
  ) IS NOT NULL
  AND position(
    'pragas_prod_compat_export_v1' IN pg_get_functiondef(
      'public.export_pragas_notification_queue_snapshot(uuid,timestamp with time zone,integer)'::regprocedure
    )
  ) > 0
  AND EXISTS (
    SELECT 1 FROM storage.buckets
     WHERE id = 'pragas-avatars' AND NOT public
       AND file_size_limit = 2097152
       AND allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']::text[]
  )
  AND NOT has_table_privilege('anon', 'public.pragas_profiles', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.pragas_diagnoses', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.pragas_diagnosis_feedback', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.pragas_push_tokens', 'SELECT')
  AND NOT has_table_privilege(
    'authenticated', 'public.pragas_profiles', 'UPDATE'
  )
  AND has_column_privilege(
    'authenticated', 'public.pragas_profiles', 'city', 'UPDATE'
  )
  AND has_column_privilege(
    'authenticated', 'public.pragas_profiles', 'avatar_path', 'UPDATE'
  )
  AND NOT has_column_privilege(
    'authenticated', 'public.pragas_profiles', 'id', 'UPDATE'
  )
  AND NOT has_column_privilege(
    'authenticated', 'public.pragas_profiles', 'user_id', 'UPDATE'
  )
  AND has_function_privilege('authenticated', 'public.pragas_link_account()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.pragas_link_account()', 'EXECUTE')
  AND NOT EXISTS (
    SELECT 1
      FROM (VALUES
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
     WHERE to_regprocedure('public.' || expected.signature) IS NULL
        OR NOT has_function_privilege(
          expected.execution_role,
          to_regprocedure('public.' || expected.signature),
          'EXECUTE'
        )
        OR has_function_privilege(
          'anon', to_regprocedure('public.' || expected.signature), 'EXECUTE'
        )
        OR (
          expected.execution_role = 'service_role'
          AND has_function_privilege(
            'authenticated', to_regprocedure('public.' || expected.signature),
            'EXECUTE'
          )
        )
  )
  AND NOT EXISTS (
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
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'pragas_profiles', 'pragas_diagnoses',
         'pragas_diagnosis_feedback', 'pragas_push_tokens',
         'pragas_user_preferences'
       )
       AND permissive = 'PERMISSIVE'
       AND roles && ARRAY['public','anon','authenticated']::name[]
       AND (
         (cmd IN ('SELECT','DELETE') AND (
           position('auth.uid' IN lower(coalesce(qual, ''))) = 0
           OR position('user_id' IN lower(coalesce(qual, ''))) = 0
         ))
         OR (cmd = 'INSERT' AND (
           position('auth.uid' IN lower(coalesce(with_check, qual, ''))) = 0
           OR position('user_id' IN lower(coalesce(with_check, qual, ''))) = 0
         ))
         OR (cmd IN ('UPDATE','ALL') AND (
           position('auth.uid' IN lower(coalesce(qual, ''))) = 0
           OR position('user_id' IN lower(coalesce(qual, ''))) = 0
           OR position('auth.uid' IN lower(coalesce(with_check, qual, ''))) = 0
           OR position('user_id' IN lower(coalesce(with_check, qual, ''))) = 0
         ))
       )
  )
  AND (
    SELECT count(*) FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'pragas_profiles', 'pragas_diagnoses',
         'pragas_diagnosis_feedback', 'pragas_push_tokens',
         'pragas_user_preferences'
       )
       AND policyname = 'pragas_active_link_restrict'
       AND permissive = 'RESTRICTIVE'
       AND roles = ARRAY['authenticated']::name[]
       AND position('pragas_current_link_allows_access' IN coalesce(qual, '')) > 0
       AND position(
         'pragas_current_link_allows_access' IN coalesce(with_check, qual, '')
       ) > 0
  ) = 5
THEN 'PRAGAS_PROD_COMPAT_POSTFLIGHT_OK'
ELSE 'PRAGAS_PROD_COMPAT_POSTFLIGHT_FAILED' END AS result;
SQL
)"
postflight_csv="$tmp/postflight.csv"
if ! supabase db query --linked --workdir "$tmp" --agent=no --output csv \
    "$postflight_sql" >"$postflight_csv"; then
  echo "production postflight query failed" >&2
  exit 1
fi
postflight_result="$(sed -n '2p' "$postflight_csv" | tr -d '"\r[:space:]')"
if [[ "$postflight_result" != "PRAGAS_PROD_COMPAT_POSTFLIGHT_OK" ]]; then
  echo "production postflight contract failed" >&2
  echo "no Edge Function was deployed; database down scripts remain manual" >&2
  exit 1
fi

if ! supabase db query --linked --workdir "$tmp" --agent=no --output json \
    "SELECT tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('pragas_profiles','pragas_diagnoses','pragas_diagnosis_feedback','pragas_push_tokens','pragas_user_preferences') ORDER BY tablename, policyname" \
    >"$backup_dir/policies-after.json"; then
  echo "failed to record postflight RLS inventory" >&2
  exit 1
fi

edge_run_dir="$backup_dir/edge-deployment-state"
mkdir -p "$edge_run_dir"
edge_baseline_inventory="$edge_run_dir/target-baseline.json"
edge_expected_inventory="$edge_run_dir/target-expected-before-next-deploy.json"
edge_latest_observed_target="$edge_run_dir/target-observed-latest.json"
edge_validated_transitions="$edge_run_dir/validated-transitions.json"
edge_stop_report="$backup_dir/edge-deployment-stop-report.json"
edge_recovery_instructions="$backup_dir/EDGE-RECOVERY-INSTRUCTIONS.txt"
cp "$tmp/target-edge-before.json" "$edge_baseline_inventory"
cp "$edge_baseline_inventory" "$edge_expected_inventory"
cp "$edge_baseline_inventory" "$edge_latest_observed_target"
printf '%s\n' '[]' >"$edge_validated_transitions"

cat >"$edge_recovery_instructions" <<EOF
Rumo Pragas production compatibility Edge recovery

Automatic Edge rollback is disabled. Supabase Edge delete/deploy operations do
not provide a conditional version/hash compare-and-swap contract, so an
automatic restore or delete could overwrite a concurrent operator's change.

On any rollout stop:
1. Preserve every remote Edge Function exactly as observed.
2. Inspect edge-deployment-stop-report.json and edge-deployment-state/.
3. Re-read the live inventory and compare version, ezbr_sha256, status and
   verify_jwt with the expected and observed records immediately before any
   separately authorized manual recovery.
4. The archived source for the original pragas-send-push is available at
   $(basename "$edge_archive"). It is evidence/recovery input, not an
   authorization to overwrite the live function.
5. Database down scripts are separate and manual; do not couple them to an
   Edge recovery without a fresh database assessment.

No destructive Edge command is generated by this gate.
EOF

write_edge_stop_report() {
  local reason="$1"
  local failed_slug="$2"
  local observed_available="$3"
  local raw_observed_file="${4:-}"
  local report_tmp="$edge_stop_report.tmp"
  local stopped_at

  stopped_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  jq -n \
    --arg schema "pragas_edge_deployment_stop_v1" \
    --arg target_ref "$TARGET_REF" \
    --arg stopped_at "$stopped_at" \
    --arg reason "$reason" \
    --arg failed_slug "$failed_slug" \
    --arg raw_observed_file "$raw_observed_file" \
    --argjson observed_available "$observed_available" \
    --slurpfile baseline "$edge_baseline_inventory" \
    --slurpfile expected "$edge_expected_inventory" \
    --slurpfile observed "$edge_latest_observed_target" \
    --slurpfile transitions "$edge_validated_transitions" '
      {
        schema: $schema,
        target_ref: $target_ref,
        stopped_at: $stopped_at,
        reason: $reason,
        failed_slug: (
          if $failed_slug == "" then null else $failed_slug end
        ),
        automatic_edge_rollback: false,
        stop_handler_mutated_edge_state: false,
        target_baseline: $baseline[0],
        expected_before_attempt: $expected[0],
        observed_available: $observed_available,
        observed_after_attempt: (
          if $observed_available then $observed[0] else null end
        ),
        raw_observed_inventory_file: (
          if $raw_observed_file == "" then null else $raw_observed_file end
        ),
        validated_transitions: $transitions[0],
        recovery_instructions: "EDGE-RECOVERY-INSTRUCTIONS.txt",
        database_down_scripts: "separate_and_manual"
      }
    ' >"$report_tmp"
  mv "$report_tmp" "$edge_stop_report"
  echo "Edge rollout stopped fail-closed: $reason" >&2
  echo "automatic Edge rollback is disabled; remote state was left intact by the stop handler" >&2
  echo "expected/observed report: $edge_stop_report" >&2
  echo "manual recovery guidance: $edge_recovery_instructions" >&2
}

record_edge_transition() {
  local deployed_slug="$1"
  local before_file="$2"
  local after_file="$3"
  local local_candidate_ezbr="$4"
  local entry_file="$edge_run_dir/transition-entry.tmp.json"
  local manifest_tmp="$edge_validated_transitions.tmp"
  local observed_at

  observed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  jq -n \
    --arg slug "$deployed_slug" \
    --arg observed_at "$observed_at" \
    --arg local_candidate_ezbr "$local_candidate_ezbr" \
    --slurpfile before "$before_file" \
    --slurpfile after "$after_file" '
      {
        slug: $slug,
        observed_at: $observed_at,
        local_candidate_ezbr_sha256: $local_candidate_ezbr,
        before: (
          [$before[0][] | select(.slug == $slug)][0] // null
        ),
        after: [$after[0][] | select(.slug == $slug)][0]
      }
    ' >"$entry_file"
  jq --slurpfile entry "$entry_file" \
    '. + [$entry[0]]' "$edge_validated_transitions" >"$manifest_tmp"
  mv "$manifest_tmp" "$edge_validated_transitions"
  rm -f "$entry_file"
}

# Recheck the private snapshot after the database operation. The shared
# worktree is intentionally no longer an input to any bundle.
for slug in "${EDGE_SLUGS[@]}"; do
  if ! assert_edge_candidate_snapshot "$slug"; then
    write_edge_stop_report \
      "edge_candidate_snapshot_changed_before_rollout" "$slug" false ""
    exit 1
  fi
done

# PRAGAS_EDGE_DEPLOY_LOOP_BEGIN
edge_attempt=0
for slug in "${EDGE_DEPLOY_ORDER[@]}"; do
  edge_attempt=$((edge_attempt + 1))
  attempt_label="$(printf '%02d' "$edge_attempt")-$slug"
  predeploy_raw="$edge_run_dir/$attempt_label-before-raw.json"
  predeploy_target="$edge_run_dir/$attempt_label-before-target.json"
  postdeploy_raw="$edge_run_dir/$attempt_label-after-raw.json"
  postdeploy_target="$edge_run_dir/$attempt_label-after-target.json"
  postdeploy_confirm_raw="$edge_run_dir/$attempt_label-confirmed-raw.json"
  postdeploy_confirm_target="$edge_run_dir/$attempt_label-confirmed-target.json"
  deploy_debug_log="$tmp/$attempt_label-local-bundle-debug.log"
  local_bundle_evidence="$edge_run_dir/$attempt_label-local-ezbr-sha256.txt"

  # Re-read immediately before every deploy. For the first iteration this is
  # the required post-database baseline revalidation; later iterations also
  # prove that all previously observed transitions remain unchanged.
  if ! supabase functions list --project-ref "$TARGET_REF" --output json \
      --workdir "$edge_candidate_work" --agent=no >"$predeploy_raw"; then
    write_edge_stop_report \
      "predeploy_inventory_unavailable" "$slug" false "$predeploy_raw"
    exit 1
  fi
  if ! pragas_write_target_edge_inventory \
      "$predeploy_raw" "$target_slug_json" >"$predeploy_target"; then
    write_edge_stop_report \
      "predeploy_inventory_malformed" "$slug" false "$predeploy_raw"
    exit 1
  fi
  cp "$predeploy_target" "$edge_latest_observed_target"
  if ! pragas_assert_target_edge_inventory \
      "$edge_expected_inventory" "$predeploy_raw" "$target_slug_json"; then
    write_edge_stop_report \
      "predeploy_inventory_changed" "$slug" true "$predeploy_raw"
    exit 1
  fi

  # Rehash the immutable candidate immediately before the CLI reads it.
  if ! assert_edge_candidate_snapshot "$slug"; then
    write_edge_stop_report \
      "edge_candidate_snapshot_changed" "$slug" true "$predeploy_raw"
    exit 1
  fi

  deploy_args=(
    functions deploy "$slug"
    --project-ref "$TARGET_REF"
    --workdir "$edge_candidate_work"
    --use-docker
    --debug
    --agent=no
  )
  if [[ "$(expected_edge_verify_jwt "$slug")" == "false" ]]; then
    deploy_args+=(--no-verify-jwt)
  fi
  : >"$deploy_debug_log"
  chmod 600 "$deploy_debug_log"
  if ! supabase "${deploy_args[@]}" 2>"$deploy_debug_log"; then
    observed_available="false"
    if supabase functions list --project-ref "$TARGET_REF" --output json \
        --workdir "$edge_candidate_work" --agent=no >"$postdeploy_raw" \
        && pragas_write_target_edge_inventory \
          "$postdeploy_raw" "$target_slug_json" >"$postdeploy_target"; then
      cp "$postdeploy_target" "$edge_latest_observed_target"
      observed_available="true"
    fi
    write_edge_stop_report \
      "deploy_command_failed_or_ambiguous" "$slug" \
      "$observed_available" "$postdeploy_raw"
    exit 1
  fi

  # The pinned local Docker bundler hashes the exact compressed EZBR before
  # its mutation request. Extract exactly one private debug URL identity; a
  # server-side fallback, duplicate request, malformed hash or unexpected
  # endpoint is an ambiguous deployment and stops without automatic rollback.
  if ! expected_deployed_ezbr="$(pragas_extract_local_edge_bundle_hash \
      "$deploy_debug_log" "$TARGET_REF" "$slug")"; then
    observed_available="false"
    if supabase functions list --project-ref "$TARGET_REF" --output json \
        --workdir "$edge_candidate_work" --agent=no >"$postdeploy_raw" \
        && pragas_write_target_edge_inventory \
          "$postdeploy_raw" "$target_slug_json" >"$postdeploy_target"; then
      cp "$postdeploy_target" "$edge_latest_observed_target"
      observed_available="true"
    fi
    write_edge_stop_report \
      "local_bundle_identity_unavailable" "$slug" \
      "$observed_available" "$postdeploy_raw"
    exit 1
  fi
  printf '%s  %s\n' "$expected_deployed_ezbr" "$slug" \
    >"$local_bundle_evidence"
  chmod 600 "$local_bundle_evidence"
  chmod 400 "$deploy_debug_log"

  if ! supabase functions list --project-ref "$TARGET_REF" --output json \
      --workdir "$edge_candidate_work" --agent=no >"$postdeploy_raw"; then
    write_edge_stop_report \
      "postdeploy_inventory_unavailable" "$slug" false "$postdeploy_raw"
    exit 1
  fi
  if ! pragas_write_target_edge_inventory \
      "$postdeploy_raw" "$target_slug_json" >"$postdeploy_target"; then
    write_edge_stop_report \
      "postdeploy_inventory_malformed" "$slug" false "$postdeploy_raw"
    exit 1
  fi
  cp "$postdeploy_target" "$edge_latest_observed_target"

  if ! assert_edge_candidate_snapshot "$slug"; then
    write_edge_stop_report \
      "edge_candidate_snapshot_changed_after_deploy" "$slug" true \
      "$postdeploy_raw"
    exit 1
  fi
  # A second independent inventory read must reproduce the exact bundle hash
  # first observed for this deployment. A valid-but-different 64-hex hash is a
  # race/failure, not an acceptable transition.
  if ! supabase functions list --project-ref "$TARGET_REF" --output json \
      --workdir "$edge_candidate_work" --agent=no \
      >"$postdeploy_confirm_raw"; then
    write_edge_stop_report \
      "postdeploy_confirmation_unavailable" "$slug" false \
      "$postdeploy_confirm_raw"
    exit 1
  fi
  if ! pragas_write_target_edge_inventory \
      "$postdeploy_confirm_raw" "$target_slug_json" \
      >"$postdeploy_confirm_target"; then
    write_edge_stop_report \
      "postdeploy_confirmation_malformed" "$slug" false \
      "$postdeploy_confirm_raw"
    exit 1
  fi
  cp "$postdeploy_confirm_target" "$edge_latest_observed_target"
  if ! pragas_assert_target_edge_inventory \
      "$postdeploy_target" "$postdeploy_confirm_raw" "$target_slug_json"; then
    write_edge_stop_report \
      "postdeploy_hash_changed_before_confirmation" "$slug" true \
      "$postdeploy_confirm_raw"
    exit 1
  fi
  if ! pragas_assert_edge_deploy_transition \
      "$predeploy_target" "$postdeploy_confirm_target" "$slug" \
      "$(expected_edge_verify_jwt "$slug")" "$expected_deployed_ezbr"; then
    write_edge_stop_report \
      "postdeploy_transition_ambiguous" "$slug" true \
      "$postdeploy_confirm_raw"
    exit 1
  fi
  if ! record_edge_transition \
      "$slug" "$predeploy_target" "$postdeploy_confirm_target" \
      "$expected_deployed_ezbr"; then
    write_edge_stop_report \
      "transition_record_failed" "$slug" true "$postdeploy_confirm_raw"
    exit 1
  fi
  if ! cp "$postdeploy_confirm_target" "$edge_expected_inventory"; then
    write_edge_stop_report \
      "expected_state_record_failed" "$slug" true "$postdeploy_confirm_raw"
    exit 1
  fi
done
# PRAGAS_EDGE_DEPLOY_LOOP_END

# A final fresh inventory must still equal the exact state recorded after the
# twelfth transition. Any later concurrent mutation stops without rollback.
remote_functions_after="$backup_dir/edge-functions-after.json"
if ! supabase functions list --project-ref "$TARGET_REF" --output json \
    --workdir "$edge_candidate_work" --agent=no >"$remote_functions_after"; then
  write_edge_stop_report \
    "final_inventory_unavailable" "" false "$remote_functions_after"
  exit 1
fi
if ! pragas_write_target_edge_inventory \
    "$remote_functions_after" "$target_slug_json" \
    >"$edge_run_dir/target-final.json"; then
  write_edge_stop_report \
    "final_inventory_malformed" "" false "$remote_functions_after"
  exit 1
fi
cp "$edge_run_dir/target-final.json" "$edge_latest_observed_target"
if ! pragas_assert_target_edge_inventory \
    "$edge_expected_inventory" "$remote_functions_after" \
    "$target_slug_json"; then
  write_edge_stop_report \
    "final_inventory_changed" "" true "$remote_functions_after"
  exit 1
fi

edge_hash_manifest="$backup_dir/edge-local-source-sha256.txt"
for slug in _shared "${EDGE_SLUGS[@]}"; do
  printf '%s  %s\n' "$(expected_edge_hash "$slug")" "$slug" \
    >>"$edge_hash_manifest"
done

echo "prod-compat DB + 12 Edge gate: APPLY PASS"
echo "backup_and_restore_evidence=$backup_dir"
echo "Edge recovery: automatic rollback disabled; use recorded state and manual guidance"
echo "database recovery: down scripts remain separate and manual"
