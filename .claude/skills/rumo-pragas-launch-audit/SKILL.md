---
name: rumo-pragas-launch-audit
description: Contexto canônico do app Rumo Pragas IA para agentes de auditoria/fix — stack real, regras inegociáveis, mapa de telas, estado de lançamento e gotchas. Carregar em TODO subagente que trabalhe neste repo.
---

# Rumo Pragas IA — Launch Audit Skill (2026-07-02)

## Stack REAL (verificado no código, não assumir nada além disso)
- **App:** Expo SDK 55 / React Native 0.83.6 / expo-router v55 — código vivo em `expo-app/` (NÃO há pasta `mobile/`).
- **Plataformas:** iOS + Android + **Web** (react-native-web 0.21 + `vercel.json` com `expo export --platform web`, SPA rewrite + `api/**/*.ts` serverless functions maxDuration 30).
- **Backend:** Supabase projeto **jxcnfyeemdltdfqtgbcl** (REGRA ZERO: byfg é APENAS Rumo Máquinas — JAMAIS tocar). Tabelas prefixo `pragas_*`. Edge functions: `diagnose`, `ai-chat` (deployadas 01/jul com FREE_MODE), `process-deletions` v18 (cron LGPD jobid 4, 03:00 UTC, key no Vault).
- **Pagamentos:** ⛔ **O APP É 100% GRÁTIS** (decisão CEO 01/jul, pós-rejeição Apple 2.3.2/2.1b). RevenueCat presente mas escondido/no-op; paywall no-op; entitlement forçado. As 3 subscriptions do ASC foram DELETADAS em 02/jul (product IDs queimados de propósito). **NÃO reintroduzir paywall, gating pago, Stripe checkout ou IAP** — re-monetização é update futuro com IDs novos e decisão explícita do CEO. Auditar pagamentos = verificar que o pivot grátis está íntegro (binário + servidor sem 403 + IAP inexistente + legal/landing coerentes).
- **Observability:** @sentry/react-native 7.11 + script pós-build EAS.
- **Testes:** jest — 48 suites / 440 testes verdes em 02/jul. `npm run typecheck` (tsc --noEmit, stack-size 8000) e `npm run lint` (max-warnings 0) devem passar SEMPRE.

## Estado de lançamento (02/jul — NÃO PERTURBAR)
- **iOS:** ⚠️ ATUALIZADO 02/jul: 1.0.7 **REJECTED** no ASC (app 6762232682, bundle `com.agrorumo.rumopragas`, submissão be0320d0 em UNRESOLVED_ISSUES desde 02/jul 12:47 UTC). Causa provável: Review Notes descreviam app PAGO (IAP/paywall deletados) — **já corrigidas via API 02/jul** para modelo grátis. Texto oficial da rejeição sendo lido no Resolution Center. Resubmit = decisão do orquestrador principal APÓS ler a rejeição; agentes NÃO tocam em ASC.
- **Android:** 1.0.7 / versionCode 44 em **production completed** (fila de revisão Google, países=Brasil).
- **Git:** main = `b6e5716` (go-live merge). Fixes novos vão na branch `perfect/pragas-launch-2026-07-02` para a v1.0.8. Build number: SEMPRE checar `list-builds` max no ASC antes de bumpar (auto-land do Mac Mini builda em paralelo).
- **Landing prod:** pragas.agrorumo.com = **Astro** (a Next.js em `Apps/rumo-pragas-landing` NÃO é prod). Hero/copy já em "Disponível na App Store e Google Play". ZERO-N: design locked — só reportar drift, nunca editar visual sem `CEO_CODE_AUTH`.

## Mapa de telas (expo-app/app/)
- `(auth)/login` · `onboarding` · `consent-location` · `update-password`
- `(tabs)/`: index (home), ai-chat, history, library, settings
- `diagnosis/`: crop-select → camera → loading → result → pest/[id]
- Modais/rotas soltas: paywall (no-op grátis), edit-profile, privacy, terms, +not-found

## Regras inegociáveis (deste audit + herdadas)
1. **3 plataformas:** toda mudança deve funcionar em iOS, Android E Web. Não há uso de `isOnline` hoje no código; se introduzir lógica offline, padrão obrigatório `if (!isOnline && Platform.OS !== 'web')` — offline guard NUNCA no web.
2. **Ler antes de modificar:** grep TODOS os call sites do símbolo alterado e corrigir todos no mesmo commit (ZERO-Q para RPCs).
3. **Zero regressões; nada de mock/placeholder/TODO em fluxo real; commits atômicos** `fix(área): ...`.
4. **LGPD:** controlador = MM CAMPO FORTE LTDA, CNPJ 57.169.838/0001-20, DPO contato@agrorumo.com. JAMAIS CNPJ fictício. Privacidade não pode afirmar que GPS não acompanha foto (código envia coarse).
5. **Gates que agente NUNCA executa:** PR (ZERO-AC), merge, deploy de edge fn SHARED (`stripe-webhook` live no jxcn é código do FINANCE — deploy por cima = clobber PROIBIDO), release de loja, migration destrutiva, mudança visual em landing prod, reset de senha.
6. i18n: 100% PT-BR em superfície de usuário.

## Gotchas conhecidos
- `eas build --local` só com Node 22 (`eval $(fnm env) && fnm use v22.22.3`) + eas 20 em `~/.npm-global/bin` (o `/usr/local/bin/eas` é fóssil v16). `.nvmrc` já corrigido.
- `mcp__supabase__execute_sql` multi-statement retorna só o último result set.
- Path com espaço ("AgroRumo Projetos") quebra globs/grep ingênuos — sempre quote.
- Docs de concorrentes já existem (`COMPETITOR_ANALYSIS.md`, `PESQUISA_CONCORRENTES_BRASIL.md`, atualizados 01/jul) — atualizar, não recriar.
