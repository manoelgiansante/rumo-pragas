#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# The source path is anchored to the resolved repository.
# shellcheck disable=SC1091
source "$repo_root/supabase/scripts/pragas-prod-compat-lib.sh"

tmp="$(mktemp -d /tmp/pragas-prod-credential-storage.XXXXXX)"
cleanup() {
  chmod -R u+w "$tmp" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
umask 077

official_ca_url="https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt"
valid_root_ca="$tmp/fixture-root-ca.pem"
openssl req -x509 -newkey rsa:2048 -sha256 -days 1 -nodes \
  -subj '/CN=Pragas Pinned CA Unit Fixture' \
  -keyout "$tmp/fixture-root-ca.key" -out "$valid_root_ca" \
  >/dev/null 2>&1
chmod 600 "$valid_root_ca"
valid_root_ca_hash="$(shasum -a 256 "$valid_root_ca" | awk '{print $1}')"
pragas_validate_pinned_db_sslrootcert \
  "$valid_root_ca" "$valid_root_ca_hash" >/dev/null
if pragas_validate_pinned_db_sslrootcert \
    "$valid_root_ca" "$(printf 'f%.0s' {1..64})" >/dev/null 2>&1; then
  echo "database TLS root CA hash mismatch was accepted" >&2
  exit 1
fi

mock_curl="$tmp/mock-curl"
cat >"$mock_curl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

output_file=""
request_method="GET"
request_url=""
uses_stdin_config="false"
previous=""
: >"$MOCK_CURL_ARGV_LOG"
for argument in "$@"; do
  printf '%s\n' "$argument" >>"$MOCK_CURL_ARGV_LOG"
  if [[ "$previous" == "--output" ]]; then
    output_file="$argument"
  elif [[ "$previous" == "--request" ]]; then
    request_method="$argument"
  elif [[ "$previous" == "--config" && "$argument" == "-" ]]; then
    uses_stdin_config="true"
  fi
  if [[ "$argument" == https://* ]]; then
    request_url="$argument"
  fi
  previous="$argument"
done
if [[ "$uses_stdin_config" == "true" ]]; then
  IFS= read -r config_line
  if [[ "$config_line" != 'header = "Authorization: Bearer sbp_'*'"' ]]; then
    exit 71
  fi
  : >"$MOCK_CURL_CONFIG_OK"
fi
if [[ -z "$output_file" || -z "$request_url" ]]; then
  exit 72
fi
cp "$MOCK_CURL_FIXTURE" "$output_file"
printf '%s\t%s\t%s' \
  "${MOCK_CURL_HTTP_CODE:-200}" \
  "${MOCK_CURL_EFFECTIVE_URL:-$request_url}" \
  "${MOCK_CURL_REDIRECTS:-0}"
[[ "$request_method" == "GET" || "$request_method" == "POST" ]]
SH
chmod 700 "$mock_curl"

export MOCK_CURL_ARGV_LOG="$tmp/mock-curl-argv.log"
export MOCK_CURL_CONFIG_OK="$tmp/mock-curl-config-ok"
export MOCK_CURL_FIXTURE="$valid_root_ca"
export MOCK_CURL_HTTP_CODE=200
export MOCK_CURL_EFFECTIVE_URL="$official_ca_url"
export MOCK_CURL_REDIRECTS=0
installed_ca="$tmp/installed-root-ca.pem"
pragas_install_pinned_db_sslrootcert \
  "$installed_ca" "$official_ca_url" "$valid_root_ca_hash" \
  "$mock_curl" >/dev/null
[[ "$(pragas_stat_mode "$installed_ca")" == "400" ]]
[[ "$(shasum -a 256 "$installed_ca" | awk '{print $1}')" \
  == "$valid_root_ca_hash" ]]

export MOCK_CURL_EFFECTIVE_URL="https://unexpected.example/prod-ca-2021.crt"
if pragas_install_pinned_db_sslrootcert \
    "$tmp/redirected-root-ca.pem" "$official_ca_url" \
    "$valid_root_ca_hash" "$mock_curl" >/dev/null 2>&1; then
  echo "redirected database TLS root CA was accepted" >&2
  exit 1
fi
export MOCK_CURL_EFFECTIVE_URL="$official_ca_url"
if pragas_install_pinned_db_sslrootcert \
    "$tmp/hash-mismatch-root-ca.pem" "$official_ca_url" \
    "$(printf 'e%.0s' {1..64})" "$mock_curl" >/dev/null 2>&1; then
  echo "unpinned database TLS root CA content was accepted" >&2
  exit 1
fi
if pragas_install_pinned_db_sslrootcert \
    "$tmp/unexpected-origin-root-ca.pem" \
    "https://unexpected.example/prod-ca-2021.crt" \
    "$valid_root_ca_hash" "$mock_curl" >/dev/null 2>&1; then
  echo "unexpected database TLS root CA origin was accepted" >&2
  exit 1
fi

synthetic_access_token="sbp_$(printf 'a%.0s' {1..40})"
encoded_access_token="go-keyring-base64:$(
  printf '%s' "$synthetic_access_token" | /usr/bin/base64
)"
decoded_access_token=""
pragas_decode_go_keyring_secret \
  "$encoded_access_token" decoded_access_token
[[ "$decoded_access_token" == "$synthetic_access_token" ]]
hex_access_token="go-keyring-encoded:$(
  printf '%s' "$synthetic_access_token" | /usr/bin/xxd -p | tr -d '\n'
)"
decoded_access_token=""
pragas_decode_go_keyring_secret "$hex_access_token" decoded_access_token
[[ "$decoded_access_token" == "$synthetic_access_token" ]]
export SUPABASE_ACCESS_TOKEN="$synthetic_access_token"
loaded_access_token=""
pragas_load_supabase_access_token loaded_access_token
[[ "$loaded_access_token" == "$synthetic_access_token" ]]
unset SUPABASE_ACCESS_TOKEN

temp_role_response_fixture="$tmp/temp-role-fixture.json"
cat >"$temp_role_response_fixture" <<'JSON'
{
  "role": "cli_login_postgres_unit",
  "password": "synthetic-unit-password-123",
  "ttl_seconds": 1800
}
JSON
export MOCK_CURL_FIXTURE="$temp_role_response_fixture"
export MOCK_CURL_HTTP_CODE=201
export MOCK_CURL_EFFECTIVE_URL="https://api.supabase.com/v1/projects/jxcnfyeemdltdfqtgbcl/cli/login-role"
rm -f "$MOCK_CURL_CONFIG_OK"
temp_role_response="$tmp/temp-role-response.json"
pragas_call_supabase_cli_login_role_api \
  POST jxcnfyeemdltdfqtgbcl "$synthetic_access_token" \
  "$temp_role_response" "$mock_curl"
[[ -f "$MOCK_CURL_CONFIG_OK" ]]
if rg -Fq "$synthetic_access_token" "$MOCK_CURL_ARGV_LOG"; then
  echo "Supabase access token leaked into curl arguments" >&2
  exit 1
fi
parsed_role=""
parsed_password=""
parsed_ttl=""
pragas_parse_supabase_temp_login_role \
  "$temp_role_response" 300 3600 \
  parsed_role parsed_password parsed_ttl
[[ "$parsed_role" == "cli_login_postgres_unit" ]]
[[ "$parsed_password" == "synthetic-unit-password-123" ]]
[[ "$parsed_ttl" == "1800" ]]
[[ "$(pragas_build_temp_pooler_username \
  "$parsed_role" jxcnfyeemdltdfqtgbcl)" \
  == "cli_login_postgres_unit.jxcnfyeemdltdfqtgbcl" ]]
pragas_assert_temp_login_role_fresh 2000 120 1000
if pragas_assert_temp_login_role_fresh 1100 120 1000 \
    >/dev/null 2>&1; then
  echo "nearly expired Supabase temporary login role was accepted" >&2
  exit 1
fi

for response_mutation in extra_key wrong_role short_password short_ttl long_ttl; do
  case "$response_mutation" in
    extra_key)
      jq '.unexpected = true' "$temp_role_response_fixture" \
        >"$tmp/temp-role-mutated.json"
      ;;
    wrong_role)
      jq '.role = "postgres"' "$temp_role_response_fixture" \
        >"$tmp/temp-role-mutated.json"
      ;;
    short_password)
      jq '.password = "short"' "$temp_role_response_fixture" \
        >"$tmp/temp-role-mutated.json"
      ;;
    short_ttl)
      jq '.ttl_seconds = 299' "$temp_role_response_fixture" \
        >"$tmp/temp-role-mutated.json"
      ;;
    long_ttl)
      jq '.ttl_seconds = 3601' "$temp_role_response_fixture" \
        >"$tmp/temp-role-mutated.json"
      ;;
  esac
  chmod 600 "$tmp/temp-role-mutated.json"
  if pragas_parse_supabase_temp_login_role \
      "$tmp/temp-role-mutated.json" 300 3600 \
      parsed_role parsed_password parsed_ttl >/dev/null 2>&1; then
    echo "mutated Supabase temporary role was accepted: $response_mutation" >&2
    exit 1
  fi
done

unsupported_response="$tmp/unsupported-method-response.json"
if pragas_call_supabase_cli_login_role_api \
    PATCH jxcnfyeemdltdfqtgbcl "$synthetic_access_token" \
    "$unsupported_response" "$mock_curl" >/dev/null 2>&1; then
  echo "unsupported Supabase CLI login-role method was accepted" >&2
  exit 1
fi
[[ ! -e "$unsupported_response" ]]

pragas_validate_backup_encryption_metadata \
  "/Volumes/RumoPragasProdBackup/backups" \
  "/Volumes/RumoPragasProdBackup" "/dev/disk9s1" false true
pragas_validate_backup_encryption_metadata \
  "/Users/manoelnascimento/backups" \
  "/System/Volumes/Data" "/dev/disk3s5" true true
for encryption_mutation in common_without_filevault dedicated_unencrypted escaped malformed; do
  case "$encryption_mutation" in
    common_without_filevault)
      encryption_args=(
        "/private/tmp/backups" "/System/Volumes/Data"
        "/dev/disk3s5" false true
      )
      ;;
    dedicated_unencrypted)
      encryption_args=(
        "/Volumes/RumoPragasProdBackup/backups"
        "/Volumes/RumoPragasProdBackup" "/dev/disk9s1" false false
      )
      ;;
    escaped)
      encryption_args=(
        "/private/tmp/backups" "/Volumes/RumoPragasProdBackup"
        "/dev/disk9s1" false true
      )
      ;;
    malformed)
      encryption_args=(
        "/Volumes/RumoPragasProdBackup/backups"
        "/Volumes/RumoPragasProdBackup" "disk9s1" false true
      )
      ;;
  esac
  if pragas_validate_backup_encryption_metadata \
      "${encryption_args[@]}" >/dev/null 2>&1; then
    echo "mutated backup encryption metadata was accepted: $encryption_mutation" >&2
    exit 1
  fi
done

current_uid="$(id -u)"
encrypted_sparsebundle_path="$tmp/RumoPragasProdBackup.sparsebundle"
encrypted_disk_image_fixture="$(
  jq -nc \
    --arg image_path "$encrypted_sparsebundle_path" \
    --argjson owner_uid "$current_uid" '
      {
        images: [
          {
            "image-encrypted": true,
            "image-path": $image_path,
            "image-type": "sparse bundle disk image",
            "owner-uid": $owner_uid,
            writeable: true,
            "system-entities": [
              {"dev-entry": "/dev/disk9"},
              {
                "dev-entry": "/dev/disk9s1",
                "mount-point": "/Volumes/RumoPragasProdBackup"
              }
            ]
          }
        ]
      }
    '
)"
[[ "$(pragas_validate_encrypted_disk_image_metadata \
  "$encrypted_disk_image_fixture" \
  /Volumes/RumoPragasProdBackup /dev/disk9s1 "$current_uid")" \
  == "$encrypted_sparsebundle_path" ]]
for disk_image_mutation in unencrypted foreign_owner readonly wrong_type \
  wrong_entity duplicate ambiguous_shape; do
  case "$disk_image_mutation" in
    unencrypted)
      mutated_disk_image="$(jq '.images[0]."image-encrypted" = false' \
        <<<"$encrypted_disk_image_fixture")"
      ;;
    foreign_owner)
      mutated_disk_image="$(jq '.images[0]."owner-uid" += 1' \
        <<<"$encrypted_disk_image_fixture")"
      ;;
    readonly)
      mutated_disk_image="$(jq '.images[0].writeable = false' \
        <<<"$encrypted_disk_image_fixture")"
      ;;
    wrong_type)
      mutated_disk_image="$(jq \
        '.images[0]."image-type" = "read/write disk image"' \
        <<<"$encrypted_disk_image_fixture")"
      ;;
    wrong_entity)
      mutated_disk_image="$(jq \
        '.images[0]."system-entities"[1]."dev-entry" = "/dev/disk8s1"' \
        <<<"$encrypted_disk_image_fixture")"
      ;;
    duplicate)
      mutated_disk_image="$(jq \
        '.images[0]."system-entities" += [.images[0]."system-entities"[1]]' \
        <<<"$encrypted_disk_image_fixture")"
      ;;
    ambiguous_shape)
      mutated_disk_image="$(jq '.images += [.images[0]]' \
        <<<"$encrypted_disk_image_fixture")"
      ;;
  esac
  if pragas_validate_encrypted_disk_image_metadata \
      "$mutated_disk_image" \
      /Volumes/RumoPragasProdBackup /dev/disk9s1 "$current_uid" \
      >/dev/null 2>&1; then
    echo "mutated encrypted disk-image metadata was accepted: $disk_image_mutation" >&2
    exit 1
  fi
done
if pragas_assert_encrypted_backup_root "$tmp" >/dev/null 2>&1; then
  echo "ordinary temporary directory was accepted for production backup" >&2
  exit 1
fi

echo "pragas prod-compat credential/storage unit tests: PASS"
echo "ca_pin_mutations=4 api_calls=mocked token_argv_leaks=0 temp_role_mutations=5 temp_role_ttl=bounded global_delete=blocked encryption_mutations=4 disk_image_mutations=7 ordinary_directory=rejected"
