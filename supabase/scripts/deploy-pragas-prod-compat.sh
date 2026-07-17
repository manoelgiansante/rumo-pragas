#!/usr/bin/env bash
set -euo pipefail

readonly TARGET_REF="jxcnfyeemdltdfqtgbcl"
readonly REVIEWED_SUPABASE_CLI_VERSION="2.98.2"
readonly REVIEWED_SUPABASE_CLI_SHA256="0412442a84b5b85af85ee540dd445e961b4cd1818ddc5365aa0ac298d908bd87"
readonly REVIEWED_EDGE_RUNTIME_IMAGE="supabase/edge-runtime:v1.73.13"
readonly REVIEWED_EDGE_RUNTIME_IMAGE_ID="sha256:cfa86b9ad11f349aa4b930f3ab295d6ad923f2e43c5513c08d79c1f3b990b486"
readonly REVIEWED_PG_BACKUP_IMAGE="public.ecr.aws/supabase/postgres@sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426"
readonly REVIEWED_PG_BACKUP_DIGEST="sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426"
readonly REVIEWED_DB_CA_URL="https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt"
readonly REVIEWED_DB_CA_SHA256="700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7"
readonly REVIEWED_SYSTEM_CURL="/usr/bin/curl"
readonly TEMP_LOGIN_ROLE_MIN_TTL_SECONDS="300"
readonly TEMP_LOGIN_ROLE_MAX_TTL_SECONDS="3600"
readonly TEMP_LOGIN_ROLE_MIN_REMAINING_SECONDS="120"
readonly PHYSICAL_BACKUP_MAX_AGE_SECONDS="129600"
readonly REVIEWED_APPLE_SIGN_IN_KEY_ID="S7F5NF2BN7"
readonly REVIEWED_APPLE_SIGN_IN_KEY_ID_SHA256="7e3835d041807f1b3013af69924f4c67feae09b2e147af5589576f0d34c72ade"
readonly REVIEWED_APPLE_SIGN_IN_PRIVATE_KEY_SHA256="ce1992e53f55a4fdc98d535d088b95e0a71faf841cb52288f0c0764a1eaa08a0"
readonly TARGET_VERSIONS=(
  "20260715170000"
  "20260715171000"
  "20260715172000"
  "20260715173000"
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
  "pragas-global-account-deletion"
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
  "pragas-global-account-deletion"
)
readonly EDGE_DEPLOY_ORDER=(
  "pragas-process-deletions"
  "pragas-process-ai-idempotency"
  "pragas-send-push"
  "pragas-global-account-deletion"
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
readonly EXISTING_EDGE_VERSION="21"
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
    20260715173000) echo "20260715173000_agrorumo_global_account_deletion_requests.sql" ;;
    *) return 1 ;;
  esac
}

expected_hash() {
  case "$1" in
    20260715170000) echo "e75f0ea10b80d8021aaa1ddccd0307098cb313b67b1042a777311d1d038b64d5" ;;
    20260715171000) echo "6166cb7282e4e5f16300b29404cec218dcca81255ca09202f2e094658077c9bb" ;;
    20260715172000) echo "46ab43a60bf9adf52ec99aed85eaee22010132e6afc4364fd6d47589ed4b087e" ;;
    20260715173000) echo "213e20b7b824630d862457c512caf17336754ff87296bc1c854403b7c3c436fc" ;;
    *) return 1 ;;
  esac
}

expected_edge_verify_jwt() {
  case "$1" in
    pragas-process-deletions|pragas-process-ai-idempotency|pragas-send-push|pragas-global-account-deletion)
      echo "false"
      ;;
    *) echo "true" ;;
  esac
}

expected_edge_hash() {
  case "$1" in
    _shared) echo "61529feb4a91fb5dd3093cd38e0dd25f1e9b073743577e290163eef55d283d4c" ;;
    diagnose-pragas) echo "4e8293678b98cb6e2b3061fef6a8483aa4d1450efa3c8a9991e1a33b5bd2447b" ;;
    ai-chat-pragas) echo "b07ef59e6857ac131b5df00691d14f0fe94581d9396ee8e5a3fdc52b3f867b5f" ;;
    pragas-delete-user-account) echo "5a8601bf3d8caa6200f983d65cd4cd66e0801deb4cccbbadd6d54d9b117b0513" ;;
    pragas-export-user-data) echo "c37964b4e4194a9add2188e4e0dc2207dbed0bd4b5aa5239ea56e6274dc8cfd4" ;;
    pragas-reactivate-account) echo "7919180b3d618b4c67c67bce9c4665338af42972c4eb801ee4c9fa9d84c0a638" ;;
    pragas-analytics) echo "fa031fd68caf3bd58ee21d39c1696d8d09108afcacfdca388fea48d7f9a7b386" ;;
    report-ai-content) echo "4120e5aa54137cea56118a42047689996d1f3b8f3f0f592488a496a0d312e1bf" ;;
    report-diagnosis-feedback) echo "2bbed865bf4420eae7ec98108af22a82de91b9c4731eb75f43111cc0a179c93e" ;;
    admin-ai-content-reports) echo "d9ecd60ed0e6d31748263e3762fe33afa7b33e93fb724f278a0fa4868f77ccb9" ;;
    pragas-process-deletions) echo "9dcfd5b9cb2e14bc4a075c71acd9315d17bf3fa6254f8f24166d29a3e1b66a38" ;;
    pragas-process-ai-idempotency) echo "fc896e878917c441c3f622c5b568599cf0ceaab84aaed246185417db2654c185" ;;
    pragas-send-push) echo "897078f6ffd884e8eb272ce024a095adaa4c96f286428875b2cfa583f0a9e880" ;;
    pragas-global-account-deletion) echo "df633ba8db0334294cc5f2299e1171cec72c8c05fa399b75a4236bccb10fd760" ;;
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
if [[ "$-" == *x* ]]; then
  echo "refusing production gate while shell tracing is enabled" >&2
  exit 1
fi
if [[ ! -f "$REVIEWED_SYSTEM_CURL" || -L "$REVIEWED_SYSTEM_CURL" \
      || ! -x "$REVIEWED_SYSTEM_CURL" ]]; then
  echo "reviewed system curl is unavailable" >&2
  exit 1
fi

tmp="$(mktemp -d /tmp/rumo-pragas-prod-compat.XXXXXX)"
restore_container=""
backup_dir=""
backup_pgpass=""
sensitive_work_dir=""
restore_pgdata=""
temp_login_cleanup_required="false"
temp_login_access_token=""
temp_login_role=""
temp_login_password=""
temp_login_ttl=""
temp_login_expires_at=""
temp_login_role_issued="false"
temp_login_response=""
backup_db_password=""
cleanup_started="false"

clear_temp_login_role_local() {
  if [[ "$temp_login_cleanup_required" != "true" ]]; then
    return 0
  fi
  if [[ -n "$temp_login_response" ]]; then
    rm -f "$temp_login_response"
  fi
  if [[ -n "$backup_pgpass" ]]; then
    rm -f -- "$backup_pgpass"
  fi
  temp_login_cleanup_required="false"
  temp_login_access_token=""
  temp_login_role=""
  temp_login_password=""
  temp_login_ttl=""
  temp_login_expires_at=""
  temp_login_role_issued="false"
  temp_login_response=""
}

cleanup() {
  local exit_status=$?

  if [[ "$cleanup_started" == "true" ]]; then
    return "$exit_status"
  fi
  cleanup_started="true"
  set +e
  if [[ "$temp_login_cleanup_required" == "true" ]]; then
    if [[ "$temp_login_role_issued" == "true" ]]; then
      echo "clearing local temporary-role credentials; server role will expire by its validated TTL" >&2
    fi
    clear_temp_login_role_local
  fi
  temp_login_access_token=""
  temp_login_role=""
  temp_login_password=""
  temp_login_ttl=""
  temp_login_response=""
  backup_db_password=""
  if [[ -n "$restore_container" ]]; then
    docker rm -f "$restore_container" >/dev/null 2>&1 || true
  fi
  if [[ -n "$sensitive_work_dir" && -n "$backup_dir" \
        && -d "$sensitive_work_dir" && ! -L "$sensitive_work_dir" ]] \
      && pragas_assert_private_backup_leaf \
        "$backup_dir" "$sensitive_work_dir" >/dev/null 2>&1; then
    chmod -R u+w "$sensitive_work_dir" >/dev/null 2>&1 || true
    rm -rf -- "$sensitive_work_dir"
  fi
  chmod -R u+w "$tmp" >/dev/null 2>&1 || true
  rm -rf "$tmp"
  return "$exit_status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

db_sslrootcert_source="${PRAGAS_PROD_DB_SSLROOTCERT:-}"
if [[ -n "$db_sslrootcert_source" ]]; then
  db_sslrootcert_source="$(pragas_validate_pinned_db_sslrootcert \
    "$db_sslrootcert_source" "$REVIEWED_DB_CA_SHA256")" || {
      echo "verified database TLS root CA preflight failed" >&2
      exit 1
    }
elif ! db_sslrootcert_source="$(pragas_install_pinned_db_sslrootcert \
    "$tmp/official-db-root-ca.pem" "$REVIEWED_DB_CA_URL" \
    "$REVIEWED_DB_CA_SHA256" "$REVIEWED_SYSTEM_CURL")"; then
  echo "official database TLS root CA bootstrap failed" >&2
  exit 1
fi
if ! pragas_validate_pinned_db_sslrootcert \
    "$db_sslrootcert_source" "$REVIEWED_DB_CA_SHA256" >/dev/null; then
  echo "verified database TLS root CA preflight failed" >&2
  exit 1
fi
if ! db_sslrootcert_hash="$(
  shasum -a 256 "$db_sslrootcert_source" 2>/dev/null | awk '{print $1}'
)" || [[ "$db_sslrootcert_hash" != "$REVIEWED_DB_CA_SHA256" ]]; then
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
bash "$repo_root/supabase/tests/agrorumo-global-account-deletion-integration.sh"

if [[ "$(shasum -a 256 "$repo_root/supabase/config.toml" | awk '{print $1}')" \
      != "48df42067b5307e8a968f0716ea7473ea045581a2df9c0109cdba9c68b12fede" ]]; then
  echo "Supabase function configuration hash mismatch" >&2
  exit 1
fi
if [[ "$(shasum -a 256 "$repo_root/supabase/functions/deno.json" | awk '{print $1}')" \
      != "2ba7fa4d273962008d261c1d4f0438fa636ba94939edf989206b5bd605428d1c" ]]; then
  echo "Edge Deno configuration hash mismatch" >&2
  exit 1
fi
if [[ "$(shasum -a 256 "$repo_root/supabase/functions/deno.lock" | awk '{print $1}')" \
      != "cb09d8fcef6cffb7efe7f733a48d3f5bdb773187b99afba2fb26c7e1e6dcd0df" ]]; then
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
expo_access_token_expected_digest="${PRAGAS_PROD_EXPO_ACCESS_TOKEN_SHA256:-}"
if [[ ! "$expo_access_token_expected_digest" =~ ^[0-9a-f]{64}$ \
      || "$expo_access_token_expected_digest" \
         == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" ]]; then
  echo "EXPO_ACCESS_TOKEN fingerprint preflight failed" >&2
  echo "set PRAGAS_PROD_EXPO_ACCESS_TOKEN_SHA256 to the reviewed secret SHA-256" >&2
  exit 1
fi

db_sslrootcert="$tmp/db-root-ca.pem"
if ! pragas_copy_verified_file \
    "$db_sslrootcert_source" "$db_sslrootcert" "$db_sslrootcert_hash" \
    >/dev/null 2>&1; then
  echo "verified database TLS root CA snapshot failed" >&2
  exit 1
fi
mkdir -p "$tmp/supabase/.temp" "$tmp/supabase/migrations"
pragas_copy_verified_file \
  "$repo_root/supabase/config.toml" "$tmp/supabase/config.toml" \
  "48df42067b5307e8a968f0716ea7473ea045581a2df9c0109cdba9c68b12fede"

# Snapshot every reviewed Edge input before any remote access. The deploy CLI
# later receives only this private read-only tree, so edits in the shared
# worktree cannot cross the hash-check/bundle boundary.
edge_candidate_work="$tmp/edge-candidate-work"
mkdir -p "$edge_candidate_work/supabase/functions"
pragas_copy_verified_file \
  "$repo_root/supabase/config.toml" \
  "$edge_candidate_work/supabase/config.toml" \
  "48df42067b5307e8a968f0716ea7473ea045581a2df9c0109cdba9c68b12fede"
pragas_copy_verified_file \
  "$repo_root/supabase/functions/deno.json" \
  "$edge_candidate_work/supabase/functions/deno.json" \
  "2ba7fa4d273962008d261c1d4f0438fa636ba94939edf989206b5bd605428d1c"
pragas_copy_verified_file \
  "$repo_root/supabase/functions/deno.lock" \
  "$edge_candidate_work/supabase/functions/deno.lock" \
  "cb09d8fcef6cffb7efe7f733a48d3f5bdb773187b99afba2fb26c7e1e6dcd0df"
for slug in _shared "${EDGE_SLUGS[@]}"; do
  pragas_copy_verified_tree \
    "$repo_root/supabase/functions/$slug" \
    "$edge_candidate_work/supabase/functions/$slug" \
    "$(expected_edge_hash "$slug")"
done
chmod -R u=rX,go= "$edge_candidate_work"

assert_edge_candidate_snapshot() {
  local slug="$1"

  chmod -R u=rX,go= "$edge_candidate_work" || return 1
  pragas_assert_owned_readonly_tree "$edge_candidate_work" >/dev/null \
    || return 1
  [[ "$(shasum -a 256 "$edge_candidate_work/supabase/config.toml" | awk '{print $1}')" \
      == "48df42067b5307e8a968f0716ea7473ea045581a2df9c0109cdba9c68b12fede" \
    && "$(shasum -a 256 "$edge_candidate_work/supabase/functions/deno.json" | awk '{print $1}')" \
      == "2ba7fa4d273962008d261c1d4f0438fa636ba94939edf989206b5bd605428d1c" \
    && "$(shasum -a 256 "$edge_candidate_work/supabase/functions/deno.lock" | awk '{print $1}')" \
      == "cb09d8fcef6cffb7efe7f733a48d3f5bdb773187b99afba2fb26c7e1e6dcd0df" \
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
chmod -R u=rX,go= "$tmp/supabase/.temp"
if ! pragas_assert_owned_readonly_tree "$tmp/supabase/.temp" >/dev/null; then
  echo "Supabase linked metadata snapshot is not private and immutable" >&2
  exit 1
fi
linked_metadata_snapshot_hash="$(directory_hash "$tmp/supabase/.temp")"

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
  'plpgsql_check|public|2.7' \
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

remote_secrets="$tmp/remote-edge-secrets.json"
secret_names="$tmp/remote-secret-names.txt"
if ! supabase secrets list --project-ref "$TARGET_REF" --output json \
    --workdir "$repo_root" --agent=no >"$remote_secrets"; then
  echo "failed to read remote Edge secret names" >&2
  exit 1
fi
if ! jq -r '.[].name' "$remote_secrets" \
    | LC_ALL=C sort -u >"$secret_names"; then
  echo "remote Edge secret metadata is malformed" >&2
  exit 1
fi
required_secret_names=(
  AGRIO_API_KEY
  APPLE_SIGN_IN_KEY_ID
  APPLE_SIGN_IN_PRIVATE_KEY
  CLAUDE_API_KEY
  EXPO_ACCESS_TOKEN
  GEMINI_API_KEY
  SENTRY_DSN
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_URL
)

validate_required_edge_secret_metadata() {
  local inventory_file="$1"
  local secret_name expected_secret_digest

  for secret_name in "${required_secret_names[@]}"; do
    expected_secret_digest=""
    case "$secret_name" in
      EXPO_ACCESS_TOKEN)
        expected_secret_digest="$expo_access_token_expected_digest"
        ;;
      APPLE_SIGN_IN_KEY_ID)
        expected_secret_digest="$REVIEWED_APPLE_SIGN_IN_KEY_ID_SHA256"
        ;;
      APPLE_SIGN_IN_PRIVATE_KEY)
        expected_secret_digest="$REVIEWED_APPLE_SIGN_IN_PRIVATE_KEY_SHA256"
        ;;
    esac
    if ! pragas_validate_required_secret_metadata \
        "$inventory_file" "$secret_name" "$expected_secret_digest"; then
      echo "required Edge secret metadata is absent or unverified: $secret_name" >&2
      if [[ "$secret_name" == APPLE_SIGN_IN_* ]]; then
        echo "expected dedicated Rumo Pragas SIWA key id: $REVIEWED_APPLE_SIGN_IN_KEY_ID" >&2
      fi
      return 1
    fi
  done
}

refresh_required_edge_secret_metadata() {
  local inventory_file="$1"
  local checkpoint_label="$2"

  rm -f -- "$inventory_file"
  if ! supabase secrets list --project-ref "$TARGET_REF" --output json \
      --workdir "$repo_root" --agent=no >"$inventory_file"; then
    echo "failed to re-read required Edge secret metadata: $checkpoint_label" >&2
    return 1
  fi
  if ! validate_required_edge_secret_metadata "$inventory_file"; then
    echo "required Edge secret metadata recheck failed: $checkpoint_label" >&2
    return 1
  fi
}

if ! validate_required_edge_secret_metadata "$remote_secrets"; then
  exit 1
fi

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
  # An already-applied candidate is represented by its real file below; a
  # second local file for the same version would confuse the CLI plan.
  if [[ " ${TARGET_VERSIONS[*]} " != *" $version "* ]]; then
    : > "$tmp/supabase/migrations/${version}_remote_history.sql"
  fi
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
  pragas_copy_verified_file \
    "$repo_root/supabase/migrations/$migration_name_value" \
    "$tmp/supabase/migrations/$migration_name_value" \
    "$(expected_hash "$version")"
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
if [[ "$candidate_file_count" != "${#TARGET_VERSIONS[@]}" ]]; then
  echo "isolated bundle contains a non-allowlisted candidate" >&2
  exit 1
fi

expected_snapshot_migration_names="$tmp/expected-snapshot-migration-names.txt"
{
  grep -vxF -f <(printf '%s\n' "${TARGET_VERSIONS[@]}") "$remote_versions" \
    | sed 's/$/_remote_history.sql/'
  for version in "${TARGET_VERSIONS[@]}"; do
    migration_name "$version"
  done
} | LC_ALL=C sort >"$expected_snapshot_migration_names"

assert_database_candidate_snapshot() {
  local label="$1"
  local version
  local migration_name_value
  local actual_snapshot_migration_names="$tmp/actual-snapshot-migration-names-$label.txt"

  chmod u=r,go= "$tmp/supabase/config.toml" || return 1
  chmod -R u=rX,go= "$tmp/supabase/.temp" "$tmp/supabase/migrations" \
    || return 1
  if [[ ! -f "$tmp/supabase/config.toml" \
        || -L "$tmp/supabase/config.toml" \
        || "$(pragas_stat_uid "$tmp/supabase/config.toml")" != "$(id -u)" \
        || "$(pragas_stat_mode "$tmp/supabase/config.toml")" != "400" \
        || "$(shasum -a 256 "$tmp/supabase/config.toml" | awk '{print $1}')" \
           != "48df42067b5307e8a968f0716ea7473ea045581a2df9c0109cdba9c68b12fede" \
        || "$(directory_hash "$tmp/supabase/.temp")" \
           != "$linked_metadata_snapshot_hash" \
        || "$(tr -d '[:space:]' <"$tmp/supabase/.temp/project-ref")" \
           != "$TARGET_REF" ]]; then
    echo "reviewed database candidate snapshot changed: $label" >&2
    return 1
  fi
  pragas_assert_owned_readonly_tree "$tmp/supabase/.temp" >/dev/null \
    || return 1
  pragas_assert_owned_readonly_tree "$tmp/supabase/migrations" >/dev/null \
    || return 1
  find "$tmp/supabase/migrations" -maxdepth 1 -type f -print \
    | sed 's#.*/##' | LC_ALL=C sort >"$actual_snapshot_migration_names"
  if ! cmp -s \
      "$expected_snapshot_migration_names" "$actual_snapshot_migration_names"; then
    echo "reviewed migration snapshot inventory changed: $label" >&2
    return 1
  fi
  for version in "${TARGET_VERSIONS[@]}"; do
    migration_name_value="$(migration_name "$version")"
    if [[ "$(shasum -a 256 \
        "$tmp/supabase/migrations/$migration_name_value" | awk '{print $1}')" \
          != "$(expected_hash "$version")" ]]; then
      echo "reviewed migration snapshot hash changed: $version ($label)" >&2
      return 1
    fi
  done
  while IFS= read -r version; do
    # Applied candidates are represented by their hash-pinned real file
    # (verified above), never by a placeholder.
    if [[ " ${TARGET_VERSIONS[*]} " == *" $version "* ]]; then
      continue
    fi
    if [[ ! -f "$tmp/supabase/migrations/${version}_remote_history.sql" \
          || -L "$tmp/supabase/migrations/${version}_remote_history.sql" \
          || -s "$tmp/supabase/migrations/${version}_remote_history.sql" ]]; then
      echo "remote migration-history placeholder changed: $version ($label)" >&2
      return 1
    fi
  done <"$remote_versions"
}

if ! assert_database_candidate_snapshot "before-dry-run"; then
  echo "isolated database candidate failed its final dry-run identity check" >&2
  exit 1
fi

dry_run_output="$(
  PGSSLMODE=verify-full PGSSLROOTCERT="$db_sslrootcert" \
    supabase db push --linked --dry-run --include-all --workdir "$tmp" --yes 2>&1
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
  echo "prod-compat DB + 13 Edge gate: DRY RUN PASS"
  echo "target=$TARGET_REF profiles=$profile_count generated_ids=$generated_profile_count"
  echo "allowlist=${TARGET_VERSIONS[*]}"
  echo "edge_new_absent=11 edge_restore_baseline=pragas-send-push@$EXISTING_EDGE_VERSION"
  echo "apply remains blocked until authenticated backups and restore tests succeed"
  exit 0
fi

if ! backup_root="$(pragas_validate_backup_root \
    "$repo_root" "$PRAGAS_PROD_COMPAT_BACKUP_DIR")"; then
  echo "backup preparation refused before creating any artifact" >&2
  exit 1
fi
if ! backup_root="$(pragas_assert_encrypted_backup_root "$backup_root")"; then
  echo "production backup root is not on verified encrypted storage" >&2
  echo "mount an encrypted APFS volume under /Volumes or enable FileVault" >&2
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
sensitive_work_dir="$(pragas_create_private_backup_leaf \
  "$backup_dir" "private-work")"

assert_backup_storage_still_valid() {
  local current_backup_root

  if ! current_backup_root="$(
      pragas_assert_encrypted_backup_root "$backup_root"
    )" \
      || [[ "$current_backup_root" != "$backup_root" ]] \
      || ! pragas_assert_private_backup_leaf \
        "$backup_root" "$backup_dir" >/dev/null; then
    echo "encrypted backup storage identity or privacy changed" >&2
    return 1
  fi
}

assert_sensitive_backup_workspace() {
  assert_backup_storage_still_valid \
    && pragas_assert_private_backup_leaf \
      "$backup_dir" "$sensitive_work_dir" >/dev/null
}

capture_physical_backup_inventory() {
  local destination="$1"
  local checkpoint_label="$2"
  local stderr_file="$sensitive_work_dir/physical-backups-$checkpoint_label.stderr"

  if [[ -e "$destination" || -L "$destination" \
        || -e "$stderr_file" || -L "$stderr_file" ]] \
      || ! assert_sensitive_backup_workspace; then
    return 1
  fi
  if ! supabase backups list --project-ref "$TARGET_REF" --output json \
      --workdir "$tmp" --agent=no >"$destination" 2>"$stderr_file"; then
    chmod 400 "$stderr_file" >/dev/null 2>&1 || true
    echo "physical-backup inventory failed; encrypted diagnostic: $stderr_file" >&2
    return 1
  fi
  rm -f "$stderr_file"
  chmod 400 "$destination"
  assert_sensitive_backup_workspace
}

physical_backups_before="$backup_dir/physical-backups-before.json"
if ! capture_physical_backup_inventory \
    "$physical_backups_before" "before"; then
  echo "recent physical-backup evidence is unavailable" >&2
  exit 1
fi
physical_backup_before="$(pragas_validate_physical_backup_inventory \
  "$physical_backups_before" "$(date +%s)" \
  "$PHYSICAL_BACKUP_MAX_AGE_SECONDS")" || {
    echo "no recent completed WAL-G physical backup is available" >&2
    exit 1
  }
IFS=$'\t' read -r physical_backup_id physical_backup_inserted_at \
  physical_backup_walg physical_backup_pitr <<<"$physical_backup_before"
printf '%s\n' \
  "target=$TARGET_REF" \
  "physical_backup_id=$physical_backup_id" \
  "inserted_at=$physical_backup_inserted_at" \
  "status=COMPLETED" \
  "is_physical_backup=true" \
  "walg_enabled=$physical_backup_walg" \
  "pitr_enabled=$physical_backup_pitr" \
  >"$backup_dir/physical-backup-evidence.txt"
chmod 400 "$backup_dir/physical-backup-evidence.txt"

data_scope_contract_sql="$(cat <<'SQL'
WITH RECURSIVE scoped_tables AS (
  SELECT relation.oid,
         namespace_row.nspname AS schema_name,
         relation.relname AS relation_name
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace_row
      ON namespace_row.oid = relation.relnamespace
   WHERE relation.relkind = 'r'
     AND (
       namespace_row.nspname IN ('auth', 'storage')
       OR (
         namespace_row.nspname = 'public'
         AND (
           relation.relname LIKE 'pragas\_%' ESCAPE '\'
           OR relation.relname IN (
             'subscriptions', 'chat_usage',
             'analytics_events', 'audit_log'
           )
         )
       )
     )
), partitioned_tables AS (
  SELECT namespace_row.nspname AS schema_name,
         relation.relname AS relation_name
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace_row
      ON namespace_row.oid = relation.relnamespace
   WHERE relation.relkind = 'p'
     AND (
       namespace_row.nspname IN ('auth', 'storage')
       OR (
         namespace_row.nspname = 'public'
         AND (
           relation.relname LIKE 'pragas\_%' ESCAPE '\'
           OR relation.relname IN (
             'subscriptions', 'chat_usage',
             'analytics_events', 'audit_log'
           )
         )
       )
     )
), scoped_sequences AS (
  SELECT namespace_row.nspname AS schema_name,
         relation.relname AS relation_name
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace_row
      ON namespace_row.oid = relation.relnamespace
   WHERE relation.relkind = 'S'
     AND (
       namespace_row.nspname IN ('auth', 'storage')
       OR (
         namespace_row.nspname = 'public'
         AND (
           relation.relname LIKE 'pragas\_%' ESCAPE '\'
           OR EXISTS (
             SELECT 1
               FROM pg_depend AS dependency
               JOIN scoped_tables AS scoped_table
                 ON scoped_table.oid = dependency.refobjid
              WHERE dependency.objid = relation.oid
                AND dependency.deptype IN ('a', 'i')
           )
         )
       )
     )
), parent_closure AS (
  SELECT scoped_table.oid, ARRAY[scoped_table.oid]::oid[] AS visited
    FROM scoped_tables AS scoped_table
  UNION ALL
  SELECT constraint_row.confrelid,
         parent_row.visited || constraint_row.confrelid
    FROM parent_closure AS parent_row
    JOIN pg_constraint AS constraint_row
      ON constraint_row.conrelid = parent_row.oid
     AND constraint_row.contype = 'f'
   WHERE NOT constraint_row.confrelid = ANY(parent_row.visited)
), external_parent_relations AS (
  SELECT DISTINCT namespace_row.nspname AS schema_name,
         relation.relname AS relation_name
    FROM parent_closure AS parent_row
    JOIN pg_class AS relation ON relation.oid = parent_row.oid
    JOIN pg_namespace AS namespace_row
      ON namespace_row.oid = relation.relnamespace
   WHERE NOT EXISTS (
     SELECT 1 FROM scoped_tables AS scoped_table
      WHERE scoped_table.oid = parent_row.oid
   )
)
SELECT jsonb_build_object(
  'scoped_tables', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'schema', scoped_table.schema_name,
      'table', scoped_table.relation_name
    ) ORDER BY scoped_table.schema_name, scoped_table.relation_name)
      FROM scoped_tables AS scoped_table
  ), '[]'::jsonb),
  'data_relations', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'schema', data_relation.schema_name,
      'relation', data_relation.relation_name,
      'kind', data_relation.relation_kind
    ) ORDER BY data_relation.schema_name, data_relation.relation_name)
      FROM (
        SELECT schema_name, relation_name, 'table'::text AS relation_kind
          FROM scoped_tables
        UNION ALL
        SELECT schema_name, relation_name, 'sequence'::text AS relation_kind
          FROM scoped_sequences
      ) AS data_relation
  ), '[]'::jsonb),
  'partitioned_tables', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'schema', partitioned_table.schema_name,
      'table', partitioned_table.relation_name
    ) ORDER BY partitioned_table.schema_name, partitioned_table.relation_name)
      FROM partitioned_tables AS partitioned_table
  ), '[]'::jsonb),
  'external_parent_relations', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'schema', external_parent.schema_name,
      'table', external_parent.relation_name
    ) ORDER BY external_parent.schema_name, external_parent.relation_name)
      FROM external_parent_relations AS external_parent
  ), '[]'::jsonb)
) AS data_scope_contract;
SQL
)"

capture_data_scope_contract() {
  local destination="$1"
  local checkpoint_label="$2"
  local stderr_file="$sensitive_work_dir/data-scope-$checkpoint_label.stderr"

  if [[ -e "$destination" || -L "$destination" \
        || -e "$stderr_file" || -L "$stderr_file" ]] \
      || ! assert_sensitive_backup_workspace; then
    return 1
  fi
  if ! supabase db query --linked --workdir "$tmp" --agent=no --output json \
      "$data_scope_contract_sql" >"$destination" 2>"$stderr_file"; then
    chmod 400 "$stderr_file" >/dev/null 2>&1 || true
    echo "logical data-scope inventory failed; encrypted diagnostic: $stderr_file" >&2
    return 1
  fi
  rm -f "$stderr_file"
  chmod 400 "$destination"
  assert_sensitive_backup_workspace
}

data_scope_contract_before="$backup_dir/data-scope-before.json"
data_scope_relations_manifest="$backup_dir/data-scope-relations.manifest"
data_scope_tables_manifest="$backup_dir/data-scope-tables.manifest"
if ! capture_data_scope_contract "$data_scope_contract_before" "before" \
    || ! pragas_validate_data_scope_contract \
      "$data_scope_contract_before" >"$data_scope_relations_manifest"; then
  echo "logical data-scope allowlist or recursive FK closure failed" >&2
  exit 1
fi
awk -F '\t' '$3 == "table" { print $1 "|" $2 }' \
  "$data_scope_relations_manifest" >"$data_scope_tables_manifest"
chmod 400 "$data_scope_relations_manifest" "$data_scope_tables_manifest"

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

edge_archive="$backup_dir/pragas-send-push-v${EXISTING_EDGE_VERSION}-restore.tgz"
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
backup_pgpass="$sensitive_work_dir/prod-backup.pgpass"
backup_db_username="$pooler_username"
backup_db_password="${SUPABASE_DB_PASSWORD:-}"
use_temp_login_role="false"
temp_login_roles_issued_count=0
if [[ -z "$backup_db_password" ]]; then
  use_temp_login_role="true"
else
  if ! pragas_write_private_pgpass \
      "$backup_pgpass" "$pooler_host" "$pooler_port" "$pooler_database" \
      "$backup_db_username" "$backup_db_password" >/dev/null 2>&1; then
    echo "private production backup credential preflight failed" >&2
    exit 1
  fi
  backup_db_password=""
fi

refresh_temp_login_role_credentials() {
  if ! assert_sensitive_backup_workspace; then
    echo "encrypted temporary-role workspace is unavailable" >&2
    return 1
  fi
  clear_temp_login_role_local
  if ! pragas_load_supabase_access_token temp_login_access_token; then
    echo "temporary Supabase login-role authentication is unavailable" >&2
    return 1
  fi
  temp_login_cleanup_required="true"
  temp_login_response="$sensitive_work_dir/temp-login-role-response.json"
  if ! pragas_call_supabase_cli_login_role_api \
      POST "$TARGET_REF" "$temp_login_access_token" \
      "$temp_login_response" "$REVIEWED_SYSTEM_CURL"; then
    echo "temporary Supabase login-role acquisition failed" >&2
    return 1
  fi
  temp_login_role_issued="true"
  if ! pragas_parse_supabase_temp_login_role \
      "$temp_login_response" \
      "$TEMP_LOGIN_ROLE_MIN_TTL_SECONDS" \
      "$TEMP_LOGIN_ROLE_MAX_TTL_SECONDS" \
      temp_login_role temp_login_password temp_login_ttl; then
    echo "temporary Supabase login-role validation failed" >&2
    return 1
  fi
  rm -f "$temp_login_response"
  temp_login_response=""
  if ! backup_db_username="$(pragas_build_temp_pooler_username \
      "$temp_login_role" "$TARGET_REF")"; then
    echo "temporary Supabase pooler identity validation failed" >&2
    return 1
  fi
  temp_login_expires_at="$(($(date +%s) + temp_login_ttl))"
  backup_db_password="$temp_login_password"
  temp_login_access_token=""
  if ! pragas_write_private_pgpass \
      "$backup_pgpass" "$pooler_host" "$pooler_port" "$pooler_database" \
      "$backup_db_username" "$backup_db_password" >/dev/null 2>&1; then
    backup_db_password=""
    temp_login_password=""
    echo "private temporary-role pgpass creation failed" >&2
    return 1
  fi
  backup_db_password=""
  temp_login_password=""
  temp_login_roles_issued_count=$((temp_login_roles_issued_count + 1))
  assert_sensitive_backup_workspace
}

backup_raw_dir="$(pragas_create_private_backup_leaf \
  "$sensitive_work_dir" "verified-backup-raw")"
backup_failure_evidence=""

capture_verified_backup_raw() {
  local tool="$1"
  local raw_output="$2"
  local raw_error="${raw_output}.stderr"
  local encrypted_error
  shift 2

  if [[ "$(dirname "$raw_output")" != "$backup_raw_dir" \
        || -e "$raw_output" || -L "$raw_output" \
        || -e "$raw_error" || -L "$raw_error" ]]; then
    return 1
  fi
  # Re-read both the mounted encrypted-volume identity and the private leaf
  # immediately before every authenticated dump. This closes the long-running
  # preflight window if a sparse bundle is detached or replaced mid-gate.
  if ! assert_backup_storage_still_valid; then
    return 1
  fi
  # Supabase may issue the minimum five-minute TTL while a full schema dump can
  # take more than a minute. Bind one fresh credential to exactly one dump so
  # no later dump can inherit a role close to expiry.
  if [[ "$use_temp_login_role" == "true" ]] \
      && ! refresh_temp_login_role_credentials; then
    return 1
  fi
  if [[ "$use_temp_login_role" == "true" ]] \
      && ! pragas_assert_temp_login_role_fresh \
        "$temp_login_expires_at" \
        "$TEMP_LOGIN_ROLE_MIN_REMAINING_SECONDS"; then
    clear_temp_login_role_local
    return 1
  fi
  if ! pragas_run_pinned_pg_backup \
      "$REVIEWED_PG_BACKUP_IMAGE" "$REVIEWED_PG_BACKUP_DIGEST" \
      "$tool" "$db_sslrootcert" "$backup_pgpass" \
      "$pooler_host" "$pooler_port" "$backup_db_username" \
      "$pooler_database" bridge "$@" >"$raw_output" 2>"$raw_error"; then
    if assert_sensitive_backup_workspace && [[ -s "$raw_error" ]]; then
      encrypted_error="$backup_dir/$(basename "$raw_error")"
      if [[ ! -e "$encrypted_error" && ! -L "$encrypted_error" ]] \
          && mv "$raw_error" "$encrypted_error" \
          && chmod 400 "$encrypted_error"; then
        backup_failure_evidence="$encrypted_error"
      fi
    fi
    if [[ "$use_temp_login_role" == "true" ]]; then
      clear_temp_login_role_local
    fi
    rm -f -- "$raw_output" "$raw_error"
    return 1
  fi
  if ! assert_sensitive_backup_workspace; then
    if [[ "$use_temp_login_role" == "true" ]]; then
      clear_temp_login_role_local
    fi
    return 1
  fi
  rm -f -- "$raw_error"
  if [[ "$use_temp_login_role" == "true" ]]; then
    clear_temp_login_role_local
  fi
  chmod 400 "$raw_output"
  [[ -s "$raw_output" ]] && assert_sensitive_backup_workspace
}

report_backup_failure_evidence() {
  if [[ -n "$backup_failure_evidence" ]]; then
    echo "encrypted diagnostic retained at $backup_failure_evidence" >&2
  fi
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
  local -a relation_args=("$@")

  if (( ${#relation_args[@]} == 0 )); then
    return 1
  fi

  capture_verified_backup_raw pg_dump "$raw_output" \
    --data-only --quote-all-identifiers --role postgres \
    "${relation_args[@]}" || return 1
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
  report_backup_failure_evidence
  exit 1
fi
if ! write_verified_schema_backup extensions \
    "$extensions_schema_backup" 2>/dev/null; then
  echo "authenticated extensions-schema backup failed; no migration was applied" >&2
  report_backup_failure_evidence
  exit 1
fi
if ! write_verified_schema_backup vault "$vault_schema_backup" \
    2>/dev/null; then
  echo "authenticated vault-schema backup failed; no migration was applied" >&2
  report_backup_failure_evidence
  exit 1
fi
if ! write_verified_schema_backup auth "$auth_schema_backup" \
    2>/dev/null; then
  echo "authenticated auth-schema backup failed; no migration was applied" >&2
  report_backup_failure_evidence
  exit 1
fi
if ! write_verified_schema_backup storage "$storage_schema_backup" \
    2>/dev/null; then
  echo "authenticated storage-schema backup failed; no migration was applied" >&2
  report_backup_failure_evidence
  exit 1
fi
if ! write_verified_schema_backup public "$schema_backup" \
    2>/dev/null; then
  echo "authenticated schema backup failed; no migration was applied" >&2
  report_backup_failure_evidence
  exit 1
fi
# One pg_dump invocation provides one MVCC snapshot for all identity, storage
# and allowlisted Rumo Pragas rows. Unrelated shared-portfolio tables are
# intentionally excluded after the recursive FK parent closure proves that the
# reviewed scope is self-contained.
data_dump_relation_args=()
while IFS=$'\t' read -r schema_name relation_name _; do
  data_dump_relation_args+=("--table=$schema_name.$relation_name")
done <"$data_scope_relations_manifest"
if ! write_verified_data_backup "${data_dump_relation_args[@]}" \
    2>/dev/null; then
  echo "authenticated multi-schema data backup failed; no migration was applied" >&2
  report_backup_failure_evidence
  exit 1
fi
data_scope_contract_after="$backup_dir/data-scope-after.json"
data_scope_relations_after="$sensitive_work_dir/data-scope-relations-after.manifest"
if ! capture_data_scope_contract "$data_scope_contract_after" "after" \
    || ! pragas_validate_data_scope_contract \
      "$data_scope_contract_after" >"$data_scope_relations_after" \
    || ! cmp -s \
      "$data_scope_relations_manifest" "$data_scope_relations_after"; then
  echo "logical data scope or recursive FK closure changed during backup" >&2
  exit 1
fi
rm -f "$data_scope_relations_after"
rm -f "$backup_pgpass"
if [[ "$use_temp_login_role" == "true" ]]; then
  echo "temporary-role credentials cleared after $temp_login_roles_issued_count isolated dumps; server roles are bounded by their validated TTL"
  clear_temp_login_role_local
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
dump_scope_tables_manifest="$sensitive_work_dir/dump-scope-tables.manifest"
awk -F '|' '{ print $1 "|" $2 }' "$data_row_manifest" \
  | LC_ALL=C sort >"$dump_scope_tables_manifest"
if ! cmp -s "$data_scope_tables_manifest" "$dump_scope_tables_manifest"; then
  echo "logical dump table inventory differs from the reviewed scope" >&2
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
  "$edge_archive" "$physical_backups_before" \
  "$backup_dir/physical-backup-evidence.txt" \
  "$data_scope_contract_before" "$data_scope_contract_after" \
  "$data_scope_relations_manifest" "$data_scope_tables_manifest"
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
  "$edge_archive" "$physical_backups_before" \
  "$backup_dir/physical-backup-evidence.txt" \
  "$data_scope_contract_before" "$data_scope_contract_after" \
  "$data_scope_relations_manifest" "$data_scope_tables_manifest"
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
if ! assert_backup_storage_still_valid; then
  echo "backup encryption or leaf privacy changed; no migration was applied" >&2
  exit 1
fi

# Restore every backup into a disposable PostgreSQL 17/Supabase image. A
# successful parse is insufficient: roles, managed schemas/data and public
# schemas/data must all load, and the two identity invariants must match.
restore_container="pragas-prod-restore-${RANDOM}"
restore_password="pragas-restore-only"
restore_pgdata="$(pragas_create_private_backup_leaf \
  "$sensitive_work_dir" "restore-pgdata")"
if ! assert_sensitive_backup_workspace \
    || ! pragas_assert_private_backup_leaf \
      "$sensitive_work_dir" "$restore_pgdata" >/dev/null; then
  echo "encrypted restore workspace is unavailable; no migration was applied" >&2
  exit 1
fi
docker run -d --name "$restore_container" \
  -e POSTGRES_PASSWORD="$restore_password" \
  --mount "type=bind,source=$restore_pgdata,target=/var/lib/postgresql/data" \
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
chmod 700 "$restore_pgdata"
if ! assert_sensitive_backup_workspace \
    || ! pragas_assert_private_backup_leaf \
      "$sensitive_work_dir" "$restore_pgdata" >/dev/null; then
  echo "encrypted restore workspace changed during startup" >&2
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
CREATE EXTENSION plpgsql_check WITH SCHEMA public VERSION '2.7';
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
auth_schema_base="$sensitive_work_dir/auth-schema-base.sql"
auth_public_triggers="$sensitive_work_dir/auth-public-triggers.sql"
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

storage_schema_base="$sensitive_work_dir/storage-schema-base.sql"
storage_policies="$sensitive_work_dir/storage-policies.sql"
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

restored_data_scope_contract="$sensitive_work_dir/restored-data-scope-contract.json"
restored_data_scope_relations="$sensitive_work_dir/restored-data-scope-relations.manifest"
if ! assert_sensitive_backup_workspace \
    || ! docker exec -e PGPASSWORD="$restore_password" "$restore_container" \
      psql -qAt -X -v ON_ERROR_STOP=1 -h 127.0.0.1 \
        -U supabase_admin -d postgres -c "$data_scope_contract_sql" \
        >"$restored_data_scope_contract" \
    || ! pragas_validate_data_scope_contract \
      "$restored_data_scope_contract" >"$restored_data_scope_relations" \
    || ! cmp -s \
      "$data_scope_relations_manifest" "$restored_data_scope_relations" \
    || ! assert_sensitive_backup_workspace; then
  echo "restored logical data scope or recursive FK closure differs from production" >&2
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
restored_row_manifest_unsorted="$sensitive_work_dir/restored-data-row-counts.unsorted"
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
if ! assert_database_candidate_snapshot "before-clone"; then
  echo "reviewed database candidate changed before clone rehearsal" >&2
  exit 1
fi
if ! run_shared_bootstrap_on_clone; then
  echo "shared relation bootstrap failed on the production clone; no production mutation occurred" >&2
  exit 1
fi
# PRAGAS_CLONE_POST_BOOTSTRAP_SOURCE_RECHECK_BEGIN
if ! assert_database_candidate_snapshot "before-clone-migration-loop"; then
  echo "reviewed database candidate changed after clone bootstrap" >&2
  exit 1
fi
# PRAGAS_CLONE_POST_BOOTSTRAP_SOURCE_RECHECK_END
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
     AND to_regclass('public.agrorumo_account_deletion_requests') IS NOT NULL
     AND to_regclass('public.agrorumo_account_deletion_apple_revocations') IS NOT NULL
     AND to_regclass('public.agrorumo_account_deletion_events') IS NOT NULL
     AND to_regprocedure('vault.create_secret(text,text,text,uuid)') IS NOT NULL
     AND position('pragas_link_account_global_deletion_precedence_v1' IN
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
chmod 700 "$restore_pgdata"
if ! assert_sensitive_backup_workspace \
    || ! pragas_assert_private_backup_leaf \
      "$sensitive_work_dir" "$restore_pgdata" >/dev/null; then
  echo "encrypted restore workspace changed during rehearsal" >&2
  exit 1
fi
docker rm -f "$restore_container" >/dev/null
restore_container=""
chmod -R u+w "$restore_pgdata"
rm -rf -- "$restore_pgdata"
restore_pgdata=""

printf '%s\n' \
  "target=$TARGET_REF" \
  "backup_stamp=$backup_stamp" \
  "profiles=$profile_count" \
  "generated_profile_ids=$generated_profile_count" \
  "auth_users=$auth_user_count" \
  "storage_objects=$storage_object_count" \
  "dump_tables=$dump_table_count" \
  "logical_data_scope_relations=${#data_dump_relation_args[@]}" \
  "recursive_fk_parent_closure=closed" \
  "physical_backup_id=$physical_backup_id" \
  "physical_backup_status=COMPLETED" \
  "physical_backup_walg=$physical_backup_walg" \
  "physical_backup_pitr=$physical_backup_pitr" \
  "sensitive_workspace=encrypted-private-leaf" \
  "restored_manifest_sha256=$restored_manifest_hash" \
  "extensions=11" \
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
if ! assert_sensitive_backup_workspace \
   || ! (cd "$backup_dir" && shasum -a 256 -c SHA256SUMS >/dev/null); then
  echo "backup evidence encryption, privacy or checksums changed; no migration was applied" >&2
  exit 1
fi

if [[ "$mode" == "--prepare" ]]; then
  echo "prod-compat authenticated backup + restore preparation: PASS"
  echo "no production mutation was performed"
  echo "backup_and_restore_evidence=$backup_dir"
  exit 0
fi

physical_backups_before_mutation="$backup_dir/physical-backups-before-mutation.json"
if ! capture_physical_backup_inventory \
    "$physical_backups_before_mutation" "before-mutation"; then
  echo "physical-backup evidence changed before production mutation" >&2
  exit 1
fi
physical_backup_before_mutation="$(pragas_validate_physical_backup_inventory \
  "$physical_backups_before_mutation" "$(date +%s)" \
  "$PHYSICAL_BACKUP_MAX_AGE_SECONDS")" || {
    echo "recent completed WAL-G physical backup disappeared before mutation" >&2
    exit 1
  }
IFS=$'\t' read -r physical_backup_mutation_id _ _ _ \
  <<<"$physical_backup_before_mutation"
if (( physical_backup_mutation_id < physical_backup_id )); then
  echo "physical-backup inventory regressed before production mutation" >&2
  exit 1
fi
physical_mutation_hash="$(shasum -a 256 \
  "$physical_backups_before_mutation" | awk '{print $1}')"
printf '%s  %s\n' "$physical_mutation_hash" \
  "$(basename "$physical_backups_before_mutation")" >>"$checksum_manifest"
if ! assert_sensitive_backup_workspace \
    || ! (cd "$backup_dir" && shasum -a 256 -c SHA256SUMS >/dev/null); then
  echo "physical-backup evidence failed its mutation-boundary checksum" >&2
  exit 1
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
if ! assert_sensitive_backup_workspace; then
  echo "backup storage changed before the first production mutation" >&2
  exit 1
fi
data_scope_contract_before_mutation="$backup_dir/data-scope-before-mutation.json"
data_scope_relations_before_mutation="$sensitive_work_dir/data-scope-before-mutation.manifest"
if ! capture_data_scope_contract \
    "$data_scope_contract_before_mutation" "before-mutation" \
    || ! pragas_validate_data_scope_contract \
      "$data_scope_contract_before_mutation" \
      >"$data_scope_relations_before_mutation" \
    || ! cmp -s "$data_scope_relations_manifest" \
      "$data_scope_relations_before_mutation"; then
  echo "logical data scope or recursive FK closure changed before mutation" >&2
  exit 1
fi
data_scope_mutation_hash="$(shasum -a 256 \
  "$data_scope_contract_before_mutation" | awk '{print $1}')"
printf '%s  %s\n' "$data_scope_mutation_hash" \
  "$(basename "$data_scope_contract_before_mutation")" \
  >>"$checksum_manifest"
if ! (cd "$backup_dir" && shasum -a 256 -c SHA256SUMS >/dev/null); then
  echo "logical data-scope mutation evidence checksum failed" >&2
  exit 1
fi
if ! refresh_required_edge_secret_metadata \
    "$tmp/remote-edge-secrets-before-production-mutation.json" \
    "before-production-mutation"; then
  echo "required Edge secret metadata changed before the first production mutation" >&2
  exit 1
fi
if ! assert_database_candidate_snapshot "before-shared-bootstrap"; then
  echo "reviewed database candidate changed before the first mutation" >&2
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

if ! assert_database_candidate_snapshot "before-db-push"; then
  echo "reviewed database candidate changed before db push" >&2
  exit 1
fi

if ! db_push_output="$(
  PGSSLMODE=verify-full PGSSLROOTCERT="$db_sslrootcert" \
    supabase db push --linked --include-all --workdir "$tmp" --yes 2>&1
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
  AND to_regclass('public.agrorumo_account_deletion_requests') IS NOT NULL
  AND to_regclass('public.agrorumo_account_deletion_apple_revocations') IS NOT NULL
  AND to_regclass('public.agrorumo_account_deletion_events') IS NOT NULL
  AND to_regprocedure('vault.create_secret(text,text,text,uuid)') IS NOT NULL
  AND to_regprocedure('public.pragas_link_account()') IS NOT NULL
  AND position(
    'pragas_link_account_global_deletion_precedence_v1' IN
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
    'authenticated', 'public.agrorumo_account_deletion_requests', 'SELECT'
  )
  AND NOT has_table_privilege(
    'service_role', 'public.agrorumo_account_deletion_apple_revocations', 'UPDATE'
  )
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
        ('agrorumo_deletion_session_ref(uuid)', 'service_role'),
        ('agrorumo_deletion_subject_ref(uuid)', 'service_role'),
        ('begin_agrorumo_account_deletion_challenge(uuid,uuid,uuid,text,text)', 'service_role'),
        ('begin_agrorumo_apple_revocation_attempt(uuid,uuid,text)', 'service_role'),
        ('claim_agrorumo_apple_revocation_token(uuid,uuid,uuid)', 'service_role'),
        ('claim_pragas_deletion_job(uuid)', 'service_role'),
        ('claim_pragas_deletion_jobs(integer)', 'service_role'),
        ('claim_pragas_push_notification(uuid,text,text)', 'service_role'),
        ('cleanup_pragas_user_rows(uuid)', 'service_role'),
        ('complete_pragas_ai_idempotency(uuid,text,uuid,text,uuid,integer,jsonb,integer)', 'service_role'),
        ('complete_pragas_deletion_job(uuid,uuid)', 'service_role'),
        ('complete_pragas_push_notification(uuid,text,uuid,text,integer,integer,integer)', 'service_role'),
        ('consume_pragas_api_rate_limit(uuid,text,integer,integer,uuid,text)', 'service_role'),
        ('consume_pragas_mcp_rate_limit(uuid,text)', 'authenticated'),
        ('consume_agrorumo_deletion_status_rate_limit(text,integer,integer)', 'service_role'),
        ('export_pragas_notification_queue_snapshot(uuid,timestamp with time zone,integer)', 'service_role'),
        ('grant_pragas_ai_consent(text,text)', 'authenticated'),
        ('get_agrorumo_account_deletion_app_gate(uuid)', 'service_role'),
        ('get_agrorumo_account_deletion_replay(uuid,uuid)', 'service_role'),
        ('get_agrorumo_account_deletion_status(uuid)', 'service_role'),
        ('list_agrorumo_account_deletion_queue(text,integer)', 'service_role'),
        ('mark_pragas_ai_provider_started(uuid,text,uuid,text,uuid)', 'service_role'),
        ('mark_pragas_ai_unknown_outcome(uuid,text,uuid,text,uuid)', 'service_role'),
        ('mark_pragas_push_provider_started(uuid,text,uuid)', 'service_role'),
        ('mark_pragas_push_unknown_outcome(uuid,text,uuid,integer,integer,integer)', 'service_role'),
        ('pragas_link_account()', 'authenticated'),
        ('pragas_current_link_allows_access()', 'authenticated'),
        ('purge_agrorumo_account_deletion_ephemera(integer)', 'service_role'),
        ('reactivate_pragas_account(uuid,uuid,uuid)', 'service_role'),
        ('record_pragas_ai_consent(uuid,text,text)', 'service_role'),
        ('record_pragas_analytics_events(uuid,jsonb)', 'service_role'),
        ('record_agrorumo_apple_revocation_result(uuid,uuid,uuid,text,text)', 'service_role'),
        ('release_pragas_ai_idempotency(uuid,text,uuid,text,uuid)', 'service_role'),
        ('release_pragas_push_notification(uuid,text,uuid)', 'service_role'),
        ('request_pragas_account_deletion(uuid)', 'service_role'),
        ('reserve_agrorumo_account_deletion_request(uuid,uuid,timestamp with time zone,timestamp with time zone,uuid,text,text,text,boolean,text,uuid,uuid)', 'service_role'),
        ('reserve_pragas_ai_idempotency(uuid,text,uuid,text)', 'service_role'),
        ('retry_pragas_deletion_job(uuid,uuid,text,timestamp with time zone)', 'service_role'),
        ('resolve_agrorumo_account_deletion_subject(uuid)', 'service_role'),
        ('revoke_pragas_ai_consent(text)', 'authenticated'),
        ('scrub_expired_pragas_ai_idempotency(integer)', 'service_role'),
        ('set_pragas_location_consent(uuid,boolean,text,timestamp with time zone,bigint)', 'authenticated'),
        ('touch_pragas_push_token(text,text,boolean)', 'authenticated'),
        ('transition_agrorumo_account_deletion_request(uuid,text,text,text,uuid,text,text,text)', 'service_role'),
        ('store_agrorumo_apple_revocation_token(uuid,uuid,uuid,text,text)', 'service_role'),
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
  deploy_debug_log="$sensitive_work_dir/$attempt_label-local-bundle-debug.log"
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

  if ! refresh_required_edge_secret_metadata \
      "$tmp/remote-edge-secrets-before-edge-rollout.json" \
      "before-edge-rollout"; then
    write_edge_stop_report \
      "edge_secret_metadata_changed_before_rollout" "$slug" true \
      "$predeploy_raw"
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
  if ! assert_sensitive_backup_workspace; then
    write_edge_stop_report \
      "encrypted_debug_workspace_unavailable" "$slug" true \
      "$predeploy_raw"
    exit 1
  fi
  : >"$deploy_debug_log"
  chmod 600 "$deploy_debug_log"
  # PRAGAS_EDGE_FINAL_SOURCE_RECHECK_BEGIN
  if ! assert_edge_candidate_snapshot "$slug"; then
    write_edge_stop_report \
      "edge_candidate_snapshot_changed_after_secret_refresh" "$slug" true \
      "$predeploy_raw"
    exit 1
  fi
  # PRAGAS_EDGE_FINAL_SOURCE_RECHECK_END
  if ! supabase "${deploy_args[@]}" 2>"$deploy_debug_log"; then
    chmod 400 "$deploy_debug_log" >/dev/null 2>&1 || true
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
    chmod 400 "$deploy_debug_log" >/dev/null 2>&1 || true
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
  rm -f -- "$deploy_debug_log"

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
# thirteenth transition. Any later concurrent mutation stops without rollback.
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

echo "prod-compat DB + 13 Edge gate: APPLY PASS"
echo "backup_and_restore_evidence=$backup_dir"
echo "Edge recovery: automatic rollback disabled; use recorded state and manual guidance"
echo "database recovery: down scripts remain separate and manual"
