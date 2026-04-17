#!/usr/bin/env bash
# =============================================================================
# validate-prod-env.sh
# =============================================================================
# Garante que todas as variaveis de ambiente obrigatorias estao configuradas
# como EAS secrets ANTES de iniciar um build de producao.
#
# Uso:
#   ./scripts/validate-prod-env.sh
#
# Rode localmente (nao no CI) — requer EAS CLI autenticado.
# =============================================================================

set -euo pipefail

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Lista de EAS secrets obrigatorios para o canal production
# (valores sensiveis ou keys SDK que queremos como secret por higiene)
REQUIRED_SECRETS=(
  "EXPO_PUBLIC_REVENUECAT_IOS_KEY"
  "EXPO_PUBLIC_REVENUECAT_ANDROID_KEY"
  "SENTRY_AUTH_TOKEN"
)

# Env vars publicas obrigatorias em eas.json production.env
# (sao referenciadas em codigo e precisam estar no build)
REQUIRED_EAS_JSON_VARS=(
  "EXPO_PUBLIC_SENTRY_DSN"
  "EXPO_PUBLIC_REVENUECAT_IOS_KEY"
  "EXPO_PUBLIC_REVENUECAT_ANDROID_KEY"
)

echo -e "${YELLOW}Validando configuracao de build production...${NC}"
echo ""

# -----------------------------------------------------------------------------
# 1. Checar EAS CLI + secrets
# -----------------------------------------------------------------------------
echo -e "${YELLOW}[1/2] EAS secrets${NC}"

if ! command -v eas >/dev/null 2>&1; then
  echo -e "${RED}ERRO: EAS CLI nao encontrado. Instale com: npm install -g eas-cli${NC}"
  exit 1
fi

# Lista secrets uma vez (evita N chamadas)
SECRET_LIST=$(eas secret:list --json 2>/dev/null || echo "[]")

MISSING_SECRETS=()
FOUND_SECRETS=()

for secret in "${REQUIRED_SECRETS[@]}"; do
  if echo "$SECRET_LIST" | grep -q "\"name\": \"$secret\""; then
    FOUND_SECRETS+=("$secret")
  else
    MISSING_SECRETS+=("$secret")
  fi
done

for s in "${FOUND_SECRETS[@]}"; do
  echo -e "  ${GREEN}OK${NC}      $s"
done

for s in "${MISSING_SECRETS[@]}"; do
  echo -e "  ${RED}MISSING${NC} $s"
done

echo ""

# -----------------------------------------------------------------------------
# 2. Checar eas.json production.env
# -----------------------------------------------------------------------------
echo -e "${YELLOW}[2/2] eas.json build.production.env${NC}"

if [ ! -f "eas.json" ]; then
  echo -e "${RED}ERRO: eas.json nao encontrado. Rode este script em expo-app/${NC}"
  exit 1
fi

MISSING_EAS_VARS=()
FOUND_EAS_VARS=()

for var in "${REQUIRED_EAS_JSON_VARS[@]}"; do
  if grep -q "\"$var\"" eas.json; then
    FOUND_EAS_VARS+=("$var")
  else
    MISSING_EAS_VARS+=("$var")
  fi
done

for v in "${FOUND_EAS_VARS[@]}"; do
  echo -e "  ${GREEN}OK${NC}      $v"
done

for v in "${MISSING_EAS_VARS[@]}"; do
  echo -e "  ${RED}MISSING${NC} $v"
done

echo ""

# -----------------------------------------------------------------------------
# Relatorio final
# -----------------------------------------------------------------------------
TOTAL_MISSING=$((${#MISSING_SECRETS[@]} + ${#MISSING_EAS_VARS[@]}))

if [ $TOTAL_MISSING -gt 0 ]; then
  echo -e "${RED}FALHA: $TOTAL_MISSING itens faltando.${NC}"
  echo ""

  if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
    echo "Crie os secrets faltando:"
    for s in "${MISSING_SECRETS[@]}"; do
      echo "  eas secret:create --scope project --name $s --value <VALUE>"
    done
    echo ""
  fi

  if [ ${#MISSING_EAS_VARS[@]} -gt 0 ]; then
    echo "Adicione em eas.json > build.production.env:"
    for v in "${MISSING_EAS_VARS[@]}"; do
      echo "  \"$v\": \"@$v\""
    done
    echo ""
  fi

  echo "Docs:"
  echo "  RevenueCat: https://app.revenuecat.com > Project Settings > API Keys"
  echo "  Sentry:     https://sentry.io > Settings > Auth Tokens"
  exit 1
fi

echo -e "${GREEN}Todos os secrets + env vars estao configurados. Pronto pra build.${NC}"
exit 0
