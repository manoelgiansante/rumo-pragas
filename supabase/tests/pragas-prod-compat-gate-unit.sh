#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# The source path is anchored to the resolved repository.
# shellcheck disable=SC1091
source "$repo_root/supabase/scripts/pragas-prod-compat-lib.sh"

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

mkdir -p "$tmp/source-tree/nested" "$tmp/source-snapshot-root"
printf '%s\n' 'reviewed source' >"$tmp/source-tree/index.ts"
printf '%s\n' 'reviewed dependency' >"$tmp/source-tree/nested/dependency.ts"
reviewed_source_hash="$(pragas_directory_hash "$tmp/source-tree")"
pragas_copy_verified_tree \
  "$tmp/source-tree" "$tmp/source-snapshot-root/source-tree" \
  "$reviewed_source_hash"
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
mkdir -p "$tmp/symlink-source"
ln -s "$tmp/source-tree/index.ts" "$tmp/symlink-source/index.ts"
if pragas_copy_verified_tree \
    "$tmp/symlink-source" "$tmp/source-snapshot-root/symlink-source" \
    "$reviewed_source_hash" >/dev/null 2>&1; then
  echo "symlinked source tree was accepted" >&2
  exit 1
fi
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
echo "cli_pin_mutations=3 tls_root_ca_mutations=7 pooler_mutations=6 pgpass_escaping=raw oci_identity_mutations=4 source_snapshot_mutations=3 timeout_overrun=blocked local_bundle_identity=create+update/8_mutations backup_boundary=pass manifest_mutations=5 multi_schema_snapshot=pass recheck_mutations=3 edge_races=2 edge_transition_mutations=7"
