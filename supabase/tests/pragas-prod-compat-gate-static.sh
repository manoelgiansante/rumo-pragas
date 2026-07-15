#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
deploy_gate="$repo_root/supabase/scripts/deploy-pragas-prod-compat.sh"

bash "$repo_root/supabase/tests/pragas-prod-compat-gate-unit.sh"

for gate_dependency in \
  "$repo_root/supabase/scripts/pragas-prod-compat-lib.sh" \
  "$repo_root/supabase/scripts/pragas-copy-row-manifest.awk"
do
  [[ -s "$gate_dependency" ]] || {
    echo "missing production gate dependency: $(basename "$gate_dependency")" >&2
    exit 1
  }
done

# The final race-window query must be one SQL statement with one CSV row and
# four stable, named columns. Multiple SELECT statements previously produced a
# fragile repeated-header stream in some CLI versions.
mutation_recheck_block="$(sed -n \
  '/PRAGAS_MUTATION_RECHECK_SINGLE_SELECT_BEGIN/,/PRAGAS_MUTATION_RECHECK_SINGLE_SELECT_END/p' \
  "$deploy_gate")"
if [[ "$(printf '%s' "$mutation_recheck_block" | tr -cd ';' | wc -c \
      | tr -d '[:space:]')" != "1" ]] \
   || [[ "$(printf '%s\n' "$mutation_recheck_block" \
      | rg -c 'AS (profile_count|generated_profile_count|app_subscription_count|push_notification_count)')" != "4" ]] \
   || rg -q ';[[:space:]]*SELECT[[:space:]]+count' "$deploy_gate" \
   || ! rg -q 'pragas_parse_mutation_recheck_csv' "$deploy_gate"; then
  echo "immediate production recheck is not the reviewed single-statement contract" >&2
  exit 1
fi

# Backups must be external/private and every COPY payload must be verified by a
# restored table row-count manifest rather than production-wide count probes.
for required_gate_contract in \
  'pragas_validate_backup_root' \
  'pragas_create_private_backup_leaf' \
  'pragas_assert_private_backup_leaf' \
  'pragas-copy-row-manifest.awk' \
  'expected_dump_rows' \
  'restored_dump_rows' \
  'pragas_compare_row_manifests'
do
  if ! rg -q "$required_gate_contract" "$deploy_gate"; then
    echo "production backup/restore contract is missing: $required_gate_contract" >&2
    exit 1
  fi
done
if rg -q 'AS (auth_user_count|storage_object_count)' "$deploy_gate"; then
  echo "production preflight contains prohibited full managed-table counts" >&2
  exit 1
fi

candidate_migrations=(
  "20260715170000_pragas_link_account_prod_hotfix.sql"
  "20260715171000_pragas_prod_compat_runtime.sql"
  "20260715172000_pragas_prod_compat_export.sql"
)

for migration_name in "${candidate_migrations[@]}"; do
  migration="$repo_root/supabase/migrations/$migration_name"
  [[ -f "$migration" ]] || {
    echo "missing candidate migration: $migration_name" >&2
    exit 1
  }
  if [[ "$(grep -Ec '^BEGIN;$' "$migration")" != "1" ]]; then
    echo "candidate migration lacks one explicit top-level BEGIN: $migration_name" >&2
    exit 1
  fi
  if [[ "$(awk 'NF { last = $0 } END { print last }' "$migration")" != "COMMIT;" ]]; then
    echo "candidate migration does not end in COMMIT: $migration_name" >&2
    exit 1
  fi
done

# 143000 is intentionally recorded as a no-op. Strip comments and reject any
# data/schema/ACL statement so the superseded live-incompatible body cannot
# silently return during a later edit.
superseded="$repo_root/supabase/migrations/20260714143000_pragas_backend_security.sql"
if sed -E '/^[[:space:]]*--/d; /^[[:space:]]*$/d' "$superseded" \
    | grep -Eiq '^[[:space:]]*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE|TRUNCATE|COPY|EXECUTE)([[:space:]]|$)'; then
  echo "superseded 143000 migration is no longer inert" >&2
  exit 1
fi

edge_slugs=(
  diagnose-pragas
  ai-chat-pragas
  pragas-delete-user-account
  pragas-export-user-data
  pragas-reactivate-account
  pragas-analytics
  report-ai-content
  report-diagnosis-feedback
  admin-ai-content-reports
  pragas-process-deletions
  pragas-process-ai-idempotency
  pragas-send-push
)

expected_verify_jwt() {
  case "$1" in
    pragas-process-deletions|pragas-process-ai-idempotency|pragas-send-push)
      printf 'false\n'
      ;;
    *) printf 'true\n' ;;
  esac
}

for slug in "${edge_slugs[@]}"; do
  entry="$repo_root/supabase/functions/$slug/index.ts"
  [[ -f "$entry" ]] || {
    echo "missing Edge entrypoint: $slug" >&2
    exit 1
  }
  configured="$({
    awk -v section="[functions.$slug]" '
      $0 == section { active = 1; next }
      active && /^\[/ { exit }
      active && /^[[:space:]]*verify_jwt[[:space:]]*=/ {
        gsub(/[[:space:]]/, "", $0)
        sub(/^verify_jwt=/, "", $0)
        print
        exit
      }
    ' "$repo_root/supabase/config.toml"
  } || true)"
  if [[ "$configured" != "$(expected_verify_jwt "$slug")" ]]; then
    echo "verify_jwt config mismatch for $slug" >&2
    exit 1
  fi
done

source_files=()
while IFS= read -r file; do source_files+=("$file"); done < <(
  {
    rg --files \
      "$repo_root/supabase/functions/_shared" \
      "${edge_slugs[@]/#/$repo_root/supabase/functions/}"
    rg --files "$repo_root/expo-app"
  } | rg '\.(ts|tsx|js|mjs)$'
)

expected_rpcs=(
  claim_pragas_deletion_job
  claim_pragas_deletion_jobs
  claim_pragas_push_notification
  cleanup_pragas_user_rows
  complete_pragas_ai_idempotency
  complete_pragas_deletion_job
  complete_pragas_push_notification
  consume_pragas_api_rate_limit
  consume_pragas_mcp_rate_limit
  export_pragas_notification_queue_snapshot
  grant_pragas_ai_consent
  mark_pragas_ai_provider_started
  mark_pragas_ai_unknown_outcome
  mark_pragas_push_provider_started
  mark_pragas_push_unknown_outcome
  reactivate_pragas_account
  record_pragas_ai_consent
  record_pragas_analytics_events
  release_pragas_ai_idempotency
  release_pragas_push_notification
  request_pragas_account_deletion
  reserve_pragas_ai_idempotency
  retry_pragas_deletion_job
  revoke_pragas_ai_consent
  scrub_expired_pragas_ai_idempotency
  set_pragas_location_consent
  touch_pragas_push_token
  transition_pragas_ai_content_report
)

actual_rpcs="$({
  perl -0777 -ne '
    while (/\.rpc\s*\(\s*["\x27]([A-Za-z0-9_]+)["\x27]/g) {
      print "$1\n";
    }
  ' "${source_files[@]}"
} | LC_ALL=C sort -u)"
expected_rpc_text="$(printf '%s\n' "${expected_rpcs[@]}" | LC_ALL=C sort -u)"
if [[ "$actual_rpcs" != "$expected_rpc_text" ]]; then
  echo "Edge/app RPC inventory differs from the reviewed contract" >&2
  diff -u <(printf '%s\n' "$expected_rpc_text") \
    <(printf '%s\n' "$actual_rpcs") >&2 || true
  exit 1
fi

candidate_sql=(
  "$repo_root/supabase/migrations/20260715171000_pragas_prod_compat_runtime.sql"
  "$repo_root/supabase/migrations/20260715172000_pragas_prod_compat_export.sql"
)
while IFS= read -r rpc; do
  if ! rg -q "public[.]${rpc}([ (]|$)" "${candidate_sql[@]}"; then
    echo "RPC used by Edge/app is absent from candidate SQL: $rpc" >&2
    exit 1
  fi
done <<< "$actual_rpcs"

echo "pragas prod-compat static gate: PASS"
echo "migrations=3 edge_functions=12 rpc_contracts=28 superseded_143000=inert backup_restore=lossless"
