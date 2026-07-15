# 08 — SEGURANÇA & PERFORMANCE · Rumo Pragas IA

> [!CAUTION]
> **ARQUIVO HISTÓRICO — NÃO USAR COMO POSTURA DE SEGURANÇA ATUAL.**
> Use `SECURITY.md`, o código atual e `docs/audit/launch-coverage-2026-07-14.md`.

> Fase: mega-audit de lançamento · 2026-07-02 · branch `perfect/pragas-launch-2026-07-02` (read-only)
> Escopo: auth/tokens (ZERO-X), secrets no bundle, rate limiting, injeção, storage de foto, bundle web, cold start, imagens, memory leaks/re-renders, useEffect cleanup.
> Regra seguida: nenhum item já corrigido pelo mega-audit de 01/jul foi re-reportado (grants chat_usage, FREE_MODE, gen_ai telemetry, fail-closed de quota, CORS allowlist, JWT verify — tudo CONFIRMADO já presente no código atual e registrado em "Positivos").

**Nota da dimensão no estado atual: 8.0/10** — postura de segurança server-side excepcional para o porte; os gaps reais são de *device compartilhado* (cross-conta) e *web* (sessão + headers), nenhum bloqueia a release em revisão.

---

## ACHADOS

### SP-01 · MÉDIO · web/auth — Sessão web NÃO persiste: refresh desloga o usuário
- **Evidência:** `expo-app/services/supabase.ts:9-22` — `SecureStoreAdapter` retorna `null`/no-op quando `Platform.OS === 'web'`, e é passado incondicionalmente como `auth.storage` com `persistSession: true` (linha 41-53). No web (react-native-web + Vercel SPA, que É plataforma suportada por `vercel.json`), o supabase-js não tem onde gravar a sessão → **todo reload da página desloga o usuário**.
- **Impacto:** UX web quebrada (login a cada refresh); não é vazamento, é perda de sessão. Zero impacto iOS/Android.
- **Fix proposto:** adapter por plataforma — no web usar `localStorage` (default do supabase-js web; mesmo perfil de risco do padrão da indústria), mantendo SecureStore no nativo. ~6 linhas, funciona nas 3 plataformas.
- **gate:** false (fix de código client, sem superfície visual, v1.0.8).

### SP-02 · MÉDIO · auth/multi-conta — AsyncStorage device-global sem sweep no signOut → vazamento cross-conta em aparelho compartilhado
- **Evidência (3 vetores, mesma causa raiz):**
  1. `expo-app/services/auth.ts:62-66` — `signOut()` só chama `supabase.auth.signOut()`; nenhuma limpeza local. `app/(tabs)/settings.tsx:440,477` idem.
  2. `app/(tabs)/ai-chat.tsx:32` — histórico de chat em `@rumo_pragas_chat_history` (chave global, não escopada por userId). Usuário B no mesmo device **lê toda a conversa de A** com o Agro IA.
  3. `services/diagnosisQueue.ts:14-26` — `PendingDiagnosis` **não tem userId**; `hooks/useDiagnosisSync.ts:100-126` sincroniza a fila com `session.access_token` do usuário ATUAL. Cenário real (celular compartilhado na fazenda): A fotografa offline → desloga → B loga → rede volta → **foto+GPS de A são gravados como diagnóstico de B** (`pragas_diagnoses.user_id = B`). Mistura de dado pessoal entre titulares (LGPD) + histórico poluído.
  4. Bônus mesmo tema: `services/notifications.ts` não desativa o push token no signOut — o device continua recebendo pushes endereçados ao usuário anterior.
- **Impacto:** dispositivo compartilhado é o caso comum no público-alvo (produtor + funcionário). Não é explorável remotamente — requer acesso físico ao device — por isso MÉDIO e não ALTO.
- **Fix proposto (1 commit, 3 plataformas):** (a) carimbar `userId` no enqueue e, na sync, pular/purgar itens de outro usuário; (b) no `signOut()` limpar `CHAT_HISTORY_KEY`, fila offline + arquivos em `diagnosis-queue/`, cache de prefs de notificação, e marcar `pragas_push_tokens.is_active=false` do token do device (best-effort); (c) alternativa mais simples pro chat: escopar a chave por userId (`@rumo_pragas_chat_history:<uid>`).
- **gate:** false (fix client-side; a desativação de push token usa tabela própria `pragas_*`).

### SP-03 · BAIXO · web/headers — vercel.json do app web sem HSTS e sem CSP
- **Evidência:** `expo-app/vercel.json` — headers presentes: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`. Ausentes: `Strict-Transport-Security` e `Content-Security-Policy` (a landing Astro tem ambos; o app web não).
- **Fix proposto:** adicionar `Strict-Transport-Security: max-age=63072000; includeSubDomains` + `Permissions-Policy` mínima (camera/geolocation self). CSP para bundle Expo web exige `unsafe-inline` — começar em Report-Only.
- **gate:** false (config invisível ao usuário, ZERO-N não se aplica).

### SP-04 · BAIXO · lgpd/storage — Purge de storage nas fns de exclusão aponta para bucket "diagnoses", mas o bucket real do app é `pragas-images`
- **Evidência:** `supabase/functions/delete-user-account/index.ts:58` e `supabase/functions/process-deletions/index.ts:73` — `STORAGE_BUCKETS = ["diagnoses", "avatars"]`. Em prod (fase DB) os buckets são `pragas-images` (privado) + `avatars` (público). Hoje NENHUM código do app faz upload para `pragas-images` (o diagnóstico manda base64 direto pra Claude e não persiste foto), então o purge de "diagnoses" é um no-op inofensivo — mas se `pragas-images` contiver objetos por usuário (upload legado/futuro), a exclusão LGPD **não os cobre**.
- **Fix proposto:** ao executar o M1 do mapa (diff + redeploy da delete-user-account, já gate CEO), alinhar `STORAGE_BUCKETS` para `["pragas-images", "avatars"]` (listar antes objetos existentes em prod: `select count(*) from storage.objects where bucket_id='pragas-images'`).
- **gate:** true (carona no redeploy M1 da edge fn — deploy de fn com slug genérico precisa confirmação de que nenhum app irmão a invoca).

### SP-05 · BAIXO · perf/memória — Contexts com value não-memoizado (padrão do bug do Finance, forma atenuada)
- **Evidência:** `expo-app/contexts/DiagnosisContext.tsx:80-91` — `value={{ ...state, ...7 callbacks }}` (objeto novo a cada render do provider); `contexts/AuthContext.tsx:9-10` + `hooks/useAuth.ts:179-186` — `useAuth()` retorna `{ ...state, ...5 callbacks }` novo a cada render. Ambos providers estão na raiz (`_layout.tsx`) → qualquer re-render da raiz re-renderiza TODOS os consumidores. Diferente do Finance, aqui **não há loop** (callbacks são `useCallback` estáveis e ninguém depende da identidade do value em effects) — é só re-render desnecessário.
- **Fix proposto:** `useMemo` no value dos dois providers (deps: state + callbacks). NavigationGateContext já faz isso certo (linha 79) — replicar o padrão.
- **gate:** false.

### SP-06 · BAIXO · perf/memória — `DiagnosisContext.reset()` existe mas nunca é chamado: imagem base64 fica retida no heap a sessão inteira
- **Evidência:** `contexts/DiagnosisContext.tsx:75-77` define `reset()`; grep em `app/`, `components/`, `hooks/` = **zero call sites**. Após o fluxo câmera→resultado, `imageBase64` (~100–400KB pós-compressão 1024px/q0.75 — `app/diagnosis/camera.tsx:27-28`) + `result` ficam no state até o próximo diagnóstico sobrescrever. Leak *bounded* (1 imagem), relevante em Android low-end.
- **Fix proposto:** chamar `reset()` ao concluir/abandonar o fluxo (unmount de `result.tsx` ou navegação de volta às tabs).
- **gate:** false.

### SP-07 · BAIXO · perf/web — Bundle web em chunk único de 6,8 MB (sem code-splitting) → cold start lento em rede rural
- **Evidência:** `expo-app/dist/_expo/static/js/web/index-*.js` = 6,8 MB não-comprimido (1 chunk; só `subscriptionSync` separado com 4KB). `dist/` é stale (debris B6 do mapa), mas a config atual de export produz o mesmo formato.
- **Impacto:** first load do app web em 3G/4G do interior; irrelevante pra iOS/Android (bundle nativo).
- **Fix proposto:** re-medir no export atual (gzip real ~1,5–2MB); habilitar lazy/async routes do expo-router no web quando bumpar; garantir `Cache-Control` imutável para `/_expo/static/*` no Vercel (hash no nome já permite).
- **gate:** false (nenhuma mudança visual).

### SP-08 · BAIXO · perf/resiliência — `fetchWeather` sem timeout/AbortController
- **Evidência:** `expo-app/services/weather.ts:127-132` — `fetch(url)` cru para open-meteo, sem `AbortController` (contraste: `services/diagnosis.ts:148-149` faz timeout corretamente). Se a API pendurar, o widget de clima da Home fica em loading indefinido (cache TTL mitiga chamadas repetidas).
- **Fix proposto:** replicar o padrão do diagnosis.ts (AbortController + 10s + fallback silencioso pro cache).
- **gate:** false.

### SP-09 · BAIXO · verificação — Mapa Fase 1 descreve api/mcp com "token estático"; o código atual usa JWT Supabase + RLS — confirmar qual versão está DEPLOYADA no Vercel
- **Evidência:** `expo-app/api/mcp/auth.ts:1-13` — auth atual = `Bearer <supabase-user-jwt>` validado via `auth.getUser(jwt)`, userId derivado do JWT (nunca de parâmetro), tools via `getUserClient(jwt)` com RLS ativa (`_supabase.ts:5-13` — service_role REMOVIDO), rate limit 30 req/min pós-auth (`auth.ts:66-89`). Isso é ZERO-X exemplar. Porém o 00_MAPA_DO_APP (Fase 1) descreve "api/mcp Vercel read-only com token estático" — ou o mapa está desatualizado, ou o deploy Vercel corrente é anterior a este refactor (mesmo padrão de drift repo↔prod do M1).
- **Fix proposto:** `curl -X POST https://<deploy>/api/mcp/server -H 'Authorization: Bearer invalido'` → se responder o erro novo ("Invalid or expired token") o deploy está atualizado; senão, redeploy Vercel (auto no próximo push).
- **gate:** false (verificação; redeploy Vercel do api/ é rotina).

---

## POSITIVOS CONFIRMADOS (sem ação — base do 8.0)

**ZERO-X / auth server-side (exemplar):**
- `diagnose` (index.ts:307-334) e `ai-chat` (index.ts:246-274): JWT verify server-side via `auth.getUser`, 401 sem token — nunca confiam em user_id de body/header.
- `api/mcp` (repo): JWT + RLS-bound client + userId derivado do token + rate limit por usuário.
- `delete-user-account`: JWT do próprio usuário; tabelas compartilhadas com filtro `app` (anti cross-app wipe).
- `send-push`: service_role only (server-to-server), idempotência por `notification_id` PK, allowlist de categoria/screen.
- `revenuecat-webhook`: Authorization secret + guard anti-sandbox-upsert.

**Rate limiting:** por plano com headers `X-RateLimit-*` + `Retry-After` em diagnose (10/h free) e ai-chat (20/min free); LRU eviction bounded (10k entries); api/mcp 30/min. Limitação conhecida e documentada (`RATE_LIMITS.md`): contador in-memory reseta em cold start — aceitável para o perfil de abuso atual.

**Injeção:** crop_type com allowlist + strip de especiais; validação de coordenadas por range; magic bytes de imagem + limite 7,5MB + regex base64; sanitização HTML da saída da IA; pest_id filtrado a `[a-zA-Z0-9_-]`; prompt-injection defense no SYSTEM_PROMPT + delimitador; inserts via client parametrizado (sem SQL string). Mensagens de chat: role allowlist + 4000 chars + 20 msgs.

**Secrets:** bundle web (dist) contém APENAS a anon key (pública por design) — zero service_role/sk-ant (grep confirmado); `CLAUDE_API_KEY`/`RESEND_API_KEY` removidos do client (constants/config.ts); `.trim()` em todos os env (classe CampoVivo `\n` morta); `play-store-key.json`, `credentials.json`, `credentials/*.p12` **não rastreados pelo git** (check-ignore confirmado — ficam só no disco local); tokens de auth nativos em SecureStore (Keychain/Keystore).

**Fotos:** diagnóstico NÃO persiste imagem em storage (base64 → Claude → descarte) — menor superfície LGPD possível; avatar comprimido (512px/0.8) antes do upload, path `userId/...` com RLS; bucket `avatars` público é padrão de mercado para avatar (URL não-enumerável por UUID).

**Perf client:** todas as 5 FlatLists com `keyExtractor` (+ `windowSize`/`initialNumToRender`/`getItemLayout` onde importa); history com `.limit(50)`; imagem da câmera comprimida a 1024px/q0.75 ANTES de virar base64; fila offline guarda imagem em ARQUIVO (não AsyncStorage) com migração de legado; timers todos com cleanup verificado (useAuth race+timer, loading.tsx refs, analytics interval com re-init/reset seguros, BackHandler com remove); splash watchdog 10s; Sentry lazy-init com `sendDefaultPii:false` e sampling 0.1.

---

## RESUMO EXECUTIVO
Nenhum CRITICAL/ALTO. O server-side está no estado da arte do portfólio (ZERO-X em todas as rotas de IA, fail-closed, sanitização em profundidade). Os 2 MÉDIOs são da mesma família — estado local de device não amarrado ao usuário (sessão web + sweep de signOut/fila offline) — e cabem num único commit client-side na v1.0.8, sem tocar no iOS em review.
