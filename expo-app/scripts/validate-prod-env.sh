#!/usr/bin/env bash
# Valida nomes obrigatórios no EAS Environment sem imprimir valores.

set -euo pipefail

cd "$(dirname "$0")/.."

EAS_ENVIRONMENT="${1:-production}"
case "$EAS_ENVIRONMENT" in
  production|preview|development) ;;
  *) echo "ERRO: ambiente EAS inválido: $EAS_ENVIRONMENT" >&2; exit 2 ;;
esac

command -v eas >/dev/null 2>&1 || {
  echo "ERRO: EAS CLI não encontrado." >&2
  exit 1
}

command -v node >/dev/null 2>&1 || {
  echo "ERRO: Node.js não encontrado." >&2
  exit 1
}

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

# A saída fica somente em memória. Sem --include-sensitive, e sem echo do conteúdo,
# nenhum valor público ou secreto chega aos logs.
if ! EAS_ENV_LIST=$(eas env:list --environment "$EAS_ENVIRONMENT" --scope project --format short 2>/dev/null); then
  echo "ERRO: não foi possível consultar o EAS Environment. Verifique autenticação e projeto." >&2
  exit 1
fi

MISSING=()
for name in "${REQUIRED_REMOTE_NAMES[@]}"; do
  if grep -Eq "(^|[[:space:]])${name}([[:space:]=]|$)" <<<"$EAS_ENV_LIST"; then
    echo "OK: variável remota presente: $name"
  else
    MISSING+=("EAS Environment:$name")
  fi
done

for name in "${OPTIONAL_GOOGLE_NAMES[@]}"; do
  if grep -Eq "(^|[[:space:]])${name}([[:space:]=]|$)" <<<"$EAS_ENV_LIST"; then
    echo "OK: provedor Google opcional configurado: $name"
  else
    echo "N/A: $name ausente; CTA Google correspondente ficará oculto."
  fi
done
unset EAS_ENV_LIST

if ((${#MISSING[@]} > 0)); then
  echo "ERRO: configuração obrigatória ausente:" >&2
  printf '  - %s\n' "${MISSING[@]}" >&2
  echo "Cadastre o valor no EAS Environment; não o passe na linha de comando." >&2
  exit 1
fi

echo "Validação concluída. Nenhum valor foi impresso."
