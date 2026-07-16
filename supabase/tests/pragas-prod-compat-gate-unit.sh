#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
deploy_gate="$repo_root/supabase/scripts/deploy-pragas-prod-compat.sh"
# The source path is anchored to the resolved repository.
# shellcheck disable=SC1091
source "$repo_root/supabase/scripts/pragas-prod-compat-lib.sh"

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

assert_guard_order_and_adjacency() {
  local source_file="$1"
  local predecessor_literal="$2"
  local guard_begin_literal="$3"
  local guard_literal="$4"
  local guard_end_literal="$5"
  local successor_literal="$6"
  local predecessor_line guard_begin_line guard_line guard_end_line

  predecessor_line="$(source_line_for_unique_literal \
    "$source_file" "$predecessor_literal")" || return 1
  guard_begin_line="$(source_line_for_unique_literal \
    "$source_file" "$guard_begin_literal")" || return 1
  guard_end_line="$(source_line_for_unique_literal \
    "$source_file" "$guard_end_literal")" || return 1
  guard_line="$(source_line_for_unique_statement_between \
    "$source_file" "$guard_literal" \
    "$guard_begin_line" "$guard_end_line")" || return 1
  [[ "$predecessor_line" -lt "$guard_begin_line" \
    && "$guard_begin_line" -lt "$guard_line" \
    && "$guard_line" -lt "$guard_end_line" \
    && "$(next_executable_line_after "$source_file" "$guard_end_line")" \
       == "$successor_literal" ]]
}

inject_executable_gap_after_literal() {
  local source_file="$1"
  local marker_literal="$2"
  local destination="$3"

  awk -v marker="$marker_literal" '
    { print }
    index($0, marker) { print "  : # injected TOCTOU gap" }
  ' "$source_file" >"$destination"
}

move_literal_after_literal() {
  local source_file="$1"
  local moved_literal="$2"
  local destination_literal="$3"
  local destination="$4"

  awk -v moved="$moved_literal" -v destination_marker="$destination_literal" '
    index($0, moved) {
      deferred = $0
      next
    }
    { print }
    index($0, destination_marker) && deferred != "" {
      print deferred
      deferred = ""
    }
    END {
      if (deferred != "") {
        print deferred
      }
    }
  ' "$source_file" >"$destination"
}

tmp="$(mktemp -d /tmp/pragas-prod-gate-unit.XXXXXX)"
cleanup() {
  chmod 700 "$tmp/backup-root/private-leaf" >/dev/null 2>&1 || true
  chmod -R u+w "$tmp" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

mkdir -p "$tmp/repository/nested" "$tmp/backup-root"

pragas_assert_supabase_cli_version "2.98.2" "2.98.2"
for mutated_cli_version in "2.109.1" "2.98.2 " ""; do
  if pragas_assert_supabase_cli_version \
      "2.98.2" "$mutated_cli_version" >/dev/null 2>&1; then
    echo "unreviewed Supabase CLI version was accepted" >&2
    exit 1
  fi
done

valid_secret_digest="$(printf 'a%.0s' {1..64})"
empty_secret_digest="$(printf '%s' '' | shasum -a 256 | awk '{print $1}')"
cat >"$tmp/secret-metadata-valid.json" <<JSON
[
  {
    "name": "EXPO_ACCESS_TOKEN",
    "updated_at": "2026-07-16T12:00:00Z",
    "value": "$valid_secret_digest"
  }
]
JSON
pragas_validate_required_secret_metadata \
  "$tmp/secret-metadata-valid.json" "EXPO_ACCESS_TOKEN" "$valid_secret_digest"
for secret_metadata_mutation in \
  missing duplicate malformed_digest empty_digest malformed_inventory digest_mismatch
do
  case "$secret_metadata_mutation" in
    missing)
      printf '%s\n' '[]' >"$tmp/secret-metadata-mutated.json"
      ;;
    duplicate)
      jq '.[1] = .[0]' "$tmp/secret-metadata-valid.json" \
        >"$tmp/secret-metadata-mutated.json"
      ;;
    malformed_digest)
      jq '.[0].value = "not-a-digest"' "$tmp/secret-metadata-valid.json" \
        >"$tmp/secret-metadata-mutated.json"
      ;;
    empty_digest)
      jq --arg digest "$empty_secret_digest" '.[0].value = $digest' \
        "$tmp/secret-metadata-valid.json" >"$tmp/secret-metadata-mutated.json"
      ;;
    malformed_inventory)
      printf '%s\n' '{"name":"EXPO_ACCESS_TOKEN"}' \
        >"$tmp/secret-metadata-mutated.json"
      ;;
    digest_mismatch)
      cp "$tmp/secret-metadata-valid.json" "$tmp/secret-metadata-mutated.json"
      ;;
  esac
  expected_secret_digest="$valid_secret_digest"
  if [[ "$secret_metadata_mutation" == "digest_mismatch" ]]; then
    expected_secret_digest="$(printf 'b%.0s' {1..64})"
  fi
  if pragas_validate_required_secret_metadata \
      "$tmp/secret-metadata-mutated.json" "EXPO_ACCESS_TOKEN" \
      "$expected_secret_digest" \
      >/dev/null 2>&1; then
    echo "mutated secret metadata was accepted: $secret_metadata_mutation" >&2
    exit 1
  fi
done

cat >"$tmp/physical-backups-valid.json" <<'JSON'
{
  "backups": [
    {
      "id": 1130516363,
      "inserted_at": "2026-07-16T10:35:53.454Z",
      "is_physical_backup": true,
      "status": "COMPLETED"
    },
    {
      "id": 1122343504,
      "inserted_at": "2026-07-15T10:38:35.282Z",
      "is_physical_backup": true,
      "status": "COMPLETED"
    }
  ],
  "physical_backup_data": {},
  "pitr_enabled": false,
  "region": "us-west-2",
  "walg_enabled": true
}
JSON
physical_now_epoch=1784200000
expected_physical_backup=$'1130516363\t2026-07-16T10:35:53.454Z\ttrue\tfalse'
if [[ "$(pragas_validate_physical_backup_inventory \
    "$tmp/physical-backups-valid.json" "$physical_now_epoch" 129600)" \
      != "$expected_physical_backup" ]]; then
  echo "recent completed physical backup was not selected" >&2
  exit 1
fi
for physical_mutation in stale walg_disabled no_completed malformed; do
  case "$physical_mutation" in
    stale)
      jq '.backups |= map(.inserted_at = "2026-07-10T10:35:53.000Z")' \
        "$tmp/physical-backups-valid.json" >"$tmp/physical-backups-mutated.json"
      ;;
    walg_disabled)
      jq '.walg_enabled = false' "$tmp/physical-backups-valid.json" \
        >"$tmp/physical-backups-mutated.json"
      ;;
    no_completed)
      jq '.backups |= map(.status = "PENDING")' \
        "$tmp/physical-backups-valid.json" >"$tmp/physical-backups-mutated.json"
      ;;
    malformed)
      printf '%s\n' '[]' >"$tmp/physical-backups-mutated.json"
      ;;
  esac
  if pragas_validate_physical_backup_inventory \
      "$tmp/physical-backups-mutated.json" "$physical_now_epoch" 129600 \
      >/dev/null 2>&1; then
    echo "mutated physical-backup evidence was accepted: $physical_mutation" >&2
    exit 1
  fi
done

cat >"$tmp/data-scope-valid.json" <<'JSON'
[
  {
    "data_scope_contract": {
      "data_relations": [
        {"schema":"auth","relation":"users","kind":"table"},
        {"schema":"auth","relation":"refresh_tokens_id_seq","kind":"sequence"},
        {"schema":"storage","relation":"objects","kind":"table"},
        {"schema":"public","relation":"analytics_events","kind":"table"},
        {"schema":"public","relation":"audit_log","kind":"table"},
        {"schema":"public","relation":"chat_usage","kind":"table"},
        {"schema":"public","relation":"pragas_profiles","kind":"table"},
        {"schema":"public","relation":"subscriptions","kind":"table"}
      ],
      "external_parent_relations": [],
      "partitioned_tables": [],
      "scoped_tables": [
        {"schema":"auth","table":"users"},
        {"schema":"storage","table":"objects"},
        {"schema":"public","table":"analytics_events"},
        {"schema":"public","table":"audit_log"},
        {"schema":"public","table":"chat_usage"},
        {"schema":"public","table":"pragas_profiles"},
        {"schema":"public","table":"subscriptions"}
      ]
    }
  }
]
JSON
pragas_validate_data_scope_contract "$tmp/data-scope-valid.json" \
  >"$tmp/data-scope-valid.manifest"
printf '%s\n' \
  $'auth\trefresh_tokens_id_seq\tsequence' \
  $'auth\tusers\ttable' \
  $'public\tanalytics_events\ttable' \
  $'public\taudit_log\ttable' \
  $'public\tchat_usage\ttable' \
  $'public\tpragas_profiles\ttable' \
  $'public\tsubscriptions\ttable' \
  $'storage\tobjects\ttable' >"$tmp/data-scope-wanted.manifest"
if ! cmp -s "$tmp/data-scope-valid.manifest" \
    "$tmp/data-scope-wanted.manifest"; then
  echo "logical data-scope manifest changed unexpectedly" >&2
  exit 1
fi
for data_scope_mutation in external_parent partitioned missing_required duplicate outside mismatch; do
  case "$data_scope_mutation" in
    external_parent)
      jq '.[0].data_scope_contract.external_parent_relations = [{schema:"public",table:"foreign_parent"}]' \
        "$tmp/data-scope-valid.json" >"$tmp/data-scope-mutated.json"
      ;;
    partitioned)
      jq '.[0].data_scope_contract.partitioned_tables = [{schema:"public",table:"pragas_partitioned"}]' \
        "$tmp/data-scope-valid.json" >"$tmp/data-scope-mutated.json"
      ;;
    missing_required)
      jq '.[0].data_scope_contract.scoped_tables |= map(select(.table != "audit_log")) | .[0].data_scope_contract.data_relations |= map(select(.relation != "audit_log"))' \
        "$tmp/data-scope-valid.json" >"$tmp/data-scope-mutated.json"
      ;;
    duplicate)
      jq '.[0].data_scope_contract.data_relations += [.[0].data_scope_contract.data_relations[0]]' \
        "$tmp/data-scope-valid.json" >"$tmp/data-scope-mutated.json"
      ;;
    outside)
      jq '.[0].data_scope_contract.scoped_tables += [{schema:"public",table:"vet_conf_fornecimentos"}] | .[0].data_scope_contract.data_relations += [{schema:"public",relation:"vet_conf_fornecimentos",kind:"table"}]' \
        "$tmp/data-scope-valid.json" >"$tmp/data-scope-mutated.json"
      ;;
    mismatch)
      jq '.[0].data_scope_contract.data_relations |= map(select(.relation != "pragas_profiles"))' \
        "$tmp/data-scope-valid.json" >"$tmp/data-scope-mutated.json"
      ;;
  esac
  if pragas_validate_data_scope_contract "$tmp/data-scope-mutated.json" \
      >/dev/null 2>&1; then
    echo "mutated logical data scope was accepted: $data_scope_mutation" >&2
    exit 1
  fi
done

mkdir -p "$tmp/source-tree/nested" "$tmp/source-snapshot-root"
printf '%s\n' 'reviewed source' >"$tmp/source-tree/index.ts"
printf '%s\n' 'reviewed dependency' >"$tmp/source-tree/nested/dependency.ts"
reviewed_source_hash="$(pragas_directory_hash "$tmp/source-tree")"
pragas_copy_verified_tree \
  "$tmp/source-tree" "$tmp/source-snapshot-root/source-tree" \
  "$reviewed_source_hash"
pragas_assert_owned_readonly_tree \
  "$tmp/source-snapshot-root/source-tree"
printf '%s\n' 'concurrent worktree mutation' >"$tmp/source-tree/index.ts"
if [[ "$(pragas_directory_hash "$tmp/source-snapshot-root/source-tree")" \
      != "$reviewed_source_hash" ]]; then
  echo "immutable source snapshot changed with the worktree" >&2
  exit 1
fi
chmod u+w "$tmp/source-snapshot-root/source-tree/index.ts"
printf '%s\n' 'snapshot mutation' \
  >"$tmp/source-snapshot-root/source-tree/index.ts"
if [[ "$(pragas_directory_hash "$tmp/source-snapshot-root/source-tree")" \
      == "$reviewed_source_hash" ]]; then
  echo "mutated source snapshot retained the reviewed hash" >&2
  exit 1
fi
if pragas_assert_owned_readonly_tree \
    "$tmp/source-snapshot-root/source-tree" >/dev/null 2>&1; then
  echo "writable source snapshot was accepted" >&2
  exit 1
fi
mkdir -p "$tmp/symlink-source"
ln -s "$tmp/source-tree/index.ts" "$tmp/symlink-source/index.ts"
if pragas_copy_verified_tree \
    "$tmp/symlink-source" "$tmp/source-snapshot-root/symlink-source" \
    "$reviewed_source_hash" >/dev/null 2>&1; then
  echo "symlinked source tree was accepted" >&2
  exit 1
fi

# The dollar-prefixed expressions are intentional literal source contracts.
# shellcheck disable=SC2016
clone_guard_contract=(
  'if ! run_shared_bootstrap_on_clone; then'
  'PRAGAS_CLONE_POST_BOOTSTRAP_SOURCE_RECHECK_BEGIN'
  'if ! assert_database_candidate_snapshot "before-clone-migration-loop"; then'
  'PRAGAS_CLONE_POST_BOOTSTRAP_SOURCE_RECHECK_END'
  'for version in "${TARGET_VERSIONS[@]}"; do'
)
# shellcheck disable=SC2016
edge_guard_contract=(
  '"before-edge-rollout"; then'
  'PRAGAS_EDGE_FINAL_SOURCE_RECHECK_BEGIN'
  'if ! assert_edge_candidate_snapshot "$slug"; then'
  'PRAGAS_EDGE_FINAL_SOURCE_RECHECK_END'
  'if ! supabase "${deploy_args[@]}" 2>"$deploy_debug_log"; then'
)
for guard_name in clone edge; do
  case "$guard_name" in
    clone)
      guard_contract=("${clone_guard_contract[@]}")
      ;;
    edge)
      guard_contract=("${edge_guard_contract[@]}")
      ;;
  esac
  if ! assert_guard_order_and_adjacency "$deploy_gate" \
      "${guard_contract[@]}"; then
    echo "production source guard ordering is invalid: $guard_name" >&2
    exit 1
  fi

  inject_executable_gap_after_literal "$deploy_gate" \
    "${guard_contract[3]}" "$tmp/$guard_name-gap.sh"
  if assert_guard_order_and_adjacency "$tmp/$guard_name-gap.sh" \
      "${guard_contract[@]}"; then
    echo "executable TOCTOU gap was accepted: $guard_name" >&2
    exit 1
  fi

  move_literal_after_literal "$deploy_gate" \
    "${guard_contract[0]}" "${guard_contract[3]}" \
    "$tmp/$guard_name-reordered.sh"
  if assert_guard_order_and_adjacency "$tmp/$guard_name-reordered.sh" \
      "${guard_contract[@]}"; then
    echo "reordered TOCTOU guard was accepted: $guard_name" >&2
    exit 1
  fi
done
pragas_run_with_timeout 2 sh -c 'exit 0'
if pragas_run_with_timeout 1 sh -c 'sleep 2' >/dev/null 2>&1; then
  echo "timed command overrun was accepted" >&2
  exit 1
fi

edge_target_ref="jxcnfyeemdltdfqtgbcl"
edge_test_slug="diagnose-pragas"
edge_local_hash="$(printf 'e%.0s' {1..64})"
cat >"$tmp/local-edge-update-debug.log" <<LOG
HTTP 2026/07/15 22:00:00 GET: https://api.supabase.com/v1/projects/$edge_target_ref/functions
HTTP 2026/07/15 22:00:01 PATCH: https://api.supabase.com/v1/projects/$edge_target_ref/functions/$edge_test_slug?entrypoint_path=file%3A%2F%2Findex.ts&ezbr_sha256=$edge_local_hash&verify_jwt=true
LOG
[[ "$(pragas_extract_local_edge_bundle_hash \
    "$tmp/local-edge-update-debug.log" "$edge_target_ref" "$edge_test_slug")" \
    == "$edge_local_hash" ]]
cat >"$tmp/local-edge-create-debug.log" <<LOG
HTTP 2026/07/15 22:00:02 POST: https://api.supabase.com/v1/projects/$edge_target_ref/functions?entrypoint_path=file%3A%2F%2Findex.ts&ezbr_sha256=$edge_local_hash&name=$edge_test_slug&slug=$edge_test_slug&verify_jwt=true
LOG
[[ "$(pragas_extract_local_edge_bundle_hash \
    "$tmp/local-edge-create-debug.log" "$edge_target_ref" "$edge_test_slug")" \
    == "$edge_local_hash" ]]

for local_bundle_mutation in \
  absent duplicate_url duplicate_hash wrong_slug malformed fallback_api put_method fake_output
do
  case "$local_bundle_mutation" in
    absent)
      printf '%s\n' \
        "HTTP 2026/07/15 22:00:03 GET: https://api.supabase.com/v1/projects/$edge_target_ref/functions" \
        >"$tmp/local-edge-mutated.log"
      ;;
    duplicate_url)
      cat "$tmp/local-edge-update-debug.log" \
        "$tmp/local-edge-update-debug.log" >"$tmp/local-edge-mutated.log"
      ;;
    duplicate_hash)
      printf '%s\n' \
        "HTTP 2026/07/15 22:00:04 PATCH: https://api.supabase.com/v1/projects/$edge_target_ref/functions/$edge_test_slug?ezbr_sha256=$edge_local_hash&ezbr_sha256=$edge_local_hash" \
        >"$tmp/local-edge-mutated.log"
      ;;
    wrong_slug)
      printf '%s\n' \
        "HTTP 2026/07/15 22:00:05 PATCH: https://api.supabase.com/v1/projects/$edge_target_ref/functions/other-slug?ezbr_sha256=$edge_local_hash" \
        >"$tmp/local-edge-mutated.log"
      ;;
    malformed)
      printf '%s\n' \
        "HTTP 2026/07/15 22:00:06 PATCH: https://api.supabase.com/v1/projects/$edge_target_ref/functions/$edge_test_slug?ezbr_sha256=abc" \
        >"$tmp/local-edge-mutated.log"
      ;;
    fallback_api)
      printf '%s\n' \
        "HTTP 2026/07/15 22:00:07 POST: https://api.supabase.com/v1/projects/$edge_target_ref/functions/deploy?slug=$edge_test_slug" \
        >"$tmp/local-edge-mutated.log"
      ;;
    put_method)
      printf '%s\n' \
        "HTTP 2026/07/15 22:00:08 PUT: https://api.supabase.com/v1/projects/$edge_target_ref/functions?ezbr_sha256=$edge_local_hash&slug=$edge_test_slug" \
        >"$tmp/local-edge-mutated.log"
      ;;
    fake_output)
      printf '%s\n' \
        "Bundler says ezbr_sha256=$edge_local_hash" \
        >"$tmp/local-edge-mutated.log"
      ;;
  esac
  if pragas_extract_local_edge_bundle_hash \
      "$tmp/local-edge-mutated.log" "$edge_target_ref" "$edge_test_slug" \
      >/dev/null 2>&1; then
    echo "mutated local Edge bundle identity was accepted: $local_bundle_mutation" >&2
    exit 1
  fi
done

valid_root_ca="$tmp/db-root-ca.pem"
openssl req -x509 -newkey rsa:2048 -sha256 -days 1 -nodes \
  -subj '/CN=Pragas Unit Root CA' \
  -keyout "$tmp/db-root-ca.key" -out "$valid_root_ca" \
  >/dev/null 2>&1
chmod 600 "$valid_root_ca"
[[ "$(pragas_validate_db_sslrootcert "$valid_root_ca")" \
    == "$valid_root_ca" ]]
mkdir "$tmp/stat-probe"
printf '%s\n' poison >"$tmp/stat-probe/%u"
printf '%s\n' poison >"$tmp/stat-probe/%Lp"
if [[ "$(cd "$tmp/stat-probe" && pragas_stat_uid "$valid_root_ca")" \
      != "$(id -u)" ]] \
    || [[ "$(cd "$tmp/stat-probe" && pragas_stat_mode "$valid_root_ca")" \
      != "600" ]]; then
  echo "stat portability probe leaked incompatible formatter output" >&2
  exit 1
fi
for rejected_root_ca in "" "$tmp/missing-root-ca.pem" "relative-ca.pem"; do
  if pragas_validate_db_sslrootcert "$rejected_root_ca" \
      >/dev/null 2>&1; then
    echo "missing/relative database TLS root CA was accepted" >&2
    exit 1
  fi
done
ln -s "$valid_root_ca" "$tmp/symlink-root-ca.pem"
if pragas_validate_db_sslrootcert "$tmp/symlink-root-ca.pem" \
    >/dev/null 2>&1; then
  echo "symlinked database TLS root CA was accepted" >&2
  exit 1
fi
cp "$valid_root_ca" "$tmp/writable-root-ca.pem"
chmod 666 "$tmp/writable-root-ca.pem"
if pragas_validate_db_sslrootcert "$tmp/writable-root-ca.pem" \
    >/dev/null 2>&1; then
  echo "group/world-writable database TLS root CA was accepted" >&2
  exit 1
fi
cp "$valid_root_ca" "$tmp/unreadable-root-ca.pem"
chmod 000 "$tmp/unreadable-root-ca.pem"
if pragas_validate_db_sslrootcert "$tmp/unreadable-root-ca.pem" \
    >/dev/null 2>&1; then
  echo "unreadable database TLS root CA was accepted" >&2
  exit 1
fi
printf '%s\n' 'not a PEM certificate' >"$tmp/invalid-root-ca.pem"
chmod 600 "$tmp/invalid-root-ca.pem"
if pragas_validate_db_sslrootcert "$tmp/invalid-root-ca.pem" \
    >/dev/null 2>&1; then
  echo "invalid database TLS root CA bundle was accepted" >&2
  exit 1
fi

pooler_ref="jxcnfyeemdltdfqtgbcl"
valid_pooler_url="postgresql://postgres.$pooler_ref@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"
expected_pooler_identity="aws-0-sa-east-1.pooler.supabase.com"
expected_pooler_identity+=$'\t6543\tpostgres.jxcnfyeemdltdfqtgbcl\tpostgres'
if [[ "$(pragas_parse_pooler_url "$valid_pooler_url" "$pooler_ref")" \
      != "$expected_pooler_identity" ]]; then
  echo "valid Supabase pooler identity was not parsed" >&2
  exit 1
fi
for rejected_pooler_url in \
  "postgresql://postgres.$pooler_ref:secret@aws-0-sa-east-1.pooler.supabase.com:6543/postgres" \
  "postgresql://postgres%2E$pooler_ref@aws-0-sa-east-1.pooler.supabase.com:6543/postgres" \
  "postgresql://postgres.$pooler_ref@evil.example:6543/postgres" \
  "postgresql://postgres.$pooler_ref@aws-0-sa-east-1.pooler.supabase.com:9999/postgres" \
  "postgresql://postgres.$pooler_ref@aws-0-sa-east-1.pooler.supabase.com:6543/other" \
  "postgresql://postgres.$pooler_ref@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=disable"
do
  if pragas_parse_pooler_url "$rejected_pooler_url" "$pooler_ref" \
      >/dev/null 2>&1; then
    echo "malformed/credential-bearing pooler URL was accepted" >&2
    exit 1
  fi
done

pgpass_file="$tmp/verified-backup.pgpass"
pgpass_password='raw%2Fpass:with\backslash'
pragas_write_private_pgpass \
  "$pgpass_file" "aws-0-sa-east-1.pooler.supabase.com" "6543" \
  "postgres" "postgres.$pooler_ref" "$pgpass_password"
[[ "$(pragas_stat_mode "$pgpass_file")" == "600" ]]
printf '%s\n' \
  'aws-0-sa-east-1.pooler.supabase.com:6543:postgres:postgres.jxcnfyeemdltdfqtgbcl:raw%2Fpass\:with\\backslash' \
  >"$tmp/expected.pgpass"
if ! cmp -s "$pgpass_file" "$tmp/expected.pgpass"; then
  echo "private pgpass escaping changed raw credentials" >&2
  exit 1
fi
if pragas_write_private_pgpass \
    "$tmp/newline.pgpass" "db.example" "5432" "postgres" "postgres" \
    $'line1\nline2' >/dev/null 2>&1; then
  echo "newline-bearing database credential was accepted" >&2
  exit 1
fi

pinned_image_digest="sha256:$(printf 'a%.0s' {1..64})"
pinned_image_ref="public.ecr.aws/supabase/postgres@$pinned_image_digest"
pinned_repo_digests="example.invalid/other@sha256:$(printf 'b%.0s' {1..64})"
pinned_repo_digests+=$'\n'
pinned_repo_digests+="$pinned_image_ref"
pragas_validate_pinned_image_metadata \
  "$pinned_image_ref" "$pinned_image_digest" \
  "$pinned_repo_digests" arm64
for pinned_image_mutation in wrong_digest missing_repo_digest unsupported_arch tagged_ref; do
  case "$pinned_image_mutation" in
    wrong_digest)
      mutation_ref="$pinned_image_ref"
      mutation_digest="sha256:$(printf 'c%.0s' {1..64})"
      mutation_repos="$pinned_repo_digests"
      mutation_arch="amd64"
      ;;
    missing_repo_digest)
      mutation_ref="$pinned_image_ref"
      mutation_digest="$pinned_image_digest"
      mutation_repos="example.invalid/other@sha256:$(printf 'b%.0s' {1..64})"
      mutation_arch="amd64"
      ;;
    unsupported_arch)
      mutation_ref="$pinned_image_ref"
      mutation_digest="$pinned_image_digest"
      mutation_repos="$pinned_repo_digests"
      mutation_arch="s390x"
      ;;
    tagged_ref)
      mutation_ref="public.ecr.aws/supabase/postgres:17.6"
      mutation_digest="$pinned_image_digest"
      mutation_repos="$pinned_repo_digests"
      mutation_arch="amd64"
      ;;
  esac
  if pragas_validate_pinned_image_metadata \
      "$mutation_ref" "$mutation_digest" "$mutation_repos" \
      "$mutation_arch" >/dev/null 2>&1; then
    echo "mutated OCI image identity was accepted: $pinned_image_mutation" >&2
    exit 1
  fi
done

if pragas_validate_backup_root "$tmp/repository" \
    "$tmp/repository/nested" >/dev/null 2>&1; then
  echo "repository-contained backup root was accepted" >&2
  exit 1
fi
validated_root="$(pragas_validate_backup_root \
  "$tmp/repository" "$tmp/backup-root")"
expected_root="$(cd "$tmp/backup-root" && pwd -P)"
[[ "$validated_root" == "$expected_root" ]]

private_leaf="$(pragas_create_private_backup_leaf \
  "$validated_root" "private-leaf")"
[[ "$(pragas_stat_uid "$private_leaf")" == "$(id -u)" ]]
[[ "$(pragas_stat_mode "$private_leaf")" == "700" ]]
chmod 755 "$private_leaf"
if pragas_assert_private_backup_leaf \
    "$validated_root" "$private_leaf" >/dev/null 2>&1; then
  echo "mutated backup leaf permissions were accepted" >&2
  exit 1
fi
chmod 700 "$private_leaf"
pragas_assert_private_backup_leaf "$validated_root" "$private_leaf" >/dev/null

cat >"$tmp/auth-data.sql" <<'SQL'
-- fixture
COPY "auth"."users" ("id", "email") FROM stdin;
1\tone@example.invalid
2\ttwo@example.invalid
\.
COPY "auth"."identities" ("id") FROM stdin;
\.
SQL
awk -v expected_schema=auth \
  -f "$repo_root/supabase/scripts/pragas-copy-row-manifest.awk" \
  "$tmp/auth-data.sql" | LC_ALL=C sort >"$tmp/expected.manifest"
printf '%s\n' 'auth|identities|0' 'auth|users|2' >"$tmp/wanted.manifest"
pragas_compare_row_manifests \
  "$tmp/wanted.manifest" "$tmp/expected.manifest"

cp "$tmp/expected.manifest" "$tmp/actual.manifest"
pragas_compare_row_manifests \
  "$tmp/expected.manifest" "$tmp/actual.manifest"
sed -i.bak '/auth|identities|0/d' "$tmp/actual.manifest"
if pragas_compare_row_manifests \
    "$tmp/expected.manifest" "$tmp/actual.manifest" >/dev/null 2>&1; then
  echo "missing restored table was accepted" >&2
  exit 1
fi
cp "$tmp/expected.manifest" "$tmp/actual.manifest"
printf '%s\n' 'auth|unexpected|0' >>"$tmp/actual.manifest"
if pragas_compare_row_manifests \
    "$tmp/expected.manifest" "$tmp/actual.manifest" >/dev/null 2>&1; then
  echo "extra restored table was accepted" >&2
  exit 1
fi
sed 's/auth|users|2/auth|users|3/' \
  "$tmp/expected.manifest" >"$tmp/actual.manifest"
if pragas_compare_row_manifests \
    "$tmp/expected.manifest" "$tmp/actual.manifest" >/dev/null 2>&1; then
  echo "restored row-count divergence was accepted" >&2
  exit 1
fi

cat >"$tmp/multi-schema-data.sql" <<'SQL'
COPY "auth"."users" ("id") FROM stdin;
1
\.
COPY "storage"."objects" ("id") FROM stdin;
10
\.
COPY "public"."pragas_profiles" ("id") FROM stdin;
1
\.
SQL
awk -v expected_schemas=auth,storage,public \
  -f "$repo_root/supabase/scripts/pragas-copy-row-manifest.awk" \
  "$tmp/multi-schema-data.sql" | LC_ALL=C sort \
  >"$tmp/multi-schema.manifest"
printf '%s\n' \
  'auth|users|1' \
  'public|pragas_profiles|1' \
  'storage|objects|1' >"$tmp/multi-schema-wanted.manifest"
pragas_compare_row_manifests \
  "$tmp/multi-schema-wanted.manifest" "$tmp/multi-schema.manifest"
sed '/^COPY "storage"/,/^\\[.]$/d' \
  "$tmp/multi-schema-data.sql" >"$tmp/temporal-split-data.sql"
if awk -v expected_schemas=auth,storage,public \
    -f "$repo_root/supabase/scripts/pragas-copy-row-manifest.awk" \
    "$tmp/temporal-split-data.sql" >/dev/null 2>&1; then
  echo "data artifact missing one schema snapshot was accepted" >&2
  exit 1
fi

cat >"$tmp/recheck.csv" <<'CSV'
profile_count,generated_profile_count,app_subscription_count,push_notification_count
82,82,0,0
CSV
[[ "$(pragas_parse_mutation_recheck_csv "$tmp/recheck.csv" 82 82)" \
   == "82|82|0|0" ]]
sed 's/app_subscription_count/subscriptions/' \
  "$tmp/recheck.csv" >"$tmp/recheck-mutated.csv"
if pragas_parse_mutation_recheck_csv \
    "$tmp/recheck-mutated.csv" 82 82 >/dev/null 2>&1; then
  echo "mutated immediate-recheck header was accepted" >&2
  exit 1
fi
sed 's/82,82,0,0/82,81,0,0/' \
  "$tmp/recheck.csv" >"$tmp/recheck-mutated.csv"
if pragas_parse_mutation_recheck_csv \
    "$tmp/recheck-mutated.csv" 82 82 >/dev/null 2>&1; then
  echo "mutated immediate-recheck values were accepted" >&2
  exit 1
fi
cat >"$tmp/recheck-mutated.csv" <<'CSV'
count
82
count
82
count
0
count
0
CSV
if pragas_parse_mutation_recheck_csv \
    "$tmp/recheck-mutated.csv" 82 82 >/dev/null 2>&1; then
  echo "legacy multi-statement immediate recheck was accepted" >&2
  exit 1
fi

target_slugs='["diagnose-pragas","pragas-send-push"]'
baseline_hash="$(printf 'a%.0s' {1..64})"
published_hash="$(printf 'b%.0s' {1..64})"
new_hash="$(printf 'c%.0s' {1..64})"
unexpected_hash="$(printf 'd%.0s' {1..64})"
cat >"$tmp/edge-baseline.json" <<JSON
[
  {
    "slug": "unrelated-function",
    "status": "ACTIVE",
    "version": 7,
    "verify_jwt": true,
    "ezbr_sha256": "$new_hash"
  },
  {
    "slug": "pragas-send-push",
    "status": "ACTIVE",
    "version": 18,
    "verify_jwt": true,
    "ezbr_sha256": "$baseline_hash"
  }
]
JSON
pragas_write_target_edge_inventory \
  "$tmp/edge-baseline.json" "$target_slugs" >"$tmp/edge-expected.json"
pragas_assert_target_edge_inventory \
  "$tmp/edge-expected.json" "$tmp/edge-baseline.json" "$target_slugs"

jq --arg hash "$new_hash" \
  '. + [{
    slug: "diagnose-pragas", status: "ACTIVE", version: 1,
    verify_jwt: true, ezbr_sha256: $hash
  }]' "$tmp/edge-baseline.json" >"$tmp/edge-raced.json"
if pragas_assert_target_edge_inventory \
    "$tmp/edge-expected.json" "$tmp/edge-raced.json" \
    "$target_slugs" >/dev/null 2>&1; then
  echo "concurrently created Edge Function was accepted" >&2
  exit 1
fi
jq 'map(if .slug == "pragas-send-push" then .version = 19 else . end)' \
  "$tmp/edge-baseline.json" >"$tmp/edge-raced.json"
if pragas_assert_target_edge_inventory \
    "$tmp/edge-expected.json" "$tmp/edge-raced.json" \
    "$target_slugs" >/dev/null 2>&1; then
  echo "concurrently versioned Edge Function was accepted" >&2
  exit 1
fi

jq --arg hash "$published_hash" \
  'map(if .slug == "pragas-send-push" then
    .version = 19 | .verify_jwt = false | .ezbr_sha256 = $hash
  else . end)' "$tmp/edge-baseline.json" >"$tmp/edge-after-existing.json"
pragas_write_target_edge_inventory \
  "$tmp/edge-after-existing.json" "$target_slugs" \
  >"$tmp/edge-after-existing-target.json"
pragas_assert_edge_deploy_transition \
  "$tmp/edge-expected.json" "$tmp/edge-after-existing-target.json" \
  "pragas-send-push" false "$published_hash"

for mutation in version hash status verify duplicate unrelated; do
  case "$mutation" in
    version)
      jq 'map(if .slug == "pragas-send-push" then .version = 20 else . end)' \
        "$tmp/edge-after-existing-target.json" >"$tmp/edge-mutated.json"
      ;;
    hash)
      jq --arg hash "$unexpected_hash" \
        'map(if .slug == "pragas-send-push" then .ezbr_sha256 = $hash else . end)' \
        "$tmp/edge-after-existing-target.json" >"$tmp/edge-mutated.json"
      ;;
    status)
      jq 'map(if .slug == "pragas-send-push" then .status = "FAILED" else . end)' \
        "$tmp/edge-after-existing-target.json" >"$tmp/edge-mutated.json"
      ;;
    verify)
      jq 'map(if .slug == "pragas-send-push" then .verify_jwt = true else . end)' \
        "$tmp/edge-after-existing-target.json" >"$tmp/edge-mutated.json"
      ;;
    duplicate)
      jq '. + [.[0]]' "$tmp/edge-after-existing-target.json" \
        >"$tmp/edge-mutated.json"
      ;;
    unrelated)
      jq --arg hash "$new_hash" \
        '. + [{
          slug: "diagnose-pragas", status: "ACTIVE", version: 1,
          verify_jwt: true, ezbr_sha256: $hash
        }]' "$tmp/edge-after-existing-target.json" >"$tmp/edge-mutated.json"
      ;;
  esac
  if pragas_assert_edge_deploy_transition \
      "$tmp/edge-expected.json" "$tmp/edge-mutated.json" \
      "pragas-send-push" false "$published_hash" >/dev/null 2>&1; then
    echo "mutated Edge deploy transition was accepted: $mutation" >&2
    exit 1
  fi
done

printf '%s\n' '[]' >"$tmp/edge-new-before.json"
cat >"$tmp/edge-new-after.json" <<JSON
[
  {
    "slug": "diagnose-pragas",
    "status": "ACTIVE",
    "version": 1,
    "verify_jwt": true,
    "ezbr_sha256": "$new_hash"
  }
]
JSON
pragas_assert_edge_deploy_transition \
  "$tmp/edge-new-before.json" "$tmp/edge-new-after.json" \
  "diagnose-pragas" true "$new_hash"
jq '.[0].version = 2' "$tmp/edge-new-after.json" \
  >"$tmp/edge-mutated.json"
if pragas_assert_edge_deploy_transition \
    "$tmp/edge-new-before.json" "$tmp/edge-mutated.json" \
    "diagnose-pragas" true "$new_hash" >/dev/null 2>&1; then
  echo "non-initial version for a newly created Edge Function was accepted" >&2
  exit 1
fi

echo "pragas prod-compat gate unit tests: PASS"
echo "cli_pin_mutations=3 physical_backup_mutations=4 data_scope_mutations=6 secret_metadata_mutations=6 stat_probe=poisoned-format-files tls_root_ca_mutations=7 pooler_mutations=6 pgpass_escaping=raw oci_identity_mutations=4 source_snapshot_mutations=4 toctou_order_mutations=4 timeout_overrun=blocked local_bundle_identity=create+update/8_mutations backup_boundary=pass manifest_mutations=5 multi_schema_snapshot=pass recheck_mutations=3 edge_races=2 edge_transition_mutations=7"
