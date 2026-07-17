#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
deploy_gate="$repo_root/supabase/scripts/deploy-pragas-prod-compat.sh"

if ! command -v rg >/dev/null 2>&1; then
  echo "ripgrep (rg) is required for the production compatibility source gate" >&2
  exit 1
fi

source_line_for_unique_literal() {
  local source_file="$1"
  local literal="$2"
  local occurrence_count

  occurrence_count="$(rg -F -c -- "$literal" "$source_file" || true)"
  [[ "$occurrence_count" == "1" ]] || return 1
  rg -n -F -m 1 -- "$literal" "$source_file" | cut -d: -f1
}

next_executable_line_after() {
  local source_file="$1"
  local after_line="$2"

  awk -v after_line="$after_line" '
    NR > after_line {
      statement = $0
      sub(/^[[:space:]]+/, "", statement)
      sub(/[[:space:]]+$/, "", statement)
      if (statement != "" && statement !~ /^#/) {
        print statement
        exit
      }
    }
  ' "$source_file"
}

source_line_for_unique_statement_between() {
  local source_file="$1"
  local statement_literal="$2"
  local begin_line="$3"
  local end_line="$4"

  awk -v statement_literal="$statement_literal" \
      -v begin_line="$begin_line" -v end_line="$end_line" '
    NR > begin_line && NR < end_line {
      statement = $0
      sub(/^[[:space:]]+/, "", statement)
      sub(/[[:space:]]+$/, "", statement)
      if (statement == statement_literal) {
        found_line = NR
        found_count++
      }
    }
    END {
      if (found_count == 1) {
        print found_line
        exit 0
      }
      exit 1
    }
  ' "$source_file"
}

bash "$repo_root/supabase/tests/pragas-prod-compat-gate-unit.sh"
bash "$repo_root/supabase/tests/pragas-prod-compat-credential-storage-unit.sh"

if ! rg -Fq \
    'bash "$repo_root/supabase/tests/agrorumo-global-account-deletion-integration.sh"' \
    "$deploy_gate"; then
  echo "production gate omits the PG17 global deletion integration proof" >&2
  exit 1
fi

for gate_dependency in \
  "$repo_root/supabase/scripts/pragas-prod-compat-lib.sh" \
  "$repo_root/supabase/scripts/pragas-copy-row-manifest.awk"
do
  [[ -s "$gate_dependency" ]] || {
    echo "missing production gate dependency: $(basename "$gate_dependency")" >&2
    exit 1
  }
done

stat_helper="$repo_root/supabase/scripts/pragas-prod-compat-lib.sh"
# Dollar-prefixed strings below are intentional literal source contracts.
# shellcheck disable=SC2016
for required_stat_contract in \
  'value="$(stat -f '\''%u'\''' \
  'value="$(stat -c '\''%u'\'' --' \
  '[[ "$value" =~ ^[0-9]+$ ]]' \
  'value="$(stat -f '\''%Lp'\''' \
  'value="$(stat -c '\''%a'\'' --' \
  '[[ "$value" =~ ^[0-7]{3,4}$ ]]'
do
  if ! rg -Fq "$required_stat_contract" "$stat_helper"; then
    echo "portable stat validation is missing: $required_stat_contract" >&2
    exit 1
  fi
done
if rg -q 'stat -f .*\|\|[[:space:]]*stat -c' "$stat_helper"; then
  echo "stat portability can leak stdout from an incompatible formatter" >&2
  exit 1
fi

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
# The dollar-prefixed text below is an intentional literal source contract.
# shellcheck disable=SC2016
for required_gate_contract in \
  'pragas_validate_backup_root' \
  'pragas_assert_encrypted_backup_root' \
  'pragas_create_private_backup_leaf' \
  'pragas_assert_private_backup_leaf' \
  'umask 077' \
  'pragas-copy-row-manifest.awk' \
  'expected_dump_rows' \
  'restored_dump_rows' \
  'pragas_validate_data_scope_contract' \
  'data_scope_relations_manifest' \
  'external_parent_relations' \
  'parent_closure' \
  'data_dump_relation_args' \
  'expected_schemas=auth,storage,public' \
  'PRAGAS_RESTORED_FOREIGN_KEYS_OK' \
  'constraint_row.convalidated' \
  'restored_foreign_keys=pass' \
  'LC_ALL=C sort "$restored_row_manifest_unsorted"' \
  'pragas_compare_row_manifests' \
  'pragas_write_private_pgpass' \
  'pragas_run_pinned_pg_backup' \
  'write_verified_role_backup' \
  'write_verified_schema_backup' \
  'write_verified_data_backup' \
  'pragas_call_supabase_cli_login_role_api' \
  'clear_temp_login_role_local' \
  'assert_backup_storage_still_valid' \
  'assert_sensitive_backup_workspace' \
  'pragas_validate_physical_backup_inventory' \
  'supabase backups list'
do
  if ! rg -Fq -- "$required_gate_contract" "$deploy_gate"; then
    echo "production backup/restore contract is missing: $required_gate_contract" >&2
    exit 1
  fi
done
if [[ "$(rg -c -- '--data-only' "$deploy_gate")" != "1" ]] \
    || rg -Fq 'auth-data.sql' "$deploy_gate" \
    || rg -Fq 'storage-data.sql' "$deploy_gate" \
    || rg -Fq -- "--schema 'auth|storage|public'" "$deploy_gate" \
    || ! rg -Fq 'write_verified_data_backup "${data_dump_relation_args[@]}"' \
      "$deploy_gate"; then
  echo "allowlisted auth/storage/Pragas data is not captured in one MVCC dump snapshot" >&2
  exit 1
fi
verified_backup_block="$(sed -n \
  '/PRAGAS_VERIFIED_BACKUP_BEGIN/,/PRAGAS_VERIFIED_BACKUP_END/p' \
  "$deploy_gate")"
# Dollar-prefixed strings below are intentional literal source contracts.
# shellcheck disable=SC2016
for required_verified_backup_contract in \
  '$REVIEWED_PG_BACKUP_IMAGE' \
  '${SUPABASE_DB_PASSWORD:-}' \
  '--roles-only --role postgres --quote-all-identifiers' \
  '--no-role-passwords --no-comments' \
  '--schema-only --quote-all-identifiers --role postgres' \
  '"${relation_args[@]}"' \
  'SET session_replication_role = replica;' \
  'RESET ALL;'
do
  if ! printf '%s\n' "$verified_backup_block" \
      | rg -Fq -- "$required_verified_backup_contract"; then
    echo "verified backup semantics are missing: $required_verified_backup_contract" >&2
    exit 1
  fi
done
if ! rg -Fq \
    'readonly REVIEWED_PG_BACKUP_IMAGE="public.ecr.aws/supabase/postgres@sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426"' \
    "$deploy_gate" \
    || ! rg -Fq \
      'readonly REVIEWED_PG_BACKUP_DIGEST="sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426"' \
      "$deploy_gate"; then
  echo "reviewed PostgreSQL backup image is not pinned by OCI digest" >&2
  exit 1
fi
# Dollar-prefixed paths below are intentional literal source contracts.
# shellcheck disable=SC2016
for prohibited_unencrypted_path in \
  'backup_pgpass="$tmp/' \
  'backup_raw_dir="$tmp/' \
  'temp_login_response="$tmp/' \
  'raw_error="$tmp/' \
  'deploy_debug_log="$tmp/' \
  'restored_row_manifest_unsorted="$tmp/'
do
  if rg -Fq "$prohibited_unencrypted_path" "$deploy_gate"; then
    echo "sensitive backup material can be created outside encrypted storage" >&2
    exit 1
  fi
done
# Dollar-prefixed paths below are intentional literal source contracts.
# shellcheck disable=SC2016
for required_sensitive_path in \
  'backup_pgpass="$sensitive_work_dir/prod-backup.pgpass"' \
  'temp_login_response="$sensitive_work_dir/temp-login-role-response.json"' \
  'backup_raw_dir="$(pragas_create_private_backup_leaf' \
  'restore_pgdata="$(pragas_create_private_backup_leaf' \
  '--mount "type=bind,source=$restore_pgdata,target=/var/lib/postgresql/data"' \
  'deploy_debug_log="$sensitive_work_dir/' \
  'restored_row_manifest_unsorted="$sensitive_work_dir/' \
  'assert_sensitive_backup_workspace && [[ -s "$raw_error" ]]' \
  'mv "$raw_error" "$encrypted_error"'
do
  if ! rg -Fq -- "$required_sensitive_path" "$deploy_gate"; then
    echo "encrypted sensitive-workspace contract is missing: $required_sensitive_path" >&2
    exit 1
  fi
done
if rg -Fq 'supabase db dump' "$deploy_gate" \
    || rg -Fq 'PGPASSWORD' <<<"$verified_backup_block" \
    || rg -q -- '--password([=[:space:]]|$)' <<<"$verified_backup_block" \
    || [[ "$(rg -c '^if ! write_verified_schema_backup' \
      <<<"$verified_backup_block")" != "5" ]]; then
  echo "production backups bypass the pinned verified-TLS contract" >&2
  exit 1
fi
if rg -q 'AS (auth_user_count|storage_object_count)' "$deploy_gate"; then
  echo "production preflight contains prohibited full managed-table counts" >&2
  exit 1
fi

# Dollar-prefixed strings below are intentional literal source contracts.
# shellcheck disable=SC2016
for required_temporary_role_contract in \
  'pragas_load_supabase_access_token' \
  'POST "$TARGET_REF" "$temp_login_access_token"' \
  'TEMP_LOGIN_ROLE_MIN_TTL_SECONDS="300"' \
  'TEMP_LOGIN_ROLE_MAX_TTL_SECONDS="3600"' \
  'pragas_assert_temp_login_role_fresh' \
  '[[ "$method" != "POST" ]]' \
  'clear_temp_login_role_local' \
  'refresh_temp_login_role_credentials' \
  'temp_login_roles_issued_count' \
  'trap cleanup EXIT' \
  'server role will expire by its validated TTL'
do
  if ! rg -Fq "$required_temporary_role_contract" "$deploy_gate" \
      "$repo_root/supabase/scripts/pragas-prod-compat-lib.sh"; then
    echo "temporary Supabase login-role contract is missing: $required_temporary_role_contract" >&2
    exit 1
  fi
done
capture_backup_block="$(sed -n \
  '/^capture_verified_backup_raw()/,/^}/p' "$deploy_gate")"
for required_per_dump_role_contract in \
  'refresh_temp_login_role_credentials' \
  'pragas_assert_temp_login_role_fresh' \
  'pragas_run_pinned_pg_backup' \
  'clear_temp_login_role_local'
do
  if ! rg -Fq "$required_per_dump_role_contract" \
      <<<"$capture_backup_block"; then
    echo "temporary login role is not isolated per dump: $required_per_dump_role_contract" >&2
    exit 1
  fi
done
login_role_helper_block="$(sed -n \
  '/^pragas_call_supabase_cli_login_role_api()/,/^}/p' \
  "$repo_root/supabase/scripts/pragas-prod-compat-lib.sh")"
if rg -Fq 'DELETE' <<<"$login_role_helper_block"; then
  echo "global Supabase CLI login-role revocation is reachable" >&2
  exit 1
fi
for required_encrypted_storage_contract in \
  'pragas_validate_backup_encryption_metadata' \
  'pragas_validate_encrypted_disk_image_metadata' \
  '"image-encrypted" == true' \
  '"image-type" == "sparse bundle disk image"' \
  'hdiutil info -plist' \
  'EncryptionThisVolumeProper' \
  'FileVault' \
  '/Volumes/*' \
  'assert_backup_storage_still_valid' \
  'production backup root is not on verified encrypted storage'
do
  if ! rg -Fq "$required_encrypted_storage_contract" "$deploy_gate" \
      "$repo_root/supabase/scripts/pragas-prod-compat-lib.sh"; then
    echo "encrypted production-backup contract is missing: $required_encrypted_storage_contract" >&2
    exit 1
  fi
done
if [[ "$(rg -c 'assert_backup_storage_still_valid' "$deploy_gate")" -lt 2 ]]; then
  echo "encrypted backup storage is not revalidated across dump/evidence/mutation boundaries" >&2
  exit 1
fi
if [[ "$(rg -c 'assert_sensitive_backup_workspace' "$deploy_gate")" -lt 10 ]] \
    || ! rg -Fq 'PHYSICAL_BACKUP_MAX_AGE_SECONDS="129600"' "$deploy_gate" \
    || ! rg -Fq 'status=COMPLETED' "$deploy_gate" \
    || ! rg -Fq 'walg_enabled=$physical_backup_walg' "$deploy_gate" \
    || ! rg -Fq 'physical_backup_mutation_id < physical_backup_id' "$deploy_gate"; then
  echo "AES workspace or recent physical-backup evidence is not revalidated" >&2
  exit 1
fi
data_scope_block="$(sed -n \
  '/^data_scope_contract_sql=/,/^capture_data_scope_contract()/p' \
  "$deploy_gate")"
for required_data_scope_contract in \
  "namespace_row.nspname IN ('auth', 'storage')" \
  "relation.relname LIKE 'pragas\\_%'" \
  "'subscriptions', 'chat_usage'" \
  "'analytics_events', 'audit_log'" \
  "constraint_row.contype = 'f'" \
  'parent_closure' \
  'external_parent_relations' \
  'partitioned_tables' \
  "relation.relkind = 'S'"
do
  if ! printf '%s\n' "$data_scope_block" \
      | rg -Fq "$required_data_scope_contract"; then
    echo "logical data-scope/closure contract is missing: $required_data_scope_contract" >&2
    exit 1
  fi
done
if ! rg -Fq 'logical data scope or recursive FK closure changed during backup' \
      "$deploy_gate" \
    || ! rg -Fq 'restored logical data scope or recursive FK closure differs from production' \
      "$deploy_gate" \
    || ! rg -Fq 'logical data scope or recursive FK closure changed before mutation' \
      "$deploy_gate"; then
  echo "logical data-scope identity is not checked before/after/restore/mutation" >&2
  exit 1
fi

clone_rehearsal_block="$(sed -n \
  '/PRAGAS_PRODUCTION_CLONE_MIGRATION_REHEARSAL_BEGIN/,/PRAGAS_PRODUCTION_CLONE_MIGRATION_REHEARSAL_END/p' \
  "$deploy_gate")"
# The array expression below is an intentional literal source contract.
# shellcheck disable=SC2016
for required_clone_contract in \
  'assert_database_candidate_snapshot "before-clone"' \
  'run_shared_bootstrap_on_clone' \
  'for version in "${TARGET_VERSIONS[@]}"' \
  'PRAGAS_PRODUCTION_CLONE_REHEARSAL_OK' \
  'pragas_link_account_global_deletion_precedence_v1' \
  'agrorumo_account_deletion_apple_revocations' \
  'vault.create_secret(text,text,text,uuid)' \
  'pragas_prod_compat_export_v1'
do
  if ! printf '%s\n' "$clone_rehearsal_block" \
      | rg -Fq "$required_clone_contract"; then
    echo "production clone does not rehearse the reviewed bundle: $required_clone_contract" >&2
    exit 1
  fi
done
# Dollar-prefixed paths below are intentional literal source contracts.
# shellcheck disable=SC2016
for required_candidate_identity_contract in \
  'pragas_assert_owned_readonly_tree "$tmp/supabase/.temp"' \
  'pragas_assert_owned_readonly_tree "$tmp/supabase/migrations"' \
  'linked_metadata_snapshot_hash' \
  'expected_snapshot_migration_names' \
  'assert_database_candidate_snapshot "before-shared-bootstrap"' \
  'assert_database_candidate_snapshot "before-clone-migration-loop"' \
  'assert_database_candidate_snapshot "before-db-push"'
do
  if ! rg -Fq "$required_candidate_identity_contract" "$deploy_gate"; then
    echo "database source/ref TOCTOU guard is missing: $required_candidate_identity_contract" >&2
    exit 1
  fi
done
clone_rehearsal_line="$(rg -n -m 1 \
  'PRAGAS_PRODUCTION_CLONE_MIGRATION_REHEARSAL_BEGIN' \
  "$deploy_gate" | cut -d: -f1)"
production_push_line="$(rg -n -m 1 \
  'supabase db push --linked --include-all --workdir "\$tmp" --yes' \
  "$deploy_gate" | cut -d: -f1)"
if [[ -z "$clone_rehearsal_line" || -z "$production_push_line" \
      || "$clone_rehearsal_line" -ge "$production_push_line" ]]; then
  echo "production clone migration rehearsal does not precede db push" >&2
  exit 1
fi

clone_bootstrap_line="$(source_line_for_unique_literal "$deploy_gate" \
  'if ! run_shared_bootstrap_on_clone; then')" || {
    echo "clone bootstrap invocation is not unique" >&2
    exit 1
  }
clone_source_recheck_begin_line="$(source_line_for_unique_literal "$deploy_gate" \
  'PRAGAS_CLONE_POST_BOOTSTRAP_SOURCE_RECHECK_BEGIN')" || {
    echo "clone post-bootstrap source recheck begin marker is not unique" >&2
    exit 1
  }
clone_source_recheck_line="$(source_line_for_unique_literal "$deploy_gate" \
  'assert_database_candidate_snapshot "before-clone-migration-loop"')" || {
    echo "clone post-bootstrap source recheck is not unique" >&2
    exit 1
  }
clone_source_recheck_end_line="$(source_line_for_unique_literal "$deploy_gate" \
  'PRAGAS_CLONE_POST_BOOTSTRAP_SOURCE_RECHECK_END')" || {
    echo "clone post-bootstrap source recheck end marker is not unique" >&2
    exit 1
  }
# The loop expression is an intentional literal source contract.
# shellcheck disable=SC2016
if [[ "$clone_bootstrap_line" -ge "$clone_source_recheck_begin_line" \
      || "$clone_source_recheck_begin_line" -ge "$clone_source_recheck_line" \
      || "$clone_source_recheck_line" -ge "$clone_source_recheck_end_line" \
      || "$(next_executable_line_after \
        "$deploy_gate" "$clone_source_recheck_end_line")" \
         != 'for version in "${TARGET_VERSIONS[@]}"; do' ]]; then
  echo "database snapshot recheck is not adjacent to the post-bootstrap migration loop" >&2
  exit 1
fi

shared_bootstrap_block="$(sed -n \
  '/PRAGAS_SHARED_RELATION_BOOTSTRAP_BEGIN/,/PRAGAS_SHARED_RELATION_BOOTSTRAP_END/p' \
  "$deploy_gate")"
for required_shared_bootstrap_contract in \
  'pg_relation_size' \
  'pg_stat_activity' \
  'SHARED_RELATION_MAX_BYTES' \
  'SHARED_LONG_XACT_LIMIT_SECONDS' \
  "set_config('lock_timeout', '2s', true)" \
  'IN ACCESS EXCLUSIVE MODE NOWAIT' \
  "column_info.is_generated <> 'NEVER'" \
  "column_info.is_identity <> 'NO'" \
  'column_info.column_default IS NOT NULL' \
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_user_app' \
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_user_app' \
  'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_pragas_event_id'
do
  if ! printf '%s\n' "$shared_bootstrap_block" \
      | rg -Fq "$required_shared_bootstrap_contract"; then
    echo "shared relation bootstrap is not fail-closed: $required_shared_bootstrap_contract" >&2
    exit 1
  fi
done
# The variable expression below is an intentional literal source contract.
# shellcheck disable=SC2016
for required_shared_execution_contract in \
  'pragas_run_with_timeout "$SHARED_INDEX_CLIENT_TIMEOUT_SECONDS"' \
  'assert_remote_migration_history_unchanged "before-shared-bootstrap"' \
  'assert_remote_migration_history_unchanged "after-shared-bootstrap"' \
  'run_shared_bootstrap_on_linked_project'
do
  if ! rg -Fq "$required_shared_execution_contract" "$deploy_gate"; then
    echo "shared relation execution guard is missing: $required_shared_execution_contract" >&2
    exit 1
  fi
done

required_secret_block="$(sed -n \
  '/^required_secret_names=(/,/^)/p' "$deploy_gate")"
for required_secret in EXPO_ACCESS_TOKEN APPLE_SIGN_IN_KEY_ID APPLE_SIGN_IN_PRIVATE_KEY; do
  if ! printf '%s\n' "$required_secret_block" \
      | grep -Eq "^[[:space:]]*$required_secret[[:space:]]*$"; then
    echo "production preflight does not require $required_secret" >&2
    exit 1
  fi
done
if ! rg -Fq \
    'PRAGAS_PROD_EXPO_ACCESS_TOKEN_SHA256' \
    "$deploy_gate" \
    || ! rg -Fq \
      'readonly REVIEWED_APPLE_SIGN_IN_KEY_ID="S7F5NF2BN7"' \
      "$deploy_gate" \
    || ! rg -Fq \
      'readonly REVIEWED_APPLE_SIGN_IN_KEY_ID_SHA256="7e3835d041807f1b3013af69924f4c67feae09b2e147af5589576f0d34c72ade"' \
      "$deploy_gate" \
    || ! rg -Fq \
      'readonly REVIEWED_APPLE_SIGN_IN_PRIVATE_KEY_SHA256="ce1992e53f55a4fdc98d535d088b95e0a71faf841cb52288f0c0764a1eaa08a0"' \
      "$deploy_gate" \
    || ! rg -Fq \
      '"$inventory_file" "$secret_name" "$expected_secret_digest"' \
      "$deploy_gate" \
    || ! rg -Fq 'refresh_required_edge_secret_metadata' "$deploy_gate" \
    || ! rg -Fq '"before-production-mutation"' "$deploy_gate" \
    || ! rg -Fq '"before-edge-rollout"' "$deploy_gate"; then
  echo "production preflight does not verify secret metadata fingerprints" >&2
  exit 1
fi
secret_refresh_contract_count="$(
  rg -Fc 'refresh_required_edge_secret_metadata' "$deploy_gate"
)"
if [[ "$secret_refresh_contract_count" -lt 3 ]]; then
  echo "production gate does not re-read secret metadata at both mutation boundaries" >&2
  exit 1
fi
push_handler="$repo_root/supabase/functions/pragas-send-push/index.ts"
if ! rg -Fq \
    'const EXPO_ACCESS_TOKEN = (Deno.env.get("EXPO_ACCESS_TOKEN") ?? "").trim();' \
    "$push_handler" \
    || ! rg -Fq \
    'if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !EXPO_ACCESS_TOKEN)' \
    "$push_handler" \
    || ! rg -Fq \
      'return jsonResponse({ ok: false, error: "misconfigured", requestId }, { status: 503 })' \
      "$push_handler"; then
  echo "push handler does not fail closed when EXPO_ACCESS_TOKEN is absent" >&2
  exit 1
fi
for required_push_runtime_contract in \
  'classifyExpoPushHttpStatus(response.status)' \
  'classifyExpoPushTerminalStatus(claim.status)' \
  'classifyExpoPushTerminalStatus(status)' \
  'captureStableFailure("expo_authentication")' \
  'delivery.state === "configuration_error"' \
  'error: "expo_credentials_rejected_new_notification_id_required"' \
  'error: "push_delivery_failed_new_notification_id_required"' \
  'new_notification_id_required: true' \
  'resolveExpoPushChannel(input.category)'
do
  if ! rg -Fq "$required_push_runtime_contract" "$push_handler"; then
    echo "push credential/channel runtime contract is missing: $required_push_runtime_contract" >&2
    exit 1
  fi
done
configuration_error_block="$(sed -n \
  '/if (delivery.state === "configuration_error") {/,/if (delivery.state === "unknown_outcome") {/p' \
  "$push_handler")"
for required_configuration_error_contract in \
  'const status = "failed";' \
  'notification_id: input.notificationId' \
  'accepted_count: accepted' \
  'error_count: failures'
do
  if ! printf '%s\n' "$configuration_error_block" \
      | rg -Fq "$required_configuration_error_contract"; then
    echo "rejected Expo credential completion is inconsistent: $required_configuration_error_contract" >&2
    exit 1
  fi
done
if printf '%s\n' "$configuration_error_block" | rg -Fq 'Retry-After' \
    || printf '%s\n' "$configuration_error_block" \
      | rg -Fq 'accepted > 0 ? "partial" : "failed"'; then
  echo "rejected Expo credentials are incorrectly advertised as retryable" >&2
  exit 1
fi

if ! rg -Fq 'readonly REVIEWED_SUPABASE_CLI_VERSION="2.98.2"' \
    "$deploy_gate" \
    || ! rg -Fq 'readonly REVIEWED_SUPABASE_CLI_SHA256="0412442a84b5b85af85ee540dd445e961b4cd1818ddc5365aa0ac298d908bd87"' \
      "$deploy_gate" \
    || ! rg -Fq 'readonly REVIEWED_EDGE_RUNTIME_IMAGE="supabase/edge-runtime:v1.73.13"' \
      "$deploy_gate" \
    || ! rg -Fq 'readonly REVIEWED_EDGE_RUNTIME_IMAGE_ID="sha256:cfa86b9ad11f349aa4b930f3ab295d6ad923f2e43c5513c08d79c1f3b990b486"' \
      "$deploy_gate" \
    || ! rg -Fq 'pragas_assert_supabase_cli_version' "$deploy_gate" \
    || ! rg -Fq 'docker image inspect' "$deploy_gate"; then
  echo "reviewed CLI binary/local Edge bundler is not pinned fail-closed" >&2
  exit 1
fi

edge_allowlist_gate="$repo_root/supabase/functions/deploy-pragas-allowlist.sh"
if rg -Fq 'supabase functions deploy' "$edge_allowlist_gate" \
    || ! rg -Fq 'PRODUCTION_GATE="$REPO_ROOT/supabase/scripts/deploy-pragas-prod-compat.sh"' \
      "$edge_allowlist_gate" \
    || ! rg -Fq 'exec "$PRODUCTION_GATE" --apply' "$edge_allowlist_gate"; then
  echo "Edge allowlist retains a direct mutable-worktree production route" >&2
  exit 1
fi

# Dollar-prefixed strings below are intentional literal source contracts.
# shellcheck disable=SC2016
for required_db_tls_contract in \
  'pragas_validate_db_sslrootcert' \
  'pragas_validate_pinned_db_sslrootcert' \
  'pragas_install_pinned_db_sslrootcert' \
  'pragas_parse_pooler_url' \
  'pragas_write_private_pgpass' \
  'pragas_assert_pinned_docker_image' \
  'pragas_run_pinned_pg_backup' \
  '${PRAGAS_PROD_DB_SSLROOTCERT:-}' \
  'db_sslrootcert="$tmp/db-root-ca.pem"' \
  'pragas_copy_verified_file' \
  'PGSSLMODE=verify-full PGSSLROOTCERT="$db_sslrootcert"'
do
  if ! rg -Fq "$required_db_tls_contract" "$deploy_gate" \
      "$repo_root/supabase/scripts/pragas-prod-compat-lib.sh"; then
    echo "verified database TLS contract is missing: $required_db_tls_contract" >&2
    exit 1
  fi
done
if ! rg -Fq \
    'readonly REVIEWED_DB_CA_URL="https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt"' \
    "$deploy_gate" \
    || ! rg -Fq \
      'readonly REVIEWED_DB_CA_SHA256="700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7"' \
      "$deploy_gate" \
    || ! rg -Fq -- '--max-redirs 0' \
      "$repo_root/supabase/scripts/pragas-prod-compat-lib.sh"; then
  echo "official Supabase database CA is not origin/content pinned" >&2
  exit 1
fi
# Dollar-prefixed strings below are intentional literal source contracts.
# shellcheck disable=SC2016
for required_backup_tls_contract in \
  "--format '{{range .RepoDigests}}{{println .}}{{end}}'" \
  "--format '{{.Architecture}}'" \
  'pragas_validate_pinned_image_metadata' \
  'env -u SUPABASE_DB_PASSWORD docker run --rm --pull never --read-only' \
  '--user "$(id -u):$(id -g)"' \
  '--mount "type=bind,source=$root_ca,target=/run/pragas/root-ca.pem,readonly"' \
  '--mount "type=bind,source=$pgpass_file,target=/run/pragas/pgpass,readonly"' \
  '--env "PGSSLMODE=verify-full"' \
  '--env "PGSSLROOTCERT=/run/pragas/root-ca.pem"' \
  '--env "PGPASSFILE=/run/pragas/pgpass"' \
  '--env "PGOPTIONS=-c statement_timeout=15min"'
do
  if ! rg -Fq -- "$required_backup_tls_contract" \
      "$repo_root/supabase/scripts/pragas-prod-compat-lib.sh"; then
    echo "pinned backup TLS isolation is missing: $required_backup_tls_contract" >&2
    exit 1
  fi
done
if [[ "$(rg -F -c \
      'PGSSLMODE=verify-full PGSSLROOTCERT="$db_sslrootcert"' \
      "$deploy_gate")" != "2" ]] \
    || rg -q '^[[:space:]]*export[[:space:]]+PGSSL(MODE|ROOTCERT)' \
      "$deploy_gate"; then
  echo "database TLS variables are not scoped to the two db push subprocesses" >&2
  exit 1
fi
# The dollar-prefixed paths below are intentional literal source contracts.
# shellcheck disable=SC2016
tls_snapshot_block="$(sed -n \
  '/^if ! db_sslrootcert_hash="\$(/,/^mkdir -p "\$tmp\/supabase/p' \
  "$deploy_gate")"
if ! rg -Fq \
    'shasum -a 256 "$db_sslrootcert_source" 2>/dev/null' \
    <<<"$tls_snapshot_block" \
    || ! rg -Fq '>/dev/null 2>&1; then' <<<"$tls_snapshot_block" \
    || rg -q '(echo|printf).*db_sslrootcert_(source|hash)' \
      <<<"$tls_snapshot_block"; then
  echo "database TLS root CA path could leak during snapshot failure" >&2
  exit 1
fi
# shellcheck disable=SC2016
dry_run_push_block="$(sed -n '/^dry_run_output="\$(/,/^}$/p' "$deploy_gate")"
# shellcheck disable=SC2016
apply_push_block="$(sed -n '/^if ! db_push_output="\$(/,/^fi$/p' "$deploy_gate")"
for db_push_block in "$dry_run_push_block" "$apply_push_block"; do
  if ! rg -Fq 'PGSSLMODE=verify-full PGSSLROOTCERT="$db_sslrootcert"' \
      <<<"$db_push_block" \
      || ! rg -Fq 'supabase db push --linked' <<<"$db_push_block" \
      || rg -Fq -- '--debug' <<<"$db_push_block"; then
    echo "database push is not fail-closed under verified TLS" >&2
    exit 1
  fi
done

for workflow in \
  "$repo_root/.github/workflows/ci.yml" \
  "$repo_root/.github/workflows/pr-check.yml"
do
  case "$workflow" in
    */ci.yml)
      workflow_job="$(sed -n '/^  supabase-quality:/,$p' "$workflow")"
      ;;
    */pr-check.yml)
      workflow_job="$(sed -n '/^  supabase-check:/,$p' "$workflow")"
      ;;
    *)
      echo "unexpected CI workflow path: $workflow" >&2
      exit 1
      ;;
  esac
  if ! rg -Fq \
      'supabase/setup-cli@46f7f98c7f948ad727d22c1e67fab04c223a0520' \
      <<<"$workflow_job" \
      || ! rg -Fq \
        'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38' \
        <<<"$workflow_job" \
      || ! rg -Fq 'node-version: 22.22.3' <<<"$workflow_job" \
      || ! rg -Fq 'version: 2.98.2' <<<"$workflow_job" \
      || ! rg -Fq \
        'sudo apt-get install --yes --no-install-recommends ripgrep' \
        <<<"$workflow_job" \
      || ! rg -Fq 'rg --version' <<<"$workflow_job" \
      || ! rg -Fq \
        "if rg --line-number '^(<<<<<<<|=======|>>>>>>>)' supabase; then" \
        <<<"$workflow_job" \
      || ! rg -Fq 'rg_status=$?' <<<"$workflow_job" \
      || ! rg -Fq 'if [[ "$rg_status" -ne 1 ]]; then' <<<"$workflow_job" \
      || ! rg -Fq \
        'Supabase conflict-marker scan failed with status $rg_status.' \
        <<<"$workflow_job" \
      || ! rg -Fq 'if [[ "$(supabase --version)" != "2.98.2" ]]; then' \
        <<<"$workflow_job"; then
    echo "CI does not install and verify its reviewed source-gate tools: $workflow" >&2
    exit 1
  fi
  ripgrep_setup_line="$(rg -n -m 1 \
    'sudo apt-get install --yes --no-install-recommends ripgrep' \
    <<<"$workflow_job" | cut -d: -f1)"
  conflict_scan_line="$(rg -n -m 1 \
    'if rg --line-number.*supabase; then' \
    <<<"$workflow_job" | cut -d: -f1)"
  node_setup_line="$(rg -n -m 1 \
    'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38' \
    <<<"$workflow_job" | cut -d: -f1)"
  cli_setup_line="$(rg -n -m 1 \
    'supabase/setup-cli@46f7f98c7f948ad727d22c1e67fab04c223a0520' \
    <<<"$workflow_job" | cut -d: -f1)"
  cli_assert_line="$(rg -n -m 1 \
    'if \[\[ "\$\(supabase --version\)" != "2[.]98[.]2" \]\]; then' \
    <<<"$workflow_job" | cut -d: -f1)"
  prod_compat_static_line="$(rg -n -m 1 \
    'bash supabase/tests/pragas-prod-compat-gate-static[.]sh' \
    <<<"$workflow_job" | cut -d: -f1)"
  integration_line="$(rg -n -m 1 \
    'bash supabase/tests/pragas-backend-security-integration[.]sh' \
    <<<"$workflow_job" | cut -d: -f1)"
  if [[ -z "$ripgrep_setup_line" || -z "$conflict_scan_line" \
        || -z "$node_setup_line" \
        || -z "$cli_setup_line" \
        || -z "$cli_assert_line" || -z "$prod_compat_static_line" \
        || -z "$integration_line" \
        || "$ripgrep_setup_line" -ge "$conflict_scan_line" \
        || "$conflict_scan_line" -ge "$prod_compat_static_line" \
        || "$node_setup_line" -ge "$cli_setup_line" \
        || "$cli_setup_line" -ge "$cli_assert_line" \
        || "$cli_assert_line" -ge "$prod_compat_static_line" \
        || "$prod_compat_static_line" -ge "$integration_line" ]]; then
    echo "CI static/CLI gates do not precede integration: $workflow" >&2
    exit 1
  fi
done
backend_integration_wrapper="$repo_root/supabase/tests/pragas-backend-security-integration.sh"
stat_linux_integration_line="$(rg -n -m 1 \
  'pragas-prod-compat-stat-linux-integration[.]sh' \
  "$backend_integration_wrapper" | cut -d: -f1)"
backup_tls_integration_line="$(rg -n -m 1 \
  'pragas-prod-compat-backup-tls-integration[.]sh' \
  "$backend_integration_wrapper" | cut -d: -f1)"
prod_compat_integration_line="$(rg -n -m 1 \
  'pragas-prod-compat-integration[.]sh' \
  "$backend_integration_wrapper" | cut -d: -f1)"
if [[ -z "$stat_linux_integration_line" \
      || -z "$backup_tls_integration_line" \
      || -z "$prod_compat_integration_line" \
      || "$stat_linux_integration_line" -ge "$backup_tls_integration_line" \
      || "$backup_tls_integration_line" -ge "$prod_compat_integration_line" ]]; then
  echo "stat/TLS integrations are absent from the CI wrapper" >&2
  exit 1
fi
cli_pin_line="$(rg -n -m 1 'pragas_assert_supabase_cli_version' \
  "$deploy_gate" | cut -d: -f1)"
first_remote_line="$(rg -n -m 1 'supabase (db|functions|secrets)' \
  "$deploy_gate" | cut -d: -f1)"
if [[ -z "$cli_pin_line" || -z "$first_remote_line" \
      || "$cli_pin_line" -ge "$first_remote_line" ]]; then
  echo "Supabase CLI version pin does not precede remote access" >&2
  exit 1
fi

# Supabase exposes no conditional delete/deploy operation for Edge Functions.
# The rollout must therefore detect every observable race and stop without an
# automatic rollback that could overwrite a concurrent operator's change.
edge_deploy_loop="$(sed -n \
  '/PRAGAS_EDGE_DEPLOY_LOOP_BEGIN/,/PRAGAS_EDGE_DEPLOY_LOOP_END/p' \
  "$deploy_gate")"
for required_edge_race_contract in \
  'functions list' \
  'pragas_assert_target_edge_inventory' \
  'pragas_assert_edge_deploy_transition' \
  'expected_deployed_ezbr' \
  'pragas_extract_local_edge_bundle_hash' \
  'postdeploy_confirm_target' \
  'assert_edge_candidate_snapshot' \
  'write_edge_stop_report'
do
  if ! printf '%s\n' "$edge_deploy_loop" \
      | rg -Fq "$required_edge_race_contract"; then
    echo "Edge deploy loop lacks fail-closed race guard: $required_edge_race_contract" >&2
    exit 1
  fi
done
if ! rg -Fq 'local_candidate_ezbr_sha256' "$deploy_gate"; then
  echo "Edge transition evidence omits the locally derived bundle identity" >&2
  exit 1
fi
if ! rg -Fq 'edge_candidate_work="$tmp/edge-candidate-work"' "$deploy_gate" \
    || ! rg -Fq 'pragas_copy_verified_tree' "$deploy_gate" \
    || ! rg -Fq 'chmod -R u=rX,go= "$edge_candidate_work"' "$deploy_gate" \
    || ! rg -Fq 'pragas_assert_owned_readonly_tree "$edge_candidate_work"' \
      "$deploy_gate" \
    || ! printf '%s\n' "$edge_deploy_loop" \
      | rg -Fq -- '--workdir "$edge_candidate_work"' \
    || printf '%s\n' "$edge_deploy_loop" \
      | rg -Fq -- '--workdir "$repo_root"'; then
  echo "Edge deployment is not isolated from the shared worktree" >&2
  exit 1
fi
if ! printf '%s\n' "$edge_deploy_loop" | rg -Fq -- '--use-docker' \
    || ! printf '%s\n' "$edge_deploy_loop" | rg -Fq -- '--debug' \
    || ! printf '%s\n' "$edge_deploy_loop" \
      | rg -Fq '2>"$deploy_debug_log"' \
    || printf '%s\n' "$edge_deploy_loop" | rg -Fq -- '--use-api' \
    || printf '%s\n' "$edge_deploy_loop" \
      | grep -Eq '(cat|tee)[[:space:]].*deploy_debug_log'; then
  echo "Edge bundle identity is not derived privately from the pinned local bundler" >&2
  exit 1
fi

edge_secret_refresh_line="$(source_line_for_unique_literal "$deploy_gate" \
  '"before-edge-rollout"; then')" || {
    echo "Edge secret refresh checkpoint is not unique" >&2
    exit 1
  }
edge_source_recheck_begin_line="$(source_line_for_unique_literal "$deploy_gate" \
  'PRAGAS_EDGE_FINAL_SOURCE_RECHECK_BEGIN')" || {
    echo "final Edge source recheck begin marker is not unique" >&2
    exit 1
  }
edge_source_recheck_end_line="$(source_line_for_unique_literal "$deploy_gate" \
  'PRAGAS_EDGE_FINAL_SOURCE_RECHECK_END')" || {
    echo "final Edge source recheck end marker is not unique" >&2
    exit 1
  }
# The slug expression is an intentional literal source contract.
# shellcheck disable=SC2016
edge_source_recheck_line="$(source_line_for_unique_statement_between \
  "$deploy_gate" 'if ! assert_edge_candidate_snapshot "$slug"; then' \
  "$edge_source_recheck_begin_line" "$edge_source_recheck_end_line")" || {
    echo "final Edge source recheck is not unique" >&2
    exit 1
  }
# The deploy expression is an intentional literal source contract.
# shellcheck disable=SC2016
edge_deploy_line="$(source_line_for_unique_literal "$deploy_gate" \
  'if ! supabase "${deploy_args[@]}" 2>"$deploy_debug_log"; then')" || {
    echo "Edge deploy invocation is not unique" >&2
    exit 1
  }
# shellcheck disable=SC2016
if [[ "$edge_secret_refresh_line" -ge "$edge_source_recheck_begin_line" \
      || "$edge_source_recheck_begin_line" -ge "$edge_source_recheck_line" \
      || "$edge_source_recheck_line" -ge "$edge_source_recheck_end_line" \
      || "$edge_source_recheck_end_line" -ge "$edge_deploy_line" \
      || "$(next_executable_line_after \
        "$deploy_gate" "$edge_source_recheck_end_line")" \
         != 'if ! supabase "${deploy_args[@]}" 2>"$deploy_debug_log"; then' ]]; then
  echo "Edge source rehash is not after secret refresh and adjacent to deploy" >&2
  exit 1
fi
for prohibited_automatic_edge_rollback in \
  'supabase functions delete' \
  'rollback_edges' \
  'manual-edge-rollback.sh' \
  'starting exact rollback'
do
  if rg -Fq "$prohibited_automatic_edge_rollback" "$deploy_gate"; then
    echo "automatic/unconditional Edge rollback is prohibited: $prohibited_automatic_edge_rollback" >&2
    exit 1
  fi
done
if ! rg -Fq 'automatic Edge rollback is disabled' "$deploy_gate" \
    || ! rg -Fq 'edge-deployment-stop-report.json' "$deploy_gate"; then
  echo "Edge deployment stop/report contract is missing" >&2
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

runtime_migration="$repo_root/supabase/migrations/20260715171000_pragas_prod_compat_runtime.sql"
shared_analytics_preflight="$(sed -n \
  '/PRAGAS_SHARED_ANALYTICS_INDEX_PREFLIGHT_BEGIN/,/PRAGAS_SHARED_ANALYTICS_INDEX_PREFLIGHT_END/p' \
  "$runtime_migration")"
for required_shared_analytics_contract in \
  "column_info.column_name = required.column_name" \
  "column_info.udt_name = required.udt_name" \
  "column_info.is_nullable = 'YES'" \
  "column_info.is_generated = 'NEVER'" \
  "column_info.is_identity = 'NO'" \
  'column_info.column_default IS NULL' \
  'idx_analytics_events_user_app' \
  'idx_audit_log_user_app' \
  'idx_analytics_events_pragas_event_id' \
  "ARRAY['user_id', 'app']::text[]" \
  "ARRAY['user_id', 'pragas_event_id']::text[]" \
  "app=''rumo-pragas''::textandpragas_event_idisnotnull" \
  "access_method.amname = 'btree'" \
  'index_row.indisvalid' \
  'index_row.indisready' \
  'index_row.indislive' \
  'index_row.indisunique = v_index.is_unique' \
  'index_row.indnkeyatts = cardinality(v_index.key_columns)' \
  'index_row.indnatts = cardinality(v_index.key_columns)' \
  'index_row.indexprs IS NULL' \
  'index_row.indpred IS NULL' \
  'pg_get_expr(index_row.indpred, index_row.indrelid)' \
  'pragas_shared_analytics_index_contract_mismatch_'
do
  if ! printf '%s\n' "$shared_analytics_preflight" \
      | rg -Fq "$required_shared_analytics_contract"; then
    echo "171000 shared analytics preflight is incomplete: $required_shared_analytics_contract" >&2
    exit 1
  fi
done

shared_analytics_preflight_line="$(rg -n -m 1 \
  'PRAGAS_SHARED_ANALYTICS_INDEX_PREFLIGHT_BEGIN' \
  "$runtime_migration" | cut -d: -f1)"
runtime_generic_preflight_line="$(rg -n -m 1 '^DO \$preflight\$' \
  "$runtime_migration" | cut -d: -f1)"
if [[ -z "$shared_analytics_preflight_line" \
      || -z "$runtime_generic_preflight_line" \
      || "$shared_analytics_preflight_line" -ge "$runtime_generic_preflight_line" ]]; then
  echo "171000 shared analytics contract is not the first fail-closed preflight" >&2
  exit 1
fi

# Shared-table DDL belongs to the separately bounded production bootstrap. The
# Supabase CLI executes this migration as a transaction pipeline, where a
# concurrent index is unsupported and a regular index would block other apps.
runtime_executable_sql="$(sed -E '/^[[:space:]]*--/d' "$runtime_migration" \
  | tr '\n' ' ')"
if printf '%s\n' "$runtime_executable_sql" | grep -Eiq \
    'ALTER[[:space:]]+TABLE[[:space:]]+public[.](analytics_events|audit_log)([[:space:]]|$)' \
   || printf '%s\n' "$runtime_executable_sql" | grep -Eiq \
    'CREATE[[:space:]]+(UNIQUE[[:space:]]+)?INDEX([[:space:]]+CONCURRENTLY)?([[:space:]]+IF[[:space:]]+NOT[[:space:]]+EXISTS)?[[:space:]]+idx_(analytics_events|audit_log)'; then
  echo "171000 contains prohibited shared-table DDL" >&2
  exit 1
fi

export_migration="$repo_root/supabase/migrations/20260715172000_pragas_prod_compat_export.sql"
export_preflight_block="$(sed -n \
  '/PRAGAS_NOTIFICATION_QUEUE_MIGRATION_PREFLIGHT_BEGIN/,/PRAGAS_NOTIFICATION_QUEUE_MIGRATION_PREFLIGHT_END/p' \
  "$export_migration")"
for required_export_preflight_contract in \
  "column_info.column_name = 'token'" \
  "column_info.data_type = 'text'" \
  "column_info.column_name = 'created_at'" \
  "'timestamp with time zone', 'timestamp without time zone'" \
  "column_info.column_name = 'owner_user_id'" \
  "column_info.is_nullable = 'NO'" \
  "column_info.is_generated = 'NEVER'" \
  "column_info.is_identity = 'NO'" \
  'column_info.column_default IS NULL' \
  "trigger_row.tgname = 'pragas_notification_queue_owner_guard'" \
  'attribute_row.attnotnull' \
  'index_row.indisunique' \
  'pragas_notification_queue_export_schema_mismatch'
do
  if ! printf '%s\n' "$export_preflight_block" \
      | rg -Fq "$required_export_preflight_contract"; then
    echo "172000 migration preflight is incomplete: $required_export_preflight_contract" >&2
    exit 1
  fi
done
export_preflight_line="$(rg -n -m 1 \
  'PRAGAS_NOTIFICATION_QUEUE_MIGRATION_PREFLIGHT_BEGIN' \
  "$export_migration" | cut -d: -f1)"
export_create_line="$(rg -n -m 1 \
  '^CREATE OR REPLACE FUNCTION public[.]export_pragas_notification_queue_snapshot' \
  "$export_migration" | cut -d: -f1)"
if [[ -z "$export_preflight_line" || -z "$export_create_line" \
      || "$export_preflight_line" -ge "$export_create_line" ]]; then
  echo "172000 schema preflight does not precede the candidate RPC" >&2
  exit 1
fi
# The positional parameter below is an intentional SQL-function literal.
# shellcheck disable=SC2016
if rg -Fq 'pragas_push_tokens' "$export_migration" \
    || ! rg -Fq 'queue_row.owner_user_id = $1' "$export_migration" \
    || ! rg -Fq 'pragas_notification_queue_owner_guard' "$runtime_migration" \
    || ! rg -Fq 'pragas_notification_queue_legacy_owner_ambiguous' \
      "$runtime_migration" \
    || ! rg -Fq 'WHERE owner_user_id = p_user_id' "$runtime_migration"; then
  echo "notification queue export/cleanup still infers ownership from a reusable token" >&2
  exit 1
fi

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
  pragas-global-account-deletion
)

expected_verify_jwt() {
  case "$1" in
    pragas-process-deletions|pragas-process-ai-idempotency|pragas-send-push|pragas-global-account-deletion)
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

for deno_task in 'fmt:check' 'lint'; do
  if ! jq -er --arg task "$deno_task" '.tasks[$task]' \
      "$repo_root/supabase/functions/deno.json" \
      | rg -Fq 'pragas-send-push/eligibility.ts'; then
    echo "push eligibility helper is absent from Deno $deno_task" >&2
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
  begin_agrorumo_account_deletion_challenge
  begin_agrorumo_apple_revocation_attempt
  claim_agrorumo_apple_revocation_token
  claim_pragas_deletion_job
  claim_pragas_deletion_jobs
  claim_pragas_push_notification
  cleanup_pragas_user_rows
  complete_pragas_ai_idempotency
  complete_pragas_deletion_job
  complete_pragas_push_notification
  consume_pragas_api_rate_limit
  consume_pragas_mcp_rate_limit
  consume_agrorumo_deletion_status_rate_limit
  export_pragas_notification_queue_snapshot
  get_agrorumo_account_deletion_app_gate
  get_agrorumo_account_deletion_replay
  get_agrorumo_account_deletion_status
  grant_pragas_ai_consent
  mark_pragas_ai_provider_started
  mark_pragas_ai_unknown_outcome
  mark_pragas_push_provider_started
  mark_pragas_push_unknown_outcome
  reactivate_pragas_account
  record_agrorumo_apple_revocation_result
  record_pragas_ai_consent
  record_pragas_analytics_events
  release_pragas_ai_idempotency
  release_pragas_push_notification
  request_pragas_account_deletion
  reserve_agrorumo_account_deletion_request
  reserve_pragas_ai_idempotency
  retry_pragas_deletion_job
  revoke_pragas_ai_consent
  scrub_expired_pragas_ai_idempotency
  set_pragas_location_consent
  store_agrorumo_apple_revocation_token
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
  "$repo_root/supabase/migrations/20260715173000_agrorumo_global_account_deletion_requests.sql"
)
while IFS= read -r rpc; do
  if ! rg -q "public[.]${rpc}([ (]|$)" "${candidate_sql[@]}"; then
    echo "RPC used by Edge/app is absent from candidate SQL: $rpc" >&2
    exit 1
  fi
done <<< "$actual_rpcs"

echo "pragas prod-compat static gate: PASS"
echo "migrations=4 edge_functions=13 rpc_contracts=38 cli=2.98.2 cli_tracking=recovery edge_bundle=local-ezbr shared_indexes=concurrent clone_rehearsal=exact edge_rollback=manual export_preflight=transactional superseded_143000=inert backup_restore=aes-private+scoped-single-mvcc+fk-closure physical_backup=recent-walg stat_portability=macos+linux-uid1001 ci_static=required"
