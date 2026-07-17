# 00 — MAPA DO APP · Rumo Pragas IA (FASE 1, read-only)

> [!CAUTION]
> **ARQUIVO HISTÓRICO — NÃO USAR COMO ESTADO ATUAL OU CHECKLIST DE LANÇAMENTO.**
> Snapshot anterior à revisão de 14/07/2026; contém fatos e contratos superados. Use
> `docs/audit/launch-coverage-2026-07-14.md` e o código atual.

> Auditor: agente FASE 1 (mapeamento) · 2026-07-02
> Branch auditada: `perfect/pragas-launch-2026-07-02` (main = `b6e5716`, go-live merge com ~37 fixes do mega-audit 01/jul)
> Estado de lançamento (NÃO PERTURBAR): iOS 1.0.7 WAITING_FOR_REVIEW (app 6762232682) · Android 1.0.7/vc44 production completed · **APP 100% GRÁTIS (decisão CEO)**
> Backend: Supabase **jxcnfyeemdltdfqtgbcl** (compartilhado não-RM) · tabelas `pragas_*`

---

## 1. Estrutura de pastas (repo `Apps/rumo-pragas/`)

| Pasta | Conteúdo | Nota |
|---|---|---|
| `expo-app/` | App vivo — Expo SDK 55 / RN 0.83.6 / expo-router. iOS+Android+Web (react-native-web + Vercel) | Fonte de verdade |
| `expo-app/app/` | 23 rotas expo-router (mapa §2) | |
| `expo-app/api/mcp/` | Serverless Vercel — servidor MCP read-only (4 tools) | Token estático `MCP_API_TOKEN` |
| `expo-app/components/` | 24 componentes (DiagnosisCard, MipCard, WeatherCard, ChatBubble, VoiceRecorderButton, skeletons, ErrorBoundary…) | |
| `expo-app/services/` | 24 serviços (diagnosis, ai-chat, auth, purchases, notifications, analytics, weather, pestRegistry, navigationGate, passwordRecovery…) | |
| `expo-app/hooks/` | useSubscription (stub enterprise), useMonthlyUsage (stub ilimitado), useDiagnosisSync (fila offline), useNotifications, useMipKnowledge, useLocation… | |
| `expo-app/i18n/` | pt-BR / en / es — paridade de chaves verificada no mega-audit (754 chaves) | pt-BR default |
| `expo-app/data/mip/` | Base de conhecimento MIP (manejo integrado) local | |
| `supabase/functions/` | 8 edge fns: `diagnose`, `ai-chat`, `analytics`, `delete-user-account`, `process-deletions`, `revenuecat-webhook`, `send-push`, `stripe-webhook` (+`_shared`) | `stripe-webhook` slug live no jxcn = código do FINANCE → **deploy PROIBIDO (clobber)** |
| `supabase/migrations/` | 30+ migrations; últimas: per-app isolation (28/jun), chat_usage counter, revoke RPC anon (02/jul) | Drift repo↔prod conhecido (jxcn compartilhado) |
| `RumoPragas*/` (raiz) | Projeto Xcode nativo legado (não é o app Expo) | Fóssil — ignorar |
| `store-assets/`, `expo-app/store-assets/` | Assets de loja canônicos (metadata pt-BR, screenshots iOS/Android, feature-graphic) | `store-screenshots/` (raiz) = debris com print de erro |
| `docs/`, `AUDIT_REPORT.md`, `COMPETITOR_ANALYSIS.md`, `PESQUISA_CONCORRENTES_BRASIL.md` | Docs vivas (atualizadas 01/jul) | Atualizar, não recriar |

Debris no working dir do `expo-app/`: `build-1782997979273.aab` (untracked na raiz), `coverage/`, `dist/` (export web antigo), `.worktrees/i18n-finalize` (defasado). `play-store-key.json` e `credentials.json` estão **gitignored** (não versionados — OK).

## 2. Rotas expo-router (`expo-app/app/`) — status aparente

| Rota | O que faz | Status |
|---|---|---|
| `_layout.tsx` | Root: Sentry lazy-init (nunca module-scope), AuthContext, NavigationGate, i18n, notificações, OTA, initializePurchases | **OK** |
| `(auth)/login.tsx` | Login/cadastro e-mail+senha, SIWA, Google; reset de senha | **OK** (redirectTo + passwordRecovery presentes) |
| `onboarding.tsx` | Tutorial 1º uso (flag `@rumo_pragas_onboarding_seen`) | **OK** |
| `consent-location.tsx` | Opt-in explícito de localização (LGPD); fail-closed | **OK** |
| `update-password.tsx` | Define nova senha a partir do deep-link de recovery (sessão recovery ativa) | **OK** (fix mergeado — dead-end do mega-audit resolvido) |
| `(tabs)/index.tsx` | Home: clima (open-meteo), alertas, diagnósticos recentes, CTA diagnóstico | **OK** (bloco trial-counter/paywall removido no free build) |
| `(tabs)/ai-chat.tsx` | Chat IA (edge fn `ai-chat`, Claude) com histórico `pragas_chat_messages` | **OK** — ilimitado (FREE_MODE) |
| `(tabs)/history.tsx` | Histórico `pragas_diagnoses`; tap abre diagnóstico, long-press deleta | **OK** (fix de tap mergeado) |
| `(tabs)/library.tsx` | Biblioteca de pragas por cultura (dataset local pestRegistry) | **OK/observar**: itens com affordance limitada (achado MED do mega-audit — conferir na FASE de telas) |
| `(tabs)/settings.tsx` | Perfil, idioma, notificações, privacidade/termos, sair, **excluir conta** (invoke `delete-user-account` + Sentry capture) | **OK** |
| `diagnosis/crop-select.tsx` | Passo 1: escolher cultura (constants/crops) | **OK** |
| `diagnosis/camera.tsx` | Passo 2: foto (expo-camera/image-picker, manipulator para compressão) | **OK** |
| `diagnosis/loading.tsx` | Passo 3: chama edge fn `diagnose` (Claude Vision), fila offline se sem rede | **OK** |
| `diagnosis/result.tsx` | Passo 4: resultado, confiança, alternativas, MIP, PDF export | **OK** — gates isPro inertes (stub true); código morto de paywall permanece (higiene) |
| `diagnosis/pest/[id].tsx` | Ficha da praga (registry + MIP) | **OK** |
| `edit-profile.tsx` | Nome, cidade/UF, culturas, avatar (bucket `avatars`) | **OK** |
| `paywall.tsx` | **NEUTRALIZADO**: renderiza nada e `router.back()` — sem preço/CTA/restore | **OK por design (grátis)** |
| `privacy.tsx` / `terms.tsx` | Legais in-app, controlador **MM CAMPO FORTE LTDA 57.169.838/0001-20** + DPO contato@agrorumo.com | **OK** (mandato LGPD 01/jul aplicado) |
| `+not-found.tsx` | 404 | OK |

## 3. Fluxos principais

1. **Cadastro → uso**: login/signup (e-mail, SIWA, Google) → `onboarding` → `consent-location` (opt-in GPS) → `(tabs)`. Orquestrado por `services/navigationGate.ts` (ordem: onboarding → auth → consent → tabs).
2. **Diagnóstico**: crop-select → camera → loading (POST `/functions/v1/diagnose` com JWT; lat/lng SÓ com consentimento — fail-closed, `services/diagnosis.ts:58-72`) → result → pest/[id]. Offline: `services/diagnosisQueue.ts` + `useDiagnosisSync` reenvia ao reconectar (sem notificação de conclusão — UX menor conhecida).
3. **Chat IA**: `services/ai-chat.ts` → edge fn `ai-chat` (JWT verify ZERO-X, contador `chat_usage` via RPCs service_role, FREE_MODE ilimitado).
4. **Exclusão de conta (LGPD)**: settings → invoke `delete-user-account` (JWT; apaga tabelas user-scoped + auth.users) + fila `deletion_requests` processada pelo cron `pragas-process-deletions-daily` (jobid 4, 03:00 UTC → edge fn `process-deletions` v18, deployada hoje). Web: pragas.agrorumo.com/excluir-conta.
5. **Push**: `services/notifications.ts` (expo-notifications, projectId EAS) + tabela `pragas_push_tokens` + edge fn `send-push` (auth service_role, timingSafeEqual pendente — LOW conhecido).

## 4. Supabase jxcn — estado REAL (verificado via MCP hoje)

**Tabelas do app (todas com RLS ON):** `pragas` (catálogo, SELECT auth), `pragas_profiles` (12 rows; select/insert/update own), `pragas_diagnoses` (CRUD own), `pragas_diagnosis_usage`, `pragas_diagnosis_feedback`, `pragas_chat_messages`, `chat_usage`, `pragas_push_tokens`, `pragas_push_notifications` (service only), `pragas_notification_queue` (service only), `pragas_error_logs`, `pragas_analytics`, comunidade (`pragas_community_posts/likes`, `pragas_post_comments/likes/replies`, `pragas_reply_likes`, `pragas_outbreaks`, `pragas_outbreak_confirmations`) — **comunidade/outbreaks NÃO têm tela no app atual** (schema à frente do produto), `pragas_subscriptions` (DEPRECADA, janela até 21/08), e compartilhadas: `subscriptions`, `deletion_requests`, `user_preferences`, `analytics_events`, `audit_log`, `webhook_events`, `processed_webhook_events`, `mcp_api_tokens`.

**ZERO-AD (billing-fraud): PASS.** `subscriptions` = só SELECT own + service_role ALL (nenhuma policy UPDATE/INSERT de user). `pragas_profiles` não tem coluna de entitlement.

**Functions:** `handle_new_user` (SECDEF, `search_path=""` ✅), `handle_new_pragas_user`, `get_chat_usage_count` / `increment_chat_usage` (SECDEF; grants HOJE = authenticated+service_role; **anon/PUBLIC revogados** — estado bate com a migration 20260702120000, aplicada em prod).

**Storage:** bucket `pragas-images` (privado) + `avatars` (público). **Cron:** jobid 4 `pragas-process-deletions-daily` ativo.

**Edge fns live (relevantes):** `diagnose` v48 e `ai-chat` v33 (redeploy 01/jul ≈ FREE_MODE), `process-deletions` v18 (02/jul), `analytics` v12, `revenuecat-webhook` v14, `send-push` v26, `delete-user-account` **v12 (deploy antigo ~13/mai)**, `stripe-webhook` v50 (**código do Finance — INTOCÁVEL**).

## 5. Integrações

| Integração | Estado |
|---|---|
| **Sentry** | @sentry/react-native 7.11, DSN projeto `rumo-pragas` (org rumo-maquinas) inline plaintext no eas.json (ZERO-L OK); lazy-init anti-crash; edge fns com `_shared/sentry.ts` |
| **RevenueCat** | Presente porém **no-op**: keys fora do eas.json prod; `isRevenueCatConfigured()` false → skip; paywall neutralizado; `useSubscription` força enterprise. Coerente com pivot grátis. |
| **Edge diagnose/ai-chat** | FREE_MODE default `true` (só desliga com secret `FREE_MODE=false`) → free ilimitado; rate-limit horário anti-abuso preservado; JWT verify ZERO-X |
| **api/ Vercel (MCP)** | `api/mcp/server.ts` + 4 tools read-only (get_diagnosis, get_pest_history, list_diagnoses, search_pest_library); auth por token estático + tabela `mcp_api_tokens`; maxDuration 30 |
| **Push** | expo-notifications + `send-push`; **sem `googleServicesFile` no app.json** → push remoto Android depende de credencial FCM V1 no EAS server (verificar) |
| **IA Hub** | Código pronto (`lib/ia-hub.ts`) porém **DESLIGADO de propósito** em prod (2 flags exigidas; gate documentado no eas.json — não ligar sem ZERO-X/persistência/quota no Hub) |
| **Voz** | `voiceFlag.ts` — só ativa com `EXPO_PUBLIC_VOICE_ENABLED === 'true'` (default OFF) |
| **Clima** | open-meteo (sem key) via `services/weather.ts` |
| **Web** | `vercel.json`: `expo export --platform web`, SPA rewrite, headers de segurança |

## 6. Suspeitas / pontos a verificar nas próximas fases (nada re-reportado do que já foi corrigido)

| # | Sev | Item | Evidência | Fix proposto | gate |
|---|---|---|---|---|---|
| M1 | MÉDIO | `delete-user-account` live está em **v12 (~13/mai)**, anterior aos fixes LGPD de jun/jul no repo (USER_SCOPED_TABLES, push_tokens/chat_usage, escopo per-app). Repo ≠ prod → a exclusão in-app pode não apagar tudo que o código atual promete. | MCP list_edge_functions (v12, ts 1778679671s) vs `supabase/functions/delete-user-account/index.ts` | Diff repo↔prod (`get_edge_function`) e, se defasada, redeploy (fn específica do Pragas apesar do nome genérico — CONFIRMAR que nenhum outro app invoca o slug antes) | true |
| M2 | MÉDIO | Push remoto Android: sem `googleServicesFile`/`google-services.json`; se credencial FCM V1 não estiver no EAS, `getExpoPushTokenAsync` falha silencioso e alertas não chegam (achado do mega-audit ainda não confirmado como resolvido). | `expo-app/app.json` (sem chave); `services/notifications.ts:147-155` | `eas credentials -p android` para confirmar FCM V1; se ausente e push for escopo v1, anexar credencial (não exige novo binário para push via Expo) | false |
| M3 | MÉDIO | Envs Supabase (`EXPO_PUBLIC_SUPABASE_URL/ANON_KEY`) NÃO estão inline no eas.json production — vêm do EAS remote env. ZERO-L exige visibility plaintext (SENSITIVE→`***` foi raiz de 4 rejeições históricas). Binário 1.0.7 funciona, mas rebuild 1.0.8 depende disso. | `expo-app/eas.json` production.env (só SENTRY_*) | `eas env:list --environment production` e confirmar plaintext antes do build 1.0.8 | false |
| B1 | BAIXO | `increment_chat_usage`/`get_chat_usage_count` ainda executáveis por **authenticated** com `p_user_id` arbitrário (griefing entre usuários logados). Inócuo hoje (FREE_MODE não gate nada), relevante ao re-monetizar. | pg_proc grants (verificado hoje); migration 20260702120000 (por design manteve authenticated) | Ao religar cobrança: REVOKE authenticated (edge fn usa service_role) ou validar `p_user_id = auth.uid()` dentro da fn | true |
| B2 | BAIXO | FREE_MODE das edge fns depende do DEFAULT (`env ?? "true"`); um secret `FREE_MODE=false` esquecido no jxcn reativaria caps 3/mês+10/mês silenciosamente. | `diagnose/index.ts:23-24`, `ai-chat/index.ts:142-143` | Confirmar `supabase secrets list` (jxcn) que FREE_MODE não está setado como false; smoke E2E 4º diagnóstico | false |
| B3 | BAIXO | SECDEF `get_chat_usage_count`/`increment_chat_usage` com `search_path=public` (não `''`) — superfície de hijack teórica (funções só tocam `chat_usage`). | pg_proc `proconfig` (verificado hoje) | Migration futura: `SET search_path = ''` + qualificar objetos (junto de outra janela de mudança jxcn) | true |
| B4 | BAIXO | Schema fantasma: 9 tabelas de comunidade/outbreaks com RLS+policies vivas em prod sem NENHUMA tela/consumer no app (ghost engineering; superfície RLS a manter à toa). | list_tables + ausência de referências em `expo-app/` | Documentar como roadmap OU agendar remoção pós-decisão de produto (DDL destrutivo em prod compartilhado) | true |
| B5 | BAIXO | Código morto de paywall/gating (`router.push('/paywall')` em result.tsx/pest/[id].tsx/index.tsx, strings de upgrade no i18n) — inerte, mas é risco latente de regressão 2.3.2 se os stubs reverterem. | mega-audit LOW (confirmado presente) | Higienizar na v1.0.8 (remover call-sites órfãos); NUNCA reativar paywall sem decisão CEO | true |
| B6 | BAIXO | Debris: `.aab` na raiz do expo-app, `dist/` stale (pré-free-build), `store-screenshots/` com print de erro RN, `.worktrees/i18n-finalize` defasado. | `ls expo-app/`; mega-audit MED brand | Limpeza/gitignore na branch atual (sem tocar assets canônicos `expo-app/store-assets/`) | false |

**Regras vivas desta fase:** iOS WAITING_FOR_REVIEW é intocável; nada de reintroduzir cobrança; `stripe-webhook` (slug jxcn) jamais deployar por cima; landing Astro design-locked (ZERO-N).
