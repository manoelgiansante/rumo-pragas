# 05 — PAGAMENTOS / Integridade do Pivot Grátis — Rumo Pragas IA

> Fase 1 (read-only) · branch `perfect/pragas-launch-2026-07-02` · 2026-07-02
> Escopo: auditar as **4 pernas** do pivot 100% grátis (binário · servidor · legal/copy · resíduos) + APÊNDICE de re-monetização (só plano, zero código).
> Estado de referência: iOS 1.0.7 WAITING_FOR_REVIEW (INTOCÁVEL) · Android 1.0.7 vc44 production · Supabase jxcn · diagnose v48 / ai-chat v33 FREE_MODE.

## Veredito

**O pivot grátis está ÍNTEGRO nas 4 pernas.** Nenhum caminho de compra é alcançável (2.1b/2.3.2 mitigado), o servidor não tem 403 de limite pago, os textos legais in-app são coerentes com "grátis", e não há código Stripe/checkout/Asaas/PIX em lugar nenhum do app ou do `api/`.
Zero CRITICAL, zero ALTO. Achados são **1 MÉDIO de copy** (badge "Enterprise/diamante" + "obrigado por apoiar" para usuário grátis) e **5 BAIXO** (código/copy morto latente e itens de verificação de servidor/legal). Nenhum exige rebuild urgente; todos cabem na v1.0.8.

---

## PERNA 1 — BINÁRIO (paywall no-op · RC sem quebra · nenhuma compra alcançável · sem preço visível)

### PASS confirmados
- **`app/paywall.tsx` é no-op real.** Renderiza `<View/>` e, no mount, `router.back()` (ou `replace('/(tabs)')`). Nenhum plano/preço/botão "Assinar"/"Restaurar" pode aparecer, nem via deep link ou push que ainda aponte para `/paywall`. (paywall.tsx:24-34)
- **`hooks/useSubscription.ts`** força `plan:'enterprise', isPro:true` — puro, sem dependência nativa, nunca rebaixa nem exibe gate. (useSubscription.ts:41-49)
- **`hooks/useMonthlyUsage.ts`** força `plan:'enterprise', limit:null, remaining:null` — `<UsageCounter/>` renderiza nada e `isFreePlan` fica `false`. (useMonthlyUsage.ts:44-55)
- **`hooks/useMipKnowledge.ts` `TIER_LEVELS`** desbloqueia baixo/medio/alto para TODOS os tiers → `lockedCount=0` → MipCard não mostra chip com cadeado nem CTA de upgrade. (useMipKnowledge.ts:48-52)
- **Todos os `router.push('/paywall')` estão atrás de gates sempre-falsos:**
  - `app/(tabs)/index.tsx:339` — dentro de `{isFreePlan && ...}`; `isFreePlan = plan==='free'` e plan é `enterprise` → morto. (index.tsx:330,69)
  - `app/diagnosis/result.tsx:512/543/553` — todos sob `if (!isPro)`; `isPro` é `true` → mortos. (result.tsx:510,541,551)
  - `app/diagnosis/pest/[id].tsx:95` — sob `if (!isPro)` → nunca redireciona (a tela já exige isPro).
  - `components/MipCard.tsx:91/120` — só sob `tier==='free' && lockedCount>0`; tier vem de useSubscription (enterprise) e lockedCount=0 → mortos.
  - `components/UsageCounter.tsx:121` — a função retorna `null` antes (`limit===null`) → morto. (UsageCounter.tsx:95)
- **`services/purchases.ts` não tem caller de compra alcançável:** `initializePurchases` faz early-return sem API key (keys ausentes do env de prod), com `require()` lazy (sem eval no cold-start, defesa 2.1a) e try/catch não-bloqueante (_layout.tsx:180-194). `restorePurchases` só é chamado atrás de `if (!isRevenueCatConfigured()) return` (settings.tsx:412) **e** a linha "Restaurar compras" só é renderizada dentro de `{isRevenueCatConfigured() && (...)}` (settings.tsx:581) → não renderiza em prod. `purchasePackage`/`getOfferings`/`checkSubscriptionStatus` não têm nenhum caller.
- **Card de assinatura em Settings:** CTA de upgrade só sob `{!isPro && ...}` (settings.tsx:233) → nunca renderiza.
- **Nenhuma string de preço é renderizada.** As chaves `subscription.proPrice ('R$ 29/mês')`, `enterprisePrice ('R$ 69/mês')`, `subscribe ('Assinar')`, `comingSoonMsg` etc. existem no i18n mas **nenhum componente as consome** (grep: só `diagnosis.usageBlocked` é usada, dentro do UsageCounter que retorna null no tier enterprise).

### Achados
- **P-01 (MÉDIO)** — descrito abaixo (badge "Enterprise" + "obrigado por apoiar").
- **P-02, P-03, P-04 (BAIXO)** — código/copy/RC-init mortos, descritos abaixo.

---

## PERNA 2 — SERVIDOR (sem 403 de limite pago · rate-limit por hora preservado)

### PASS confirmados
- **`diagnose/index.ts`**: `PLAN_LIMITS.free = FREE_MODE ? -1 : 3` (l.338-339). O bloco de cap mensal + `status: 403 "Limite de diagnosticos atingido"` está inteiro dentro de `if (limit !== -1)` (l.379-436) → **morto sob FREE_MODE**. O burst por hora (`RATE_LIMIT_BY_PLAN.free = 10 diag/h`, `checkRateLimit`) **permanece** protegendo o gasto de Anthropic Vision. (l.90-127)
- **`ai-chat/index.ts`**: `CHAT_LIMITS.free = FREE_MODE ? -1 : 10` (l.147-148). O `403 CHAT_LIMIT_REACHED` está dentro de `if (chatLimit !== -1)` (l.391-436) → **morto sob FREE_MODE**. O `403` de l.217 é **CORS origin allowlist** (defense-in-depth), não gate pago — correto. Burst por minuto preservado. (l.86-121)
- **FREE_MODE default = `true`** quando o env não está setado (`(Deno.env.get("FREE_MODE") ?? "true") !== "false"`), em ambas as funções → seguro por padrão.

### Achados
- **P-05 (BAIXO)** — verificação de secret FREE_MODE, abaixo.

---

## PERNA 3 — LEGAL / COPY (termos · privacidade coerentes com grátis)

### PASS confirmados
- **`app/terms.tsx:126-129`** afirma explicitamente: *"no momento não há assinatura, compra dentro do aplicativo nem qualquer cobrança"* — **coerente** com o modelo grátis. Menção condicional a planos futuros ("caso planos... via respectiva loja... nenhuma cobrança sem seu consentimento") é adequada.
- Landing de produção (Astro, `pragas.agrorumo.com`) está fora do meu escopo de escrita (ZERO-N) e o SKILL registra o hero já em "Disponível na App Store e Google Play" — sem drift de preço a reportar aqui.

### Achados
- **P-06 (BAIXO)** — `privacy.tsx:171` cita "processamento de pagamentos", abaixo.

---

## PERNA 4 — RESÍDUOS (código Stripe/checkout morto alcançável?)

- **Nenhum** arquivo com `stripe|checkout|asaas|buy.stripe|pix` em `expo-app/app`, `services`, `api`, `lib` (grep vazio).
- `api/` do app só contém `mcp/` (read-only, token estático — fora deste escopo).
- `supabase/functions/stripe-webhook` e `revenuecat-webhook` existem no diretório de functions, mas **`stripe-webhook` é código do Rumo Finance (SHARED no jxcn) — INTOCÁVEL** (não invocado por este app). `revenuecat-webhook` não tem caminho de compra no cliente que o alimente (RC nunca é configurado em prod).
- Resíduos são **código/copy morto** (P-02/P-03/P-04), não código de cobrança executável.

---

## ACHADOS DETALHADOS

### P-01 · MÉDIO · rn-app · gate=false
**Card de assinatura em Settings badge-ia o usuário grátis como "Enterprise" (ícone diamante) + tagline "Obrigado por apoiar o Rumo Pragas IA".**
Com o free build, `plan` default = `'enterprise'` (settings.tsx:266) e `isPro = plan!=='free'` = true → o SubscriptionCard mostra ícone `diamond` (âmbar), badge `planEnterprise = 'Enterprise'` (settings.tsx:204-208; i18n:386) e tagline `subTaglinePro = "Você tem acesso completo ao agrônomo IA. Obrigado por apoiar o Rumo Pragas IA."` (settings.tsx:230; i18n:427).
Num app 100% grátis, exibir um selo de tier premium ("Enterprise" + diamante) e agradecer "por apoiar" (implica pagamento) é **incoerente com o posicionamento grátis** e é justamente o tipo de sinal (existência de tier pago/IAP) que o revisor da Apple procura — este app já foi rejeitado 4× por IAP/2.3.2. Também confunde o usuário (nome em inglês "Enterprise", plano que ele nunca escolheu).
- Evidência: `app/(tabs)/settings.tsx:204-208, 230, 266` · `i18n/locales/pt-BR.ts:386, 427`
- Fix (dentro do free build, sem re-monetização): sob FREE_MODE, renderizar badge neutro (ícone `leaf`/`checkmark-circle` + rótulo "Acesso completo" ou "Grátis") e trocar a tagline por uma sem "apoiar"/"Enterprise", ex.: *"Você tem acesso completo e ilimitado ao agrônomo IA, gratuitamente."* Vale em iOS/Android/Web.

### P-02 · BAIXO · rn-app · gate=false
**Código morto de paywall/compra (latente 2.3.2).** Vários `router.push('/paywall')` (index/result/pest/MipCard/UsageCounter) e todo o `services/purchases.ts` (purchasePackage/getOfferings/checkSubscriptionStatus sem caller; restore/init guardados). Hoje 100% inalcançável, mas um refactor futuro que inverta um gate reabriria caminho de compra visível.
- Evidência: `app/paywall.tsx`, `services/purchases.ts`, call sites citados na Perna 1.
- Fix (opcional, reversível): manter é aceitável (o caminho de reverter está documentado no header de cada arquivo). Recomendo um **teste de regressão** que assegure `paywall.tsx` não renderiza CTA e que `isPro/limit` continuam forçados — barra contra reintrodução acidental. Não remover agora sem necessidade.

### P-03 · BAIXO · rn-app · gate=false
**Strings de preço/assinatura mortas no i18n** (`proPrice 'R$ 29/mês'`, `enterprisePrice 'R$ 69/mês'`, `subscribe 'Assinar'`, `comingSoonMsg`, copy de `upgrade*`/`proCta*`). Nenhuma é renderizada hoje. Risco: preços defasados/enganosos se forem reutilizados na re-monetização.
- Evidência: `i18n/locales/pt-BR.ts:262-263, 786-840` (não consumidas).
- Fix: podar ou marcar claramente como "re-monetization only"; ao reabrir cobrança, recalcular preços (não confiar nos literais atuais).

### P-04 · BAIXO · rn-app · gate=false
**RevenueCat ainda é inicializado a cada login** (`_layout.tsx:186` importa e chama `initializePurchases`). Benigno: keys ausentes → early-return; import lazy (sem eval no cold-start); try/catch não-bloqueante. Mas é inconsistente com "sem compras" e mantém o módulo nativo no grafo.
- Evidência: `app/_layout.tsx:180-194` · `services/purchases.ts:45-54`
- Fix (opcional): envolver a chamada com uma guarda de flag (ex.: `if (!APP_FREE_MODE)` / `if (isRevenueCatConfigured())`) para não iniciar RC no build grátis.

### P-05 · BAIXO · web-api · gate=false
**FREE_MODE depende do default do env.** Se algum secret `FREE_MODE=false` existir no jxcn, os caps pagos (403 dead-end) reativam silenciosamente — e o paywall que os resolveria está neutralizado.
- Evidência: `diagnose/index.ts:23-24` · `ai-chat/index.ts:142-143`
- Fix (verificação, não destrutivo): `supabase secrets list` (jxcn) confirmar que não há `FREE_MODE` override + smoke E2E do 4º diagnóstico e da 11ª mensagem de chat (devem passar sem 403).

### P-06 · BAIXO · legal · gate=false
**`app/privacy.tsx:171`** lista "processamento de pagamentos" como categoria de compartilhamento com provedores essenciais. No build grátis não há processador de pagamento ativo → sobre-declaração leve (LGPD art. 6º V — exatidão).
- Evidência: `app/privacy.tsx:171`
- Fix: remover a menção a "processamento de pagamentos" enquanto o app for grátis (tela in-app, editável — **não** é landing/ZERO-N), reintroduzindo só quando houver cobrança real.

---

## APÊNDICE (gate=true) — Plano de re-monetização futura (SÓ PLANO, ZERO CÓDIGO)

> Decisão do CEO. Nada abaixo deve ser implementado sem autorização explícita. IDs antigos (`pragas_pro_monthly`/`pragas_pro_annual`) foram **queimados** e as 3 subs do ASC deletadas em 02/jul — não reutilizar.

**Modelo alinhado ao portfólio (mobile IAP + web Stripe/PIX via Asaas):**
1. **Produtos novos (IDs inéditos)** — ASC + Play com IDs frescos (ex.: `pragas.pro.mensal.v2` / `pragas.pro.anual.v2`). Base plan Android com ≥1 offer (senão offerToken vazio). RevenueCat **project DEDICADO** do Pragas (ZERO-W — jamais reusar key de outro app), keys `EXPO_PUBLIC_REVENUECAT_*` como **plaintext** no EAS (ZERO-L).
2. **Reverter os 3 commits `fix/pragas-free-2026-06-30`** (paywall.tsx, useSubscription, useMonthlyUsage) via git history — restaura paywall RC, gate metered e UsageCounter.
3. **Servidor**: setar `FREE_MODE=false` (jxcn) → reativa `PLAN_LIMITS.free=3` (diagnose) e `CHAT_LIMITS.free=10` (ai-chat). Confirmar que o webhook RevenueCat grava entitlement via `service_role` (bypassa RLS) e que **o cliente nunca escreve entitlement** (ZERO-AD — congelar colunas de plano em `pragas_subscriptions`/`pragas_profiles`).
4. **Web (Stripe/PIX via Asaas)**: checkout web fora do binário iOS (nunca ofertar compra de conteúdo consumido no app iOS fora do IAP — 3.1.1). Webhook com signature verify + dedup atômico (INSERT-first) + verificar pagamento em TODOS os branches (`payment_status==='paid'` / `status ∈ active,trialing`).
5. **Griefing das RPCs `chat_usage`** (ver B1/B3 do mapa): ao re-monetizar, `REVOKE ... FROM authenticated` OU validar `p_user_id = auth.uid()` na função, e migrar `search_path=public → ''` nas SECDEF — janela coordenada jxcn.
6. **Copy/legal**: reverter P-01/P-03/P-06 (badges, preços, privacidade) e alinhar Termos + landing ZERO-N (autorização de design) ao novo preço/trial (Modelo B = 14d, não 7d).
7. **Store**: submeter a 1ª assinatura **na versão** (UI-only no ASC — não há caminho de API confiável) e **nunca** deixar IAP `WAITING_FOR_REVIEW` bundlado numa versão grátis (trap 2.1b).

---

## Saúde (registro, sem ação)
- paywall no-op real · hooks de assinatura/uso puros e forçados a ilimitado · todos os pushes de paywall atrás de gates sempre-falsos · zero Stripe/checkout/PIX no app · servidor sem 403 pago (burst rate-limit preservado) · Termos in-app coerentes com grátis · Restore/upgrade CTA corretamente não-renderizados.
