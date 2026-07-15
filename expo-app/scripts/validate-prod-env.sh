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
    fnm exec --using=22.22.3 -- node --version >/dev/null 2>&1 || {
      echo "ERRO: Node 22.22.3 indisponível via fnm." >&2
      exit 1
    }
    [[ -x ./scripts/eas-pinned.sh ]] || {
      echo "ERRO: executor EAS fixado não encontrado." >&2
      exit 1
    }
    EAS_COMMAND=(./scripts/eas-pinned.sh)
    NODE_COMMAND=(fnm exec --using=22.22.3 -- node)
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

REQUIRED_REMOTE_NAMES=(
  "EXPO_PUBLIC_SUPABASE_URL"
  "EXPO_PUBLIC_SUPABASE_ANON_KEY"
  "EXPO_PUBLIC_SENTRY_DSN"
  "GOOGLE_SERVICES_JSON"
  "SENTRY_AUTH_TOKEN"
)

OPTIONAL_GOOGLE_NAMES=(
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"
  "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID"
)

echo "Validando configuração do ambiente EAS '$EAS_ENVIRONMENT' sem exibir valores..."

PROBE_SCRIPT="./scripts/probe-eas-env.mjs"
[[ -f "$PROBE_SCRIPT" ]] || {
  echo "ERRO: verificador seguro do EAS Environment não encontrado." >&2
  exit 1
}

probe_name() {
  local name="$1"
  "${NODE_COMMAND[@]}" "$PROBE_SCRIPT" "$name" "$EAS_ENVIRONMENT" "${EAS_COMMAND[@]}"
}

ALL_REMOTE_NAMES=("${REQUIRED_REMOTE_NAMES[@]}" "${OPTIONAL_GOOGLE_NAMES[@]}")
PROBE_PIDS=()

cancel_probes() {
  local exit_code="$1"
  trap - HUP INT TERM
  for pid in "${PROBE_PIDS[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  for pid in "${PROBE_PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
  exit "$exit_code"
}

trap 'cancel_probes 129' HUP
trap 'cancel_probes 130' INT
trap 'cancel_probes 143' TERM

for name in "${ALL_REMOTE_NAMES[@]}"; do
  probe_name "$name" &
  PROBE_PIDS+=("$!")
done

PROBE_STATUSES=()
set +e
for index in "${!PROBE_PIDS[@]}"; do
  wait "${PROBE_PIDS[$index]}"
  PROBE_STATUSES[index]=$?
done
set -e
trap - HUP INT TERM

MISSING=()
REQUIRED_COUNT=${#REQUIRED_REMOTE_NAMES[@]}
for ((index = 0; index < REQUIRED_COUNT; index++)); do
  name="${ALL_REMOTE_NAMES[$index]}"
  probe_status="${PROBE_STATUSES[$index]}"
  case "$probe_status" in
    0) echo "OK: variável remota presente: $name" ;;
    3) MISSING+=("EAS Environment:$name") ;;
    124)
      echo "ERRO: consulta EAS excedeu 30 segundos para $name." >&2
      exit 1
      ;;
    *)
      echo "ERRO: não foi possível consultar $name no EAS Environment." >&2
      exit 1
      ;;
  esac
done

for ((index = REQUIRED_COUNT; index < ${#ALL_REMOTE_NAMES[@]}; index++)); do
  name="${ALL_REMOTE_NAMES[$index]}"
  probe_status="${PROBE_STATUSES[$index]}"
  case "$probe_status" in
    0) echo "OK: provedor Google opcional configurado: $name" ;;
    3) echo "N/A: $name ausente; CTA Google correspondente ficará oculto." ;;
    124)
      echo "ERRO: consulta EAS excedeu 30 segundos para $name." >&2
      exit 1
      ;;
    *)
      echo "ERRO: não foi possível consultar $name no EAS Environment." >&2
      exit 1
      ;;
  esac
done

if ((${#MISSING[@]} > 0)); then
  echo "ERRO: configuração obrigatória ausente:" >&2
  printf '  - %s\n' "${MISSING[@]}" >&2
  echo "Cadastre o valor no EAS Environment; não o passe na linha de comando." >&2
  exit 1
fi

echo "Validação concluída. Nenhum valor foi impresso."
