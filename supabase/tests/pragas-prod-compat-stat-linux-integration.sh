#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# The source path is anchored to the resolved repository.
# shellcheck disable=SC1091
source "$repo_root/supabase/scripts/pragas-prod-compat-lib.sh"

readonly linux_image="postgres@sha256:4f736ae292687621d4dbe0d499ffd024a36bd2ee7d8ca6f2ccd4c800f047b394"
readonly linux_image_digest="sha256:4f736ae292687621d4dbe0d499ffd024a36bd2ee7d8ca6f2ccd4c800f047b394"

if ! docker image inspect "$linux_image" >/dev/null 2>&1; then
  docker pull "$linux_image" >/dev/null
fi
if ! pragas_assert_pinned_docker_image \
    "$linux_image" "$linux_image_digest" >/dev/null 2>&1; then
  echo "pinned Debian portability image identity mismatch" >&2
  exit 1
fi

docker run --rm -i --pull never --read-only --network none \
  --cap-drop ALL --security-opt no-new-privileges \
  --user 1001:1001 \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m,mode=1777 \
  --mount "type=bind,source=$repo_root/supabase/scripts/pragas-prod-compat-lib.sh,target=/opt/pragas-prod-compat-lib.sh,readonly" \
  --entrypoint /bin/bash "$linux_image" -s <<'LINUX'
set -euo pipefail
# shellcheck disable=SC1091
source /opt/pragas-prod-compat-lib.sh

tmp="$(mktemp -d /tmp/pragas-stat-linux.XXXXXX)"
cleanup() {
  chmod -R u+w "$tmp" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
cd "$tmp"

if [[ "$(id -u)" != "1001" ]]; then
  echo "Linux portability test did not run as uid 1001" >&2
  exit 1
fi
printf '%s\n' poison >'%u'
printf '%s\n' poison >'%Lp'
openssl req -x509 -newkey rsa:2048 -sha256 -days 1 -nodes \
  -subj '/CN=Pragas Linux Stat Test CA' \
  -keyout root-ca.key -out root-ca.pem >/dev/null 2>&1
chmod 600 root-ca.pem
root_ca="$tmp/root-ca.pem"
if [[ "$(pragas_stat_uid "$root_ca")" != "1001" \
      || "$(pragas_stat_mode "$root_ca")" != "600" \
      || "$(pragas_validate_db_sslrootcert "$root_ca")" != "$root_ca" ]]; then
  echo "GNU stat uid/mode or CA validation contract failed" >&2
  exit 1
fi

ln -s root-ca.pem symlink-ca.pem
if pragas_validate_db_sslrootcert "$tmp/symlink-ca.pem" \
    >/dev/null 2>&1; then
  echo "Linux CA validation accepted a symlink" >&2
  exit 1
fi
cp root-ca.pem writable-ca.pem
chmod 666 writable-ca.pem
if pragas_validate_db_sslrootcert "$tmp/writable-ca.pem" \
    >/dev/null 2>&1; then
  echo "Linux CA validation accepted unsafe permissions" >&2
  exit 1
fi
cp root-ca.pem unreadable-ca.pem
chmod 000 unreadable-ca.pem
if pragas_validate_db_sslrootcert "$tmp/unreadable-ca.pem" \
    >/dev/null 2>&1; then
  echo "Linux CA validation accepted an unreadable file" >&2
  exit 1
fi
printf '%s\n' invalid >invalid-ca.pem
chmod 600 invalid-ca.pem
if pragas_validate_db_sslrootcert "$tmp/invalid-ca.pem" \
    >/dev/null 2>&1; then
  echo "Linux CA validation accepted invalid PEM" >&2
  exit 1
fi

pgpass="$tmp/pgpass"
pragas_write_private_pgpass \
  "$pgpass" db.example 5432 postgres postgres 'raw:pass\word'
if [[ "$(pragas_stat_uid "$pgpass")" != "1001" \
      || "$(pragas_stat_mode "$pgpass")" != "600" ]]; then
  echo "GNU stat pgpass ownership/mode contract failed" >&2
  exit 1
fi
printf '%s\n' 'db.example:5432:postgres:postgres:raw\:pass\\word' \
  >expected.pgpass
if ! cmp -s "$pgpass" expected.pgpass; then
  echo "Linux pgpass escaping contract failed" >&2
  exit 1
fi
ln -s pgpass symlink.pgpass
if pragas_write_private_pgpass \
    "$tmp/symlink.pgpass" db.example 5432 postgres postgres raw \
    >/dev/null 2>&1; then
  echo "Linux pgpass validation accepted a symlink destination" >&2
  exit 1
fi

echo "pragas GNU stat portability integration: PASS"
echo "linux=debian uid=1001 ca_mode=600 pgpass_mode=600 poison_files=%u+%Lp"
LINUX
