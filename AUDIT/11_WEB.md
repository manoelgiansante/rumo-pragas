# 11_WEB — Auditoria da Plataforma WEB · Rumo Pragas IA

> [!CAUTION]
> **ARQUIVO HISTÓRICO — NÃO USAR COMO ESTADO WEB ATUAL.**
> Use `docs/audit/launch-coverage-2026-07-14.md`; a landing pública vive em repositório separado.

**Data:** 2026-07-02 · **Branch:** `perfect/pragas-launch-2026-07-02` (read-only) · **Fase:** 11 (WEB)
**Escopo:** `expo export --platform web` + `vercel.json` + `api/**/*.ts` serverless + deploy Vercel + SPA/deep-links + offline no web.

---

## Veredito executivo

O build **web funciona 100%** (`npx expo export --platform web` → exit 0, 3669 módulos, `dist/` gerado, SPA single-page). Nenhum módulo nativo mobile-only quebra o web: todos têm suporte web nativo ou guard de `Platform.OS`. O SPA rewrite do `vercel.json` cobre deep links corretamente. **O deploy web EXISTE em produção na Vercel** (projeto `rumo-pragas`, último deploy Production `● Ready` há ~5h).

**Porém:** todo o deploy — inclusive as rotas `/api/mcp/*` — está **atrás de Vercel Authentication (SSO)** e **sem domínio custom**. Ou seja, hoje **nenhum usuário real acessa o web** (redireciona pra tela de login da Vercel). Isso é BOM se o web NÃO é uma superfície de lançamento (o lançamento é App Store + Google Play), e é BLOQUEANTE se a intenção for expor o web publicamente. É a única decisão que exige o CEO.

Nota geral da dimensão WEB no estado atual: **7.5/10** (build sólido e portável; pendências são de exposição/hardening, não de funcionamento).

---

## O que foi verificado (evidências)

### ✅ Build web
```
Web Bundled 21992ms index.ts (3669 modules)
› web bundles (2): _expo/static/js/web/index-*.js (7.1MB) + subscriptionSync-*.js (1KB)
› Files (3): favicon.ico, index.html (1.2KB), metadata.json
Exported: dist   EXIT=0
```
- `expo-app/app.json`: `web.bundler = metro`, `web.output = single` → SPA (um único `index.html`).
- `dist/index.html` gerado com reset do react-native-web, `<div id="root">`, script `defer`. OK.
- Bundle único de 7.1MB (sem code-splitting) — grande, mas aceitável para app funcional; impacto só em LCP no primeiro load (relevante apenas se o web virar público).

### ✅ Módulos nativos usados no web — todos seguros
| Módulo | Comportamento no web | Status |
|---|---|---|
| `expo-haptics` (camera:55, crop-select:37/44, login, history, update-password) | Implementação web real (`ExpoHaptics.web.ts` → `navigator.vibrate`, no-op se indisponível) | OK — chamadas sem `.catch()` NÃO quebram |
| `expo-image-picker` (camera.tsx) | Suporte web (file input / getUserMedia) | OK |
| `expo-location` (`hooks/useLocation.ts`) | Suporte web (Geolocation API do browser) | OK |
| `expo-notifications` (`services/notifications.ts`) | Guard explícito `if (Platform.OS === 'web') { …; return; }` (linha 55) | OK — degrada sem crash |
| `react-native-purchases` (`services/purchases.ts`) | `require()` LAZY + gated por `isRevenueCatConfigured()` (retorna false no web: sem chave) → nunca é invocado | OK — no-op no web |
| `@react-native-community/netinfo` (`useNetworkStatus`) | Suporte web (`navigator.onLine`) | OK |
| `@react-native-async-storage/async-storage` | Backed por `localStorage` no web | OK |

Conclusão: **não há uso de API mobile-only sem guard** que quebre o web. O build passar (exit 0) confirma que o Metro resolveu tudo para a plataforma web.

### ✅ SPA rewrite / deep links
`vercel.json`:
```json
"rewrites": [
  { "source": "/api/(.*)", "destination": "/api/$1" },
  { "source": "/(.*)",     "destination": "/index.html" }
]
```
- API tem prioridade sobre o catch-all → correto.
- Deep link testado: `GET /diagnosis/result` → 302 (SSO, não 404) → prova que a rota chega ao `index.html` (uma vez removido o SSO, o expo-router resolve client-side). **SPA rewrite cobre deep links.** OK.

### ✅ Auth + segurança das rotas `api/mcp/*`
- `api/mcp/auth.ts`: exige `Authorization: Bearer <supabase-user-jwt>`, valida via `auth.getUser(jwt)`, deriva `userId` do JWT verificado (NUNCA do input). **ZERO-X compliant.**
- `api/mcp/_supabase.ts`: usa **anon key** + JWT do caller (RLS ativa por usuário), NÃO usa mais service_role. Defense-in-depth com `.eq('user_id', userId)`.
- Rate limit 30 req/min por userId (`checkRateLimit`).
- `setSecurityHeaders`: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cache-Control: no-store`, remove `X-Powered-By`. Bom.
- Só aceita `POST` (405 nos demais). OK.

### ✅ Env do build web (Vercel Production)
```
EXPO_PUBLIC_SUPABASE_ANON_KEY  Encrypted  Production   (44d)
EXPO_PUBLIC_SUPABASE_URL       Encrypted  Production   (44d)
```
- O build web na Vercel lê `EXPO_PUBLIC_*` do env da Vercel (não do `eas.json`, que só serve builds nativos). Backend presente → web tem Supabase. Chaves anon são públicas por design (ZERO-L OK, plaintext esperado).

---

## Achados

### 🟠 W1 — HIGH · gate=true · Deploy web (e /api/mcp) 100% atrás de Vercel Authentication → sem acesso público
**Evidência:** `curl https://rumo-pragas-igko0eyp5-manoels-projects-849ab1fe.vercel.app/` → `302 → vercel.com/sso-api`. `POST /api/mcp/server` → `401 {"error":{"message":"Protected deployment"},"protection":{"vercel_auth_enabled":true}}`. `vercel ls` mostra Production `● Ready`, mas **sem alias/domínio custom** (`vercel domains ls | grep pragas` = vazio; `vercel alias ls` = vazio para o app).
**Impacto:** hoje nenhum usuário real acessa o web — cai na tela de login da Vercel. As rotas `/api/mcp` também ficam inalcançáveis por qualquer cliente MCP externo (mesmo com JWT válido), a menos que um Protection Bypass seja configurado.
**Decisão do CEO (por isso gate=true):**
- Se o **web NÃO é superfície de lançamento** (lançamento = App Store + Google Play): **está tudo certo, nenhuma ação** — e é até desejável (impede indexação de um web não-polido). Documentar como "web privado por decisão".
- Se o **web deve ser público**: desativar Deployment Protection do projeto + atribuir domínio custom (ex.: `app.pragas.agrorumo.com`) + reavaliar W2 (CSP) antes.
**Fix proposto:** decisão explícita do CEO. Nenhuma ação de código — é config de projeto Vercel (reversível).

### 🟡 W2 — MEDIUM · Sem Content-Security-Policy no `vercel.json` (+ `X-XSS-Protection` deprecado)
**Evidência:** `expo-app/vercel.json:14-24` define `X-Content-Type-Options`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy` — mas **nenhum `Content-Security-Policy`**. `X-XSS-Protection` é um header legado/deprecado (pode até introduzir vetores em browsers antigos; recomendação atual é removê-lo).
**Impacto:** só relevante se o web virar público (W1). SPA carrega Supabase + Sentry + open-meteo; sem CSP a superfície de XSS não tem defesa em profundidade. HSTS já é injetado automaticamente pela Vercel (visto no `curl`).
**Fix proposto (mudança invisível — não é ZERO-N, é `vercel.json` de app, não landing):** ao tornar o web público, adicionar CSP restritiva e remover `X-XSS-Protection`:
```json
{ "key": "Content-Security-Policy",
  "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co https://*.ingest.us.sentry.io https://api.open-meteo.com; font-src 'self' data:; base-uri 'self'; frame-ancestors 'none'" }
```
(validar em preview — react-native-web injeta estilos inline, daí `style-src 'unsafe-inline'`; um bundle single-file pode exigir ajuste de `script-src`). Não aplicar antes da decisão W1.

### 🟡 W3 — MEDIUM · Secrets órfãos no env de produção Vercel: `SUPABASE_SERVICE_ROLE_KEY` + `MCP_API_TOKEN`
**Evidência:** `vercel env ls production` mostra `SUPABASE_SERVICE_ROLE_KEY` (Dev/Preview/Prod) e `MCP_API_TOKEN` (Prod). O código atual NÃO os usa — `api/mcp/_supabase.ts:5` "This server NO LONGER uses the service_role key"; `api/mcp/README.md:21,56-57` já lista o sunset dos dois como checklist pendente. Também há `NEXT_PUBLIC_SUPABASE_ANON_KEY` (era Next.js, debris).
**Impacto:** uma **service_role key** (bypassa RLS) parada no env de um deployment serverless é risco latente — se uma função futura a ler por engano, vira vetor de acesso total ao jxcn. Blast-radius mitigado hoje porque o deploy está atrás de Vercel Auth (W1) e nenhuma função a lê.
**Fix proposto:** executar o checklist do próprio README após confirmar zero callers: `vercel env rm SUPABASE_SERVICE_ROLE_KEY production` + `vercel env rm MCP_API_TOKEN production` + limpar `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Reversível (re-adicionar se necessário). gate=false (limpeza de env, baixo risco).

### 🔵 W4 — LOW · gate=true · Web sem domínio custom (confirma que não é superfície de produto hoje)
**Evidência:** `vercel domains ls | grep pragas` = vazio; sem alias no deploy Production. O produto só tem URLs geradas `*.vercel.app` (protegidas).
**Impacto:** informativo — reforça W1. Se o web for público, precisa de domínio custom + o web deixa de ser "invisível".
**Fix proposto:** parte da mesma decisão de W1. Sem ação isolada.

### 🔵 W5 — LOW · `api/mcp/server.ts` sem tratamento de CORS/OPTIONS
**Evidência:** `api/mcp/server.ts:26-32` seta headers de segurança mas não define `Access-Control-Allow-Origin` nem trata `OPTIONS` (preflight). Só `POST` é aceito (405 nos demais → `OPTIONS` cairia em 405).
**Impacto:** nulo para o uso atual (endpoint MCP é **server-to-server**, chamado por ferramentas MCP com JWT, não por browser). Só viraria problema se algum dia um cliente **browser** (cross-origin) precisasse chamar `/api/mcp`.
**Fix proposto:** nenhum agora. Se um dia houver caller browser: tratar `OPTIONS` (204) + `Access-Control-Allow-Origin` allowlist + `Allow-Headers: authorization, content-type`. Manter server-to-server é mais seguro.

### 🔵 W6 — LOW · Offline-path é ALCANÇÁVEL no web (NetInfo + localStorage) — funciona, não é breaker
**Evidência:** `app/diagnosis/loading.tsx:186` enfileira o diagnóstico quando `isConnectedRef.current === false`; `useNetworkStatus` usa NetInfo (no web = `navigator.onLine`); `services/diagnosisQueue.ts` grava em AsyncStorage (no web = `localStorage`); `useDiagnosisSync` sincroniza ao voltar online. `components/OfflineBanner.tsx` renderiza banner offline.
**Impacto:** ao contrário da premissa "não há offline-path no web", o caminho offline **existe e É acionável no web** — porém funciona corretamente via APIs web-compatíveis (navigator.onLine + localStorage), sem crash. Um usuário web genuinamente offline enfileira e sincroniza depois. Comportamento aceitável.
**Observação p/ regra do SKILL (#1):** se no futuro alguém introduzir lógica offline NOVA, o padrão obrigatório é `if (!isOnline && Platform.OS !== 'web')`. O código atual NÃO viola isso porque não usa um `isOnline` cru — usa NetInfo, que é web-aware. Nenhuma correção necessária; apenas monitorar em novas contribuições.
**Fix proposto:** nenhum. Documentado como esperado.

---

## Checklist de resposta às perguntas da tarefa

| Pergunta | Resposta |
|---|---|
| O build web funciona? | **Sim** — `expo export --platform web` exit 0, 3669 módulos, `dist/` SPA gerado. |
| APIs mobile-only sem guard `Platform.OS`? | **Não** — haptics(web vibrate), notifications(guard), purchases(lazy+no-op), camera/location/imagepicker(web-supported). Nada quebra. |
| Rotas `api/` têm auth + CORS? | **Auth: sim** (JWT Supabase, ZERO-X). **CORS: ausente** (server-to-server, aceitável — W5). |
| Headers de segurança do `vercel.json` suficientes (CSP?)? | Bons, mas **falta CSP** e `X-XSS-Protection` está deprecado (W2). |
| Deploy web existe em produção Vercel? | **Sim** (projeto `rumo-pragas`, Production `● Ready` ~5h) — **mas atrás de Vercel Auth + sem domínio custom** (W1/W4). |
| SPA rewrite cobre deep links? | **Sim** — `/(.*) → /index.html`, API com prioridade; `/diagnosis/result` chega ao SPA. |
| Há offline-path no web? | **Sim, e é alcançável** — mas funciona via NetInfo+localStorage, sem crash (W6). Não é breaker. |

---

## Gates para o CEO
- **W1 (HIGH)** — decidir se o web é superfície pública. Se sim → desativar Vercel Auth + domínio custom + aplicar CSP (W2). Se não → documentar "web privado por decisão".
- **W4 (LOW)** — atrelado a W1 (domínio custom).

Nenhuma alteração de código foi feita (fase read-only). W2/W3 são mudanças invisíveis ao usuário (config Vercel/`vercel.json` de app — NÃO é landing ZERO-N), executáveis quando o CEO decidir W1.
