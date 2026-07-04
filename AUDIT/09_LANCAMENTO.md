# 09 — LANÇAMENTO: Onboarding, Conversão e Prontidão de Loja

> Rumo Pragas IA · Auditoria 2026-07-02 (fase 09) · branch `perfect/pragas-launch-2026-07-02` (read-only)
> Escopo: time-to-value, onboarding, e-mails transacionais, deep links, assets de loja/ASO, push opt-in, checklist de submissão v1.0.8.
> Verificações ao vivo: ASC (read-only via MCP), Supabase jxcn (SQL read-only), landing prod (curl), código atual da main/branch.

---

## ⚠️ MUDANÇA DE ESTADO DESCOBERTA NESTA AUDITORIA

**O iOS 1.0.7 NÃO está mais WAITING_FOR_REVIEW — está REJECTED.**
Verificado ao vivo no ASC (02/jul): `appStoreVersions` → 1.0.7 `appVersionState: REJECTED`; a submissão de **02/jul 12:47 UTC** (`reviewSubmissions` id `be0320d0-bd62-4ccb-88d3-1056b11e18e0`) está em **UNRESOLVED_ISSUES**. O texto da rejeição só existe no Resolution Center (UI-only, sem API). Todo o plano "não perturbar a fila" está superado: agora existe trabalho de resubmissão.

---

## Achados

### L1 · CRITICAL · gate=CEO — iOS 1.0.7 REJEITADO em 02/jul (estado do skill/plano desatualizado)
- **Evidência:** ASC app 6762232682 → version 1.0.7 (`8ba00eab-679a-4645-84a1-ef2336cf30c9`) `REJECTED`; reviewSubmission 02/jul 12:47 UTC em `UNRESOLVED_ISSUES` (11ª submissão do app).
- **Impacto:** app não vai publicar sozinho; sem ação, morre na fila. O motivo exato exige CEO abrir Resolution Center (ZERO-O playbook: ler Resolution Center ANTES de rebuildar).
- **Fix proposto:** CEO lê o Resolution Center → cruzar com L2 abaixo (forte candidato a causa) → corrigir e resubmeter a MESMA 1.0.7 com build novo só se o motivo exigir binário. **NÃO** cancelar a submissão (cai para DEVELOPER_REJECTED).

### L2 · CRITICAL · gate=CEO — Review Notes no ASC ainda descrevem app PAGO (paywall, "Assinar Pro", IAP, conta Pro/expirada)
- **Evidência:** `appStoreReviewDetail` `c1f175c7-...` (lido ao vivo 02/jul): "Build 50 (v1.0.7)…", "PRIMARY (active **Pro subscription**…)", "EXPIRED subscription account (to review the **re-purchase** flow…)", "Guideline 2.1(b) — **In-App Purchase location**… 'Assinar Pro' / paywall → StoreKit purchase sheet appears", "IAP 'Pragas Pro Mensal'".
- **Realidade:** app 100% grátis (decisão CEO 01/jul), paywall neutralizado, as 3 subscriptions **deletadas** do ASC em 02/jul. O reviewer segue as notas, procura paywall/IAP que não existem → confusão direta com 2.1/2.3.2 (instruções imprecisas). Provável causa ou contribuinte da rejeição de 02/jul. As notas também citam "Build 50" (o build anexado é posterior).
- **Fix proposto:** reescrever as review notes para o modelo grátis ("O app é 100% gratuito, não há compras internas; conta demo: pragas.review@agrorumo.com; fluxo: onboarding → login → consentimento → Diagnosticar → foto → resultado"), remover toda menção a Pro/IAP/expired-account. Executável via API (`update-app-store-review-detail`) — write no ASC = **gate CEO**.

### L3 · ALTO · gate=false (docs) — 3 documentos ASO do repo ainda vendem o modelo PAGO (drift perigoso pré-resubmit)
- **Evidência:**
  - `expo-app/STORE_LISTING.md:21` ("Free (com IAP)"), `:112-114` ("PLANOS… Pro… Enterprise"), `:248` ("In-app purchases Yes R$ 49,90/mês"), `:532-548` (Screenshot 5 = Paywall), `:601` ("Test IAP sandbox").
  - `docs/aso-final.md:28` ("7 dias grátis, sem cartão"), `:64-68` ("R$ 49,90/mês ou R$ 499/ano"), `:166-169`.
  - `docs/aso/play-metadata.md:34` ("In-app purchases: Yes"), `:151` ("[ ] IAP SKUs publicados em Monetization > Products").
- **Impacto:** a fonte canônica correta (grátis) é `expo-app/store-assets/metadata/{ios,android}/pt-BR/*.txt` — mas qualquer agente/pessoa que abrir os 3 docs "master ASO" vai colar copy paga no console → 2.3.1 (metadata enganosa) e reintrodução acidental de narrativa de cobrança (proibida pelo pivot).
- **Fix proposto:** marcar os 3 arquivos com banner `> ⚠️ DEPRECATED 2026-07-02 — modelo 100% GRÁTIS; fonte canônica: expo-app/store-assets/metadata/` e corrigir as seções de plano/IAP. Sem gate (documentação interna), mas fazer ANTES do resubmit.

### L4 · MÉDIO · gate=CEO (mudança de comportamento) — Time-to-value: conta obrigatória + 3 prompts nativos antes do 1º diagnóstico; push prompt dispara "frio" logo após login
- **Fluxo real medido (código atual):** splash → onboarding 3 telas (skippável, 1 toque) → **login obrigatório** (Apple/Google ≈2 toques; e-mail/senha ≈3 campos + termos) → consent-location "Continuar" + **prompt nativo de localização** → entra nas tabs e `useNotifications(isAuthenticated)` em `expo-app/app/_layout.tsx:159` chama `registerForPushNotificationsAsync()` imediatamente → **prompt nativo de push** → Home → "Diagnosticar" → crop-select → **prompt nativo de câmera** → foto → resultado. ≈ **10–12 interações + 3 prompts de sistema** até o primeiro valor; zero valor antes da conta (sem modo visitante; a biblioteca de pragas, que não exige backend do usuário, também fica atrás do login).
- **Impacto:** o prompt de push chega colado no de localização, sem contexto → opt-in de push despenca (é o canal dos "alertas regionais" prometidos na listing); conta-antes-do-valor é a maior alavanca de conversão restante.
- **Fix proposto (v1.0.8+, decisão de produto):** (a) adiar o registro de push para depois do 1º diagnóstico concluído com pre-prompt PT-BR ("Quer receber alertas de pragas na sua região?"); (b) avaliar modo visitante (biblioteca + 1 diagnóstico sem conta). Ambos = feature/comportamento novo → **gate CEO**. Positivo já existente: onboarding reduzido a 3 páginas com analytics (`onboarding_started/finished`), nome opcional no cadastro, signup com sessão navega direto (sem alerta enganoso).

### L5 · MÉDIO · gate=CEO (deploy landing + build) — Universal/App Links "pega-tudo": qualquer link de pragas.agrorumo.com abre o app e cai em 404 (+not-found)
- **Evidência:** AASA servido em prod com `"paths": ["*"]` / `"components":[{"/":"/*"}]` (curl 02/jul); `expo-app/app.json:120-133` intentFilter Android `autoVerify` com `pathPrefix: "/"`; o app NÃO possui rotas `/privacidade`, `/termos`, `/suporte`, `/excluir-conta` (rotas internas são `privacy`, `terms`…), e não há `+native-intent.tsx` para remapear.
- **Impacto:** com o app instalado, tocar "Política de Privacidade"/"Termos"/"Excluir conta" (links da loja, de e-mail, do WhatsApp) abre o APP na tela `+not-found` em vez da página web — atrito e risco de reviewer topar com 404 in-app. O fluxo de recovery NÃO depende disso (usa scheme `rumopragas://update-password`).
- **Fix proposto:** restringir o AASA/assetlinks (arquivo `.well-known` no repo da landing Astro — mudança invisível, mas deploy em landing prod = **gate CEO**) e o `pathPrefix` do `app.json` (build 1.0.8) apenas às rotas que o app realmente trata — hoje, nenhuma é essencial; alternativa: adicionar `+native-intent.tsx` que devolve rotas conhecidas e manda o resto pro browser.

### L6 · MÉDIO · gate=false (verificação) — Reset de senha: `rumopragas://update-password` precisa estar na allowlist de Redirect URLs do jxcn (não verificável daqui; fluxo quase nunca exercitado)
- **Evidência:** `expo-app/services/auth.ts:68-74` envia `redirectTo: Linking.createURL('/update-password')`; o handler in-app está completo (`services/passwordRecovery.ts` cobre PKCE `?code=` e implícito `#access_token`, cold e warm start; tela `app/update-password.tsx` existe). Porém o jxcn é projeto COMPARTILHADO (60+ apps) e a allowlist não é legível por SQL/CLI desta máquina. SQL ao vivo: **apenas 1 recovery e-mail já foi enviado na história do app** (61 usuários) → fluxo essencialmente não testado em produção.
- **Impacto:** se a URL não estiver na allowlist, o Supabase silenciosamente cai no Site URL global do jxcn (provavelmente domínio de OUTRO app) e o produtor nunca volta ao Rumo Pragas para redefinir a senha.
- **Fix proposto:** conferir Dashboard jxcn → Auth → URL Configuration → Redirect URLs contém `rumopragas://update-password` (e o domínio web `https://app.pragas.agrorumo.com/update-password` para a versão web); adicionar é aditivo e não afeta outros apps. Depois, smoke E2E real do reset (enviar e-mail, tocar link no device, trocar senha).

### L7 · MÉDIO · gate=CEO (config compartilhada) — E-mails transacionais: template/sender de recovery é o do projeto jxcn COMPARTILHADO (idioma/marca não garantidos PT-BR)
- **Evidência (SQL ao vivo, 02/jul):** dos 61 usuários Pragas, **0 unconfirmed / 0 confirmation_sent** → confirmação de e-mail está DESLIGADA (autoconfirm) — bom para time-to-value, e significa que o ÚNICO e-mail transacional do app é o de **recovery**. O template e o remetente (SMTP sender name/from) são configurados por PROJETO no Supabase → são compartilhados com todos os apps não-RM do jxcn; default do Supabase é em inglês ("Reset Your Password") com remetente genérico.
- **Impacto:** produtor BR recebe e-mail de redefinição possivelmente em inglês/da marca errada → desconfiança/abandono; superfície de usuário 100% PT-BR é regra do app.
- **Fix proposto:** ler o template atual no Dashboard jxcn (Auth → Email Templates) e o sender (Project Settings → Auth → SMTP). Se genérico/EN: personalizar com texto PT-BR **neutro multi-app** (ex.: "Redefinir sua senha — AgroRumo") porque a mudança afeta TODOS os apps do jxcn → **gate CEO** (decisão compartilhada).

### L8 · BAIXO · gate=false — Conta demo do reviewer existe e loga, mas o histórico está vazio
- **Evidência (SQL ao vivo):** `pragas.review@agrorumo.com` confirmado, last_sign_in 02/jul 15:38 UTC, **0 diagnósticos / 0 chats**; `pragas.review.expired@agrorumo.com` tem 1 diagnóstico. (As duas contas citadas nas review notes existem — ponto positivo.)
- **Fix proposto:** antes do resubmit, popular 2–3 diagnósticos reais na conta primária (login manual + fotos de exemplo) para o reviewer ver Histórico/Biblioteca com conteúdo. A conta "expired" ficou sem função no modelo grátis — remover das notes (ver L2).

### L9 · BAIXO · gate=false — Dois conjuntos de screenshots divergentes no repo (fonte única indefinida)
- **Evidência:** raiz `store-assets/screenshots/{iphone-6.7,ipad-12.9}/` (01-hero…05-agro-ia, com `_src/*.svg`, 24/jun) **vs** `expo-app/store-assets/{ios/6.5|6.7|6.9,android/phone}/` (01-hero…05-login). Dimensões dos de `expo-app` corretas (iOS 1290×2796; Android 1080×2340; feature graphic 1024×500 ✅). Nenhum dos nomes indica tela de paywall/preço (bom — sem risco 2.3.3 por preço).
- **Fix proposto:** eleger `expo-app/store-assets/` como fonte canônica (é a referenciada por `docs/aso/play-metadata.md`) e mover a pasta da raiz para arquivo/deletar (cruza com o achado B6 de debris da fase 1 — não re-reportado aqui).

### L10 · BAIXO · gate=false — Docs apontam Support URL para `/support` (404); o live usa `/suporte` (200 OK)
- **Evidência:** curl 02/jul: `https://pragas.agrorumo.com/support` → **404**; `/suporte` → 200. ASC live `supportUrl = /suporte` ✅. `docs/aso-final.md:102` ainda manda `/support`.
- **Fix proposto:** corrigir o doc (junto do L3). Demais URLs obrigatórias OK ao vivo: `/privacidade` 200, `/termos` 200, `/delete-account` 200, `/excluir-conta` 200.

### L11 · BAIXO · gate=CEO (metadata de loja) — Claims da listing live ("82,5% de acurácia", "5 segundos") mais fortes que a copy nova do repo
- **Evidência:** ASC live promotional text: "NOVO: 82% de acurácia validada em campo…"; description live: "82,5% de acurácia ponderada". A copy nova do repo (`store-assets/metadata/ios/pt-BR/description.txt`) já suavizou ("primeira leitura rapida e confiavel") e a promo nova diz "100% gratis". Validação existe (`scripts/validate-diagnose.ts`, 82.5% weighted, 10 imagens) mas é amostra pequena para claim público de campo.
- **Fix proposto:** no resubmit da 1.0.7/1.0.8, subir a metadata do repo (que também injeta o "100% grátis" na promo — reforça o modelo). Push de metadata = write na loja → **gate CEO**.

---

## O que está SAUDÁVEL (verificado, sem ação)

- **Metadata canônica do repo é grátis-coerente:** `expo-app/store-assets/metadata/{ios,android}/pt-BR/` diz "GRATIS PARA USAR… sem cobranca e sem assinatura" — pivot íntegro na copy nova.
- **ASC live (description/keywords) não menciona preço/IAP** — sem 2.3.1 por preço na listing atual.
- **AASA + assetlinks.json servidos e corretos** (appID `5YW9UY5LXP.com.agrorumo.rumopragas`; SHA-256 do cert presente) — só o escopo "pega-tudo" é problema (L5).
- **Recovery in-app completo** (fix do mega-audit confirmado no código): redirectTo + PKCE/implicit + tela update-password + rota no Stack.
- **Onboarding**: 3 telas PT-BR (strings `onboarding.*` presentes em `i18n/locales/pt-BR.ts:845-861`), skippável, instrumentado, iPad-safe (useWindowDimensions), navegação via gate único (loop RUMO-PRAGAS-7/8 corrigido).
- **Consent de localização** compatível Apple 5.1.1(iv) + LGPD (propósito antes do prompt, revogável em Ajustes, fail-closed).
- **Push**: canais Android PT-BR (`pest-alerts`, `general`), deep link de push com whitelist + UUID estrito + Sentry em rejeição (ZERO-O), token persistido via RPC `touch_push_token`; `POST_NOTIFICATIONS` declarado (Android 13+). Único senão é o TIMING do prompt (L4). Credencial FCM V1 = achado M2 da fase 1 (não re-reportado).
- **Web**: `agro-rumo-pragas-ia.vercel.app` e `app.pragas.agrorumo.com` respondem 200; SPA rewrite + headers de segurança no `vercel.json`.
- **Confirmação de e-mail desligada** = zero fricção de confirmação no signup (e o código trata os dois cenários corretamente).
- **Contas demo existem no jxcn** e a primária logou em 02/jul.

---

## Checklist de submissão v1.0.8 (na ordem)

**Pré-requisito — destravar a rejeição atual (1.0.7):**
1. [ ] **CEO**: abrir Resolution Center e capturar o motivo da rejeição de 02/jul (L1).
2. [ ] **CEO/agente autorizado**: reescrever review notes p/ modelo grátis, remover IAP/Pro/expired (L2).
3. [ ] Popular 2–3 diagnósticos na conta `pragas.review@agrorumo.com` (L8).
4. [ ] Se o motivo exigir binário → seguir bloco abaixo; senão, corrigir metadata/notes e "Enviar para Análise" (clique = UI-only, CEO).

**Build & binário (quando houver 1.0.8):**
5. [ ] `list-builds` max no ASC ANTES de bumpar (auto-land do Mac Mini builda em paralelo; colisão real em 01/jul).
6. [ ] `eas build --local` com Node 22 (`fnm use v22.22.3`), eas 20 de `~/.npm-global/bin`, 1 plataforma por vez (ZERO-D). `.nvmrc` já corrigido.
7. [ ] ZERO-L: `eas env:list --environment production` → `EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY` **plaintext** (M3 fase 1).
8. [ ] FCM V1 anexada (`eas credentials -p android`) se push remoto Android for pra valer (M2 fase 1).
9. [ ] Smoke free-mode: 4º diagnóstico do mesmo usuário passa sem 403 (B2 fase 1).

**Metadata & assets (com o resubmit):**
10. [ ] Subir copy do repo (`store-assets/metadata/`) p/ ASC (promo "100% gratis") e Play (fastlane supply) — remover claim "82%" da promo live (L11).
11. [ ] Play Console: confirmar "In-app purchases" desmarcado / sem SKUs ativos e Data Safety coerente com `store-assets/android/DATA_SAFETY.md`.
12. [ ] Screenshots: fonte única `expo-app/store-assets/` (L9); conferir que nenhum print mostra paywall/preço.
13. [ ] What's New 1.0.8 PT-BR mencionando "100% grátis".

**Config/infra (paralelo, sem loja):**
14. [ ] Verificar allowlist jxcn: `rumopragas://update-password` + URL web (L6) + smoke E2E do reset.
15. [ ] Ler template/sender do e-mail de recovery no jxcn; decidir personalização compartilhada (L7 — gate).
16. [ ] Decidir escopo dos universal links (L5 — landing `.well-known` + `app.json`).
17. [ ] Deprecar os 3 docs ASO pagos (L3) + corrigir `/support`→`/suporte` (L10).
18. [ ] Web Vercel: nada bloqueante; manter deploy atual.

**Decisões de produto (backlog CEO, não bloqueia resubmit):**
19. [ ] Pre-prompt de push pós-1º-diagnóstico (L4).
20. [ ] Modo visitante / valor antes da conta (L4).

---

## Nota de método
- Nenhum item já corrigido pelo mega-audit de 01/jul foi re-reportado (signup-com-sessão, tela update-password, redirectTo do reset, history tap, paywall neutralizado — todos confirmados PRESENTES no código atual e listados como saudáveis).
- Nenhuma escrita foi feita em ASC/Play/Supabase/landing; ASC e SQL usados em modo leitura.
- Score da dimensão "lançamento" no estado atual: **5.5/10** — metadata/assets/e-mails/deep-link em bom estado ou com fixes fáceis, mas o estado real da loja (REJECTED + review notes pagas) é bloqueante e desconhecido do plano vigente.
