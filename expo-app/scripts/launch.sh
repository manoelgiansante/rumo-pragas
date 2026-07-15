#!/usr/bin/env bash
# launch.sh — valida e gera builds do Rumo Pragas. Nunca submete às lojas.

set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  cat <<'EOF'
Uso: ./scripts/launch.sh [opções]

Opções:
  --platform ios|android|all       Plataforma do build (padrão: all)
  --profile production|preview|development
                                  Perfil EAS (padrão: production)
  --local                         Executa eas build --local; exige uma plataforma
  --help                          Mostra esta ajuda

Este comando nunca usa --auto-submit e nunca envia um binário às lojas.
EOF
}

PLATFORM="all"
PROFILE="production"
LOCAL_BUILD=false

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
      LOCAL_BUILD=true
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
  ios|android|all) ;;
  *) echo "ERRO: plataforma inválida: $PLATFORM" >&2; exit 2 ;;
esac

case "$PROFILE" in
  production|preview|development) ;;
  *) echo "ERRO: perfil inválido: $PROFILE" >&2; exit 2 ;;
esac

if [[ "$LOCAL_BUILD" == true && "$PLATFORM" == "all" ]]; then
  echo "ERRO: build local aceita uma plataforma por execução." >&2
  echo "Use --platform ios ou --platform android." >&2
  exit 2
fi

if [[ "$LOCAL_BUILD" == true && "$PROFILE" == "production" ]]; then
  exec ./scripts/eas-local-production-build.sh --platform "$PLATFORM"
fi

[[ -x ./scripts/eas-pinned.sh ]] || {
  echo "ERRO: executor EAS fixado não encontrado." >&2
  exit 1
}

echo "Rumo Pragas — validação e build"
echo "Plataforma: $PLATFORM"
echo "Perfil: $PROFILE"
echo "Execução: $([[ "$LOCAL_BUILD" == true ]] && echo local || echo EAS Build)"

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
  --non-interactive
)

if [[ "$LOCAL_BUILD" == true ]]; then
  BUILD_COMMAND+=(--local)
fi

printf 'Executando build sem submissão automática: eas build --platform %s --profile %s' \
  "$PLATFORM" "$PROFILE"
[[ "$LOCAL_BUILD" == true ]] && printf ' --local'
printf '\n'

echo "Saída bruta do EAS suprimida; acompanhe detalhes no painel autenticado do EAS."
set +e
CI=1 "${BUILD_COMMAND[@]}" </dev/null >/dev/null 2>&1
BUILD_STATUS=$?
set -e

if [[ "$BUILD_STATUS" -ne 0 ]]; then
  echo "ERRO: EAS Build falhou com código $BUILD_STATUS; a saída bruta foi suprimida." >&2
  exit "$BUILD_STATUS"
fi

echo "Build concluído ou enfileirado. Nenhuma submissão foi iniciada."
echo "Uma submissão exige autorização explícita e o comando separado ./scripts/submit.sh."
