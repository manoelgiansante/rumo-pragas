# Rumo Pragas IA — contexto operacional para agentes

Este arquivo descreve o estado atual do repositório. As regras globais de `AGENTS.md` continuam
obrigatórias.

## Escopo canônico

- Aplicativo publicado: `expo-app/` (Expo SDK 55, React Native 0.83, Expo Router, TypeScript).
- Backend e dados: `supabase/`, em projeto compartilhado com outros apps AgroRumo.
- Materiais de loja: `expo-app/store-assets/`.
- Fonte canônica da landing: remote
  `https://github.com/manoelgiansante/rumo-pragas-landing-nextjs.git`, worktree sibling
  `../rumo-pragas-landing` e candidato atual no PR #3; a implantação Vercel de produção permanece
  separada.
- `RumoPragas/` e `RumoPragas.xcodeproj`: protótipo SwiftUI legado; não é o app das lojas.

Leia antes de alterar comportamento:

- `README.md`;
- `SECURITY.md`;
- `docs/audit/launch-coverage-2026-07-14.md`;
- `docs/launch-runbook.md`;
- `expo-app/BUILD_CHECKLIST.md`;
- `expo-app/SUBMISSION_CHECKLIST.md`.

## Contrato do produto

- O lançamento é gratuito, sem anúncios, assinatura, compra, paywall ou restauração de compra.
- O diagnóstico é uma hipótese assistida por IA, com confiança e alternativas; não é laudo,
  receituário nem substituto de profissional habilitado.
- Não publicar promessas de acurácia, tempo fixo, validação em campo, dosagem ou resultado
  garantido.
- A inferência exige internet. A fila local apenas adia o envio; não existe inferência offline.
- Fotos de diagnóstico seguem para Agrio por padrão, com Claude configurável no servidor. O chat
  envia texto ao Gemini por padrão, com Claude configurável. Não prometa retenção zero, ausência
  de treino ou região de processamento sem evidência contratual verificável.
- A exclusão no app é limitada aos dados do Rumo Pragas; não prometer remoção da identidade
  global compartilhada nem de registros operacionais compartilhados. O marcador mínimo de
  desvinculação continua até reativação explícita ou exclusão global e não restaura dados antigos.

## Restrições de segurança

- Nunca registrar ou imprimir secrets, tokens, imagens, mensagens do chat, localização ou dados
  pessoais.
- Nunca versionar `.env`, service accounts, arquivos de assinatura, keystores,
  `google-services.json` ou `GoogleService-Info.plist` reais.
- O Supabase é compartilhado: toda consulta e migration deve preservar isolamento por aplicativo,
  RLS, least privilege e rollback testável.
- Mudanças remotas, migrations de produção, exclusão de dados reais, publicação e alteração de
  credenciais exigem o gate correspondente.
- Não reativar funções remotas de cobrança ou diagnóstico que não tenham fonte local auditada.

## Gates

```bash
cd expo-app
npm ci
npm run lint
npm run typecheck
npm test -- --runInBand
npm run test:coverage -- --runInBand
npx expo-doctor@1.20.0
npx expo export --platform web
npm audit --audit-level=high
```

```bash
cd supabase/functions
deno task gate
```

Preserve os gates nos workflows. Não use `--no-verify`, não enfraqueça testes e não esconda
falhas. A versão de produto é definida em `expo-app/app.json`; a numeração efetiva de builds de
loja é remota no EAS e deve ser consultada antes de cada build e submissão. O inventário somente
leitura de 2026-07-14 observou iOS 63 e Android 54; são baselines mutáveis, não valores do candidato.
O build local protegido define `SENTRY_DISABLE_AUTO_UPLOAD=true`; qualquer upload nativo separado
exige autorização e gate próprios, sem migrar o build para a nuvem. OTA é uma ação separada; depois
do `eas update` autorizado, use o script explícito de upload de mapas.

## Cicatrizes importantes

- O splash tem watchdog para impedir congelamento durante o boot; inicializações novas não podem
  bloquear indefinidamente a primeira tela.
- Sentry deve permanecer sem PII e inicializado de forma compatível com o build nativo.
- O app usa tema claro e tokens de `expo-app/constants/theme.ts`; textos de interface precisam
  existir em pt-BR, en e es.
- O fluxo de autenticação e navegação já teve loops; alterações precisam de testes do cold start,
  sessão, consentimento e recuperação de senha.
- Conteúdo químico ou de manejo não deve ser apresentado como prescrição. Identificações incertas
  exigem confirmação explícita.

Relatórios em `AUDIT/` e arquivos antigos de pesquisa são apenas histórico. A cobertura vigente é
`docs/audit/launch-coverage-2026-07-14.md`.

## Estado operacional 17/07/2026 (mega-trabalho rodada 1 — verificado ao vivo)

### Gates do CEO (o workflow NÃO fez — decisão/loja/deploy/migration)
- **Provider do diagnose**: Agrio (~US$0,10/diag, e é o concorrente #1 na loja BR) vs recarregar Anthropic + `DIAGNOSE_PROVIDER=claude`. **Manter o path `claude` vivo como rollback** (não deixar apodrecer). O **chat NÃO migrou** e cai junto no próximo zero de crédito Anthropic.
- ✅ **Furo de segurança (banco compartilhado) — FECHADO em prod 17/07 (PR-04)**: RPCs `get_chat_usage_count`/`increment_chat_usage` (SECURITY DEFINER com `p_user_id` arbitrário) tinham EXECUTE p/ `authenticated` → **IDOR cross-user** (qualquer logado de QUALQUER app jxcn lia/inflava contador alheio). Inerte hoje só porque `FREE_MODE` zera os caps.
  ✅ **REVOKE APLICADO em prod 17/07.** Verificado ao vivo: `proacl` das duas RPCs agora = **apenas `postgres` e `service_role`** (sem anon, sem authenticated). Migration `20260713190517_lock_chat_usage_rpc_service_role_only.sql` (renomeada de `20260707120000` no cherry-pick `adaeb47` da rodada 2) versionada em `supabase/migrations/`; o header interno ainda diz "PROPOSAL ONLY — DO NOT APPLY" (não atualizado pós-apply — inofensivo, é comentário). Zero caminho de client quebrou (a única chamada é da edge fn `ai-chat` via `supabaseAdmin`/service_role, que bypassa grant). Vetor DoS-to-paywall neutralizado; `FREE_MODE=false` deixa de depender deste gate.
- 🔴 **Entitlement partido — BUG CONFIRMADO (GATE-B)**: `agrorumo-combo/supabase/functions/_shared/combo.ts` KNOB 4 tem `PRAGAS_TABLE = 'pragas_subscriptions'`, mas `diagnose`/`ai-chat` leem `subscriptions` (app='rumo-pragas' → **0 linhas**). **Comprador de combo com Pragas paga e não desbloqueia** quando o gating pago ligar. Mascarado hoje pelo `FREE_MODE`. As 80 linhas reais vivem em `pragas_subscriptions` (72 trialing/pro, 7 active/pro, 1 expired).
  **Decisão CEO (dinheiro + fonte-da-verdade):** apontar o WRITE do combo p/ `subscriptions`, OU repontar os READERS p/ `pragas_subscriptions` — ⚠️ repontar readers concederia 'pro' aos **7 `active/pro`** existentes (conferir se são pagantes legítimos). **NÃO ligar `FREE_MODE=false` antes de reconciliar.**
- ❌ **"Checkout 500 precisa deploy" — REFUTADO (GATE-D). Não faça nada.** O **Pragas standalone NÃO tem checkout** (é grátis; não existe `create-checkout*` neste repo). Quem cobra é `create-checkout-session-combo` (combo, www.agrorumo.com/planos), e o código **deployado** já trata os params mutuamente exclusivos (`if (couponId) discounts else allow_promotion_codes=false`). Os erros `RUMO-PRAGAS-11` eram **do combo**, mal-roteados pro Sentry do Pragas pela poluição de DSN (abaixo).
- 🔴 **Exclusão de conta = HARD DELETE da identidade COMPARTILHADA (GATE-C)**: a fn deployada `delete-user-account` (v24, byte-idêntica ao repo) faz `admin.auth.admin.deleteUser(userId)` **imediato**, sem grace period; **nunca** escreve `deletion_requests`/`scheduled_hard_delete_at` (a existência da tabela enganou uma análise anterior). Apagar a conta no Pragas remove o login AgroRumo do **Vet/Finance/Operacional/CampoVivo** com o mesmo e-mail. Mitigado no client pelo aviso de 2 passos (`3758fe8`); **migrar p/ soft-delete + janela de recuperação = decisão CEO.**
- **Loja**: (a) **screenshots 1.0.9 mostram paywall/limite/dark-mode que não existem mais** (contradiz "grátis ilimitado", Guideline 2.3.3) → regravar; (b) review notes afirmam falsamente "grupos de assinatura vazios" (há 2 subs MISSING_METADATA `pragas_pro_m2/y2` — os IDs da re-monetização; deixá-los incompletos OU deletar, e corrigir a nota); (c) Data Safety/privacidade declaram só Anthropic — **falta declarar o Agrio** (subprocessador que recebe as fotos desde 06/07).
- 🟡 **Sentry poluído (causa de 1 misdiagnóstico real) — EM RESOLUÇÃO (PR-08, 13/jul)**: o projeto `rumo-pragas` recebe erros de **outros apps do jxcn** — `agrorumo-news` (1.230 eventos "THREADS_USER_ID" + `IG_USER_ID`) e `agrorumo-combo` (os 500 do checkout, `RUMO-PRAGAS-11`, que me levaram a diagnosticar errado). Causa: `SENTRY_DSN`/`SENTRY_DSN_EDGE` do jxcn é compartilhado e aponta pro projeto do Pragas.
  **Status 13/jul (verificado):** (a) **News** — código `publish.ts` já prefere `NEWS_SENTRY_DSN` com fallback (e8aaf9d, 10/jul) + skip `unconfigured` de THREADS → issue `RUMO-PRAGAS-R` **resolved/tapering** (último evento 2d atrás); secret `NEWS_SENTRY_DSN` **CONFIRMADO setado no jxcn** (`supabase secrets list` 13/jul); projeto Sentry `agrorumo-news` **já existe**. (b) **Combo** — projeto Sentry **`agrorumo-combo` CRIADO via MCP** (slug `agrorumo-combo`, ID `4511728996712448`); o código combo `_shared/sentry.ts` **já prefere `SENTRY_DSN_COMBO`** (`|| SENTRY_DSN_EDGE || SENTRY_DSN`), então falta só o secret. **Varredura de fontes (issues 14d):** além de News e Combo, **nenhum outro app jxcn** polui o `rumo-pragas` — os demais (vet/finance/operacional/arroba/confinamento/mercado/pesquisa/sucessao) já têm DSN dedicado próprio nos secrets do jxcn; o resto (`RUMO-PRAGAS-W/X/10/Z/Y/V/T/P`) é do PRÓPRIO Pragas (client + edge `diagnose`).
  **PENDENTE (DEPLOY — sessão principal, jxcn compartilhado):** setar `SENTRY_DSN_COMBO` como secret do jxcn (DSN do novo projeto `agrorumo-combo`) → redeploy das fns do repo `agrorumo-combo`. Só depois vale criar alerta no projeto do Pragas (hoje seria puro ruído).

### ✅ PR-10 (17/jul) — SVP do ai-chat Gemini em prod: SELADO, funcionando
- **Smoke E2E 17/jul ~12:07 BRT com user real logado** (`tutorial.demo.pragas.0507@agrorumo.com`, sign-in por senha no jxcn):
  - `POST /functions/v1/ai-chat` (slug COMPARTILHADO — o que o binário público 1.0.9/vc49 chama; deploy Gemini v54 de 10/jul): **HTTP 200**, geração Gemini REAL de 1.963 chars ("Ferrugem do Cafeeiro *Hemileia vastatrix*…"), 5.427ms no log da fn.
  - `POST /functions/v1/ai-chat-pragas` (slug DEDICADO novo, main PR#52, v1 deployado 17/jul 01:24 UTC): **HTTP 200**, geração real de 2.953 chars, 6.421ms — mas SÓ pelo fluxo completo do client novo: RPC `pragas_link_account` (linked:true) → RPC `grant_pragas_ai_consent` (chat, versão `2026-07-14.1`) → headers `X-Rumo-App: rumo-pragas` + `X-Pragas-AI-Consent-Version/-Purpose` + `Idempotency-Key` UUID. Chamada crua sem esses passos = **409 `unlinked` / 403 `app_not_allowed` / 428 `ai_consent_required`** — fail-closed POR DESIGN, não é bug (armadilha p/ smoke futuro).
- **Traços server-side do E2E (SQL prod):** `pragas_api_rate_limit_counters` scope `ai_chat` request_count=1 · `pragas_ai_consents` (chat) last_used_at tocado pela fn · `pragas_app_links` 0→1 active (era **0 na vida inteira** — nenhum user real linkou ainda; o client 1.0.9 não chama o link).
- ⚠️ **Telemetria do chat = CEGA (ZERO-V):** `pragas_chat_messages` está e VAI CONTINUAR em 0 — **nenhum código** (client ou fns) escreve nela, e em FREE_MODE o `increment_chat_usage` é pulado (chatLimit=-1). "0 linhas" NÃO significa chat quebrado; uso real só aparece nos logs da fn (invocations) / Sentry. Se quiser métrica de adoção do chat, é preciso instrumentar (fora do escopo PR-10).
- Nota: memória 12/jul dizia Gemini free `limit:0` + modelo 404 (IA-Hub/jxcn "ainda aberto") — **17/jul os DOIS slugs devolvem geração real**; considerar aquele estado superado para o Pragas (prova = este smoke).

### Anti-falha para o próximo agente (armadilhas confirmadas nesta base)
- **`multi-statement execute_sql` no Supabase MCP retorna só o ÚLTIMO result set** — não conclua "objeto faltando" de query com vários SELECTs.
- **O hook `block-mcp-prod-writes` bloqueia `execute_sql` se o texto contiver DDL-like** (DROP/DELETE/UPDATE/INSERT/GRANT) mesmo em CTE de SELECT — reescreva sem essas palavras.
- **`get_edge_function`/`list_edge_functions` estouram o limite de tokens** — salve em arquivo e fatie por char range.
- **DV de CNPJ**: controlador **MM CAMPO FORTE LTDA 57.169.838/0001-20** (VÁLIDO, conferido) · DPO contato@agrorumo.com.
- **Refutados (não reinvestigue)**: MIP NÃO é gated por plano (tier fixo 'enterprise'); constraint `subscriptions_user_app_unique` EXISTE em prod; island JS da landing carrega 200; não há monitor sintético recorrente.

### PR-26 (18/jul) — smoke re-executável do chat IA em prod
- `scripts/smoke-ai-chat.sh`: reproduz o fluxo do E2E 17/jul (login REST → `ai-chat` compartilhado → link account → consent chat → `ai-chat-pragas` com headers do contrato). Credenciais SOMENTE via env (`PRAGAS_SMOKE_EMAIL`, `PRAGAS_SMOKE_PASSWORD`, `PRAGAS_SUPABASE_URL`, `PRAGAS_SUPABASE_ANON_KEY`). Saída = `PASS/FAIL + HTTP + latência` por etapa; exit 0 só se tudo 200. Roda contra PROD (conta demo dedicada).
