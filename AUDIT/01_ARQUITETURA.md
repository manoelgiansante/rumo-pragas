# 01 — Arquitetura e Qualidade de Código · Rumo Pragas IA

> [!CAUTION]
> **ARQUIVO HISTÓRICO — NÃO USAR COMO ESTADO ATUAL OU CHECKLIST DE LANÇAMENTO.**
> Snapshot anterior à revisão de 14/07/2026; use `docs/audit/launch-coverage-2026-07-14.md`.

> Auditoria read-only · branch `perfect/pragas-launch-2026-07-02` · 2026-07-02
> Escopo: `expo-app/` (iOS + Android + Web). Estado: 100% grátis, iOS 1.0.7 WAITING_FOR_REVIEW (intocável).
> **Nota geral da dimensão: 8.5/10** — base de código madura, TypeScript strict completo, error handling exemplar. Deduções por testes desabilitados, gap de observabilidade no serverless e código morto de paywall.

## Veredito executivo
A arquitetura está **acima da média do portfólio**. Pontos fortes confirmados no código ATUAL (não re-reportando itens já corrigidos no mega-audit de 01/jul):
- **TypeScript strict TOTAL** (`tsconfig.json`): `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. Apenas **1** `as any` em todo o código-fonte (`lib/voice-sdk.ts:185`, arquivo desligado por flag).
- **Error handling de fluxo de dado exemplar**: `services/diagnosis.ts:288-309` faz `captureException` + mensagens i18n PT-BR com `cause` chaining e mapeamento por tipo de erro (rate-limit/auth/network/genérico). ZERO catch que engole erro de dado sem instrumentar.
- **ZERO-X compliant**: `services/diagnosis.ts:268-286` nunca envia `userId` no body — encaminha JWT via header; `api/mcp/auth.ts` valida JWT via `auth.getUser()` e deriva `userId` do token verificado (o comentário do MAPA "token estático read-only" está DESATUALIZADO — o código real usa JWT + RLS por usuário).
- **Sentry client bem-arquitetado**: init lazy (nunca em module-scope, `app/_layout.tsx:50`), envolto em try/catch que nunca derruba o app, `ErrorBoundary` no topo da árvore, DSN dedicado plaintext (ZERO-L OK). 24 arquivos usam Sentry.
- **Duplicata de contexto resolvida**: só existe `contexts/AuthContext.tsx` (o antigo `context/` foi removido — item histórico #8 da knowledge base corrigido).
- **Catches vazios são todos legítimos**: `Haptics.*.catch(() => {})` (feedback tátil não deve crashar) e `// ignore — Sentry must never crash the caller`. Nenhum swallow de fluxo de negócio.
- **npm audit --omit=dev**: apenas 1 moderate (js-yaml em `@istanbuljs/load-nyc-config`, dependência de coverage do jest, **dev-only**), já mitigada pelo `overrides` que fixa js-yaml@3.14.1 nesse caminho. Nada vulnerável no bundle do app.

---

## Achados

### A1 · MÉDIO · 3 suítes de teste DESABILITADAS escondem cobertura de fluxo core
**Evidência:** `package.json` → `jest.testPathIgnorePatterns` ignora:
- `__tests__/services/diagnosisQueue.test.ts` (11 KB — cobre a **fila offline de diagnóstico**, um fluxo de usuário central)
- `__tests__/services/subscriptionSync.test.ts` (4,4 KB)
- `__tests__/components/ConfidenceBar.test.tsx` (2,6 KB)

Os arquivos EXISTEM e foram desligados no commit `2098bed` ("CI green - ... ignore flaky tests"). O claim "48 suites / 440 testes verdes" é enganoso: a fila offline (`services/diagnosisQueue.ts`), que persiste e re-sincroniza diagnósticos sem rede, roda **sem nenhum teste ativo**. "Silenciar flaky" ≠ "corrigir flaky" — regressões nesse caminho passam despercebidas.
**Fix proposto:** desflakar e reativar as 3 suítes (isolar timers/mocks de AsyncStorage/NetInfo), OU, se realmente obsoletas, deletar os arquivos e documentar. Prioridade na `diagnosisQueue` por ser fluxo real. `gate=false`.

### A2 · MÉDIO · Camada serverless `api/mcp/` sem Sentry (gap ZERO-O)
**Evidência:** `api/mcp/server.ts:85-88` — o `catch` de exceção de tool chama `logEvent('tool_exception', …)` (que é apenas `console.log`, `api/mcp/_types.ts:35`) e retorna 500. **Nenhum `captureException`/`withSentry`** em toda a pasta `api/` (grep vazio). ZERO-O exige que todo endpoint Vercel novo instrumente Sentry. Resultado: 500s nos tools MCP (list_diagnoses, get_diagnosis, search_pest_library, get_pest_history) são invisíveis no Sentry — só aparecem em log cru do Vercel.
**Fix proposto:** importar o shim/SDK Sentry no `server.ts` e chamar `captureException(e, { tags: { surface: 'mcp', tool } })` dentro do catch antes do 500 (superfície read-only e token-gated, então severidade média, não alta). `gate=false`.

### A3 · BAIXO · Código morto de paywall/RevenueCat — risco latente de regressão 2.3.2
**Evidência:** `useSubscription()` (`hooks/useSubscription.ts:41-49`) retorna hard-coded `isPro: true` / `plan: 'enterprise'`. Todos os gates `if (!isPro) router.push('/paywall')` ficam **inalcançáveis mas presentes**:
- `app/(tabs)/index.tsx:339`
- `app/diagnosis/result.tsx:509, 543, 553`
- `app/diagnosis/pest/[id].tsx:95` (`router.replace('/paywall')`)
- `services/subscriptionSync.ts` (consumer RC lazy-loaded em `app/_layout.tsx:206,222`)
- `services/purchases.ts` (restore em `settings.tsx`), i18n `paywall.*`

O paywall em si está neutralizado (`app/paywall.tsx` renderiza nada + back), mas o cabeamento sobrevive. Risco: se alguém reverter `useSubscription` sem limpar isto, o app volta a gatear — reincidência direta da rejeição Apple 2.3.2/2.1b. Manutenibilidade + risco de loja.
**Fix proposto:** manter neutralizado, porém remover os ramos `if (!isPro) → /paywall` das telas (substituir por no-op) e marcar `subscriptionSync`/`purchases` como quarentena até a decisão de re-monetização. **`gate=true`** — qualquer mexida em superfície de cobrança é decisão do CEO.

### A4 · BAIXO · `app/diagnosis/result.tsx` é um god component (1.545 linhas)
**Evidência:** `wc -l` → result.tsx 1545, settings.tsx 943, login.tsx 787, edit-profile.tsx 763, pest/[id].tsx 715. O result.tsx acumula: render do diagnóstico + geração de PDF/print + gates de paywall + alternativas + enrichment. Dificulta revisão e testes; concentra risco.
**Fix proposto:** extrair `buildPdfHtml`/exportação para `services/diagnosisPdf.ts` e as seções de enrichment para componentes. Refactor pós-freeze (não bloqueia launch). `gate=false`.

### A5 · BAIXO · 66 chamadas `console.*` no fonte, sem abstração de logger
**Evidência:** grep → 66 ocorrências (`services/notifications.ts` 9, `services/analytics.ts` 7, `services/purchases.ts` 5, `services/subscriptionSync.ts` 4, telas `_layout`/`index`/`history`…). Amostragem não revelou vazamento de dado sensível, mas é ruído de log em produção e diverge do canal Sentry. Sem `logger` central, a política de log é inconsistente.
**Fix proposto:** introduzir `utils/logger.ts` (dev = console, prod = breadcrumb Sentry) e migrar os call sites gradualmente; no mínimo remover `console.log` puramente diagnósticos. `gate=false`.

### A6 · BAIXO · npm audit — 1 moderate js-yaml (dev-only, já mitigada)
**Evidência:** `npm audit --omit=dev` → 1 moderate (GHSA-h67p-54hq-rp68, js-yaml <3.15.0) em `@istanbuljs/load-nyc-config` (coverage do jest). Não entra no bundle do app; o bloco `overrides` já fixa `js-yaml@3.14.1` para esse caminho.
**Fix proposto:** nenhuma ação obrigatória. `npm audit fix` opcional em janela de manutenção; **não** fazer bump de major. `gate=false`.

---

## Itens verificados e SEM achado (confirmados corrigidos / sadios)
- MCP API usa JWT real (ZERO-X), não token estático — MAPA desatualizado.
- Sem `context/AuthContext.tsx` duplicado.
- Sem catch que engole erro de fluxo de dado (todos os `return null` de weather/notifications são fallbacks legítimos de feature não-crítica).
- `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` ativos e respeitados (ex.: `api/mcp/auth.ts:36` usa `m[1]!` com justificativa).
- CNPJ correto (MM CAMPO FORTE 57.169.838/0001-20) nas telas legais.
