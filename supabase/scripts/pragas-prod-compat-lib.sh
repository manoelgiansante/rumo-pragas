#!/usr/bin/env bash

# Shared, side-effect-free validation helpers for the production compatibility
# gate. The caller owns shell options and cleanup.

pragas_stat_uid() {
  local path="$1"
  stat -f '%u' "$path" 2>/dev/null || stat -c '%u' "$path"
}

pragas_stat_mode() {
  local path="$1"
  stat -f '%Lp' "$path" 2>/dev/null || stat -c '%a' "$path"
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
