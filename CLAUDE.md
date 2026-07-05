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
