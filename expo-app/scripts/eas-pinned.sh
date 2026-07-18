#!/usr/bin/env -S -i HOME=/Users/manoelnascimento PATH=/usr/bin:/bin /bin/bash --noprofile --norc
# shellcheck shell=bash
# Executor EAS fixado: allowlist mínima e nenhum comando de build/workflow/cloud.

if [[ "${1:-}" != "--internal-sanitized-bootstrap" ]]; then
  exec /usr/bin/env -i \
    HOME=/Users/manoelnascimento \
    USER=manoelnascimento \
    LOGNAME=manoelnascimento \
    LANG=C \
    LC_ALL=C \
    PATH=/usr/bin:/bin:/usr/sbin:/sbin \
    TMPDIR=/private/tmp \
    /bin/bash --noprofile --norc "$0" --internal-sanitized-bootstrap "$@"
fi
shift

set -Eeuo pipefail
umask 077

EAS_CLI_PACKAGE="eas-cli@21.0.0"
FNM_BIN="/opt/homebrew/Cellar/fnm/1.39.0/bin/fnm"
NODE_BIN="/Users/manoelnascimento/.local/share/fnm/node-versions/v22.22.3/installation/bin/node"
NPM_CLI="/Users/manoelnascimento/.local/share/fnm/node-versions/v22.22.3/installation/lib/node_modules/npm/bin/npm-cli.js"
NPX_CLI="/Users/manoelnascimento/.local/share/fnm/node-versions/v22.22.3/installation/lib/node_modules/npm/bin/npx-cli.js"
ENCRYPTED_ROOT="/Volumes/RumoPragasProdBackup"

fail_closed() {
  echo "ERRO: $1" >&2
  exit 2
}

verify_sha256() {
  local path="$1" expected="$2" actual
  [[ -f "$path" && ! -L "$path" ]] || fail_closed "toolchain EAS fixada ausente."
  actual="$(/usr/bin/shasum -a 256 "$path" | /usr/bin/awk '{print $1}')"
  [[ "$actual" == "$expected" ]] || fail_closed "toolchain EAS fixada divergiu."
}

[[ $# -gt 0 ]] || fail_closed "informe um comando EAS explicitamente permitido."
COMMAND="$1"

# O primeiro token decide tudo. build, build:*, workflow:*, cloud:* e aliases
# futuros são negados por default antes de fnm/Node/npm/npx poderem iniciar.
case "$COMMAND" in
  build|build:*|workflow|workflow:*|cloud|cloud:*)
    fail_closed "EAS Build, Workflows e comandos cloud são proibidos neste projeto."
    ;;
  env:get)
    [[ $# -eq 9 ]] || fail_closed "env:get fora do formato seguro aprovado."
    [[ "$2" =~ ^(production|preview|development)$ ]] || fail_closed "ambiente EAS inválido."
    [[ "$3" == --variable-name && "$4" =~ ^[A-Z][A-Z0-9_]*$ ]] || \
      fail_closed "variável EAS inválida."
    [[ "$5" == --scope && "$6" == project && "$7" == --format && "$8" == short && \
      "$9" == --non-interactive ]] || fail_closed "env:get fora do formato seguro aprovado."
    ;;
  env:pull)
    [[ $# -eq 5 ]] || fail_closed "env:pull fora do formato seguro aprovado."
    [[ "$2" == production && "$3" == --path && "$5" == --non-interactive ]] || \
      fail_closed "env:pull só pode ler production para path privado."
    [[ "$4" == "$ENCRYPTED_ROOT"/* && "$4" != *$'\n'* && "$4" != *$'\r'* ]] || \
      fail_closed "env:pull só pode gravar no volume criptografado aprovado."
    [[ ! -e "$4" && ! -L "$4" ]] || fail_closed "destino de env:pull já existe."
    [[ -d "$(dirname "$4")" && ! -L "$(dirname "$4")" ]] || \
      fail_closed "diretório de env:pull é inseguro."
    ENV_PULL_PARENT="$(cd "$(dirname "$4")" && pwd -P)" || \
      fail_closed "diretório de env:pull não pôde ser resolvido."
    ENV_PULL_NAME="$(basename "$4")"
    [[ "$ENV_PULL_PARENT" == "$ENCRYPTED_ROOT" || "$ENV_PULL_PARENT" == "$ENCRYPTED_ROOT"/* ]] || \
      fail_closed "env:pull escapou do volume criptografado aprovado."
    [[ "$ENV_PULL_NAME" =~ ^[A-Za-z0-9._-]+$ && "$4" == "$ENV_PULL_PARENT/$ENV_PULL_NAME" ]] || \
      fail_closed "path de env:pull não é canônico."
    ;;
  env:exec)
    [[ $# -eq 4 ]] || fail_closed "env:exec fora do formato seguro aprovado."
    [[ "$2" =~ ^(production|preview|development)$ && "$4" == --non-interactive ]] || \
      fail_closed "env:exec fora do formato seguro aprovado."
    if [[ "$3" == "./node_modules/.bin/sentry-expo-upload-sourcemaps dist" ]]; then
      :
    elif [[ "$3" =~ ^node\ \./scripts/verify-release-bundle-env\.mjs\ --platform\ ios\ --artifact\ /tmp/rumo-pragas-submit\.[A-Za-z0-9]+/candidate\.ipa$ ]]; then
      :
    elif [[ "$3" =~ ^node\ \./scripts/verify-release-bundle-env\.mjs\ --platform\ android\ --artifact\ /tmp/rumo-pragas-submit\.[A-Za-z0-9]+/candidate\.aab$ ]]; then
      :
    else
      fail_closed "comando env:exec não pertence à allowlist de release."
    fi
    ;;
  submit)
    [[ $# -eq 7 ]] || fail_closed "submit fora do formato seguro aprovado."
    [[ "$2" == --platform && "$3" =~ ^(ios|android)$ && "$4" == --profile && \
      "$5" == production && "$6" == --non-interactive && "$7" == --path=* ]] || \
      fail_closed "submit fora do formato seguro aprovado."
    SUBMIT_PATH="${7#--path=}"
    if [[ "$3" == ios ]]; then
      [[ "$SUBMIT_PATH" =~ ^/tmp/rumo-pragas-submit\.[A-Za-z0-9]+/candidate\.ipa$ ]] || \
        fail_closed "IPA de submit fora do snapshot privado."
    else
      [[ "$SUBMIT_PATH" =~ ^/tmp/rumo-pragas-submit\.[A-Za-z0-9]+/candidate\.aab$ ]] || \
        fail_closed "AAB de submit fora do snapshot privado."
    fi
    [[ -f "$SUBMIT_PATH" && ! -L "$SUBMIT_PATH" ]] || fail_closed "snapshot de submit inválido."
    ;;
  *)
    fail_closed "comando EAS não pertence à allowlist segura: $COMMAND."
    ;;
esac

verify_sha256 "$FNM_BIN" dee5acc82725a109d74989219b9adf2ec22f7bd58e8cf043b043a127ffe2c9b3
verify_sha256 "$NODE_BIN" 5d9d3872911e2340a43b707962e68143de8a4e8d54628845c0c4f2de1fb7cd5c
verify_sha256 "$NPM_CLI" 8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7
verify_sha256 "$NPX_CLI" 237adf8f3747cad8b9b62fcfd0d9c8d509a64e550337707f55100afcb79e8900
[[ "$("$FNM_BIN" --version 2>/dev/null)" == *"1.39.0" ]] || fail_closed "fnm 1.39.0 divergiu."
[[ "$("$NODE_BIN" --version 2>/dev/null)" == "v22.22.3" ]] || fail_closed "Node 22.22.3 divergiu."
[[ "$("$NODE_BIN" "$NPM_CLI" --version 2>/dev/null)" == "10.9.8" ]] || \
  fail_closed "npm 10.9.8 divergiu."

exec /usr/bin/env -i \
  HOME=/Users/manoelnascimento \
  USER=manoelnascimento \
  LOGNAME=manoelnascimento \
  LANG=C \
  LC_ALL=C \
  PATH=/Users/manoelnascimento/.local/share/fnm/node-versions/v22.22.3/installation/bin:/usr/bin:/bin:/usr/sbin:/sbin \
  TMPDIR=/private/tmp \
  CI=1 \
  DISABLE_EAS_ANALYTICS=1 \
  NO_COLOR=1 \
  FORCE_COLOR=0 \
  "$NODE_BIN" "$NPX_CLI" --yes "$EAS_CLI_PACKAGE" "$@"
