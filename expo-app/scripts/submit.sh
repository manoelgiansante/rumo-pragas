#!/usr/bin/env bash
# submit.sh — submissão deliberada de um artefato já gerado. Nunca é chamado pelo build.

set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  cat <<'EOF'
Uso:
  ./scripts/submit.sh --platform ios|android --build-id ID --confirm-authorized-submission
  ./scripts/submit.sh --platform ios|android --artifact CAMINHO --confirm-authorized-submission

O marcador --confirm-authorized-submission declara que um operador autorizado aprovou esta
submissão específica. Ele não publica uma versão automaticamente e não substitui os gates das lojas.
EOF
}

PLATFORM=""
BUILD_ID=""
ARTIFACT=""
CONFIRMED=false

while (($# > 0)); do
  case "$1" in
    --platform)
      [[ $# -ge 2 ]] || { echo "ERRO: --platform exige valor." >&2; exit 2; }
      PLATFORM="$2"
      shift 2
      ;;
    --build-id)
      [[ $# -ge 2 ]] || { echo "ERRO: --build-id exige valor." >&2; exit 2; }
      BUILD_ID="$2"
      shift 2
      ;;
    --artifact)
      [[ $# -ge 2 ]] || { echo "ERRO: --artifact exige valor." >&2; exit 2; }
      ARTIFACT="$2"
      shift 2
      ;;
    --confirm-authorized-submission)
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

[[ "$PLATFORM" == "ios" || "$PLATFORM" == "android" ]] || {
  echo "ERRO: informe exatamente uma plataforma: ios ou android." >&2
  exit 2
}

if [[ -n "$BUILD_ID" && -n "$ARTIFACT" ]] || [[ -z "$BUILD_ID" && -z "$ARTIFACT" ]]; then
  echo "ERRO: informe exatamente um --build-id ou --artifact." >&2
  exit 2
fi

[[ "$CONFIRMED" == true ]] || {
  echo "BLOQUEADO: submissão exige autorização explícita para este artefato." >&2
  usage >&2
  exit 3
}

[[ -x ./scripts/eas-pinned.sh ]] || {
  echo "ERRO: executor EAS fixado não encontrado." >&2
  exit 1
}

command -v node >/dev/null 2>&1 || {
  echo "ERRO: Node.js não encontrado." >&2
  exit 1
}

node ./scripts/validate-store-assets.mjs "$PLATFORM"

if [[ "$PLATFORM" == "android" ]]; then
  [[ -f play-store-key.json ]] || {
    echo "BLOQUEADO: credencial Play autorizada não encontrada no caminho local esperado." >&2
    exit 3
  }
  if grep -q 'analytics-mcp' play-store-key.json; then
    echo "BLOQUEADO: a credencial local pertence a outro serviço." >&2
    exit 3
  fi
fi

RUMO_EAS_CLI_MODE=pinned ./scripts/validate-prod-env.sh production

SUBMIT_COMMAND=(
  ./scripts/eas-pinned.sh submit
  --platform "$PLATFORM"
  --profile production
  --non-interactive
)

if [[ -n "$BUILD_ID" ]]; then
  SUBMIT_COMMAND+=(--id "$BUILD_ID")
else
  [[ -f "$ARTIFACT" ]] || {
    echo "ERRO: artefato não encontrado: $ARTIFACT" >&2
    exit 2
  }
  SUBMIT_COMMAND+=(--path "$ARTIFACT")
fi

echo "Submissão autorizada e separada do build: plataforma $PLATFORM."
echo "Saída bruta do EAS suprimida; confirme o resultado no console autenticado da loja."
set +e
CI=1 "${SUBMIT_COMMAND[@]}" </dev/null >/dev/null 2>&1
SUBMIT_STATUS=$?
set -e

if [[ "$SUBMIT_STATUS" -ne 0 ]]; then
  echo "ERRO: submissão falhou com código $SUBMIT_STATUS; a saída bruta foi suprimida." >&2
  exit "$SUBMIT_STATUS"
fi

echo "Submissão aceita pelo EAS. Confirme o processamento no console da loja."
