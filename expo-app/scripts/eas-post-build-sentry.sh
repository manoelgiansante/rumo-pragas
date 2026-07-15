#!/usr/bin/env bash

# Arquivo de compatibilidade deliberadamente bloqueado.
#
# O EAS Build envia os source maps nativos automaticamente quando o plugin
# oficial do Sentry está configurado e SENTRY_AUTH_TOKEN existe no ambiente.
# Finalizar uma release com o buildNumber local gerava um identificador que não
# corresponde à numeração remota usada pelo autoIncrement do EAS.

set -euo pipefail

echo "ERRO: o hook Sentry legado foi desativado." >&2
echo "Build nativo: use o upload automático do plugin Expo/Sentry." >&2
echo "EAS Update: publique explicitamente e depois execute scripts/upload-sentry-ota.sh." >&2
exit 64
