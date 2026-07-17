#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="jxcnfyeemdltdfqtgbcl"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG_FILE="$REPO_ROOT/supabase/config.toml"
PRODUCTION_GATE="$REPO_ROOT/supabase/scripts/deploy-pragas-prod-compat.sh"

FUNCTIONS=(
  admin-ai-content-reports
  ai-chat-pragas
  diagnose-pragas
  pragas-analytics
  pragas-delete-user-account
  pragas-export-user-data
  pragas-global-account-deletion
  pragas-process-ai-idempotency
  pragas-process-deletions
  pragas-reactivate-account
  pragas-send-push
  report-ai-content
  report-diagnosis-feedback
)

usage() {
  printf '%s\n' \
    'Usage:' \
    '  bash supabase/functions/deploy-pragas-allowlist.sh --list' \
    '  PRAGAS_EDGE_PRODUCTION_APPROVED=jxcnfyeemdltdfqtgbcl bash supabase/functions/deploy-pragas-allowlist.sh --execute --confirm-project jxcnfyeemdltdfqtgbcl' \
    '' \
    '--list validates local source/config and performs no network mutation.' \
    '--execute only delegates to the hash/backup/restore-enforced production gate.'
}

validate_allowlist() {
  local function_name
  for function_name in "${FUNCTIONS[@]}"; do
    if [[ ! -f "$REPO_ROOT/supabase/functions/$function_name/index.ts" ]]; then
      printf 'Missing reviewed source: %s\n' "$function_name" >&2
      exit 1
    fi
    if ! grep -Fq "[functions.$function_name]" "$CONFIG_FILE"; then
      printf 'Missing config.toml entry: %s\n' "$function_name" >&2
      exit 1
    fi
  done
}

mode="list"
confirmed_project=""
while (($#)); do
  case "$1" in
    --list)
      mode="list"
      shift
      ;;
    --execute)
      mode="execute"
      shift
      ;;
    --confirm-project)
      if (($# < 2)); then
        printf '%s\n' '--confirm-project requires a value.' >&2
        exit 2
      fi
      confirmed_project="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

validate_allowlist

if [[ "$mode" == "list" ]]; then
  printf 'Validated Rumo Pragas Edge deploy allowlist for project %s:\n' "$PROJECT_REF"
  printf '  %s\n' "${FUNCTIONS[@]}"
  printf '\nNo network or production mutation was performed.\n'
  exit 0
fi

if [[ "$confirmed_project" != "$PROJECT_REF" ]]; then
  printf 'Execution refused: pass --confirm-project %s after production authorization.\n' \
    "$PROJECT_REF" >&2
  exit 2
fi

if [[ "${PRAGAS_EDGE_PRODUCTION_APPROVED:-}" != "$PROJECT_REF" ]]; then
  printf 'Execution refused: set PRAGAS_EDGE_PRODUCTION_APPROVED to the exact project ref.\n' >&2
  exit 2
fi

if [[ ! -x "$PRODUCTION_GATE" || -L "$PRODUCTION_GATE" ]]; then
  printf '%s\n' 'Execution refused: hardened production gate is unavailable.' >&2
  exit 2
fi

exec "$PRODUCTION_GATE" --apply
