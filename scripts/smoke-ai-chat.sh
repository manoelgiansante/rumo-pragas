#!/usr/bin/env bash
# PR-26 (18/jul/2026) — Smoke SVP re-executável do chat IA em PRODUÇÃO
# do Rumo Pragas. Reproduz o E2E verificado 17/jul (CLAUDE.md "Estado
# operacional 17/07/2026"). Roda contra jxcnfyeemdltdfqtgbcl. Use uma
# conta demo dedicada — NÃO rode com o e-mail de um usuário real.
#
# Uso:
#   PRAGAS_SMOKE_EMAIL='demo@example.com' \
#   PRAGAS_SMOKE_PASSWORD='***' \
#   PRAGAS_SUPABASE_URL='https://jxcnfyeemdltdfqtgbcl.supabase.co' \
#   PRAGAS_SUPABASE_ANON_KEY='eyJ...' \
#     bash scripts/smoke-ai-chat.sh
#
# Exit codes:
#   0  — todas as etapas retornaram HTTP 200
#   1  — alguma etapa falhou (imprime FAIL + status + latência)
#   2  — env obrigatório ausente
#
# Segurança: NUNCA ecoar token/senha/JWT. `set -x` NÃO é ligado.
# Fluxo:
#   1) POST /auth/v1/token?grant_type=password  → access_token
#   2) POST /functions/v1/ai-chat               (slug compartilhado)
#   3) POST /rest/v1/rpc/pragas_link_account    (link app-scoped)
#   4) POST /rest/v1/rpc/grant_pragas_ai_consent (chat, versão vigente)
#   5) POST /functions/v1/ai-chat-pragas        (slug dedicado)
set -euo pipefail

# ── ENV obrigatório ──────────────────────────────────────────────────
: "${PRAGAS_SMOKE_EMAIL:?exit 2: PRAGAS_SMOKE_EMAIL não definido (conta demo dedicada)}"
: "${PRAGAS_SMOKE_PASSWORD:?exit 2: PRAGAS_SMOKE_PASSWORD não definido}"
: "${PRAGAS_SUPABASE_URL:=https://jxcnfyeemdltdfqtgbcl.supabase.co}"
: "${PRAGAS_SUPABASE_ANON_KEY:?exit 2: PRAGAS_SUPABASE_ANON_KEY não definido (anon key do jxcn)}"

# Contrato-espelho do client (expo-app/services/*):
#   - services/aiConsent.ts:6  → AI_CONSENT_VERSION
#   - services/ai-chat.ts:54,66-73 → endpoint + headers do ai-chat-pragas
#   - services/pragasAccount.ts:60-91 → contrato do pragas_link_account
AI_CONSENT_VERSION='2026-07-14.1'

# ── Utilitário ───────────────────────────────────────────────────────
# uuid4 sem depender de uuidgen (nem sempre está instalado); usa /dev/urandom.
uuid4() {
  python3 -c 'import uuid; print(uuid.uuid4())' 2>/dev/null \
    || command -v uuidgen >/dev/null 2>&1 && uuidgen \
    || printf '%08x-%04x-4%03x-%04x-%012x\n' \
         "$RANDOM$RANDOM" "$RANDOM" "$RANDOM" "$((RANDOM + 32768))" "$RANDOM$RANDOM$RANDOM"
}

# Faz POST e imprime `PASS/FAIL + HTTP + latência` na saída padrão.
# Retorna 0 se HTTP==200, 1 caso contrário. Body vai pra $STEP_BODY.
STEP_BODY=''
STEP_STATUS=0
smoke_post() {
  local label="$1" url="$2"
  shift 2
  local tmp_body
  tmp_body="$(mktemp)"
  local start_ms end_ms elapsed_ms http_code
  start_ms=$(python3 -c 'import time; print(int(time.time()*1000))')
  # -sS = silencioso mas mostra erros; -o body -w http_code; --max-time bounded.
  # Passamos os headers/body via "$@" pra não gerar array com senha em echo.
  http_code=$(curl -sS -o "$tmp_body" -w '%{http_code}' \
    --max-time 30 -X POST "$url" "$@" || echo '000')
  end_ms=$(python3 -c 'import time; print(int(time.time()*1000))')
  elapsed_ms=$(( end_ms - start_ms ))
  STEP_BODY="$(cat "$tmp_body")"
  rm -f "$tmp_body"
  if [[ "$http_code" == '200' ]]; then
    printf '  PASS  %-38s HTTP %s  %dms\n' "$label" "$http_code" "$elapsed_ms"
    STEP_STATUS=0
  else
    printf '  FAIL  %-38s HTTP %s  %dms\n' "$label" "$http_code" "$elapsed_ms"
    # Body do erro é seguro imprimir (Supabase retorna código estrutural, não JWT).
    # Limitamos a 500 chars pra evitar despejo grande.
    printf '        body: %.500s\n' "$STEP_BODY"
    STEP_STATUS=1
  fi
}

echo "── PR-26 smoke ai-chat (prod jxcn) ────────────────────────────"
echo "  supabase : $PRAGAS_SUPABASE_URL"
echo "  email    : $PRAGAS_SMOKE_EMAIL"
echo "  consent  : $AI_CONSENT_VERSION"
echo

FAILED=0

# ── 1) Login REST (grant_type=password) ──────────────────────────────
# curl monta JSON via --data-raw. Nunca ecoamos $ACCESS_TOKEN.
LOGIN_BODY=$(python3 -c '
import json, os
print(json.dumps({
  "email": os.environ["PRAGAS_SMOKE_EMAIL"],
  "password": os.environ["PRAGAS_SMOKE_PASSWORD"],
}))')

smoke_post 'login (grant_type=password)' \
  "${PRAGAS_SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${PRAGAS_SUPABASE_ANON_KEY}" \
  -H 'Content-Type: application/json' \
  --data-raw "$LOGIN_BODY"
LOGIN_BODY=''  # scrub
if (( STEP_STATUS != 0 )); then
  echo
  echo 'ABORT: login falhou; sem access_token não dá pra seguir.' >&2
  exit 1
fi

# Extrai access_token do JSON sem expô-lo no shell (nem em set -x).
ACCESS_TOKEN=$(printf '%s' "$STEP_BODY" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("access_token",""))')
USER_ID=$(printf '%s' "$STEP_BODY" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("user",{}).get("id",""))')
STEP_BODY=''
if [[ -z "$ACCESS_TOKEN" ]]; then
  echo 'ABORT: login retornou 200 mas sem access_token no body.' >&2
  exit 1
fi
echo "  user_id  : $USER_ID"
echo

# ── 2) ai-chat (slug compartilhado — o que o binário público chama) ──
smoke_post 'ai-chat (slug compartilhado)' \
  "${PRAGAS_SUPABASE_URL}/functions/v1/ai-chat" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "apikey: ${PRAGAS_SUPABASE_ANON_KEY}" \
  -H 'Content-Type: application/json' \
  --data-raw '{"messages":[{"role":"user","content":"Ola, me diga uma frase curta sobre ferrugem do cafeeiro."}]}'
(( STEP_STATUS != 0 )) && FAILED=1

# ── 3) pragas_link_account (linka o app-scoped account no jxcn) ──────
LINK_IDEMPOTENCY_KEY="$(uuid4)"
smoke_post 'pragas_link_account (RPC)' \
  "${PRAGAS_SUPABASE_URL}/rest/v1/rpc/pragas_link_account" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "apikey: ${PRAGAS_SUPABASE_ANON_KEY}" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: ${LINK_IDEMPOTENCY_KEY}" \
  --data-raw '{}'
(( STEP_STATUS != 0 )) && FAILED=1

# ── 4) grant_pragas_ai_consent (chat, versão vigente) ────────────────
CONSENT_BODY=$(AI_CONSENT_VERSION="$AI_CONSENT_VERSION" python3 -c '
import json, os
print(json.dumps({"p_purpose": "chat", "p_version": os.environ["AI_CONSENT_VERSION"]}))')
smoke_post 'grant_pragas_ai_consent (chat)' \
  "${PRAGAS_SUPABASE_URL}/rest/v1/rpc/grant_pragas_ai_consent" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "apikey: ${PRAGAS_SUPABASE_ANON_KEY}" \
  -H 'Content-Type: application/json' \
  --data-raw "$CONSENT_BODY"
(( STEP_STATUS != 0 )) && FAILED=1

# ── 5) ai-chat-pragas (slug dedicado — só passa com o fluxo completo) ─
CHAT_IDEMPOTENCY_KEY="$(uuid4)"
smoke_post 'ai-chat-pragas (slug dedicado)' \
  "${PRAGAS_SUPABASE_URL}/functions/v1/ai-chat-pragas" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "apikey: ${PRAGAS_SUPABASE_ANON_KEY}" \
  -H 'Content-Type: application/json' \
  -H 'X-Rumo-App: rumo-pragas' \
  -H "X-Pragas-AI-Consent-Version: ${AI_CONSENT_VERSION}" \
  -H 'X-Pragas-AI-Consent-Purpose: chat' \
  -H "Idempotency-Key: ${CHAT_IDEMPOTENCY_KEY}" \
  --data-raw '{"messages":[{"role":"user","content":"Ola, me diga uma frase curta sobre ferrugem do cafeeiro."}]}'
(( STEP_STATUS != 0 )) && FAILED=1

# ── scrub ────────────────────────────────────────────────────────────
ACCESS_TOKEN=''

echo
if (( FAILED == 0 )); then
  echo '✅ SMOKE OK — 5/5 etapas retornaram HTTP 200'
  exit 0
fi
echo '❌ SMOKE FAIL — alguma etapa não retornou HTTP 200 (veja acima)'
exit 1
