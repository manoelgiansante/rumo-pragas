#!/usr/bin/env bash
# Executor único do EAS CLI para evitar versões globais divergentes.

set -Eeuo pipefail

NODE_VERSION="22.22.3"
EAS_CLI_PACKAGE="eas-cli@21.0.0"

fail_closed() {
  echo "ERRO: $1" >&2
  exit 2
}

if (($# > 0)); then
  IS_BUILD_COMMAND=false
  for ARGUMENT in "$@"; do
    case "$ARGUMENT" in
      build)
        IS_BUILD_COMMAND=true
        ;;
      workflow|workflow:*)
        fail_closed "EAS Workflows remotos são proibidos porque podem iniciar build em nuvem."
        ;;
    esac
  done

  if [[ "$IS_BUILD_COMMAND" == true ]]; then
      LOCAL_BUILD=false
      BUILD_PLATFORM=""
      EXPECT_PLATFORM_VALUE=false

      for ARGUMENT in "$@"; do
        if [[ "$EXPECT_PLATFORM_VALUE" == true ]]; then
          [[ -z "$BUILD_PLATFORM" ]] || fail_closed "--platform não pode ser repetido."
          BUILD_PLATFORM="$ARGUMENT"
          EXPECT_PLATFORM_VALUE=false
          continue
        fi

        case "$ARGUMENT" in
          --local)
            LOCAL_BUILD=true
            ;;
          --local=*)
            fail_closed "use exatamente --local; valores booleanos não são aceitos."
            ;;
          --no-local*)
            fail_closed "nenhuma opção pode desativar o modo local obrigatório."
            ;;
          --platform)
            EXPECT_PLATFORM_VALUE=true
            ;;
          --platform=*)
            [[ -z "$BUILD_PLATFORM" ]] || fail_closed "--platform não pode ser repetido."
            BUILD_PLATFORM="${ARGUMENT#--platform=}"
            ;;
          --auto-submit*)
            fail_closed "build e submissão devem permanecer comandos separados."
            ;;
          --)
            fail_closed "o delimitador -- não é aceito em builds protegidos."
            ;;
        esac
      done

      [[ "$EXPECT_PLATFORM_VALUE" == false ]] || fail_closed "--platform exige um valor."
      [[ "$LOCAL_BUILD" == true ]] || fail_closed "build em nuvem é proibido; use --local."
      case "$BUILD_PLATFORM" in
        ios|android) ;;
        *) fail_closed "build local exige exatamente --platform ios ou --platform android." ;;
      esac
  fi
fi

command -v fnm >/dev/null 2>&1 || {
  echo "ERRO: fnm não encontrado; Node $NODE_VERSION é obrigatório." >&2
  exit 1
}

ACTUAL_NODE_VERSION="$(fnm exec --using="$NODE_VERSION" -- node --version 2>/dev/null)"
if [[ "$ACTUAL_NODE_VERSION" != "v$NODE_VERSION" ]]; then
  echo "ERRO: Node $NODE_VERSION indisponível via fnm." >&2
  exit 1
fi

exec env DISABLE_EAS_ANALYTICS=1 NO_COLOR=1 FORCE_COLOR=0 \
  fnm exec --using="$NODE_VERSION" -- npx --yes "$EAS_CLI_PACKAGE" "$@"
