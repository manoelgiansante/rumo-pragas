#!/usr/bin/env bash
set -euo pipefail

# The login hotfix is now the first atomic step of the reviewed production
# compatibility rollout. Keeping a second deploy implementation would permit a
# partial database-only release without the schema, RPC, Edge, backup and
# rollback gates that the application requires. Preserve this historical entry
# point as a strict wrapper around the single combined gate.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mode="${1:---dry-run}"

case "$mode" in
  --dry-run|--prepare|--apply) ;;
  *)
    echo "usage: $0 [--dry-run|--prepare|--apply]" >&2
    exit 2
    ;;
esac

exec "$repo_root/supabase/scripts/deploy-pragas-prod-compat.sh" "$mode"
