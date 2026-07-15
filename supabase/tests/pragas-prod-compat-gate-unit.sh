#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091 -- path is anchored to the resolved repository.
source "$repo_root/supabase/scripts/pragas-prod-compat-lib.sh"

tmp="$(mktemp -d /tmp/pragas-prod-gate-unit.XXXXXX)"
cleanup() {
  chmod 700 "$tmp/backup-root/private-leaf" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

mkdir -p "$tmp/repository/nested" "$tmp/backup-root"

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

echo "pragas prod-compat gate unit tests: PASS"
echo "backup_boundary=pass manifest_mutations=3 recheck_mutations=3"
