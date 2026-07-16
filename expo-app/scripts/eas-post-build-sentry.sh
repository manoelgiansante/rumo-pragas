#!/usr/bin/env bash

# Arquivo de compatibilidade deliberadamente bloqueado.
#
# O build local protegido define SENTRY_DISABLE_AUTO_UPLOAD=true. Qualquer
# upload nativo separado exige autorização e gate próprios.
# Finalizar uma release com o buildNumber local gerava um identificador que não
# corresponde à numeração remota usada pelo autoIncrement do EAS.

set -euo pipefail

echo "ERRO: o hook Sentry legado foi desativado." >&2
echo "Build nativo local: upload automático desativado; qualquer upload separado exige autorização e gate próprios." >&2
echo "EAS Update: publique explicitamente e depois execute scripts/upload-sentry-ota.sh." >&2
exit 64
