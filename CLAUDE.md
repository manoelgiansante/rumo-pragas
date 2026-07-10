# Rumo Pragas IA — instruções para agentes

> Atualizado 2026-07-04. Leia INTEIRO antes de mexer. Complementa (não substitui) o
> `~/CLAUDE.md` global (REGRAS ZERO) e o mapa canônico no Obsidian:
> `Apps/Rumo Pragas/Mapa Sistemico Rumo Pragas 2026-07-04.md`.

## O que é
Diagnóstico de pragas/doenças por FOTO com IA + biblioteca de pragas + chat IA Agrônomo.
**Posicionamento: "grátis de verdade, ilimitado, PT-BR"** (vs Plantix free-com-ads e Aegro caro).
O diagnóstico é o motor de aquisição; monetização volta depois (ver §Monetização).

## Onde o código vive
- **App que vai pra loja: `expo-app/`** (Expo SDK 55, RN 0.83, new-arch, expo-router, TypeScript).
- `RumoPragas/` + `RumoPragas.xcodeproj` = protótipo SwiftUI **LEGADO, não é o app das lojas. NÃO mexer.**
- Landing de produção: repo separado `Landing Pages/rumo-pragas-landing` (Astro) → pragas.agrorumo.com.
  A Next.js em `Apps/rumo-pragas-landing` NÃO é prod. Landing = ZERO-N (locked, só CEO autoriza visual).
- Supabase: projeto **jxcn** (`jxcnfyeemdltdfqtgbcl`, compartilhado com outros apps AgroRumo — NUNCA byfg).
  Tabelas `pragas_*` (profiles, subscriptions, diagnoses, push_tokens, deletion_requests).
- Edge functions PRÓPRIAS: `diagnose` e `ai-chat` (ambas em FREE_MODE — sem parede 403; rate-limit burst/hora mantido).
  **`diagnose` roda em Agrio desde 06/07 (Opção B):** identificação via Agrio (pago) + laudo do catálogo MIP embarcado (`data/mip` via `useMipKnowledge`) = ZERO gasto Anthropic. Flag env `DIAGNOSE_PROVIDER` (`agrio` default; `claude` = path legado p/ rollback). Adapter em `supabase/functions/diagnose/agrio.ts` (`AGRIO_LABEL_MAP` bridge label-inglês→PT/científico; labels sem sci nem hint → Sentry `agrio_label_unmapped`). Motivo: 06/07 os créditos Anthropic zeraram e derrubaram o diagnóstico (RUMO-PRAGAS-10). Doc: Obsidian `Apps/Rumo Pragas/Diagnose Provider - Agrio Migration 2026-07-06.md`.
  **NUNCA deployar `stripe-webhook`/`delete-user-account` daqui por cima dos genéricos — são compartilhados (Finance).**

## Design System (DS claro — diretriz CEO 02/jul + Poppins 04/jul)
Fonte única: `expo-app/constants/theme.ts`. Regras NÃO-negociáveis:
- **Sem dark mode** (decisão CEO 04/jul): `userInterfaceStyle: "light"` no app.json **+
  `expo-system-ui` instalado** — sem esse pacote o Android IGNORA a propriedade (verificado no
  prebuild; iOS trava via Info.plist sozinho). Não remova o pacote. O lock só vale em build
  nativo novo (não via OTA). Os branches `isDark`/`useColorScheme` que restaram no código são
  INERTES com o lock ativo — não os expanda, não os "conserte"; podem ser removidos em refactor
  dedicado, nunca em PR de feature.
- Fundo `Colors.background #FAFAF7` (legível no sol). Cartão branco. Texto `#0F1A14`.
- **Ação/CTA = verde-campo `Colors.accent #2E7D32`** (AA garantido). A folha profunda
  `Colors.brand #0B3D2E` é SÓ marca/hero/gradiente (`Gradients.hero`) — nunca CTA.
- Acento da vertical = dourado-trigo `warmAmber #C89B3C` (ícone/fundo/borda; como TEXTO use `earthText`).
- **Anti-AI-slop codificado**: sem azul-tech, sem teal/ciano, sem rainbow. `techBlue`/`info` são
  tons TERROSOS de suporte. Não introduza hex novo — use token; exceções permitidas: cores de
  MARCA de terceiros (Google Sign-In `#DADCE0/#3C4043`, WhatsApp `#25D366`) e o CSS do PDF em
  `result.tsx` (template HTML, outra mídia).
- **Tipografia = Poppins em TUDO** (4 pesos + itálico, bundlada via `@expo-google-fonts/poppins`).
  Padrão obrigatório em estilo de texto: `fontFamily: FontFamily.<peso>` JUNTO de
  `fontWeight: FontWeight.<peso>` (RN precisa do arquivo da fonte; peso máximo 700 — nunca 800/900).
  Itálico (nome científico) = `FontFamily.italic`, NUNCA `fontStyle: 'italic'` (Android não sintetiza).
  Carga em `app/_layout.tsx` (useFonts) entra no gate do splash MAS o watchdog de 10s manda —
  fonte JAMAIS pode travar o boot (ver §Apple).
- Escala: `FontSize` (estilo iOS HIG, body 17), `Spacing` (4→32), `BorderRadius` (8/12/16/24).
- i18n: **TODO texto de UI via `t()` nos 3 idiomas** (`i18n/locales/pt-BR.ts`, `en.ts`, `es.ts`).
  Chave nova = adicionar nos TRÊS no mesmo commit.
- A11y: todo touchable com `accessibilityLabel` + `accessibilityRole`; testID nos fluxos críticos.

## Apple / lojas — cicatrizes reais (NÃO reintroduzir)
- **Splash watchdog (`app/_layout.tsx`)**: Apple rejeitou VÁRIAS vezes por "freeze no loading" em
  iPad. O watchdog de 10s em escopo de módulo força `hideAsync`. Qualquer coisa nova no boot
  (fonte, SDK, fetch) NÃO pode condicionar o splash sem passar por esse teto.
- **Sentry init é LAZY** (nunca em module scope — SIGABRT no iOS 26 new-arch).
- **App é 100% GRÁTIS (Guideline 3.1.1)**: `app/paywall.tsx` é um stub que volta pra trás de
  propósito; `react-native-purchases` foi REMOVIDO; NENHUMA UI de assinatura/restaurar compra
  pode aparecer. Product IDs iOS antigos foram deletados/queimados — re-monetização usa IDs NOVOS.
- **ATT não existe** de propósito (sem ad SDK — prompt sem propósito = rejeição 5.1.2).
- Navegação gate (onboarding/consent/auth) tem histórico de loop infinito (RUMO-PRAGAS-7/8/M):
  a lógica em `_layout.tsx` + `services/navigationGate.ts` é cirúrgica — não "simplifique".
- iOS ASC `6762232682` · Android `com.agrorumo.rumopragas`. SA do Play: `expo-app/play-store-key.json`
  (o SA play-sa-new NÃO acessa este package).
- Estado das lojas (04/07 noite): iOS **1.0.7 PÚBLICO** (READY_FOR_SALE) + **1.0.8 (b55) WAITING_FOR_REVIEW**
  (AFTER_APPROVAL, publica sozinho); Android **production vc45 PÚBLICO** + 1.0.8 (vc46) no Play internal
  (promover pra production = gate CEO).

## Monetização (estado 04/jul)
GRÁTIS hoje. Comeback planejado: **Pro único R$19,90/mês · R$199/ano** — diagnóstico CONTINUA
grátis; Pro = histórico ∞ + relatórios PDF/receituário + IA prioritária. **NÃO construir de graça
o que está reservado pro Pro** (ex.: export PDF ilimitado). 1ª assinatura iOS = "submit with
version" no console (UI-only, gate CEO).

## Build / QA / esteira
- `npm run lint` (max-warnings 0) · `npx jest` (45 suítes; mocks de theme nos testes incluem
  FontFamily — chave nova no theme = atualizar mocks) · typecheck NESTA máquina:
  `( ulimit -s 65500; node --stack-size=50000 node_modules/typescript/bin/tsc --noEmit )`
  (o `npm run typecheck` estoura stack aqui).
- Build SEMPRE `eas build --local` (ZERO-D), 1 plataforma por vez, Node 22, workdir dedicada.
  Build >10min via tool: `nohup` + arquivo de exit (Bash tool mata em 600s).
- Antes de bumpar buildNumber: `list-builds` no ASC (esteira auto-land do Mac Mini builda em paralelo).
- Commits na main + push são liberados; **PR só com autorização CEO (ZERO-AC)**; release público
  de loja = gate CEO. Validação ZERO-AE roda no pre-commit (não contornar, nunca `--no-verify`).
- Gotcha desta máquina: acessar certos diretórios com `ls -la` pode travar (use `ls -1f` se pendurar).

## Reset de senha / auth
Supabase auth (jxcn). Deep link `rumopragas://update-password` allow-listed; tela
`update-password.tsx`. SMTP do jxcn = Resend custom (E2E provado 04/07). Apple/Google Sign-In
funcionando — botão Google usa as cores oficiais do brand guideline (não "tokenizar").

## Observability
Sentry project `rumo-pragas`. Release canônico `<slug>@<version>+<buildId>`
(`services/sentry-release.ts`). PII é strippada em `beforeSend` — manter.

## Histórico de decisões nesta base (pra não regredir)
- 2026-07-02: DS claro profissional (CEO) — tema reescrito, anti-slop.
- 2026-07-03: sweep 3.1.1 grátis total (RC removido, i18n de planos removida, paywall stub).
- 2026-07-04: Poppins app inteiro (codemod fontFamily+fontWeight), light lock (sem dark mode),
  fix copy duplicada do erro de histórico, CTA "Descrever sintomas" (Home→IA chat com prefill),
  linha "Indicar o app" (Share) nos Ajustes, chaves darkMode* removidas da i18n.

## Validação e Metodologias (ZERO-AE — 2026-07-04)
- TODA alteração de código segue a skill agrorumo-code-guard (gates G0→G5). Todo git commit passa por gate automático (tsc/gitleaks/eslint/SQL); commit BLOQUEADO = corrigir o FAIL (débito herdado de outra sessão: validate-change.sh --staged --accept-debt + declarar); contornar é proibido e negado por hook.
- Antes de trabalho não-trivial, ler Obsidian Playbooks/Metodologias e Padroes de Qualidade AgroRumo - MASTER 2026-07-04.md (router: codificação, banco, landing, design, billing).
- Validação manual: bash ~/scripts/agrorumo/validate-change.sh --staged

## Tutoriais em vídeo (05/07/2026)
Central oficial: **https://pragas-tutoriais.vercel.app** (Bob HeyGen, cortes por assunto H+V + completo).
Esteira reproduzível: `~/tmp/tutorial-marathon-2026-07-04/` (record-driver Playwright + compose.py + captions.py; conta demo tutorial.demo.pragas.0507@agrorumo.com). Caps 04-05 (diagnóstico) pendentes de rede no dia — regravar com o vigia e recompor.

---

## ⚠️ MEGA-AUDIT GO-LIVE — ESTADO VERIFICADO 2026-07-09 (LER antes de mexer)

> Auditoria completa (18 dimensões, todas as abas). Cada fato abaixo foi verificado ao vivo
> (SQL prod / E2E web / leitura de código / ASC MCP). Doc de detalhe: Obsidian
> `Apps/Rumo Pragas/Mega Audit Go-Live 2026-07-09.md`. Este bloco SUPERSEDE datas anteriores em conflito.

### Verdade de estado (corrige o §Apple acima)
- **iOS 1.0.9 PÚBLICO** (READY_FOR_SALE, build remoto 58) · **Android production 1.0.9/vc49 a 100%**. Binário == `main`. `app.json ios.buildNumber` (46) é IGNORADO (`appVersionSource: remote`) — não confie nele.
- **O diagnóstico FUNCIONA** (E2E: `POST /functions/v1/diagnose`→200, café ferrugem via Agrio, laudo cheio). MAS **uso orgânico real ≈ 8 diagnósticos na vida**: os 331 de 05-06/jul foram a GRAVAÇÃO DOS TUTORIAIS (conta `tutorial.demo.pragas.0507`). **NÃO há monitor recorrente** — nada queimando Agrio (saldo ~983). Não existe o "custo $24/dia" que se poderia supor.

### 15 fixes aplicados nesta auditoria (na `main`, commitados, NÃO pushados — CEO abre PR)
> Onda 1 (1-8) + Onda 2 (9-13) + Onda 3 (nits 14-15). Estado final verificado: **`tsc` exit 0 (zero erros)**,
> `eslint` 0, **jest 45/45 suítes · 418/418 testes VERDE**.
> (Não há débito RED pré-existente — a suspeita registrada em sessão anterior foi **refutada** com a suíte completa.)
> Ondas 1 e 2 passaram por **review adversarial** independente: veredito `SHIP_WITH_NITS`, zero regressão.
> 14. `3fca0b0` — corrige comentário FALSO em `SENSITIVE_MIP_MIN_SCORE`: score ≥4 é match forte de **keyword de sintoma**, e **NÃO garante** que o nome da praga casou (`searchByKeywords` só dá strongHit em `sintomas.palavrasChave`). Por isso o banner "confirme a identificação" continua necessário mesmo acima do limiar.
> 15. `8f791ec` — consentimento LGPD não some mais em falha dupla (servidor + fila offline): emite `trackEvent('consent_queue_write_failed')` sem PII e **desfaz** o flag otimista "consent seen" (via `clearLocationConsentSeen()` novo em `navigationGate.ts`) para o gate reaparecer no próximo cold start. ⚠️ Toque em `navigationGate.ts` é **puramente aditivo** (remove uma chave do AsyncStorage, try/catch, nunca lança) — a máquina de estado e as decisões de navegação NÃO foram tocadas; sessão corrente não sofre bounce. Cicatriz de loop infinito preservada.
1. `99dd5ba` — **Ficha técnica preenche do catálogo MIP** quando o `enrichment` do Agrio vem vazio (`pest/[id].tsx` → `useMipKnowledge`, fallback campo-a-campo: lifecycle/condições/monitoramento/produtos/IPM/sintomas). Era o bug #1 de produto: a ficha ficava vazia até no café.
2. `0cca099` — Headline do resultado usa **nome PT-BR do MIP** (não o inglês do Agrio) no hero/share/PDF.
3. `81ec483` — **Timeout de rede** (AbortController) no cliente Supabase (auth) e no chat IA — anti spinner-eterno (classe da rejeição do Vet). Diagnose já tinha 60s.
4. `307ba99` — Consent LGPD **não trava a entrada** em falha de rede (persist otimista + retry em background; registro LGPD preservado).
5. `1669f55` — **Não tenta push token no Android** sem FCM (evita throw + ruído Sentry a cada launch). Alertas locais preservados. `pragas_push_tokens`=0 até wire FCM.
6. `ec3ba70` — Row Versão lê só runtime (remove fallback `'1.0.7'`).
7. `3a2354b` — **Biblioteca navega pra ficha técnica** (era beco sem saída: cards eram estáticos). Cache-miss → sintetiza entry por params → fallback MIP hidrata.
8. `ed9906a` — **Chat IA rejeitava usuário logado na WEB.** Causa raiz: `services/ai-chat.ts` pegava o JWT via `supabase.auth.getSession()`, que na web resolve do storage — mas `SecureStoreAdapter` é no-op na web → `session:null`. Fix: passar o token do `useAuthContext` (mesmo padrão provado do diagnose). **ZERO-X preservado** (a fn continua com `supabase.auth.getUser(token)` server-side). ⚠️ **Cicatriz durável: na WEB, NUNCA confie em `supabase.auth.getSession()` para obter o token** — use `session.access_token` do auth context (o `onAuthStateChange` popula in-memory; o storage não).
9. `de81022` — **AGRO-SAFETY (o mais importante da onda 2).** O fix 1 fez a ficha exibir **dosagens de defensivo** vindas do catálogo MIP resolvido por heurística de keywords (`useMipKnowledge`, top match com score ≥ 2). Em match fuzzy ERRADO isso recomendaria agrotóxico da **praga errada** (CDC art.14 — responsabilidade objetiva + dano à lavoura). Agora: bloco químico/produtos só preenche com **score ≥ 4** (`SENSITIVE_MIP_MIN_SCORE`) e, quando vem do fallback MIP, renderiza sob banner **"Protocolo de referência para {praga} — confirme a identificação"**. Sintomas/ciclo/monitoramento seguem no limiar antigo.
   🔒 **DECISÃO DE PRODUTO — NÃO "consertar" como regressão:** em match fraco (score 2-3) o bloco de defensivos fica **vazio de propósito**. Segurança agronômica > completude.
10. `3758fe8` — **Exclusão de conta: confirmação em 2 passos.** Antes o usuário apagava a conta sem saber que perdia o login compartilhado. Passo 1 explicita que a edge fn faz **hard delete do `auth.users` COMPARTILHADO do jxcn** (perde Vet/Finance/Operacional/CampoVivo com o mesmo e-mail); passo 2 confirma permanente+imediato. Fluxo segue alcançável (Apple 5.1.1(v)). Verificado que Settings é tab raiz (não Modal) → `Alert.alert` renderiza de fato (a classe "Alert atrás de Modal" não se aplica aqui).
11. `aee502b` — **Privacidade factual.** O texto dizia que as FOTOS iam para "Claude, da Anthropic" — falso desde 06/07. Agora: **fotos → Agrio (Saillog Ltd.)**; **chat IA (texto) → Anthropic**, que nunca recebe foto; coordenadas → Open-Meteo. ⚠️ CEO deve revisar o wording final.
12. `63a4cde` — Fila offline (AsyncStorage) do consentimento LGPD de localização: replay idempotente no boot com sessão, preserva o timestamp original, ignora payload corrompido, nunca bloqueia o boot nem grava consentimento de outro usuário.
13. `9a17d3e` — Upload de avatar sobrevive ao timeout global de 20s (header-sentinela `x-rumo-timeout-ms` → 60s, removido antes do fetch real). O timeout global segue valendo para os demais fetches.

### Gates do CEO (o workflow NÃO fez — decisão/loja/deploy/migration)
- **Provider do diagnose**: Agrio (~US$0,10/diag, e é o concorrente #1 na loja BR) vs recarregar Anthropic + `DIAGNOSE_PROVIDER=claude`. **Manter o path `claude` vivo como rollback** (não deixar apodrecer). O **chat NÃO migrou** e cai junto no próximo zero de crédito Anthropic.
- 🔴 **Furo de segurança (banco compartilhado) — VERIFICADO E DE-RISKADO 09/07**: RPCs `get_chat_usage_count`/`increment_chat_usage` são SECURITY DEFINER com `p_user_id` arbitrário e EXECUTE p/ `authenticated` → **IDOR cross-user vivo em prod** (qualquer logado de QUALQUER app jxcn lê/infla o contador alheio). Inerte hoje só porque `FREE_MODE` zera os caps.
  ✅ **Sweep cross-app FEITO: REVOKE é SEGURO portfolio-wide.** As únicas referências às RPCs em todo o portfólio estão no rumo-pragas (a edge fn `ai-chat` + 3 migrations); a fn chama só via `supabaseAdmin` (service_role, bypassa grant) e o client **nunca** chama. `proacl` em prod confirma `authenticated=X` → migration `20260707120000` (marcada "PROPOSAL ONLY") **NÃO aplicada**.
  **Ação CEO:** aplicar a migration. Zero caminho de client quebra. Reversível. **OBRIGATÓRIO antes de qualquer `FREE_MODE=false`.**
- 🔴 **Entitlement partido — BUG CONFIRMADO (GATE-B)**: `agrorumo-combo/supabase/functions/_shared/combo.ts` KNOB 4 tem `PRAGAS_TABLE = 'pragas_subscriptions'`, mas `diagnose`/`ai-chat` leem `subscriptions` (app='rumo-pragas' → **0 linhas**). **Comprador de combo com Pragas paga e não desbloqueia** quando o gating pago ligar. Mascarado hoje pelo `FREE_MODE`. As 80 linhas reais vivem em `pragas_subscriptions` (72 trialing/pro, 7 active/pro, 1 expired).
  **Decisão CEO (dinheiro + fonte-da-verdade):** apontar o WRITE do combo p/ `subscriptions`, OU repontar os READERS p/ `pragas_subscriptions` — ⚠️ repontar readers concederia 'pro' aos **7 `active/pro`** existentes (conferir se são pagantes legítimos). **NÃO ligar `FREE_MODE=false` antes de reconciliar.**
- ❌ **"Checkout 500 precisa deploy" — REFUTADO (GATE-D). Não faça nada.** O **Pragas standalone NÃO tem checkout** (é grátis; não existe `create-checkout*` neste repo). Quem cobra é `create-checkout-session-combo` (combo, www.agrorumo.com/planos), e o código **deployado** já trata os params mutuamente exclusivos (`if (couponId) discounts else allow_promotion_codes=false`). Os erros `RUMO-PRAGAS-11` eram **do combo**, mal-roteados pro Sentry do Pragas pela poluição de DSN (abaixo).
- 🔴 **Exclusão de conta = HARD DELETE da identidade COMPARTILHADA (GATE-C)**: a fn deployada `delete-user-account` (v24, byte-idêntica ao repo) faz `admin.auth.admin.deleteUser(userId)` **imediato**, sem grace period; **nunca** escreve `deletion_requests`/`scheduled_hard_delete_at` (a existência da tabela enganou uma análise anterior). Apagar a conta no Pragas remove o login AgroRumo do **Vet/Finance/Operacional/CampoVivo** com o mesmo e-mail. Mitigado no client pelo aviso de 2 passos (`3758fe8`); **migrar p/ soft-delete + janela de recuperação = decisão CEO.**
- **Loja**: (a) **screenshots 1.0.9 mostram paywall/limite/dark-mode que não existem mais** (contradiz "grátis ilimitado", Guideline 2.3.3) → regravar; (b) review notes afirmam falsamente "grupos de assinatura vazios" (há 2 subs MISSING_METADATA `pragas_pro_m2/y2` — os IDs da re-monetização; deixá-los incompletos OU deletar, e corrigir a nota); (c) Data Safety/privacidade declaram só Anthropic — **falta declarar o Agrio** (subprocessador que recebe as fotos desde 06/07).
- 🟡 **Sentry poluído (causa de 1 misdiagnóstico real)**: o projeto `rumo-pragas` recebe erros de **outros apps do jxcn** — `agrorumo-news` (1.230 eventos "THREADS_USER_ID") e `agrorumo-combo` (os 500 do checkout, que apareceram como `RUMO-PRAGAS-11` e me levaram a diagnosticar errado). Causa: `SENTRY_DSN`/`SENTRY_DSN_EDGE` do jxcn é compartilhado e aponta pro projeto do Pragas; **não existe projeto Sentry `combo` nem `news`** (verificado). Efeito: esconde erro real do Pragas e envenena qualquer alerta.
  **Runbook:** criar 2 projetos Sentry (`agrorumo-combo`, `agrorumo-news`) → pegar DSNs → setar `SENTRY_DSN_COMBO`/`SENTRY_DSN_NEWS` como secrets do jxcn → redeploy dessas fns. Só depois vale criar alerta no projeto do Pragas (hoje seria puro ruído — e é por isso que 3 dias sem diagnose passaram despercebidos).

### Anti-falha para o próximo agente (armadilhas confirmadas nesta base)
- **`multi-statement execute_sql` no Supabase MCP retorna só o ÚLTIMO result set** — não conclua "objeto faltando" de query com vários SELECTs.
- **O hook `block-mcp-prod-writes` bloqueia `execute_sql` se o texto contiver DDL-like** (DROP/DELETE/UPDATE/INSERT/GRANT) mesmo em CTE de SELECT — reescreva sem essas palavras.
- **`get_edge_function`/`list_edge_functions` estouram o limite de tokens** — salve em arquivo e fatie por char range.
- **DV de CNPJ**: controlador **MM CAMPO FORTE LTDA 57.169.838/0001-20** (VÁLIDO, conferido) · DPO contato@agrorumo.com.
- **Refutados (não reinvestigue)**: MIP NÃO é gated por plano (tier fixo 'enterprise'); constraint `subscriptions_user_app_unique` EXISTE em prod; island JS da landing carrega 200; não há monitor sintético recorrente.
