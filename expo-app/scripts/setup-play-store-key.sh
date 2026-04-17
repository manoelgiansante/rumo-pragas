#!/bin/bash
# Uso: ./scripts/setup-play-store-key.sh /path/to/downloaded-play-key.json
#
# Instala o Service Account JSON do Google Play Console no local correto
# para que `eas submit --platform android` consiga autenticar.
#
# Criar o Service Account em:
#   https://play.google.com/console -> Setup -> API access
#   Grant: "Release apps to testing tracks" + "Release apps to production"
#
# Confirma que NAO e o analytics-mcp (project_id = "agrorumo") — esse e errado.

set -e

if [ -z "$1" ]; then
  echo "Uso: $0 /path/to/downloaded-play-key.json"
  exit 1
fi

if [ ! -f "$1" ]; then
  echo "Erro: arquivo '$1' nao encontrado"
  exit 1
fi

# Sanity check: confirmar que nao e o analytics-mcp errado
if grep -q '"project_id": "agrorumo"' "$1"; then
  echo "ERRO: este arquivo e o Service Account do analytics-mcp (project_id=agrorumo)."
  echo "NAO e o Service Account do Google Play Console."
  echo "Criar um NOVO em: https://play.google.com/console -> Setup -> API access"
  exit 1
fi

# Sanity check: deve ser type=service_account
if ! grep -q '"type": "service_account"' "$1"; then
  echo "ERRO: arquivo nao parece um Service Account JSON valido (falta \"type\": \"service_account\")."
  exit 1
fi

TARGET_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$TARGET_DIR/play-store-key.json"

cp "$1" "$TARGET"
chmod 600 "$TARGET"

echo "OK. play-store-key.json configurado em $TARGET"
echo "Permissoes: $(stat -f '%Sp' "$TARGET" 2>/dev/null || stat -c '%A' "$TARGET" 2>/dev/null)"
echo ""
echo "Proximo passo:"
echo "  eas submit --platform android --profile production"
