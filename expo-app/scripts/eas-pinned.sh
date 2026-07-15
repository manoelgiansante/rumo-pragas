#!/usr/bin/env bash
# Executor único do EAS CLI para evitar versões globais divergentes.

set -Eeuo pipefail

NODE_VERSION="22.22.3"
EAS_CLI_PACKAGE="eas-cli@21.0.0"

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
