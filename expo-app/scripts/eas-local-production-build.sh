#!/usr/bin/env bash
# Gera um artefato local de produção sem gravar a saída bruta do EAS CLI.

set -Eeuo pipefail
umask 077

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACTS_DIR="$APP_ROOT/.artifacts"
REDACTOR="$APP_ROOT/scripts/redact-eas-output.mjs"
NODE_VERSION="22.22.3"
EAS_CLI_PACKAGE="eas-cli@21.0.0"

usage() {
  cat <<'EOF'
Uso: ./scripts/eas-local-production-build.sh --platform ios|android

Gera um build EAS local de produção, nunca submete às lojas e grava somente
saída sanitizada em .artifacts/. Uma plataforma por execução é obrigatória.
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

command -v fnm >/dev/null 2>&1 || {
  echo "ERRO: fnm não encontrado; Node $NODE_VERSION é obrigatório." >&2
  exit 1
}

[[ -f "$REDACTOR" ]] || {
  echo "ERRO: redator seguro de saída EAS não encontrado." >&2
  exit 1
}

ACTUAL_NODE_VERSION="$(fnm exec --using="$NODE_VERSION" -- node --version 2>/dev/null)"
if [[ "$ACTUAL_NODE_VERSION" != "v$NODE_VERSION" ]]; then
  echo "ERRO: Node $NODE_VERSION indisponível via fnm." >&2
  exit 1
fi

cd "$APP_ROOT"
./scripts/validate-prod-env.sh production

install -d -m 700 "$ARTIFACTS_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARTIFACT_PATH="$ARTIFACTS_DIR/RumoPragasIA-production-${PLATFORM}-${TIMESTAMP}.${EXTENSION}"
LOG_PATH="$ARTIFACTS_DIR/eas-${PLATFORM}-production-local-${TIMESTAMP}.log"

if [[ -e "$ARTIFACT_PATH" || -e "$LOG_PATH" ]]; then
  echo "ERRO: destino de artefato ou log já existe; execute novamente." >&2
  exit 1
fi

echo "Rumo Pragas — build EAS local de produção protegido"
echo "Plataforma: $PLATFORM"
echo "Node: $NODE_VERSION"
echo "Log sanitizado: $LOG_PATH"
echo "Artefato esperado: $ARTIFACT_PATH"
echo "Sentry: upload automático desabilitado somente nesta execução local."
echo "Nenhuma submissão será iniciada."

set +e
NO_COLOR=1 FORCE_COLOR=0 SENTRY_DISABLE_AUTO_UPLOAD=true \
  fnm exec --using="$NODE_VERSION" -- \
  npx --yes "$EAS_CLI_PACKAGE" build \
    --platform "$PLATFORM" \
    --profile production \
    --local \
    --non-interactive \
    --freeze-credentials \
    --output "$ARTIFACT_PATH" \
    2>&1 \
  | fnm exec --using="$NODE_VERSION" -- node "$REDACTOR" \
  | tee "$LOG_PATH"
PIPELINE_STATUS=("${PIPESTATUS[@]}")
set -e

BUILD_STATUS="${PIPELINE_STATUS[0]:-1}"
REDACTOR_STATUS="${PIPELINE_STATUS[1]:-1}"
TEE_STATUS="${PIPELINE_STATUS[2]:-1}"

if [[ "$REDACTOR_STATUS" -ne 0 || "$TEE_STATUS" -ne 0 ]]; then
  echo "ERRO: a sanitização ou a gravação segura do log falhou; o build não é aceito." >&2
  exit 1
fi

if [[ "$BUILD_STATUS" -ne 0 ]]; then
  echo "Build EAS local falhou com código $BUILD_STATUS; consulte somente o log sanitizado." \
    | tee -a "$LOG_PATH"
  exit "$BUILD_STATUS"
fi

if [[ ! -s "$ARTIFACT_PATH" ]]; then
  echo "ERRO: EAS retornou sucesso sem produzir um artefato não vazio." | tee -a "$LOG_PATH" >&2
  exit 1
fi

chmod 600 "$ARTIFACT_PATH" "$LOG_PATH"
echo "Build concluído. Artefato e log sanitizado estão em .artifacts/."
