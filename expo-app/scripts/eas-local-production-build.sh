#!/usr/bin/env -S -i HOME=/Users/manoelnascimento PATH=/usr/bin:/bin /bin/bash --noprofile --norc
# shellcheck shell=bash
# Gera artefatos de produção nativos locais sem iniciar EAS Build.

if [[ "${1:-}" != "--internal-sanitized-bootstrap" ]]; then
  exec /usr/bin/env -i \
    HOME=/Users/manoelnascimento \
    USER=manoelnascimento \
    LOGNAME=manoelnascimento \
    LANG=C \
    LC_ALL=C \
    PATH=/usr/bin:/bin:/usr/sbin:/sbin \
    TMPDIR=/private/tmp \
    /bin/bash --noprofile --norc "$0" --internal-sanitized-bootstrap "$@"
fi
shift

set -Eeuo pipefail
umask 077

for FORBIDDEN_NAME in \
  BASH_ENV ENV NODE_OPTIONS NODE_PATH EXPO_TOKEN EAS_ACCESS_TOKEN EAS_TOKEN \
  DYLD_INSERT_LIBRARIES DYLD_LIBRARY_PATH LD_PRELOAD RUBYOPT PYTHONPATH \
  EAS_LOCAL_BUILD_PLUGIN_PATH EAS_LOCAL_BUILD_WORKINGDIR; do
  [[ -z "${!FORBIDDEN_NAME+x}" ]] || {
    echo "ERRO: ambiente do bootstrap nativo não foi sanitizado." >&2
    exit 1
  }
done

EXPECTED_APP_ROOT="/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app"
APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
REPOSITORY_ROOT="$(cd "$APP_ROOT/.." && pwd -P)"
ARTIFACTS_DIR="$APP_ROOT/.artifacts"
EAS_EXECUTOR="$APP_ROOT/scripts/eas-pinned.sh"
FNM_BIN="/opt/homebrew/Cellar/fnm/1.39.0/bin/fnm"
PINNED_NODE="/Users/manoelnascimento/.local/share/fnm/node-versions/v22.22.3/installation/bin/node"
NPM_CLI="/Users/manoelnascimento/.local/share/fnm/node-versions/v22.22.3/installation/lib/node_modules/npm/bin/npm-cli.js"
GLOBAL_LOCK_PARENT="/Users/manoelnascimento/.agrorumo"
GLOBAL_LOCK_DIR="$GLOBAL_LOCK_PARENT/native-production-build.lock"
IOS_CREDENTIALS_PATH="$APP_ROOT/credentials.json"
IOS_CREDENTIALS_STAGING_PATH="${IOS_CREDENTIALS_PATH}.materializing"
ARTIFACT_PATH=""
MANIFEST_PATH=""
SYMBOLS_PATH=""
LOG_PATH=""
BOOTSTRAP_ROOT=""
BUILD_CHILD_PID=""
LOCK_OWNED=false
LOCK_IDENTITY=""
SIGNAL_HANDLING=false

fail() {
  echo "ERRO: $1" >&2
  exit 1
}

verify_sha256() {
  local path="$1"
  local expected="$2"
  local actual
  [[ -f "$path" && ! -L "$path" ]] || fail "toolchain fixada ausente."
  actual="$(/usr/bin/shasum -a 256 "$path" | /usr/bin/awk '{print $1}')"
  [[ "$actual" == "$expected" ]] || fail "toolchain fixada divergiu."
}

cleanup_lock() {
  local current_identity owner_pid
  [[ "$LOCK_OWNED" == true ]] || return 0
  [[ -d "$GLOBAL_LOCK_DIR" && ! -L "$GLOBAL_LOCK_DIR" ]] || return 1
  current_identity="$(/usr/bin/stat -f '%d:%i' "$GLOBAL_LOCK_DIR" 2>/dev/null || true)"
  [[ "$current_identity" == "$LOCK_IDENTITY" ]] || return 1
  if [[ ! -e "$GLOBAL_LOCK_DIR/owner" && ! -L "$GLOBAL_LOCK_DIR/owner" ]]; then
    if [[ -f "$GLOBAL_LOCK_DIR/owner.pending" && ! -L "$GLOBAL_LOCK_DIR/owner.pending" ]]; then
      /bin/rm -f "$GLOBAL_LOCK_DIR/owner.pending" || return 1
    fi
    /bin/rmdir "$GLOBAL_LOCK_DIR" || return 1
    LOCK_OWNED=false
    return 0
  fi
  [[ -f "$GLOBAL_LOCK_DIR/owner" && ! -L "$GLOBAL_LOCK_DIR/owner" ]] || return 1
  IFS= read -r owner_pid <"$GLOBAL_LOCK_DIR/owner" || return 1
  [[ "$owner_pid" == "$$" ]] || return 1
  /bin/rm -f "$GLOBAL_LOCK_DIR/owner" || return 1
  /bin/rmdir "$GLOBAL_LOCK_DIR" || return 1
  LOCK_OWNED=false
}

cleanup_bootstrap() {
  [[ -z "$BOOTSTRAP_ROOT" ]] && return 0
  [[ "$BOOTSTRAP_ROOT" == "$ARTIFACTS_DIR"/.native-bootstrap-* ]] || return 1
  [[ -d "$BOOTSTRAP_ROOT" && ! -L "$BOOTSTRAP_ROOT" ]] || return 1
  /bin/chmod -R u+rwX,go-rwx "$BOOTSTRAP_ROOT" 2>/dev/null || return 1
  /bin/rm -R "$BOOTSTRAP_ROOT" || return 1
  BOOTSTRAP_ROOT=""
}

quarantine_output_family() {
  local path rejected
  for path in "$ARTIFACT_PATH" "$MANIFEST_PATH" "$SYMBOLS_PATH"; do
    [[ -n "$path" ]] || continue
    if [[ -f "$path" && ! -L "$path" ]]; then
      rejected="${path}.rejected"
      if [[ ! -e "$rejected" && ! -L "$rejected" ]]; then
        /bin/mv "$path" "$rejected" 2>/dev/null || /bin/rm -f "$path" 2>/dev/null || true
        [[ -f "$rejected" && ! -L "$rejected" ]] && /bin/chmod 600 "$rejected" 2>/dev/null || true
      else
        /bin/rm -f "$path" 2>/dev/null || true
      fi
    fi
  done
}

finalize() {
  local exit_status=$?
  local cleanup_failed=false
  trap - EXIT HUP INT TERM
  set +e
  cleanup_bootstrap || cleanup_failed=true
  cleanup_lock || cleanup_failed=true
  if [[ "$exit_status" -ne 0 || "$cleanup_failed" == true ]]; then
    quarantine_output_family
  fi
  if [[ "$cleanup_failed" == true ]]; then
    echo "ERRO: limpeza segura do workspace/lock nativo falhou." >&2
    [[ "$exit_status" -ne 0 ]] || exit_status=1
  fi
  exit "$exit_status"
}

handle_signal() {
  local signal="$1"
  local exit_status="$2"
  local attempts=0
  [[ "$SIGNAL_HANDLING" == false ]] || return
  SIGNAL_HANDLING=true
  set +e
  if [[ -n "$BUILD_CHILD_PID" ]]; then
    /bin/kill -s "$signal" "$BUILD_CHILD_PID" 2>/dev/null
    while /bin/kill -0 "$BUILD_CHILD_PID" 2>/dev/null && ((attempts < 50)); do
      /bin/sleep 0.1
      attempts=$((attempts + 1))
    done
    if /bin/kill -0 "$BUILD_CHILD_PID" 2>/dev/null; then
      /bin/kill -KILL "$BUILD_CHILD_PID" 2>/dev/null
    fi
    wait "$BUILD_CHILD_PID" 2>/dev/null
    BUILD_CHILD_PID=""
  fi
  exit "$exit_status"
}

acquire_global_lock() {
  local attempt=0 owner_pid recovered
  /usr/bin/install -d -m 700 "$GLOBAL_LOCK_PARENT"
  /bin/chmod 700 "$GLOBAL_LOCK_PARENT"
  [[ -d "$GLOBAL_LOCK_PARENT" && ! -L "$GLOBAL_LOCK_PARENT" ]] || \
    fail "diretório global de lock é inseguro."
  while ((attempt < 3)); do
    if /bin/mkdir "$GLOBAL_LOCK_DIR" 2>/dev/null; then
      /bin/chmod 700 "$GLOBAL_LOCK_DIR"
      LOCK_IDENTITY="$(/usr/bin/stat -f '%d:%i' "$GLOBAL_LOCK_DIR")"
      LOCK_OWNED=true
      /usr/bin/install -m 600 /dev/null "$GLOBAL_LOCK_DIR/owner.pending"
      {
        printf '%s\n' "$$"
        printf '%s\n' "$CANDIDATE_COMMIT"
        /bin/date -u +%Y-%m-%dT%H:%M:%SZ
      } >"$GLOBAL_LOCK_DIR/owner.pending"
      /bin/mv "$GLOBAL_LOCK_DIR/owner.pending" "$GLOBAL_LOCK_DIR/owner"
      return 0
    fi
    [[ -d "$GLOBAL_LOCK_DIR" && ! -L "$GLOBAL_LOCK_DIR" ]] || fail "lock nativo existente é inseguro."
    [[ -f "$GLOBAL_LOCK_DIR/owner" && ! -L "$GLOBAL_LOCK_DIR/owner" ]] || \
      fail "lock nativo incompleto requer revisão manual."
    IFS= read -r owner_pid <"$GLOBAL_LOCK_DIR/owner" || fail "lock nativo inválido."
    [[ "$owner_pid" =~ ^[1-9][0-9]*$ ]] || fail "PID do lock nativo é inválido."
    if /bin/kill -0 "$owner_pid" 2>/dev/null; then
      fail "outro build nativo local permanece ativo."
    fi
    recovered="$ARTIFACTS_DIR/recovered-native-lock-${owner_pid}-$(/bin/date -u +%Y%m%dT%H%M%SZ)-${RANDOM}"
    [[ ! -e "$recovered" && ! -L "$recovered" ]] || fail "destino de recuperação do lock existe."
    /bin/mv "$GLOBAL_LOCK_DIR" "$recovered" || {
      attempt=$((attempt + 1))
      continue
    }
    /bin/chmod -R u+rwX,go-rwx "$recovered"
    attempt=$((attempt + 1))
  done
  fail "não foi possível adquirir o lock nativo global."
}

assert_no_external_native_build() {
  if /usr/bin/pgrep -f 'eas-cli-local-build-plugin' >/dev/null 2>&1 || \
    /usr/bin/pgrep -f '/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild.*archive' \
      >/dev/null 2>&1 || \
    /usr/bin/pgrep -f 'org\.gradle\.wrapper\.GradleWrapperMain.*(bundle|assemble)' \
      >/dev/null 2>&1; then
    fail "outro build nativo local está ativo nesta máquina; aguarde a serialização."
  fi
}

usage() {
  cat <<'EOF'
Uso: ./scripts/eas-local-production-build.sh --platform ios|android

Gera IPA/AAB com Xcode/Gradle locais a partir do commit candidato. EAS é usado
somente para leitura do Environment production; EAS Build/workflow é proibido.
EOF
}

PLATFORM=""
while (($# > 0)); do
  case "$1" in
    --platform)
      [[ $# -ge 2 ]] || { echo "ERRO: --platform exige um valor." >&2; exit 2; }
      PLATFORM="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "ERRO: opção desconhecida: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$PLATFORM" in
  ios) EXTENSION="ipa" ;;
  android) EXTENSION="aab" ;;
  *) echo "ERRO: informe exatamente --platform ios ou --platform android." >&2; exit 2 ;;
esac

[[ "$APP_ROOT" == "$EXPECTED_APP_ROOT" ]] || fail "worktree nativa não é a aprovada."
[[ -x "$EAS_EXECUTOR" && ! -L "$EAS_EXECUTOR" ]] || fail "executor EAS fixado ausente."
[[ ! -e "$IOS_CREDENTIALS_PATH" && ! -L "$IOS_CREDENTIALS_PATH" ]] || \
  fail "credentials.json é proibido no build nativo seguro."
[[ ! -e "$IOS_CREDENTIALS_STAGING_PATH" && ! -L "$IOS_CREDENTIALS_STAGING_PATH" ]] || \
  fail "materialização antiga de credentials.json precisa ser removida."

verify_sha256 "$FNM_BIN" dee5acc82725a109d74989219b9adf2ec22f7bd58e8cf043b043a127ffe2c9b3
verify_sha256 "$PINNED_NODE" 5d9d3872911e2340a43b707962e68143de8a4e8d54628845c0c4f2de1fb7cd5c
verify_sha256 "$NPM_CLI" 8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7
[[ "$("$FNM_BIN" --version 2>/dev/null)" == *"1.39.0" ]] || fail "fnm 1.39.0 divergiu."
[[ "$("$PINNED_NODE" --version 2>/dev/null)" == "v22.22.3" ]] || fail "Node 22.22.3 divergiu."
[[ "$("$PINNED_NODE" "$NPM_CLI" --version 2>/dev/null)" == "10.9.8" ]] || fail "npm 10.9.8 divergiu."

cd "$REPOSITORY_ROOT"
[[ -z "$(/usr/bin/git status --porcelain=v1 --untracked-files=all -- expo-app)" ]] || \
  fail "expo-app precisa estar integralmente commitado antes do build."
CANDIDATE_COMMIT="$(/usr/bin/git rev-parse --verify HEAD)"
[[ "$CANDIDATE_COMMIT" =~ ^[0-9a-f]{40}$ ]] || fail "commit candidato inválido."
CURRENT_WRAPPER_BLOB="$(/usr/bin/git hash-object "$APP_ROOT/scripts/eas-local-production-build.sh")"
COMMITTED_WRAPPER_BLOB="$(/usr/bin/git rev-parse "$CANDIDATE_COMMIT:expo-app/scripts/eas-local-production-build.sh")"
[[ "$CURRENT_WRAPPER_BLOB" == "$COMMITTED_WRAPPER_BLOB" ]] || \
  fail "wrapper nativo em execução não corresponde ao blob commitado."

[[ ! -L "$ARTIFACTS_DIR" ]] || fail ".artifacts não pode ser link simbólico."
/usr/bin/install -d -m 700 "$ARTIFACTS_DIR"
[[ -d "$ARTIFACTS_DIR" && ! -L "$ARTIFACTS_DIR" ]] || fail ".artifacts precisa ser privado."
TIMESTAMP="$(/bin/date -u +%Y%m%dT%H%M%SZ)"
ARTIFACT_PATH="$ARTIFACTS_DIR/RumoPragasIA-production-${PLATFORM}-${TIMESTAMP}.${EXTENSION}"
MANIFEST_PATH="${ARTIFACT_PATH}.manifest.json"
if [[ "$PLATFORM" == ios ]]; then
  SYMBOLS_PATH="${ARTIFACT_PATH}.symbols.tar.gz"
fi
LOG_PATH="$ARTIFACTS_DIR/native-${PLATFORM}-production-local-${TIMESTAMP}.log"
for DESTINATION in "$ARTIFACT_PATH" "$MANIFEST_PATH" "$SYMBOLS_PATH" "$LOG_PATH"; do
  [[ -z "$DESTINATION" || (! -e "$DESTINATION" && ! -L "$DESTINATION") ]] || \
    fail "destino de build já existe."
done

trap finalize EXIT
trap 'handle_signal HUP 129' HUP
trap 'handle_signal INT 130' INT
trap 'handle_signal TERM 143' TERM
assert_no_external_native_build
acquire_global_lock
assert_no_external_native_build

BOOTSTRAP_ROOT="$(/usr/bin/mktemp -d "$ARTIFACTS_DIR/.native-bootstrap.XXXXXX")"
/bin/chmod 700 "$BOOTSTRAP_ROOT"
/usr/bin/git archive --format=tar "$CANDIDATE_COMMIT" \
  expo-app/scripts/native-local-production-build.mjs \
  expo-app/scripts/native-signing-policy.mjs \
  expo-app/scripts/verify-release-bundle-env.mjs \
  | /usr/bin/bsdtar -xf - -C "$BOOTSTRAP_ROOT"
BOOTSTRAP_RUNNER="$BOOTSTRAP_ROOT/expo-app/scripts/native-local-production-build.mjs"
[[ -f "$BOOTSTRAP_RUNNER" && ! -L "$BOOTSTRAP_RUNNER" ]] || fail "runner commitado não foi extraído."

{
  echo "Rumo Pragas — status do build nativo local de produção"
  echo "Plataforma: $PLATFORM"
  echo "Início UTC: $TIMESTAMP"
  echo "EAS Build cloud: proibido; somente leitura do Environment production."
  echo "Saída bruta de npm/prebuild/Pods/Gradle/Xcode suprimida por segurança."
} >"$LOG_PATH"
/bin/chmod 600 "$LOG_PATH"

echo "Rumo Pragas — build nativo local protegido"
echo "Plataforma: $PLATFORM"
echo "Commit candidato: ${CANDIDATE_COMMIT:0:12}"
echo "Log seguro: $LOG_PATH"
echo "Nenhuma submissão será iniciada."

set +e
/usr/bin/env -i \
  HOME=/Users/manoelnascimento \
  USER=manoelnascimento \
  LOGNAME=manoelnascimento \
  LANG=C \
  LC_ALL=C \
  PATH=/usr/bin:/bin:/usr/sbin:/sbin \
  TMPDIR=/private/tmp \
  CI=1 \
  NO_COLOR=1 \
  FORCE_COLOR=0 \
  DISABLE_EAS_ANALYTICS=1 \
  EXPO_NO_TELEMETRY=1 \
  SENTRY_DISABLE_AUTO_UPLOAD=true \
  RUMO_NATIVE_BOOTSTRAP=1 \
  RUMO_NATIVE_APP_ROOT="$APP_ROOT" \
  RUMO_NATIVE_CANDIDATE_COMMIT="$CANDIDATE_COMMIT" \
  RUMO_EAS_EXECUTOR="$EAS_EXECUTOR" \
  "$PINNED_NODE" "$BOOTSTRAP_RUNNER" \
    --platform "$PLATFORM" \
    --output "$ARTIFACT_PATH" \
    --status-log "$LOG_PATH" \
    </dev/null >/dev/null 2>&1 &
BUILD_CHILD_PID=$!
wait "$BUILD_CHILD_PID"
BUILD_STATUS=$?
BUILD_CHILD_PID=""
set -e

if [[ "$BUILD_STATUS" -ne 0 ]]; then
  echo "Build nativo local falhou com código $BUILD_STATUS; saída bruta suprimida." >&2
  exit "$BUILD_STATUS"
fi
for REQUIRED_OUTPUT in "$ARTIFACT_PATH" "$MANIFEST_PATH" "$SYMBOLS_PATH"; do
  [[ -z "$REQUIRED_OUTPUT" ]] && continue
  [[ -s "$REQUIRED_OUTPUT" && -f "$REQUIRED_OUTPUT" && ! -L "$REQUIRED_OUTPUT" ]] || \
    fail "runner retornou sucesso sem todos os artefatos atestados."
  [[ "$(/usr/bin/stat -f '%Lp:%l' "$REQUIRED_OUTPUT")" == "600:1" ]] || \
    fail "runner retornou saída com modo ou número de links inseguro."
done

echo "Artefato, assinatura, manifesto e símbolos aplicáveis foram atestados."
echo "Build concluído localmente."
