#!/usr/bin/env -S -i HOME=/Users/manoelnascimento PATH=/usr/bin:/bin /bin/bash --noprofile --norc
# shellcheck shell=bash
# launch.sh — valida e gera builds do Rumo Pragas. Nunca submete às lojas.

set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  cat <<'EOF'
Uso: ./scripts/launch.sh [opções]

Opções:
  --platform ios|android           Plataforma do build (obrigatória)
  --profile production            Único perfil nativo implementado
  --local                         Compatibilidade: todo build já é sempre local
  --help                          Mostra esta ajuda

Preview/development/storeQa são rejeitados com erro explícito até possuírem um
runner nativo local próprio. EAS Build cloud, workflow e fallback são proibidos.
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
  production)
    exec ./scripts/eas-local-production-build.sh --platform "$PLATFORM"
    ;;
  preview|development|storeQa)
    echo "BLOQUEADO: perfil '$PROFILE' ainda não possui executor nativo local atestado." >&2
    echo "Nenhum EAS Build foi iniciado; use production ou implemente o runner dedicado." >&2
    exit 3
    ;;
  *) echo "ERRO: perfil inválido: $PROFILE" >&2; exit 2 ;;
esac
