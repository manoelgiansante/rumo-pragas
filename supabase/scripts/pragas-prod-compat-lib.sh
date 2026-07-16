#!/usr/bin/env bash

# Shared, side-effect-free validation helpers for the production compatibility
# gate. The caller owns shell options and cleanup.

pragas_stat_uid() {
  local target="${1:-}"
  local value

  [[ -n "$target" ]] || return 1
  if value="$(stat -f '%u' "$target" 2>/dev/null)" \
      && [[ "$value" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$value"
    return 0
  fi
  if value="$(stat -c '%u' -- "$target" 2>/dev/null)" \
      && [[ "$value" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$value"
    return 0
  fi
  return 1
}

pragas_stat_mode() {
  local target="${1:-}"
  local value

  [[ -n "$target" ]] || return 1
  if value="$(stat -f '%Lp' "$target" 2>/dev/null)" \
      && [[ "$value" =~ ^[0-7]{3,4}$ ]]; then
    printf '%s\n' "$value"
    return 0
  fi
  if value="$(stat -c '%a' -- "$target" 2>/dev/null)" \
      && [[ "$value" =~ ^[0-7]{3,4}$ ]]; then
    printf '%s\n' "$value"
    return 0
  fi
  return 1
}

pragas_validate_db_sslrootcert() {
  local candidate="${1:-}"
  local owner_uid
  local mode
  local mode_value

  if [[ -z "$candidate" || "$candidate" != /* || ! -f "$candidate" \
        || -L "$candidate" || ! -r "$candidate" ]]; then
    echo "database TLS root CA must be an absolute readable regular file" >&2
    return 1
  fi
  owner_uid="$(pragas_stat_uid "$candidate")" || return 1
  mode="$(pragas_stat_mode "$candidate")" || return 1
  if [[ "$owner_uid" != "0" && "$owner_uid" != "$(id -u)" ]]; then
    echo "database TLS root CA has an untrusted owner" >&2
    return 1
  fi
  if [[ ! "$mode" =~ ^[0-7]{3,4}$ ]]; then
    echo "database TLS root CA permissions are malformed" >&2
    return 1
  fi
  mode_value=$((8#$mode))
  if (( (mode_value & 0022) != 0 )); then
    echo "database TLS root CA must not be group/world writable" >&2
    return 1
  fi
  if ! command -v openssl >/dev/null 2>&1 \
      || ! openssl x509 -in "$candidate" -noout >/dev/null 2>&1; then
    echo "database TLS root CA is not a valid PEM certificate bundle" >&2
    return 1
  fi

  printf '%s\n' "$candidate"
}

pragas_parse_pooler_url() {
  local pooler_url="${1:-}"
  local target_ref="${2:-}"
  local authority
  local userinfo
  local endpoint
  local host_port
  local host
  local port
  local database

  if [[ ! "$target_ref" =~ ^[a-z0-9]{20}$ \
        || "$pooler_url" != postgresql://* \
        || "$pooler_url" == *$'\n'* || "$pooler_url" == *$'\r'* ]]; then
    echo "Supabase pooler identity is malformed" >&2
    return 1
  fi
  authority="${pooler_url#postgresql://}"
  if [[ "$authority" != *@* || "${authority#*@}" == *@* ]]; then
    echo "Supabase pooler authority is malformed" >&2
    return 1
  fi
  userinfo="${authority%%@*}"
  endpoint="${authority#*@}"
  # Credentials in the URL, including percent-encoded userinfo, are rejected.
  # The database password is accepted only as a raw secret and escaped into a
  # private pgpass file by pragas_write_private_pgpass.
  if [[ "$userinfo" != "postgres.$target_ref" || "$userinfo" == *%* \
        || "$userinfo" == *:* || "$endpoint" != */* ]]; then
    echo "Supabase pooler user identity is malformed" >&2
    return 1
  fi
  host_port="${endpoint%%/*}"
  database="${endpoint#*/}"
  host="${host_port%:*}"
  port="${host_port##*:}"
  if [[ ! "$host" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?[.]pooler[.]supabase[.]com$ \
        || ( "$port" != "5432" && "$port" != "6543" ) \
        || "$database" != "postgres" ]]; then
    echo "Supabase pooler endpoint is malformed" >&2
    return 1
  fi

  printf '%s\t%s\t%s\t%s\n' \
    "$host" "$port" "$userinfo" "$database"
}

pragas_write_private_pgpass() {
  local destination="${1:-}"
  local host="${2:-}"
  local port="${3:-}"
  local database="${4:-}"
  local username="${5:-}"
  local password="${6:-}"
  local escaped_password

  if [[ -z "$destination" || -e "$destination" || -L "$destination" \
        || ! "$host" =~ ^[A-Za-z0-9.-]+$ \
        || ! "$port" =~ ^[0-9]+$ \
        || ! "$database" =~ ^[A-Za-z0-9_.-]+$ \
        || ! "$username" =~ ^[A-Za-z0-9_.-]+$ \
        || -z "$password" || "$password" == *$'\n'* \
        || "$password" == *$'\r'* ]]; then
    echo "private database credential request is malformed" >&2
    return 1
  fi
  escaped_password="${password//\\/\\\\}"
  escaped_password="${escaped_password//:/\\:}"
  (
    umask 077
    printf '%s:%s:%s:%s:%s\n' \
      "$host" "$port" "$database" "$username" "$escaped_password" \
      >"$destination"
  ) || return 1
  chmod 600 "$destination" || return 1
  [[ -f "$destination" && ! -L "$destination" \
    && "$(pragas_stat_uid "$destination")" == "$(id -u)" \
    && "$(pragas_stat_mode "$destination")" == "600" ]]
}

pragas_validate_pinned_image_metadata() {
  local image_ref="${1:-}"
  local expected_digest="${2:-}"
  local repo_digests="${3:-}"
  local architecture="${4:-}"
  local matched="false"
  local repo_digest

  if [[ ! "$image_ref" =~ ^[a-z0-9./_-]+@sha256:[0-9a-f]{64}$ \
        || ! "$expected_digest" =~ ^sha256:[0-9a-f]{64}$ \
        || "${image_ref##*@}" != "$expected_digest" \
        || ( "$architecture" != "amd64" && "$architecture" != "arm64" ) ]]; then
    echo "pinned container image metadata is malformed" >&2
    return 1
  fi
  while IFS= read -r repo_digest; do
    if [[ "$repo_digest" == "$image_ref" ]]; then
      matched="true"
      break
    fi
  done <<<"$repo_digests"
  if [[ "$matched" != "true" ]]; then
    echo "pinned container image digest is absent" >&2
    return 1
  fi
}

pragas_assert_pinned_docker_image() {
  local image_ref="${1:-}"
  local expected_digest="${2:-}"
  local repo_digests
  local architecture

  if ! repo_digests="$(docker image inspect "$image_ref" \
      --format '{{range .RepoDigests}}{{println .}}{{end}}' 2>/dev/null)" \
      || ! architecture="$(docker image inspect "$image_ref" \
        --format '{{.Architecture}}' 2>/dev/null)"; then
    echo "pinned container image is unavailable" >&2
    return 1
  fi
  pragas_validate_pinned_image_metadata \
    "$image_ref" "$expected_digest" "$repo_digests" "$architecture"
}

pragas_run_pinned_pg_backup() {
  local image_ref="${1:-}"
  local image_digest="${2:-}"
  local tool="${3:-}"
  local root_ca="${4:-}"
  local pgpass_file="${5:-}"
  local host="${6:-}"
  local port="${7:-}"
  local username="${8:-}"
  local database="${9:-}"
  local network="${10:-}"
  shift 10 || return 1

  if [[ ! "$image_ref" =~ ^public[.]ecr[.]aws/supabase/postgres@sha256:[0-9a-f]{64}$ \
        || ! "$image_digest" =~ ^sha256:[0-9a-f]{64}$ \
        || ( "$tool" != "pg_dump" && "$tool" != "pg_dumpall" ) \
        || ! -f "$root_ca" || -L "$root_ca" \
        || ! -f "$pgpass_file" || -L "$pgpass_file" \
        || "$(pragas_stat_uid "$root_ca")" != "$(id -u)" \
        || "$(pragas_stat_mode "$root_ca")" != "400" \
        || "$(pragas_stat_uid "$pgpass_file")" != "$(id -u)" \
        || "$(pragas_stat_mode "$pgpass_file")" != "600" \
        || ! "$host" =~ ^[A-Za-z0-9.-]+$ \
        || ! "$port" =~ ^[0-9]+$ \
        || ! "$username" =~ ^[A-Za-z0-9_.-]+$ \
        || ! "$database" =~ ^[A-Za-z0-9_.-]+$ \
        || ! "$network" =~ ^[A-Za-z0-9_.-]+$ ]]; then
    echo "verified PostgreSQL backup request is malformed" >&2
    return 1
  fi
  if ! pragas_assert_pinned_docker_image \
      "$image_ref" "$image_digest" >/dev/null 2>&1; then
    echo "reviewed PostgreSQL backup image is missing or changed" >&2
    return 1
  fi

  env -u SUPABASE_DB_PASSWORD docker run --rm --pull never --read-only \
    --cap-drop ALL --security-opt no-new-privileges \
    --user "$(id -u):$(id -g)" \
    --network "$network" \
    --mount "type=bind,source=$root_ca,target=/run/pragas/root-ca.pem,readonly" \
    --mount "type=bind,source=$pgpass_file,target=/run/pragas/pgpass,readonly" \
    --env "PGHOST=$host" \
    --env "PGPORT=$port" \
    --env "PGUSER=$username" \
    --env "PGDATABASE=$database" \
    --env "PGSSLMODE=verify-full" \
    --env "PGSSLROOTCERT=/run/pragas/root-ca.pem" \
    --env "PGPASSFILE=/run/pragas/pgpass" \
    --env "PGAPPNAME=rumo-pragas-prod-compat-backup" \
    --entrypoint "$tool" "$image_ref" "$@"
}

pragas_assert_supabase_cli_version() {
  local expected_version="$1"
  local actual_version="$2"

  if [[ ! "$expected_version" =~ ^[0-9]+[.][0-9]+[.][0-9]+$ \
        || "$actual_version" != "$expected_version" ]]; then
    echo "Supabase CLI version mismatch: expected $expected_version, got ${actual_version:-empty}" >&2
    return 1
  fi
}

pragas_directory_hash() {
  local directory="$1"
  local unsafe_entry

  if [[ ! -d "$directory" || -L "$directory" ]]; then
    echo "source tree must be a real directory: $directory" >&2
    return 1
  fi
  unsafe_entry="$(find "$directory" -mindepth 1 \
    \( -type l -o \( ! -type f ! -type d \) \) -print -quit)"
  if [[ -n "$unsafe_entry" ]]; then
    echo "source tree contains a symlink or special file: $unsafe_entry" >&2
    return 1
  fi

  find "$directory" -type f -print0 \
    | LC_ALL=C sort -z \
    | while IFS= read -r -d '' file; do
        printf '%s\0' "${file#"$directory/"}"
        shasum -a 256 "$file" | awk '{print $1}'
      done \
    | shasum -a 256 \
    | awk '{print $1}'
}

pragas_copy_verified_tree() {
  local source_tree="$1"
  local snapshot_tree="$2"
  local expected_hash="$3"
  local source_hash
  local snapshot_hash

  if [[ ! "$expected_hash" =~ ^[0-9a-f]{64}$ \
        || -e "$snapshot_tree" || -L "$snapshot_tree" ]]; then
    echo "verified source snapshot request is malformed" >&2
    return 1
  fi
  source_hash="$(pragas_directory_hash "$source_tree")" || return 1
  if [[ "$source_hash" != "$expected_hash" ]]; then
    echo "source tree hash differs from the reviewed value: $source_tree" >&2
    return 1
  fi

  mkdir -p "$(dirname "$snapshot_tree")" || return 1
  cp -R "$source_tree" "$snapshot_tree" || return 1
  snapshot_hash="$(pragas_directory_hash "$snapshot_tree")" || return 1
  if [[ "$snapshot_hash" != "$expected_hash" ]]; then
    echo "copied source snapshot differs from the reviewed tree" >&2
    return 1
  fi
  chmod -R u=rX,go= "$snapshot_tree"
}

pragas_copy_verified_file() {
  local source_file="$1"
  local snapshot_file="$2"
  local expected_hash="$3"
  local source_hash
  local snapshot_hash

  if [[ ! -f "$source_file" || -L "$source_file" \
        || ! "$expected_hash" =~ ^[0-9a-f]{64}$ \
        || -e "$snapshot_file" || -L "$snapshot_file" ]]; then
    echo "verified source file snapshot request is malformed" >&2
    return 1
  fi
  source_hash="$(shasum -a 256 "$source_file" | awk '{print $1}')"
  if [[ "$source_hash" != "$expected_hash" ]]; then
    echo "source file hash differs from the reviewed value: $source_file" >&2
    return 1
  fi

  mkdir -p "$(dirname "$snapshot_file")" || return 1
  cp "$source_file" "$snapshot_file" || return 1
  snapshot_hash="$(shasum -a 256 "$snapshot_file" | awk '{print $1}')"
  if [[ "$snapshot_hash" != "$expected_hash" ]]; then
    echo "copied source file differs from the reviewed file" >&2
    return 1
  fi
  chmod u=r,go= "$snapshot_file"
}

pragas_run_with_timeout() {
  local timeout_seconds="$1"
  shift
  local command_pid
  local watchdog_pid
  local command_status

  if [[ ! "$timeout_seconds" =~ ^[1-9][0-9]*$ || "$#" -eq 0 ]]; then
    echo "timed command request is malformed" >&2
    return 1
  fi

  "$@" &
  command_pid=$!
  (
    sleep "$timeout_seconds"
    if kill -0 "$command_pid" >/dev/null 2>&1; then
      echo "timed command exceeded ${timeout_seconds}s" >&2
      kill -TERM "$command_pid" >/dev/null 2>&1 || true
    fi
  ) &
  watchdog_pid=$!

  if wait "$command_pid"; then
    command_status=0
  else
    command_status=$?
  fi
  kill "$watchdog_pid" >/dev/null 2>&1 || true
  wait "$watchdog_pid" >/dev/null 2>&1 || true
  return "$command_status"
}

pragas_extract_local_edge_bundle_hash() {
  local debug_log="$1"
  local target_ref="$2"
  local slug="$3"
  local line
  local method
  local url
  local query
  local field
  local request_slug
  local request_hash
  local hash_fields
  local matching_requests=0

  if [[ ! -f "$debug_log" || ! "$target_ref" =~ ^[a-z0-9]{20}$ \
        || ! "$slug" =~ ^[A-Za-z0-9_-]+$ ]]; then
    echo "local Edge bundle identity request is malformed" >&2
    return 1
  fi

  # Supabase CLI v2.98.2's local Docker bundler hashes the exact compressed
  # EZBR before RoundTrip and adds it to the create/update request URL. The
  # pinned CLI's --debug transport prints that URL before any remote mutation.
  # Parse only the exact target mutation endpoint; ignore arbitrary command
  # output and the preliminary GET inventory request.
  while IFS= read -r line; do
    if [[ "$line" =~ ^HTTP[[:space:]].*[[:space:]](POST|PATCH|PUT|DELETE):[[:space:]](https://[^[:space:]]+)$ ]]; then
      method="${BASH_REMATCH[1]}"
      url="${BASH_REMATCH[2]}"
    else
      continue
    fi

    # No mutation other than the single locally bundled create/update request
    # is allowed for this target. In particular, /functions/deploy is the
    # server-side --use-api fallback and has no locally derived bundle hash.
    if [[ "$url" != https://*/v1/projects/"$target_ref"/functions* ]]; then
      continue
    fi

    request_slug=""
    request_hash=""
    hash_fields=0
    case "$method" in
      PATCH)
        if [[ "$url" != https://*/v1/projects/"$target_ref"/functions/"$slug"\?* ]]; then
          echo "unexpected Edge mutation endpoint in CLI debug output" >&2
          return 1
        fi
        request_slug="$slug"
        ;;
      POST)
        if [[ "$url" != https://*/v1/projects/"$target_ref"/functions\?* ]]; then
          echo "unexpected Edge mutation endpoint in CLI debug output" >&2
          return 1
        fi
        ;;
      *)
        echo "unexpected Edge mutation method in CLI debug output" >&2
        return 1
        ;;
    esac

    query="${url#*\?}"
    IFS='&' read -r -a query_fields <<<"$query"
    for field in "${query_fields[@]}"; do
      case "$field" in
        slug=*) request_slug="${field#slug=}" ;;
        ezbr_sha256=*)
          hash_fields=$((hash_fields + 1))
          request_hash="${field#ezbr_sha256=}"
          ;;
      esac
    done
    if [[ "$request_slug" != "$slug" ]]; then
      echo "unexpected Edge mutation slug in CLI debug output" >&2
      return 1
    fi
    matching_requests=$((matching_requests + 1))
    if (( matching_requests != 1 )) || (( hash_fields != 1 )) \
        || [[ ! "$request_hash" =~ ^[0-9a-f]{64}$ ]]; then
      echo "local Edge bundle request identity is duplicated or malformed" >&2
      return 1
    fi
  done <"$debug_log"

  if (( matching_requests != 1 )) || [[ -z "$request_hash" ]]; then
    echo "local Edge bundle identity was not present before mutation" >&2
    return 1
  fi
  printf '%s\n' "$request_hash"
}

pragas_validate_backup_root() {
  local repo_root="$1"
  local requested_root="$2"
  local canonical_repo
  local canonical_root

  if [[ -z "$requested_root" || ! -d "$requested_root" \
        || ! -w "$requested_root" || ! -x "$requested_root" ]]; then
    echo "backup root must be an existing writable directory" >&2
    return 1
  fi
  if [[ -L "$requested_root" ]]; then
    echo "backup root must not be a symbolic link" >&2
    return 1
  fi

  canonical_repo="$(cd "$repo_root" && pwd -P)" || return 1
  canonical_root="$(cd "$requested_root" && pwd -P)" || return 1
  case "$canonical_root" in
    "$canonical_repo"|"$canonical_repo"/*)
      echo "backup root must be outside the repository" >&2
      return 1
      ;;
  esac

  printf '%s\n' "$canonical_root"
}

pragas_assert_private_backup_leaf() {
  local backup_root="$1"
  local backup_leaf="$2"
  local canonical_root
  local canonical_leaf
  local owner_uid
  local mode

  if [[ ! -d "$backup_leaf" || -L "$backup_leaf" ]]; then
    echo "backup leaf must be a real directory" >&2
    return 1
  fi
  canonical_root="$(cd "$backup_root" && pwd -P)" || return 1
  canonical_leaf="$(cd "$backup_leaf" && pwd -P)" || return 1
  case "$canonical_leaf" in
    "$canonical_root"/*) ;;
    *)
      echo "backup leaf escaped the validated backup root" >&2
      return 1
      ;;
  esac

  owner_uid="$(pragas_stat_uid "$canonical_leaf")" || return 1
  mode="$(pragas_stat_mode "$canonical_leaf")" || return 1
  if [[ "$owner_uid" != "$(id -u)" ]]; then
    echo "backup leaf is not owned by the current user" >&2
    return 1
  fi
  if [[ "$mode" != "700" ]]; then
    echo "backup leaf permissions must be exactly 0700" >&2
    return 1
  fi

  printf '%s\n' "$canonical_leaf"
}

pragas_create_private_backup_leaf() {
  local backup_root="$1"
  local leaf_name="$2"
  local backup_leaf

  if [[ -z "$leaf_name" || "$leaf_name" == */* \
        || ! "$leaf_name" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "backup leaf name is unsafe" >&2
    return 1
  fi
  backup_leaf="$backup_root/$leaf_name"
  if [[ -e "$backup_leaf" || -L "$backup_leaf" ]]; then
    echo "backup leaf already exists" >&2
    return 1
  fi

  (umask 077 && mkdir -m 700 "$backup_leaf") || return 1
  pragas_assert_private_backup_leaf "$backup_root" "$backup_leaf"
}

pragas_parse_mutation_recheck_csv() {
  local csv_file="$1"
  local expected_profiles="$2"
  local expected_generated_profiles="$3"
  local header
  local row
  local nonempty_lines
  local profiles
  local generated_profiles
  local subscriptions
  local notifications
  local extra

  nonempty_lines="$(sed '/^[[:space:]]*$/d' "$csv_file" | wc -l | tr -d '[:space:]')"
  header="$(sed -n '1p' "$csv_file" | tr -d '"\r')"
  row="$(sed -n '2p' "$csv_file" | tr -d '"\r')"
  if [[ "$nonempty_lines" != "2" \
        || "$header" != "profile_count,generated_profile_count,app_subscription_count,push_notification_count" ]]; then
    echo "immediate production recheck returned an unexpected CSV contract" >&2
    return 1
  fi

  IFS=',' read -r profiles generated_profiles subscriptions notifications extra \
    <<< "$row"
  for value in "$profiles" "$generated_profiles" "$subscriptions" \
    "$notifications"; do
    if [[ ! "$value" =~ ^[0-9]+$ ]]; then
      echo "immediate production recheck returned a non-numeric value" >&2
      return 1
    fi
  done
  if [[ -n "${extra:-}" || "$profiles" != "$expected_profiles" \
        || "$generated_profiles" != "$expected_generated_profiles" \
        || "$subscriptions" != "0" || "$notifications" != "0" ]]; then
    echo "production data changed during backup" >&2
    return 1
  fi

  printf '%s|%s|%s|%s\n' \
    "$profiles" "$generated_profiles" "$subscriptions" "$notifications"
}

pragas_compare_row_manifests() {
  local expected_manifest="$1"
  local actual_manifest="$2"

  if ! cmp -s "$expected_manifest" "$actual_manifest"; then
    echo "restored table row-count manifest differs from the backup" >&2
    diff -u "$expected_manifest" "$actual_manifest" >&2 || true
    return 1
  fi
}

pragas_write_target_edge_inventory() {
  local inventory_file="$1"
  local target_slugs_json="$2"

  jq -e --argjson target_slugs "$target_slugs_json" '
    def valid_slug_list:
      type == "array"
      and all(.[]; type == "string" and length > 0)
      and length == (unique | length);
    def valid_edge_row:
      (. | keys | sort) == [
        "ezbr_sha256", "slug", "status", "verify_jwt", "version"
      ]
      and (.slug | type == "string" and length > 0)
      and (.status | type == "string" and length > 0)
      and (.version | type == "number" and . >= 1 and floor == .)
      and (.verify_jwt | type == "boolean")
      and (.ezbr_sha256
        | type == "string" and test("^[0-9a-f]{64}$"));
    if ($target_slugs | valid_slug_list | not) then
      error("target Edge slug allowlist is malformed")
    elif type != "array" then
      error("remote Edge inventory is not an array")
    else
      [
        .[]
        | select(
            .slug as $slug
            | ($target_slugs | index($slug)) != null
          )
        | {
            slug,
            status,
            version,
            verify_jwt,
            ezbr_sha256
          }
      ] as $rows
      | if (all($rows[]; valid_edge_row) | not) then
          error("target Edge inventory contains malformed metadata")
        elif (($rows | map(.slug) | unique | length) != ($rows | length)) then
          error("target Edge inventory contains duplicate slugs")
        else
          $rows | sort_by(.slug)
        end
    end
  ' "$inventory_file"
}

pragas_assert_target_edge_inventory() {
  local expected_target_file="$1"
  local observed_inventory_file="$2"
  local target_slugs_json="$3"
  local expected
  local observed

  expected="$(pragas_write_target_edge_inventory \
    "$expected_target_file" "$target_slugs_json")" || return 1
  observed="$(pragas_write_target_edge_inventory \
    "$observed_inventory_file" "$target_slugs_json")" || return 1
  if [[ "$observed" != "$expected" ]]; then
    echo "targeted Edge inventory changed concurrently" >&2
    diff -u <(printf '%s\n' "$expected") \
      <(printf '%s\n' "$observed") >&2 || true
    return 1
  fi
}

pragas_assert_edge_deploy_transition() {
  local before_target_file="$1"
  local after_target_file="$2"
  local deployed_slug="$3"
  local expected_verify_jwt="$4"
  local expected_ezbr_sha256="$5"

  if [[ ! "$expected_ezbr_sha256" =~ ^[0-9a-f]{64}$ ]]; then
    echo "expected Edge bundle hash is malformed" >&2
    return 1
  fi

  jq -en \
    --slurpfile before "$before_target_file" \
    --slurpfile after "$after_target_file" \
    --arg slug "$deployed_slug" \
    --argjson expected_verify "$expected_verify_jwt" \
    --arg expected_ezbr "$expected_ezbr_sha256" '
      def valid_edge_row:
        (. | keys | sort) == [
          "ezbr_sha256", "slug", "status", "verify_jwt", "version"
        ]
        and (.slug | type == "string" and length > 0)
        and (.status | type == "string" and length > 0)
        and (.version | type == "number" and . >= 1 and floor == .)
        and (.verify_jwt | type == "boolean")
        and (.ezbr_sha256
          | type == "string" and test("^[0-9a-f]{64}$"));
      $before[0] as $before_rows
      | $after[0] as $after_rows
      | ([$before_rows[] | select(.slug == $slug)]) as $before_row
      | ([$after_rows[] | select(.slug == $slug)]) as $after_row
      |
      ($before | length) == 1
      and ($after | length) == 1
      and ($before_rows | type) == "array"
      and ($after_rows | type) == "array"
      and all($before_rows[]; valid_edge_row)
      and all($after_rows[]; valid_edge_row)
      and (($before_rows | map(.slug) | unique | length)
        == ($before_rows | length))
      and (($after_rows | map(.slug) | unique | length)
        == ($after_rows | length))
      and ([
        $before_rows[] | select(.slug != $slug)
      ] == [
        $after_rows[] | select(.slug != $slug)
      ])
      and ($before_row | length) <= 1
      and ($after_row | length) == 1
      and $after_row[0].status == "ACTIVE"
      and $after_row[0].verify_jwt == $expected_verify
      and $after_row[0].ezbr_sha256 == $expected_ezbr
      and (
        (($before_row | length) == 0 and $after_row[0].version == 1)
        or
        (($before_row | length) == 1
          and $after_row[0].version == ($before_row[0].version + 1))
      )
    ' >/dev/null
}
