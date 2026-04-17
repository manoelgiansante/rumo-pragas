#!/bin/bash
# launch.sh — Orquestra build e submit do Rumo Pragas v1.0.0
# Uso: ./scripts/launch.sh [--skip-validate]

set -euo pipefail

cd "$(dirname "$0")/.."

echo "🚀 Rumo Pragas — Build + Submit"
echo ""

if [[ "${1:-}" != "--skip-validate" ]]; then
  echo "🔍 Validando env vars..."
  ./scripts/validate-prod-env.sh || {
    echo "❌ Validação falhou. Rode './scripts/launch.sh --skip-validate' pra pular."
    exit 1
  }
fi

echo "🔐 Verificando EAS secrets..."
REQUIRED=(
  "EXPO_PUBLIC_REVENUECAT_IOS_KEY"
  "EXPO_PUBLIC_REVENUECAT_ANDROID_KEY"
  "SENTRY_AUTH_TOKEN"
)
MISSING_SECRETS=()
if command -v eas >/dev/null 2>&1; then
  SECRETS_LIST=$(eas secret:list 2>/dev/null || true)
  for secret in "${REQUIRED[@]}"; do
    if ! echo "$SECRETS_LIST" | grep -q "$secret"; then
      MISSING_SECRETS+=("$secret")
    fi
  done
  if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
    echo "⚠️  Secrets ausentes no EAS:"
    printf '   - %s\n' "${MISSING_SECRETS[@]}"
    echo ""
    echo "Criar com: eas secret:create --scope project --name NOME --value VALOR"
    read -p "Continuar mesmo assim? (y/N) " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]] || exit 1
  fi
fi

echo "🎨 Verificando play-store-key..."
if [ ! -f play-store-key.json ]; then
  echo "❌ play-store-key.json não existe. Rode:"
  echo "   ./scripts/setup-play-store-key.sh ~/Downloads/sua-sa.json"
  exit 1
fi

if grep -q "analytics-mcp" play-store-key.json; then
  echo "❌ play-store-key.json ainda é a SA errada (analytics-mcp)."
  echo "   Crie SA no Play Console → Setup → API access → baixe JSON →"
  echo "   ./scripts/setup-play-store-key.sh ~/Downloads/sua-sa.json"
  exit 1
fi

echo "📸 Verificando screenshots..."
for size in "6.5" "6.7" "6.9"; do
  count=$(ls "store-assets/ios/$size/"*.png 2>/dev/null | wc -l | tr -d ' ')
  echo "   iOS $size\": $count PNGs"
  if [ "$count" -lt 5 ]; then
    echo "   ⚠️  Mínimo 5 screenshots recomendado"
  fi
done

echo ""
echo "🏗️  Iniciando EAS build production (iOS + Android) com auto-submit..."
echo ""
eas build --platform all --profile production --auto-submit --non-interactive

echo ""
echo "✅ Build enviado. Acompanhar:"
echo "   - iOS TestFlight: https://appstoreconnect.apple.com"
echo "   - Play Console Internal: https://play.google.com/console"
echo ""
echo "⏱️  Estimativa: iOS 30-60min, Android 1h"
