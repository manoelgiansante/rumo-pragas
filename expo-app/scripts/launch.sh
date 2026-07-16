#!/usr/bin/env bash
# launch.sh — valida e gera builds do Rumo Pragas. Nunca submete às lojas.

set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  cat <<'EOF'
Uso: ./scripts/launch.sh [opções]

Opções:
  --platform ios|android           Plataforma do build (obrigatória)
  --profile production|preview|development|storeQa
                                  Perfil EAS (padrão: production)
  --local                         Compatibilidade: todo build já é sempre local
  --help                          Mostra esta ajuda

Este comando sempre usa o executor fixado e --local, nunca usa EAS Build cloud,
nunca faz fallback remoto, nunca usa --auto-submit e nunca envia um binário às lojas.
EOF
}

PLATFORM=""
PROFILE="production"

while (($# > 0)); do
  case "$1" in
    --platform)
      [[ $# -ge 2 ]] || { echo "ERRO: --platform exige um valor." >&2; exit 2; }
      PLATFORM="$2"
      shift 2
      ;;
    --profile)
      [[ $# -ge 2 ]] || { echo "ERRO: --profile exige um valor." >&2; exit 2; }
      PROFILE="$2"
      shift 2
      ;;
    --local)
      # Mantida por compatibilidade com comandos antigos. O caminho já é sempre local.
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

case "$PLATFORM" in
  ios|android) ;;
  *)
    echo "ERRO: informe exatamente uma plataforma local: ios ou android." >&2
    exit 2
    ;;
esac

case "$PROFILE" in
  production|preview|development|storeQa) ;;
  *) echo "ERRO: perfil inválido: $PROFILE" >&2; exit 2 ;;
esac

if [[ "$PROFILE" == "production" ]]; then
  exec ./scripts/eas-local-production-build.sh --platform "$PLATFORM"
fi

[[ -x ./scripts/eas-pinned.sh ]] || {
  echo "ERRO: executor EAS fixado não encontrado." >&2
  exit 1
}

echo "Rumo Pragas — validação e build"
echo "Plataforma: $PLATFORM"
echo "Perfil: $PROFILE"
echo "Execução: EAS local obrigatório (cloud e fallback remoto desabilitados)"

if [[ "$PROFILE" == "production" ]]; then
  RUMO_EAS_CLI_MODE=pinned ./scripts/validate-prod-env.sh production
else
  echo "Perfil interno: validação de secrets de produção não se aplica."
fi

SCREENSHOT_COUNT=$(find store-assets/ios store-assets/android \
  -type f -name '*.png' ! -path '*/archive/*' ! -name 'feature-graphic.png' 2>/dev/null \
  | wc -l | tr -d ' ')
if [[ "$SCREENSHOT_COUNT" -eq 0 ]]; then
  echo "AVISO: não há screenshots reais no caminho de submissão."
  echo "Isso não bloqueia o build, mas bloqueia ./scripts/submit.sh."
fi

BUILD_COMMAND=(
  ./scripts/eas-pinned.sh build
  --platform "$PLATFORM"
  --profile "$PROFILE"
  --local
  --non-interactive
)

printf 'Executando build local sem submissão automática: eas build --platform %s --profile %s --local' \
  "$PLATFORM" "$PROFILE"
printf '\n'

echo "Saída bruta do EAS suprimida; falhas locais retornam somente um código seguro."
set +e
CI=1 "${BUILD_COMMAND[@]}" </dev/null >/dev/null 2>&1
BUILD_STATUS=$?
set -e

if [[ "$BUILD_STATUS" -ne 0 ]]; then
  echo "ERRO: EAS Build falhou com código $BUILD_STATUS; a saída bruta foi suprimida." >&2
  exit "$BUILD_STATUS"
fi

echo "Build local concluído. Nenhuma submissão foi iniciada."
echo "Uma submissão exige autorização explícita e o comando separado ./scripts/submit.sh."
