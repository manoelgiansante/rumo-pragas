#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# The source path is anchored to the resolved repository.
# shellcheck disable=SC1091
source "$repo_root/supabase/scripts/pragas-prod-compat-lib.sh"

readonly backup_image="public.ecr.aws/supabase/postgres@sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426"
readonly backup_image_digest="sha256:178f0976b54a39237096bfa310c1a352dbc82fb1b08dda45cdb8acb5d40c1426"
readonly server_image="postgres@sha256:4f736ae292687621d4dbe0d499ffd024a36bd2ee7d8ca6f2ccd4c800f047b394"
readonly server_image_digest="sha256:4f736ae292687621d4dbe0d499ffd024a36bd2ee7d8ca6f2ccd4c800f047b394"

suffix="${RANDOM}${RANDOM}"
server="pragas-backup-tls-pg-$suffix"
network="pragas-backup-tls-net-$suffix"
tmp="$(mktemp -d /tmp/pragas-backup-tls.XXXXXX)"
locker_pid=""
locker_backend_pid=""
dump_pid=""

cleanup() {
  local container_id

  if [[ -n "$dump_pid" ]]; then
    kill "$dump_pid" >/dev/null 2>&1 || true
    wait "$dump_pid" >/dev/null 2>&1 || true
  fi
  if [[ -n "$locker_pid" ]]; then
    kill "$locker_pid" >/dev/null 2>&1 || true
    wait "$locker_pid" >/dev/null 2>&1 || true
  fi
  while IFS= read -r container_id; do
    if [[ -n "$container_id" ]]; then
      docker rm -f "$container_id" >/dev/null 2>&1 || true
    fi
  done < <(docker ps -aq --filter "network=$network" 2>/dev/null || true)
  docker rm -f "$server" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  chmod -R u+w "$tmp" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

ensure_pinned_image() {
  local image="$1"
  local expected_digest="$2"

  if ! docker image inspect "$image" >/dev/null 2>&1; then
    docker pull "$image" >/dev/null
  fi
  if ! pragas_assert_pinned_docker_image \
      "$image" "$expected_digest" >/dev/null 2>&1; then
    echo "pinned PostgreSQL test image identity mismatch" >&2
    return 1
  fi
}

wait_for_server() {
  local ready="false"
  local _attempt

  for _attempt in $(seq 1 60); do
    if docker exec "$server" pg_isready -q -U postgres \
        && docker exec "$server" psql -qAt -U postgres \
          -c 'SELECT 1' 2>/dev/null | grep -qx '1'; then
      ready="true"
      break
    fi
    sleep 1
  done
  [[ "$ready" == "true" ]]
}

ensure_pinned_image "$backup_image" "$backup_image_digest"
ensure_pinned_image "$server_image" "$server_image_digest"
docker network create "$network" >/dev/null
docker run --rm -d --name "$server" --network "$network" \
  -e POSTGRES_PASSWORD=postgres "$server_image" >/dev/null
wait_for_server

docker exec -u postgres "$server" openssl req \
  -x509 -newkey rsa:2048 -sha256 -days 1 -nodes \
  -subj '/CN=Pragas Backup Test CA' \
  -addext 'basicConstraints=critical,CA:TRUE' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign' \
  -keyout /var/lib/postgresql/data/ca.key \
  -out /var/lib/postgresql/data/ca.crt >/dev/null 2>&1
docker exec -u postgres "$server" openssl req \
  -new -newkey rsa:2048 -sha256 -nodes \
  -subj "/CN=$server" \
  -addext "subjectAltName=DNS:$server" \
  -keyout /var/lib/postgresql/data/server.key \
  -out /var/lib/postgresql/data/server.csr >/dev/null 2>&1
docker exec -u postgres "$server" openssl x509 \
  -req -sha256 -days 1 \
  -in /var/lib/postgresql/data/server.csr \
  -CA /var/lib/postgresql/data/ca.crt \
  -CAkey /var/lib/postgresql/data/ca.key \
  -CAcreateserial -copy_extensions copy \
  -out /var/lib/postgresql/data/server.crt >/dev/null 2>&1
docker exec -u postgres "$server" openssl req \
  -x509 -newkey rsa:2048 -sha256 -days 1 -nodes \
  -subj '/CN=Wrong Pragas Backup Test CA' \
  -addext 'basicConstraints=critical,CA:TRUE' \
  -addext 'keyUsage=critical,keyCertSign,cRLSign' \
  -keyout /var/lib/postgresql/data/wrong-ca.key \
  -out /var/lib/postgresql/data/wrong-ca.crt >/dev/null 2>&1
docker exec -u postgres "$server" chmod 600 \
  /var/lib/postgresql/data/server.key
docker exec -i "$server" psql -qAt -v ON_ERROR_STOP=1 -U postgres <<'SQL' \
  >/dev/null
COPY (
  SELECT line FROM (VALUES
    ('local all all trust'),
    ('hostnossl all all 0.0.0.0/0 reject'),
    ('hostnossl all all ::0/0 reject'),
    ('hostssl all all 0.0.0.0/0 scram-sha-256'),
    ('hostssl all all ::0/0 scram-sha-256')
  ) AS hba(line)
) TO '/var/lib/postgresql/data/pg_hba_backup_tls.conf';
ALTER SYSTEM SET ssl = 'on';
ALTER SYSTEM SET ssl_cert_file = 'server.crt';
ALTER SYSTEM SET ssl_key_file = 'server.key';
ALTER SYSTEM SET hba_file = '/var/lib/postgresql/data/pg_hba_backup_tls.conf';
SQL
docker restart "$server" >/dev/null
wait_for_server
docker exec "$server" openssl x509 \
  -in /var/lib/postgresql/data/server.crt \
  -checkhost "$server" -noout >/dev/null

root_ca="$tmp/root-ca.pem"
wrong_ca="$tmp/wrong-root-ca.pem"
pgpass_file="$tmp/pgpass"
docker cp "$server:/var/lib/postgresql/data/ca.crt" "$root_ca" >/dev/null
docker cp "$server:/var/lib/postgresql/data/wrong-ca.crt" \
  "$wrong_ca" >/dev/null
chmod 400 "$root_ca" "$wrong_ca"
pragas_write_private_pgpass \
  "$pgpass_file" "$server" 5432 postgres postgres postgres

docker exec -i "$server" psql -q -v ON_ERROR_STOP=1 -U postgres \
  -d postgres <<'SQL'
CREATE TABLE public.pragas_backup_tls_probe (
  id bigint PRIMARY KEY,
  payload text NOT NULL
);
INSERT INTO public.pragas_backup_tls_probe
SELECT value, repeat('x', 128)
  FROM generate_series(1, 1000) AS value;
SQL
if ! docker exec "$server" psql -qAt -U postgres -d postgres \
    -c 'SELECT count(*) FROM public.pragas_backup_tls_probe' \
    | grep -qx '1000'; then
  echo "TLS backup probe fixture was not persisted" >&2
  exit 1
fi

if pragas_run_pinned_pg_backup \
    "$backup_image" "$backup_image_digest" pg_dump "$wrong_ca" "$pgpass_file" \
    "$server" 5432 postgres postgres "$network" \
    --schema-only --schema public >"$tmp/wrong-ca.sql" \
    2>"$tmp/wrong-ca.err"; then
  echo "pinned backup accepted an untrusted PostgreSQL CA" >&2
  exit 1
fi

docker exec "$server" psql -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "SET application_name = 'rumo-pragas-prod-compat-locker'; BEGIN; LOCK TABLE public.pragas_backup_tls_probe IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(300); COMMIT;" \
  >"$tmp/locker.out" 2>"$tmp/locker.err" &
locker_pid=$!
lock_ready="false"
for _attempt in $(seq 1 40); do
  locker_backend_pid="$(docker exec "$server" \
    psql -qAt -U postgres -d postgres -c \
      "SELECT activity.pid FROM pg_stat_activity AS activity JOIN pg_locks AS lock_info USING (pid) WHERE activity.application_name = 'rumo-pragas-prod-compat-locker' AND lock_info.relation = 'public.pragas_backup_tls_probe'::regclass AND lock_info.mode = 'AccessExclusiveLock' AND lock_info.granted" \
      2>/dev/null || true)"
  if [[ "$locker_backend_pid" =~ ^[1-9][0-9]*$ ]]; then
    lock_ready="true"
    break
  fi
  sleep 0.1
done
if [[ "$lock_ready" != "true" ]]; then
  echo "could not hold the TLS backup probe lock" >&2
  exit 1
fi

pragas_run_pinned_pg_backup \
  "$backup_image" "$backup_image_digest" pg_dump "$root_ca" "$pgpass_file" \
  "$server" 5432 postgres postgres "$network" \
  --data-only --quote-all-identifiers --role postgres \
  --exclude-schema '' \
  --exclude-table auth.schema_migrations \
  --exclude-table storage.migrations \
  --exclude-table supabase_functions.migrations \
  --schema 'auth|storage|public' \
  >"$tmp/correct-ca.sql" 2>"$tmp/correct-ca.err" &
dump_pid=$!
ssl_observed="false"
ssl_observation_deadline=$((SECONDS + 60))
while (( SECONDS < ssl_observation_deadline )); do
  if docker exec "$server" psql -qAt -U postgres -d postgres -c \
      "SELECT count(*) FROM pg_stat_activity AS activity JOIN pg_stat_ssl AS ssl USING (pid) WHERE activity.application_name = 'rumo-pragas-prod-compat-backup' AND ssl.ssl" \
      | grep -Eq '^[1-9][0-9]*$'; then
    ssl_observed="true"
    break
  fi
  if ! kill -0 "$dump_pid" >/dev/null 2>&1; then
    dump_status=0
    wait "$dump_pid" || dump_status=$?
    dump_pid=""
    echo "pinned backup exited before pg_stat_ssl observed its connection (status=$dump_status)" >&2
    if [[ -s "$tmp/correct-ca.err" ]]; then
      sed 's/^/pg_dump: /' "$tmp/correct-ca.err" >&2
    fi
    exit 1
  fi
  sleep 0.1
done
if [[ "$ssl_observed" != "true" ]]; then
  echo "pg_stat_ssl did not observe the pinned backup connection" >&2
  exit 1
fi
if ! docker exec "$server" psql -qAt -v ON_ERROR_STOP=1 -U postgres \
    -d postgres -c "SELECT pg_terminate_backend($locker_backend_pid)" \
    | grep -qx 't'; then
  echo "could not terminate the TLS backup probe locker" >&2
  exit 1
fi
wait "$locker_pid" >/dev/null 2>&1 || true
locker_pid=""
locker_backend_pid=""
wait "$dump_pid"
dump_pid=""
if ! rg -Fq 'COPY "public"."pragas_backup_tls_probe"' \
    "$tmp/correct-ca.sql"; then
  echo "verified TLS data backup did not preserve COPY semantics" >&2
  exit 1
fi

pragas_run_pinned_pg_backup \
  "$backup_image" "$backup_image_digest" pg_dumpall "$root_ca" "$pgpass_file" \
  "$server" 5432 postgres postgres "$network" \
  --roles-only --no-role-passwords >"$tmp/roles.sql" \
  2>"$tmp/roles.err"
if ! rg -Fq 'CREATE ROLE postgres;' "$tmp/roles.sql"; then
  echo "verified TLS role backup did not preserve role semantics" >&2
  exit 1
fi

echo "pragas pinned backup TLS integration: PASS"
echo "pg_dump=17.6 pg_dumpall=17.6 ca=correct+wrong pg_stat_ssl=observed password_transport=pgpass"
