#!/usr/bin/env bash
# Gera um artefato local de produção sem gravar a saída bruta do EAS CLI.

set -Eeuo pipefail
umask 077

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACTS_DIR="$APP_ROOT/.artifacts"
EAS_EXECUTOR="$APP_ROOT/scripts/eas-pinned.sh"
BUNDLE_VERIFIER="$APP_ROOT/scripts/verify-release-bundle-env.mjs"
ARTIFACT_PATH=""
REJECTED_PATH=""

quarantine_partial_artifact() {
  local exit_status=$?
  trap - EXIT
  if [[ "$exit_status" -ne 0 && -n "$ARTIFACT_PATH" ]] && \
    [[ -e "$ARTIFACT_PATH" || -L "$ARTIFACT_PATH" ]]; then
    REJECTED_PATH="${ARTIFACT_PATH}.rejected"
    set +e
    mv "$ARTIFACT_PATH" "$REJECTED_PATH" 2>/dev/null
    local move_status=$?
    if [[ "$move_status" -eq 0 ]]; then
      if [[ -f "$REJECTED_PATH" && ! -L "$REJECTED_PATH" ]]; then
        chmod 600 "$REJECTED_PATH" 2>/dev/null || true
      fi
    else
      rm -f "$ARTIFACT_PATH" 2>/dev/null || rmdir "$ARTIFACT_PATH" 2>/dev/null || true
    fi
    set -e
  fi
  exit "$exit_status"
}

usage() {
  cat <<'EOF'
Uso: ./scripts/eas-local-production-build.sh --platform ios|android

Gera um build EAS local de produção, nunca submete às lojas e grava somente
um registro de status controlado em .artifacts/. A saída bruta do EAS é
suprimida. Uma plataforma por execução é obrigatória.
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
  ios)
    EXTENSION="ipa"
    ;;
  android)
    EXTENSION="aab"
    ;;
  *)
    echo "ERRO: informe exatamente --platform ios ou --platform android." >&2
    exit 2
    ;;
esac

[[ -x "$EAS_EXECUTOR" ]] || {
  echo "ERRO: executor EAS fixado não encontrado." >&2
  exit 1
}

[[ -f "$BUNDLE_VERIFIER" ]] || {
  echo "ERRO: verificador fail-closed do bundle não encontrado." >&2
  exit 1
}

cd "$APP_ROOT"
RUMO_EAS_CLI_MODE=pinned ./scripts/validate-prod-env.sh production

install -d -m 700 "$ARTIFACTS_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARTIFACT_PATH="$ARTIFACTS_DIR/RumoPragasIA-production-${PLATFORM}-${TIMESTAMP}.${EXTENSION}"
REJECTED_PATH="${ARTIFACT_PATH}.rejected"
LOG_PATH="$ARTIFACTS_DIR/eas-${PLATFORM}-production-local-${TIMESTAMP}.log"

if [[ -e "$ARTIFACT_PATH" || -e "$REJECTED_PATH" || -e "$LOG_PATH" ]]; then
  echo "ERRO: destino de artefato ou log já existe; execute novamente." >&2
  exit 1
fi
trap quarantine_partial_artifact EXIT

echo "Rumo Pragas — build EAS local de produção protegido"
echo "Plataforma: $PLATFORM"
echo "Executor: Node 22.22.3 + EAS CLI 21.0.0 fixados"
echo "Log seguro de status: $LOG_PATH"
echo "Artefato esperado: $ARTIFACT_PATH"
echo "Sentry: upload automático desabilitado somente nesta execução local."
echo "Saída do EAS: suprimida para impedir exposição de credenciais."
echo "Nenhuma submissão será iniciada."

{
  echo "Rumo Pragas — status do build EAS local de produção"
  echo "Plataforma: $PLATFORM"
  echo "Início UTC: $TIMESTAMP"
  echo "Saída bruta do EAS suprimida por segurança."
} >"$LOG_PATH"
chmod 600 "$LOG_PATH"

set +e
CI=1 DISABLE_EAS_ANALYTICS=1 NO_COLOR=1 FORCE_COLOR=0 SENTRY_DISABLE_AUTO_UPLOAD=true \
  "$EAS_EXECUTOR" build \
    --platform "$PLATFORM" \
    --profile production \
    --local \
    --non-interactive \
    --freeze-credentials \
    --output "$ARTIFACT_PATH" \
    </dev/null >/dev/null 2>&1
BUILD_STATUS=$?
set -e

if [[ "$BUILD_STATUS" -ne 0 ]]; then
  echo "Build EAS local falhou com código $BUILD_STATUS; a saída bruta foi suprimida." \
    | tee -a "$LOG_PATH"
  exit "$BUILD_STATUS"
fi

if [[ ! -s "$ARTIFACT_PATH" ]]; then
  echo "ERRO: EAS retornou sucesso sem produzir um artefato não vazio." | tee -a "$LOG_PATH" >&2
  exit 1
fi

chmod 600 "$ARTIFACT_PATH" "$LOG_PATH"
ARTIFACT_FILENAME="$(basename "$ARTIFACT_PATH")"
VERIFY_COMMAND="node ./scripts/verify-release-bundle-env.mjs --platform $PLATFORM --artifact ./.artifacts/$ARTIFACT_FILENAME"

set +e
CI=1 DISABLE_EAS_ANALYTICS=1 NO_COLOR=1 FORCE_COLOR=0 \
  "$EAS_EXECUTOR" env:exec production "$VERIFY_COMMAND" --non-interactive \
    </dev/null >/dev/null 2>&1
VERIFY_STATUS=$?
set -e

if [[ "$VERIFY_STATUS" -ne 0 ]]; then
  echo "ERRO: bundle não comprovou o ambiente de produção; artefato marcado como rejeitado." \
    | tee -a "$LOG_PATH" >&2
  exit 1
fi

echo "Bundle validado sem exibir valores de ambiente." | tee -a "$LOG_PATH"
echo "Build concluído. Artefato e log seguro de status estão em .artifacts/."
