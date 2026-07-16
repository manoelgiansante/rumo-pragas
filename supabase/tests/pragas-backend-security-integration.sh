#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
bash "$repo_root/supabase/tests/pragas-prod-compat-stat-linux-integration.sh"
bash "$repo_root/supabase/tests/pragas-prod-compat-encrypted-volume-integration.sh"
bash "$repo_root/supabase/tests/pragas-prod-compat-backup-tls-integration.sh"
exec bash "$repo_root/supabase/tests/pragas-prod-compat-integration.sh"
