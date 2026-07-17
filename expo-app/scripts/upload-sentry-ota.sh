#!/usr/bin/env bash

# Envia ao Sentry somente os source maps já gerados por um EAS Update.
# Este script não publica uma atualização OTA e exige confirmação explícita.

set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  cat <<'EOF'
Uso:
  ./scripts/upload-sentry-ota.sh --environment <production|preview|development> --confirm-sourcemap-upload

Pré-condição:
  Execute e revise primeiro o `eas update` autorizado. O diretório `dist/`
  produzido por essa atualização deve permanecer intacto.
EOF
}

ENVIRONMENT=""
CONFIRMED=false

while (($# > 0)); do
  case "$1" in
    --environment)
      [[ $# -ge 2 ]] || { echo "ERRO: valor ausente para --environment." >&2; exit 2; }
      ENVIRONMENT="$2"
      shift 2
      ;;
    --confirm-sourcemap-upload)
      CONFIRMED=true
      shift
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

case "$ENVIRONMENT" in
  production|preview|development) ;;
  "") echo "ERRO: --environment é obrigatório." >&2; exit 2 ;;
  *) echo "ERRO: ambiente EAS inválido: $ENVIRONMENT" >&2; exit 2 ;;
esac

[[ "$CONFIRMED" == true ]] || {
  echo "ERRO: confirme o upload com --confirm-sourcemap-upload." >&2
  exit 3
}

[[ -d dist ]] || {
  echo "ERRO: dist/ ausente. Execute e revise primeiro o EAS Update autorizado." >&2
  exit 1
}

if ! find dist -type f -name '*.map' -print -quit | grep -q .; then
  echo "ERRO: nenhum source map foi encontrado em dist/." >&2
  exit 1
fi

[[ -x ./scripts/eas-pinned.sh ]] || {
  echo "ERRO: executor EAS fixado não encontrado." >&2
  exit 1
}

[[ -x node_modules/.bin/sentry-expo-upload-sourcemaps ]] || {
  echo "ERRO: dependências ausentes. Execute npm ci antes do upload." >&2
  exit 1
}

RUMO_EAS_CLI_MODE=pinned ./scripts/validate-prod-env.sh "$ENVIRONMENT"

echo "Enviando source maps OTA do ambiente '$ENVIRONMENT'; nenhum segredo será exibido pelo script."
set +e
CI=1 ./scripts/eas-pinned.sh env:exec "$ENVIRONMENT" \
  './node_modules/.bin/sentry-expo-upload-sourcemaps dist' \
  --non-interactive \
  </dev/null >/dev/null 2>&1
UPLOAD_STATUS=$?
set -e

if [[ "$UPLOAD_STATUS" -ne 0 ]]; then
  echo "ERRO: upload de source maps falhou; a saída bruta foi suprimida." >&2
  exit "$UPLOAD_STATUS"
fi

echo "Upload concluído. Valide a symbolication do release/dist no Sentry antes de encerrar a atualização."
