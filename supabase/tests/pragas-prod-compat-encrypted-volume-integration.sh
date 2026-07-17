#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# The source path is anchored to the resolved repository.
# shellcheck disable=SC1091
source "$repo_root/supabase/scripts/pragas-prod-compat-lib.sh"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "pragas encrypted-volume integration: SKIP (macOS hdiutil required)"
  exit 0
fi
for dependency in /usr/bin/hdiutil /usr/bin/plutil /usr/sbin/diskutil jq; do
  if [[ "$dependency" == /* ]]; then
    [[ -x "$dependency" ]] || {
      echo "missing encrypted-volume integration dependency: $dependency" >&2
      exit 1
    }
  elif ! command -v "$dependency" >/dev/null 2>&1; then
    echo "missing encrypted-volume integration dependency: $dependency" >&2
    exit 1
  fi
done

# Use the canonical macOS path. /tmp is a system symlink to /private/tmp, and
# the production gate intentionally rejects disk-image paths through symlinks.
tmp="$(mktemp -d /private/tmp/pragas-encrypted-volume-integration.XXXXXX)"
volume_name="PragasGateEncrypted-${RANDOM}-$$"
bundle="$tmp/${volume_name}.sparsebundle"
mount_point=""
# Synthetic and process-local. It never authenticates a user, service or
# production resource and is sent only over hdiutil stdin.
synthetic_passphrase="pragas-integration-only-${RANDOM}-${RANDOM}-aes256"

cleanup() {
  local exit_status=$?

  set +e
  if [[ -n "$mount_point" && -d "$mount_point" ]]; then
    /usr/bin/hdiutil detach "$mount_point" -force >/dev/null 2>&1
  fi
  synthetic_passphrase=""
  chmod -R u+w "$tmp" >/dev/null 2>&1 || true
  rm -rf "$tmp"
  return "$exit_status"
}
trap cleanup EXIT
umask 077

printf '%s' "$synthetic_passphrase" \
  | /usr/bin/hdiutil create -quiet -size 64m -type SPARSEBUNDLE \
      -fs APFS -volname "$volume_name" -encryption AES-256 \
      -stdinpass "$bundle"
chmod 700 "$bundle"

attach_plist="$(
  printf '%s' "$synthetic_passphrase" \
    | /usr/bin/hdiutil attach -plist -nobrowse -stdinpass "$bundle"
)"
mount_point="$(
  printf '%s' "$attach_plist" \
    | /usr/bin/plutil -convert json -o - - \
    | jq -er '
        [
          ."system-entities"[]?
          | ."mount-point"?
          | select(type == "string" and startswith("/Volumes/"))
        ]
        | if length == 1 then .[0] else error("ambiguous mount") end
      '
)"
if [[ "$mount_point" != "/Volumes/$volume_name" ]]; then
  echo "encrypted sparse bundle mounted at an unexpected path" >&2
  exit 1
fi

backup_root="$mount_point/backups"
mkdir -m 700 "$backup_root"
expected_root="$(cd "$backup_root" && pwd -P)"
actual_root="$(pragas_assert_encrypted_backup_root "$backup_root")"
if [[ "$actual_root" != "$expected_root" ]]; then
  echo "encrypted sparse-bundle backup root changed identity" >&2
  exit 1
fi
if pragas_assert_encrypted_backup_root "$tmp" >/dev/null 2>&1; then
  echo "ordinary unencrypted directory passed the live encryption gate" >&2
  exit 1
fi
/usr/bin/hdiutil detach "$mount_point" >/dev/null
if pragas_assert_encrypted_backup_root "$backup_root" >/dev/null 2>&1; then
  echo "detached encrypted volume passed the live encryption gate" >&2
  exit 1
fi
mount_point=""

echo "pragas encrypted-volume integration: PASS"
echo "fixture=synthetic_aes256_sparsebundle mount_verified=true ordinary_directory=rejected detached_volume=rejected"
