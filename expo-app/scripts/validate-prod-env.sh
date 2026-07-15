#!/usr/bin/env bash
# Valida nomes obrigatórios no EAS Environment sem imprimir valores.

set -euo pipefail

cd "$(dirname "$0")/.."

EAS_ENVIRONMENT="${1:-production}"
case "$EAS_ENVIRONMENT" in
  production|preview|development) ;;
  *) echo "ERRO: ambiente EAS inválido: $EAS_ENVIRONMENT" >&2; exit 2 ;;
esac

case "${RUMO_EAS_CLI_MODE:-system}" in
  pinned)
    command -v fnm >/dev/null 2>&1 || {
      echo "ERRO: fnm não encontrado para executar o EAS CLI fixado." >&2
      exit 1
    }
    PINNED_NODE="$(fnm exec --using=22.22.3 -- node -p 'process.execPath' 2>/dev/null)"
    [[ -x "$PINNED_NODE" ]] || {
      echo "ERRO: Node 22.22.3 indisponível via fnm." >&2
      exit 1
    }
    [[ "$("$PINNED_NODE" --version 2>/dev/null)" == "v22.22.3" ]] || {
      echo "ERRO: Node 22.22.3 indisponível via fnm." >&2
      exit 1
    }
    [[ -x ./scripts/eas-pinned.sh ]] || {
      echo "ERRO: executor EAS fixado não encontrado." >&2
      exit 1
    }
    EAS_COMMAND=(./scripts/eas-pinned.sh)
    NODE_COMMAND=("$PINNED_NODE")
    ;;
  system)
    command -v node >/dev/null 2>&1 || {
      echo "ERRO: Node.js não encontrado." >&2
      exit 1
    }
    command -v eas >/dev/null 2>&1 || {
      echo "ERRO: EAS CLI não encontrado." >&2
      exit 1
    }
    EAS_COMMAND=(eas)
    NODE_COMMAND=(node)
    ;;
  *)
    echo "ERRO: modo interno de EAS CLI inválido." >&2
    exit 2
    ;;
esac

[[ -f eas.json ]] || {
  echo "ERRO: expo-app/eas.json não encontrado." >&2
  exit 1
}

VALIDATOR_SCRIPT="./scripts/validate-prod-env.mjs"
[[ -f "$VALIDATOR_SCRIPT" ]] || {
  echo "ERRO: coordenador seguro do EAS Environment não encontrado." >&2
  exit 1
}

# Substituir o shell pelo coordenador Node evita que traps POSIX fiquem bloqueadas
# por `wait` em runners Linux enquanto ainda garante o encerramento dos oito probes.
exec "${NODE_COMMAND[@]}" "$VALIDATOR_SCRIPT" \
  "$EAS_ENVIRONMENT" "${EAS_COMMAND[@]}"
