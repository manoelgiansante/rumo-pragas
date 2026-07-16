#!/usr/bin/env bash
# submit.sh — submissão deliberada de um artefato já gerado. Nunca é chamado pelo build.

set -Eeuo pipefail
umask 077

cd "$(dirname "$0")/.."
BUNDLE_VERIFIER="./scripts/verify-release-bundle-env.mjs"

usage() {
  cat <<'EOF'
Uso:
  ./scripts/submit.sh --platform ios|android --artifact CAMINHO --confirm-authorized-submission

O marcador --confirm-authorized-submission declara que um operador autorizado aprovou esta
submissão específica. Somente um artefato local inspecionável é aceito; IDs de builds remotos
não são elegíveis. O marcador não publica automaticamente nem substitui os gates das lojas.
EOF
}

PLATFORM=""
ARTIFACT=""
CONFIRMED=false
SNAPSHOT_DIR=""
SUBMISSION_ARTIFACT=""

cleanup_artifact_snapshot() {
  if [[ -n "$SUBMISSION_ARTIFACT" && -f "$SUBMISSION_ARTIFACT" ]]; then
    chmod 0600 "$SUBMISSION_ARTIFACT" 2>/dev/null || true
    rm -f "$SUBMISSION_ARTIFACT" || true
  fi
  if [[ -n "$SNAPSHOT_DIR" && -d "$SNAPSHOT_DIR" ]]; then
    rmdir "$SNAPSHOT_DIR" 2>/dev/null || true
  fi
}
trap cleanup_artifact_snapshot EXIT

while (($# > 0)); do
  case "$1" in
    --platform)
      [[ $# -ge 2 ]] || { echo "ERRO: --platform exige valor." >&2; exit 2; }
      PLATFORM="$2"
      shift 2
      ;;
    --build-id)
      echo "ERRO: --build-id não é aceito; informe um artefato local com --artifact." >&2
      exit 2
      ;;
    --artifact)
      [[ $# -ge 2 ]] || { echo "ERRO: --artifact exige valor." >&2; exit 2; }
      ARTIFACT="$2"
      shift 2
      ;;
    --confirm-authorized-submission)
      CONFIRMED=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "ERRO: opção desconhecida: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

[[ "$PLATFORM" == "ios" || "$PLATFORM" == "android" ]] || {
  echo "ERRO: informe exatamente uma plataforma: ios ou android." >&2
  exit 2
}

if [[ -z "$ARTIFACT" ]]; then
  echo "ERRO: informe exatamente um artefato local com --artifact." >&2
  exit 2
fi

[[ "$ARTIFACT" != -* && "$ARTIFACT" != *$'\n'* && "$ARTIFACT" != *$'\r'* ]] || {
  echo "ERRO: caminho de artefato inválido ou ambíguo." >&2
  exit 2
}
[[ -f "$ARTIFACT" ]] || {
  echo "ERRO: artefato selecionado não foi encontrado ou não é um arquivo regular." >&2
  exit 2
}
[[ ! -L "$ARTIFACT" ]] || {
  echo "ERRO: artefato selecionado deve ser um arquivo regular, não um link simbólico." >&2
  exit 2
}
if [[ "$PLATFORM" == "ios" && "$ARTIFACT" != *.ipa ]]; then
  echo "ERRO: a submissão iOS exige um artefato .ipa." >&2
  exit 2
fi
if [[ "$PLATFORM" == "android" && "$ARTIFACT" != *.aab ]]; then
  echo "ERRO: a submissão Android exige um artefato .aab." >&2
  exit 2
fi

[[ "$CONFIRMED" == true ]] || {
  echo "BLOQUEADO: submissão exige autorização explícita para este artefato." >&2
  usage >&2
  exit 3
}

command -v node >/dev/null 2>&1 || {
  echo "ERRO: Node.js não encontrado." >&2
  exit 1
}

# A cópia privada fecha a janela TOCTOU: todos os gates e o EAS recebem os
# mesmos bytes, mesmo que o caminho originalmente informado seja alterado.
SNAPSHOT_DIR="$(umask 077; mktemp -d /tmp/rumo-pragas-submit.XXXXXX)"
if [[ "$PLATFORM" == "ios" ]]; then
  SUBMISSION_ARTIFACT="$SNAPSHOT_DIR/candidate.ipa"
else
  SUBMISSION_ARTIFACT="$SNAPSHOT_DIR/candidate.aab"
fi
cp "$ARTIFACT" "$SUBMISSION_ARTIFACT"
[[ -s "$SUBMISSION_ARTIFACT" && -f "$SUBMISSION_ARTIFACT" && ! -L "$SUBMISSION_ARTIFACT" ]] || {
  echo "ERRO: não foi possível criar um snapshot local regular e não vazio." >&2
  exit 2
}
chmod 0400 "$SUBMISSION_ARTIFACT"

# A plataforma escolhida não pode ignorar bloqueios compartilhados nem ativos
# pendentes da outra loja. O status global também vincula o hash do artefato
# selecionado ao manifesto revisado antes de qualquer credencial, ambiente ou EAS.
node ./scripts/store-submission-status.mjs \
  --platform "$PLATFORM" \
  --artifact "$SUBMISSION_ARTIFACT"

[[ -x ./scripts/eas-pinned.sh ]] || {
  echo "ERRO: executor EAS fixado não encontrado." >&2
  exit 1
}

[[ -f "$BUNDLE_VERIFIER" ]] || {
  echo "ERRO: verificador fail-closed do bundle não encontrado." >&2
  exit 1
}

if [[ "$PLATFORM" == "android" ]]; then
  [[ -f play-store-key.json ]] || {
    echo "BLOQUEADO: credencial Play autorizada não encontrada no caminho local esperado." >&2
    exit 3
  }
  if grep -q 'analytics-mcp' play-store-key.json; then
    echo "BLOQUEADO: a credencial local pertence a outro serviço." >&2
    exit 3
  fi
fi

RUMO_EAS_CLI_MODE=pinned ./scripts/validate-prod-env.sh production

SUBMIT_COMMAND=(
  ./scripts/eas-pinned.sh submit
  --platform "$PLATFORM"
  --profile production
  --non-interactive
)

SUBMIT_COMMAND+=("--path=$SUBMISSION_ARTIFACT")

echo "Submissão autorizada e separada do build: plataforma $PLATFORM."
echo "Saída bruta do EAS suprimida; confirme o resultado no console autenticado da loja."
VERIFY_COMMAND="node ./scripts/verify-release-bundle-env.mjs --platform $PLATFORM --artifact $SUBMISSION_ARTIFACT"
set +e
CI=1 DISABLE_EAS_ANALYTICS=1 NO_COLOR=1 FORCE_COLOR=0 \
  ./scripts/eas-pinned.sh env:exec production "$VERIFY_COMMAND" --non-interactive \
    </dev/null >/dev/null 2>&1
VERIFY_STATUS=$?
set -e

if [[ "$VERIFY_STATUS" -ne 0 ]]; then
  echo "ERRO: o snapshot local não comprovou o ambiente de produção; submissão cancelada." >&2
  exit 1
fi

set +e
CI=1 DISABLE_EAS_ANALYTICS=1 NO_COLOR=1 FORCE_COLOR=0 \
  "${SUBMIT_COMMAND[@]}" </dev/null >/dev/null 2>&1
SUBMIT_STATUS=$?
set -e

if [[ "$SUBMIT_STATUS" -ne 0 ]]; then
  echo "ERRO: submissão falhou com código $SUBMIT_STATUS; a saída bruta foi suprimida." >&2
  exit "$SUBMIT_STATUS"
fi

echo "Submissão aceita pelo EAS. Confirme o processamento no console da loja."
