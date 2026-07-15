#!/usr/bin/env bash
set -euo pipefail

readonly TARGET_REF="jxcnfyeemdltdfqtgbcl"
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
# shellcheck disable=SC1091 -- path is anchored to the resolved repository.
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
    20260715171000) echo "e21a27f83c03723c6d6ebf38ebd5ee250459df25d778e5ab3f470ee3e12b8e2a" ;;
    20260715172000) echo "b918ef708c50fd528c7af62de0d2a5ce2764940d135a6eb1b76f5e2839e078cd" ;;
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
    report-diagnosis-feedback) echo "3103fa2c3f3f570f9cef3fbe00f59afa3b094ba6b67c88578d8fcff6deb0688b" ;;
    admin-ai-content-reports) echo "d9ecd60ed0e6d31748263e3762fe33afa7b33e93fb724f278a0fa4868f77ccb9" ;;
    pragas-process-deletions) echo "9dcfd5b9cb2e14bc4a075c71acd9315d17bf3fa6254f8f24166d29a3e1b66a38" ;;
    pragas-process-ai-idempotency) echo "fc896e878917c441c3f622c5b568599cf0ceaab84aaed246185417db2654c185" ;;
    pragas-send-push) echo "9d339b455610e5077d14a30610fee16830cb137696d736be873e6139aa09b08b" ;;
    *) return 1 ;;
  esac
}

directory_hash() {
  local directory="$1"
  find "$directory" -type f -print0 \
    | LC_ALL=C sort -z \
    | while IFS= read -r -d '' file; do
        printf '%s\0' "${file#"$directory/"}"
        shasum -a 256 "$file" | awk '{print $1}'
      done \
    | shasum -a 256 \
    | awk '{print $1}'
}

if [[ "$mode" != "--dry-run" && "$mode" != "--prepare" \
      && "$mode" != "--apply" ]]; then
  usage
  exit 2
fi
for dependency in supabase jq deno docker shasum rg perl tar; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    echo "$dependency is required" >&2
    exit 1
  fi
done
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
      != "943e63bdbd88b38e61b42b3052a46fb0ca45cc7bd1d876a0b66600095c24f594" ]]; then
  echo "Edge Deno configuration hash mismatch" >&2
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
  rm -rf "$tmp"
}
trap cleanup EXIT
mkdir -p "$tmp/supabase/.temp" "$tmp/supabase/migrations"
cp "$repo_root/supabase/config.toml" "$tmp/supabase/config.toml"

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
if [[ "$pooler_url" != postgresql://*@* ]]; then
  echo "Supabase pooler URL is malformed" >&2
  exit 1
fi
pooler_userinfo="${pooler_url#postgresql://}"
pooler_userinfo="${pooler_userinfo%%@*}"
pooler_username="${pooler_userinfo%%:*}"
if [[ "$pooler_username" != "postgres.$TARGET_REF" ]]; then
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

candidate_file_count="$(find "$tmp/supabase/migrations" -type f \
  ! -name '*_remote_history.sql' | wc -l | tr -d '[:space:]')"
if [[ "$candidate_file_count" != "3" ]]; then
  echo "isolated bundle contains a non-allowlisted candidate" >&2
  exit 1
fi

dry_run_output="$(
  supabase db push --linked --dry-run --workdir "$tmp" --yes 2>&1
)" || {
  echo "$dry_run_output" >&2
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

roles_backup="$backup_dir/roles.sql"
extensions_schema_backup="$backup_dir/extensions-schema.sql"
vault_schema_backup="$backup_dir/vault-schema.sql"
auth_schema_backup="$backup_dir/auth-schema.sql"
storage_schema_backup="$backup_dir/storage-schema.sql"
auth_data_backup="$backup_dir/auth-data.sql"
storage_data_backup="$backup_dir/storage-data.sql"
schema_backup="$backup_dir/public-schema.sql"
data_backup="$backup_dir/public-data.sql"
if ! supabase db dump --linked --workdir "$tmp" --role-only \
    --file "$roles_backup"; then
  echo "authenticated role backup failed; no migration was applied" >&2
  exit 1
fi
if ! supabase db dump --linked --workdir "$tmp" --schema extensions \
    --file "$extensions_schema_backup"; then
  echo "authenticated extensions-schema backup failed; no migration was applied" >&2
  exit 1
fi
if ! supabase db dump --linked --workdir "$tmp" --schema vault \
    --file "$vault_schema_backup"; then
  echo "authenticated vault-schema backup failed; no migration was applied" >&2
  exit 1
fi
if ! supabase db dump --linked --workdir "$tmp" --schema auth \
    --file "$auth_schema_backup"; then
  echo "authenticated auth-schema backup failed; no migration was applied" >&2
  exit 1
fi
if ! supabase db dump --linked --workdir "$tmp" --schema storage \
    --file "$storage_schema_backup"; then
  echo "authenticated storage-schema backup failed; no migration was applied" >&2
  exit 1
fi
if ! supabase db dump --linked --workdir "$tmp" --schema auth \
    --data-only --use-copy --file "$auth_data_backup"; then
  echo "authenticated auth-data backup failed; no migration was applied" >&2
  exit 1
fi
if ! supabase db dump --linked --workdir "$tmp" --schema storage \
    --data-only --use-copy --file "$storage_data_backup"; then
  echo "authenticated storage-data backup failed; no migration was applied" >&2
  exit 1
fi
if ! supabase db dump --linked --workdir "$tmp" --schema public \
    --file "$schema_backup"; then
  echo "authenticated schema backup failed; no migration was applied" >&2
  exit 1
fi
if ! supabase db dump --linked --workdir "$tmp" --schema public \
    --data-only --use-copy --file "$data_backup"; then
  echo "authenticated data backup failed; no migration was applied" >&2
  exit 1
fi

# Derive complete table row-count evidence from the dump artifacts themselves.
# This avoids expensive production-wide COUNT queries and proves every COPY
# payload, including empty tables, after the disposable restore.
auth_row_manifest="$backup_dir/auth-data-row-counts.manifest"
storage_row_manifest="$backup_dir/storage-data-row-counts.manifest"
public_row_manifest="$backup_dir/public-data-row-counts.manifest"
data_row_manifest="$backup_dir/all-data-row-counts.manifest"
if ! awk -v expected_schema=auth \
      -f "$repo_root/supabase/scripts/pragas-copy-row-manifest.awk" \
      "$auth_data_backup" | LC_ALL=C sort >"$auth_row_manifest"; then
  echo "auth COPY manifest generation failed; no migration was applied" >&2
  exit 1
fi
if ! awk -v expected_schema=storage \
      -f "$repo_root/supabase/scripts/pragas-copy-row-manifest.awk" \
      "$storage_data_backup" | LC_ALL=C sort >"$storage_row_manifest"; then
  echo "storage COPY manifest generation failed; no migration was applied" >&2
  exit 1
fi
if ! awk -v expected_schema=public \
      -f "$repo_root/supabase/scripts/pragas-copy-row-manifest.awk" \
      "$data_backup" | LC_ALL=C sort >"$public_row_manifest"; then
  echo "public COPY manifest generation failed; no migration was applied" >&2
  exit 1
fi
LC_ALL=C sort "$auth_row_manifest" "$storage_row_manifest" \
  "$public_row_manifest" >"$data_row_manifest"
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
  "$storage_schema_backup" "$auth_data_backup" "$storage_data_backup" \
  "$schema_backup" "$data_backup" "$auth_row_manifest" \
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
  "$storage_schema_backup" "$auth_data_backup" "$storage_data_backup" \
  "$schema_backup" "$data_backup" "$auth_row_manifest" \
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
  public.ecr.aws/supabase/postgres:17.6.1.063 >/dev/null
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

for restore_artifact in "$auth_data_backup" "$storage_data_backup" "$data_backup"
do
  if ! {
    printf '%s\n' 'SET session_replication_role = replica;'
    sed '/^\\restrict /d; /^\\unrestrict /d' "$restore_artifact"
    printf '%s\n' 'SET session_replication_role = origin;'
  } | docker exec -e PGPASSWORD="$restore_password" -i \
      "$restore_container" psql -q -X -v ON_ERROR_STOP=1 \
      --single-transaction -h 127.0.0.1 \
      -U supabase_admin -d postgres; then
    echo "backup restore failed at $(basename "$restore_artifact"); no migration was applied" >&2
    exit 1
  fi
done

# Count every table represented by the three COPY dumps inside the restored
# database. Missing relations and any nonempty restored table absent from the
# dumps are hard failures; the sorted actual manifest must then match exactly.
restored_row_manifest="$backup_dir/restored-data-row-counts.manifest"
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
      >"$restored_row_manifest"; then
  echo "restored COPY manifest verification failed; no migration was applied" >&2
  exit 1
fi
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
  "all_dumped_table_row_counts=pass" \
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
    --workdir "$repo_root" --agent=no >"$remote_functions_recheck"; then
  echo "immediate Edge baseline recheck failed; no migration was applied" >&2
  exit 1
fi
target_slug_json="$(printf '%s\n' "${EDGE_SLUGS[@]}" | jq -Rsc 'split("\n")[:-1]')"
jq --argjson slugs "$target_slug_json" \
  '[.[] | select(.slug as $slug | $slugs | index($slug))
    | {slug,status,version,verify_jwt,ezbr_sha256}] | sort_by(.slug)' \
  "$remote_functions" >"$tmp/target-edge-before.json"
jq --argjson slugs "$target_slug_json" \
  '[.[] | select(.slug as $slug | $slugs | index($slug))
    | {slug,status,version,verify_jwt,ezbr_sha256}] | sort_by(.slug)' \
  "$remote_functions_recheck" >"$tmp/target-edge-recheck.json"
if ! cmp -s "$tmp/target-edge-before.json" "$tmp/target-edge-recheck.json"; then
  echo "targeted Edge baseline changed during backup; no migration was applied" >&2
  exit 1
fi

supabase db push --linked --workdir "$tmp" --yes

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
  echo "rollback order: Edge candidates, 172000, then 171000" >&2
  exit 1
fi

if ! supabase db query --linked --workdir "$tmp" --agent=no --output json \
    "SELECT tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('pragas_profiles','pragas_diagnoses','pragas_diagnosis_feedback','pragas_push_tokens','pragas_user_preferences') ORDER BY tablename, policyname" \
    >"$backup_dir/policies-after.json"; then
  echo "failed to record postflight RLS inventory" >&2
  exit 1
fi

is_new_edge_slug() {
  local candidate="$1"
  local new_slug
  for new_slug in "${NEW_EDGE_SLUGS[@]}"; do
    [[ "$candidate" == "$new_slug" ]] && return 0
  done
  return 1
}

restore_existing_edge() {
  echo "restoring archived $EXISTING_EDGE_SLUG source and gateway setting" >&2
  supabase functions deploy "$EXISTING_EDGE_SLUG" \
    --project-ref "$TARGET_REF" --workdir "$edge_snapshot_work" \
    --use-api --agent=no
}

rollback_edges() {
  local rollback_failed="false"
  local rollback_inventory="$tmp/edge-rollback-inventory.json"
  local inventory_available="false"
  local index
  if supabase functions list --project-ref "$TARGET_REF" --output json \
      --workdir "$repo_root" --agent=no >"$rollback_inventory"; then
    inventory_available="true"
  fi
  for ((index=${#deployed_new_edges[@]} - 1; index >= 0; index--)); do
    if [[ "$inventory_available" == "true" \
          && "$(jq --arg slug "${deployed_new_edges[$index]}" \
            '[.[] | select(.slug == $slug)] | length' \
            "$rollback_inventory")" == "0" ]]; then
      continue
    fi
    if ! supabase functions delete "${deployed_new_edges[$index]}" \
        --project-ref "$TARGET_REF" --workdir "$repo_root" \
        --yes --agent=no; then
      rollback_failed="true"
    fi
  done
  if [[ "$existing_edge_attempted" == "true" ]]; then
    if ! restore_existing_edge; then
      rollback_failed="true"
    fi
  fi
  if [[ "$rollback_failed" == "true" ]]; then
    echo "EDGE ROLLBACK INCOMPLETE: use $backup_dir/manual-edge-rollback.sh" >&2
    return 1
  fi
  echo "Edge rollback completed; database down scripts remain manual" >&2
}

manual_rollback="$backup_dir/manual-edge-rollback.sh"
{
  printf '%s\n' '#!/usr/bin/env bash' 'set -euo pipefail'
  printf 'readonly TARGET_REF=%q\n' "$TARGET_REF"
  for slug in "${NEW_EDGE_SLUGS[@]}"; do
    # shellcheck disable=SC2016 -- variable expands when rollback is executed.
    printf 'supabase functions delete %q --project-ref "$TARGET_REF" --yes --agent=no\n' \
      "$slug"
  done
  # shellcheck disable=SC2016 -- variable expands when rollback is executed.
  printf 'supabase functions deploy %q --project-ref "$TARGET_REF" --workdir %q --use-api --agent=no\n' \
    "$EXISTING_EDGE_SLUG" "$edge_snapshot_work"
} >"$manual_rollback"
chmod 700 "$manual_rollback"

# Recheck local sources after the database operation and immediately before
# bundling, preventing an edit in the backup window from bypassing the hashes.
for slug in _shared "${EDGE_SLUGS[@]}"; do
  if [[ "$(directory_hash "$repo_root/supabase/functions/$slug")" \
        != "$(expected_edge_hash "$slug")" ]]; then
    echo "Edge source changed after DB apply: $slug" >&2
    echo "database is compatible; no Edge Function was deployed" >&2
    exit 1
  fi
done

deployed_new_edges=()
existing_edge_attempted="false"
edge_deploy_failed="false"
failed_edge_slug=""
for slug in "${EDGE_DEPLOY_ORDER[@]}"; do
  if is_new_edge_slug "$slug"; then
    # Record before invoking deploy so a command that creates remotely and then
    # exits non-zero is still cleaned up by exact slug.
    deployed_new_edges+=("$slug")
  else
    existing_edge_attempted="true"
  fi

  deploy_args=(
    functions deploy "$slug"
    --project-ref "$TARGET_REF"
    --workdir "$repo_root"
    --use-api
    --agent=no
  )
  if [[ "$(expected_edge_verify_jwt "$slug")" == "false" ]]; then
    deploy_args+=(--no-verify-jwt)
  fi
  if ! supabase "${deploy_args[@]}"; then
    edge_deploy_failed="true"
    failed_edge_slug="$slug"
    break
  fi
done

if [[ "$edge_deploy_failed" == "true" ]]; then
  echo "Edge deploy failed at $failed_edge_slug; starting exact rollback" >&2
  rollback_edges || true
  echo "database rollback order: 172000 down, then 171000 down" >&2
  exit 1
fi

remote_functions_after="$backup_dir/edge-functions-after.json"
if ! supabase functions list --project-ref "$TARGET_REF" --output json \
    --workdir "$repo_root" --agent=no >"$remote_functions_after"; then
  echo "Edge postflight inventory failed; starting exact rollback" >&2
  rollback_edges || true
  exit 1
fi

edge_postflight_failed="false"
for slug in "${EDGE_SLUGS[@]}"; do
  expected_verify="$(expected_edge_verify_jwt "$slug")"
  if ! jq -e --arg slug "$slug" --argjson verify "$expected_verify" \
      '[.[] | select(.slug == $slug)] as $rows
       | ($rows | length) == 1
         and $rows[0].status == "ACTIVE"
         and $rows[0].verify_jwt == $verify
         and ($rows[0].version | type) == "number"
         and ($rows[0].ezbr_sha256 | type) == "string"
         and ($rows[0].ezbr_sha256 | length) == 64' \
      "$remote_functions_after" >/dev/null; then
    echo "Edge postflight failed: $slug" >&2
    edge_postflight_failed="true"
  fi
done
if ! jq -e --arg slug "$EXISTING_EDGE_SLUG" \
    --argjson old_version "$EXISTING_EDGE_VERSION" \
    '[.[] | select(.slug == $slug)] | length == 1
      and .[0].version > $old_version' \
    "$remote_functions_after" >/dev/null; then
  echo "existing Edge version did not advance" >&2
  edge_postflight_failed="true"
fi
if [[ "$edge_postflight_failed" == "true" ]]; then
  echo "Edge postflight rejected the rollout; starting exact rollback" >&2
  rollback_edges || true
  exit 1
fi

edge_hash_manifest="$backup_dir/edge-local-source-sha256.txt"
for slug in _shared "${EDGE_SLUGS[@]}"; do
  printf '%s  %s\n' "$(expected_edge_hash "$slug")" "$slug" \
    >>"$edge_hash_manifest"
done

echo "prod-compat DB + 12 Edge gate: APPLY PASS"
echo "backup_and_restore_evidence=$backup_dir"
echo "rollback: exact 11 slug deletes + archived pragas-send-push, then 172000/171000 down scripts"
