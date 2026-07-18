# QA ABA POR ABA — Rumo Pragas IA (FASE 2)

> [!CAUTION]
> **ARQUIVO HISTÓRICO — NÃO USAR COMO ESTADO ATUAL OU CHECKLIST DE LANÇAMENTO.**
> Snapshot anterior à revisão de 14/07/2026; use `docs/audit/launch-coverage-2026-07-14.md`.

> Auditoria estática (código vivo em `expo-app/`), branch `perfect/pragas-launch-2026-07-02`, read-only.
> Estado: iOS 1.0.7 WAITING_FOR_REVIEW (intocável) · Android 1.0.7 vc44 production · **100% grátis** (paywall neutralizado, `useSubscription().isPro=true`, `useMonthlyUsage().plan='enterprise'`).
> Cobertura: **23/23 rotas** · **0 rotas quebradas** · **0 CRITICAL** · **0 ALTO**.
> Plataformas avaliadas: iOS + Android + Web (react-native-web).

## Placar
| Severidade | Qtd |
|---|---|
| CRITICAL | 0 |
| ALTO | 0 |
| MÉDIO | 2 |
| BAIXO | 5 |

**Nota da dimensão (QA de telas): 8.0/10.** App maduro, estados de loading/vazio/erro consistentes, i18n 100% PT-BR, navegação sólida, pivot-grátis íntegro na UI. Os únicos temas relevantes são de safe-area/edge-to-edge (polimento visual, não bloqueiam) e código morto de paywall (latente).

---

## TABS

### 1. Home — `(tabs)/index.tsx` · VEREDITO: OK
- CTA "Diagnosticar agora" → `/diagnosis/camera` (funciona; abre o grupo modal de diagnóstico). Card de stats "Diagnósticos" faz deep-link para `/(tabs)/history`; em erro vira "!" + tap-to-retry. Estados: skeleton inicial (`HomeScreenSkeleton`), erro de clima/dados com retry, banner de fila offline. RefreshControl OK.
- **Pivot-grátis íntegro:** o card "trial counter" (`X diagnósticos grátis restantes` → `push('/paywall')`) está sob `isFreePlan && …`; como `useMonthlyUsage` força `plan='enterprise'`, `isFreePlan=false` → **nunca renderiza**. Confirmado inerte.
- Observação (BAIXO Q7): `const FREE_MONTHLY_DIAGNOSES = 3` é constante morta.
- Safe-area: OK — o hero (LinearGradient full-bleed, 190px) é intencionalmente desenhado atrás da status bar; o conteúdo fica na base do hero.

### 2. Histórico — `(tabs)/history.tsx` · VEREDITO: OK com ressalva
- Lista `pragas_diagnoses` (own-only), busca client-side, pull-to-refresh, skeleton, estado de erro com retry, empty-state com CTA "Fazer primeiro diagnóstico". Tap na linha abre o diagnóstico (fix mergeado — `savePestToCache` antes de `/diagnosis/pest/[id]`, ou reconstrói `result` para healthy/invalid). Delete via **long-press** com confirmação destrutiva + Haptics + Sentry.
- Ressalva UX (BAIXO): a exclusão só é acessível por long-press, **sem affordance visível** — usuário pode não descobrir. Sugerido: hint sutil ou swipe-to-delete.
- **Safe-area (MÉDIO Q1):** a tela NÃO aplica inset superior (sem `SafeAreaView`/`useSafeAreaInsets`); `searchRow` fica a `marginTop: Spacing.lg` (16px) do topo absoluto → no iOS com notch/Dynamic Island e no Android 15 (edge-to-edge, translúcida) a barra de busca encosta/entra sob a status bar.

### 3. Biblioteca — `(tabs)/library.tsx` · VEREDITO: OK com gap de UX
- Catálogo estático de pragas por cultura (18 culturas), chips de filtro horizontais, busca, empty-state com "Limpar filtros" + CTA diagnosticar. FlatList performática (`initialNumToRender`, `windowSize`).
- **Gap de UX (BAIXO Q4):** `PestItem` **não é tocável** (nenhum `onPress`). O usuário pode esperar tocar numa praga para ver detalhes, mas a lista é só referência e não conecta com `/diagnosis/pest/[id]`. Considerar tornar cada item navegável (ficha) ou deixar claro que é apenas leitura.
- **Safe-area (MÉDIO Q1):** mesmo caso do Histórico — `searchRow` sem inset superior.

### 4. IA Chat — `(tabs)/ai-chat.tsx` · VEREDITO: OK
- `KeyboardAvoidingView` (iOS `padding`), empty-state com sugestões, loading de histórico (AsyncStorage), FlatList com auto-scroll, "typing" indicator, limpar conversa com confirmação. Envio desabilita botão quando vazio/enviando.
- **Pivot-grátis íntegro:** no catch, `CHAT_LIMIT_REACHED` mostra **apenas mensagem informativa** (`showAlert` OK), sem CTA de upgrade. Nenhum botão de compra.
- **Safe-area (MÉDIO Q1):** com mensagens presentes, o `chatHeader` (paddingVertical 8) fica no topo absoluto → sob notch/status bar. O empty-state (`paddingTop: 50`) é tolerável.

### 5. Ajustes — `(tabs)/settings.tsx` · VEREDITO: OK
- Perfil (avatar + nome + email), card de assinatura (mostra plano `enterprise`/ilimitado, **sem** CTA de upgrade e sem barra de uso, pois `isPro=true`), preferências (dark mode display-only, idioma via ActionSheet iOS / Alert Android), notificações (switch persistido), privacidade (links Política/Termos), sobre (checar updates OTA, suporte por e-mail com fallback, versão), zona destrutiva (sair + excluir conta via edge fn `delete-user-account`).
- Safe-area: OK no iOS (`contentInsetAdjustmentBehavior="automatic"`). No Android o header depende de `paddingTop: Spacing.xxl` (24px) — aceitável, mas não é inset real (ver Q2/observação edge-to-edge).
- Observação (BAIXO Q7): `PLAN_LIMITS free:3/pro:30` e o bloco `onUpgrade`/`SubscriptionCard` (CTA "upgradePlan") são código latente inerte sob free build. `restorePurchases` fica escondido atrás de `isRevenueCatConfigured()` (false).

---

## FLUXO DE DIAGNÓSTICO (grupo modal `diagnosis/`)

### 6. Câmera — `diagnosis/camera.tsx` · VEREDITO: OK
- Entrada do fluxo (Home CTA → aqui). Permissões de câmera/galeria com **recuperação** ("Abrir Ajustes" quando negado, inclusive `canAskAgain=false`). Compressão (1024px, JPEG 0.75) → `setImage` → `push('/diagnosis/crop-select')`. Overlay de "otimizando". `UsageCounter` renderiza **nada** (tier enterprise). `VoiceRecorderButton` gated por flag (retorna null OFF).
- **Safe-area (MÉDIO Q2):** importa `SafeAreaView` de **`react-native`** (no-op no Android) → no Android 15 edge-to-edge o header (close/título, paddingVertical 12) encosta na status bar.

### 7. Seleção de cultura — `diagnosis/crop-select.tsx` · VEREDITO: OK
- Preview da imagem, busca, grid de culturas responsivo (numColumns tablet), botão "Iniciar diagnóstico" com guard anti-duplo-tap (`isNavigating` ref). Back OK.
- **Safe-area (MÉDIO Q2):** `SafeAreaView` de `react-native` (no-op Android) → header sob status bar no Android edge-to-edge.

### 8. Loading/Análise — `diagnosis/loading.tsx` · VEREDITO: OK
- Passos animados (Reanimated, UI thread), progress bar, botão **Cancelar** (aborta com `isMountedRef`), espera de localização com timeout (3s, fail-closed p/ null), fila offline quando `isConnected===false` (`addToQueue` → result `queued=true`), captura Sentry em falha online. Cleanup completo de timers/interval. Guard StrictMode (`hasStartedAnalysis`).
- Safe-area: cancel button com `top: iOS 56 / Android 24` hardcoded — aproximação aceitável (full-bleed gradient).

### 9. Resultado — `diagnosis/result.tsx` · VEREDITO: OK
- Estados completos: `queued`, `error` (com "Tentar novamente" → câmera), `invalid_image`, empty (`!data`), e resultado pleno. Hero com imagem + confiança animada, aviso de baixa confiança (<0.7), tratamento (cultural/biológico/químico), MIP, alternativas, compartilhar, exportar PDF.
- **Pivot-grátis íntegro:** com `isPro=true` **todo** o conteúdo aparece **sem cadeados/PRO**; `handleViewDetails`/`handlePdfExport`/`handleToggleAlternatives` têm ramos `if (!isPro) push('/paywall')` que **nunca executam** (ver BAIXO Q3).
- **Web:** PDF trata `Platform.OS==='web'` (usa `Print.printAsync`/diálogo do browser) antes do `printToFileAsync` nativo — cross-platform correto.
- Safe-area: `SafeAreaView` de `react-native` (no-op Android), mas o hero é full-bleed; estados de erro são centralizados. Impacto Android baixo aqui.

### 10. Ficha da praga — `diagnosis/pest/[id].tsx` · VEREDITO: OK
- Carrega do cache (`loadPestFromCache`), estados loading/not-found, abertura de links externos com `canOpenURL` guard. Redirecionamento de paywall (`if(!isPro) replace('/paywall')`) **nunca dispara** (isPro=true) — ver Q3.
- Safe-area: `SafeAreaView` de `react-native`; hero full-bleed, impacto baixo.

---

## ROTAS SOLTAS / AUTH

### 11. Login/Cadastro — `(auth)/login.tsx` · VEREDITO: OK (forte)
- `SafeAreaView` (de `react-native-safe-area-context`, edges top+bottom) + `KeyboardAvoidingView` + `ScrollView keyboardShouldPersistTaps`. Segmented control login/cadastro, validação (email regex, senha forte no signup), toggle de senha, "esqueci a senha", consentimento LGPD (checkbox obrigatório no signup, botão desabilitado sem aceite), Apple/Google gated por disponibilidade/config. Signup auto-confirmado NÃO mostra alerta enganoso ("verifique email" só quando `!session`). Guard anti-duplo-submit.

### 12. Consentimento de localização — `consent-location.tsx` · VEREDITO: OK
- Consentimento LGPD explícito, back de hardware bloqueado no Android (`BackHandler`), botão único "Continuar" que dispara o prompt nativo e grava opt-in/opt-out (Apple 5.1.1(iv)). Não auto-navega (fix do loop RUMO-PRAGAS-7/8). Fetch de localização fire-and-forget.
- **Safe-area (LOW):** `SafeAreaView` de `react-native` (no-op Android), mas o `ScrollView` tem `paddingTop` (xxl/xxxl) que amortece; conteúdo centralizado com scroll. Impacto pequeno.

### 13. Definir nova senha — `update-password.tsx` · VEREDITO: OK (POSITIVO)
- Fluxo de recuperação **completo e correto** (ao contrário do irmão Operacional): `resetPassword` usa `redirectTo: Linking.createURL('/update-password')`; deep link tratado em `services/passwordRecovery.ts` + `useAuth.ts` (`PASSWORD_RECOVERY` → `replace('/update-password')`); esta tela chama `updatePassword` (`supabase.auth.updateUser`). Validação de força + confirmação. `SafeAreaView` de context.

### 14. Editar perfil — `edit-profile.tsx` · VEREDITO: OK
- Upload de avatar (câmera/galeria, compressão 512px, `upsert` self-heal no bucket `avatars`), campos com cadeia de foco (nome→telefone→cidade→salvar), `formatPhoneBR`, chips de estado (UF), grid de culturas, `KeyboardDoneAccessory` (iOS number pad). Save usa `upsert` (evita no-op silencioso em linha inexistente). Email read-only.
- **Safe-area (parte do Q2):** header com `paddingTop: iOS Spacing.xl / Android Spacing.md` (12px) → no Android edge-to-edge o header do modal encosta na status bar.

### 15. Onboarding — `onboarding.tsx` · VEREDITO: OK
- 3 páginas full-bleed (Reanimated dots), skip, responsivo tablet (`useWindowDimensions`), não auto-navega (fix do loop). Analytics instrumentado.
- **Safe-area (BAIXO Q6):** sem `SafeAreaView`; usa insets hardcoded (`top iOS56/Android24`, `bottom iOS44/Android30`). Full-bleed tolera, mas o bottom de 30px no Android pode ficar apertado sobre a barra de gestos.

### 16-17. Privacidade / Termos — `privacy.tsx` / `terms.tsx` · VEREDITO: OK
- `SafeAreaView` de context (edges top), header com back, conteúdo 100% PT-BR. Controlador **MM CAMPO FORTE LTDA., CNPJ 57.169.838/0001-20** + DPO presentes e corretos.

### 18. Paywall — `paywall.tsx` · VEREDITO: OK por design
- Neutralizado: renderiza `<View/>` vazio e no `useEffect` volta (`router.back()`/`replace('/(tabs)')`). Mantido registrado para degradar deep links/push. Sem planos/preços/botões de compra.

### 19. Not Found — `+not-found.tsx` · VEREDITO: OK com ressalva
- 404 com botão "voltar ao início" (`replace('/')`).
- **Ressalva (BAIXO Q5):** cores hardcoded claras (sem dark mode) e verde `#1B7A3D` fora do token de marca (`#0B3D2E`). Cosmético.

### 20-23. Layouts — `_layout.tsx` (root), `(auth)/_layout.tsx`, `(tabs)/_layout.tsx`, `diagnosis/_layout.tsx` · VEREDITO: OK
- Root: gate de navegação single-source-of-truth (fix do loop iPad/Android), splash watchdog absoluto (10s), Sentry lazy init, SafeAreaProvider com initialMetrics (defesa anti-freeze iPad). Tabs: 5 abas com ícones + a11y labels + testIDs. Diagnosis: stack modal com animações por plataforma.

---

## ACHADOS (detalhe)

### MÉDIO

**Q1 — Abas Histórico/Biblioteca/IA-Chat sem inset superior de safe-area** (`rn-app`)
Arquivos: `app/(tabs)/history.tsx:180-197`, `app/(tabs)/library.tsx:214-231`, `app/(tabs)/ai-chat.tsx:256-271`.
As telas de aba não aplicam `SafeAreaView`/`useSafeAreaInsets` no topo; a barra de busca (`searchRow marginTop: Spacing.lg=16`) e o `chatHeader` ficam ~16px do topo absoluto. No iOS (notch/Dynamic Island) e no Android 15 (edge-to-edge, status bar translúcida) o conteúdo encosta/entra sob a status bar. Home (hero full-bleed) e Settings (`contentInsetAdjustmentBehavior`) já lidam — a inconsistência confirma a lacuna.
Repro: abrir Histórico/Biblioteca no iPhone 15+ (notch) ou Android 15 → topo da busca colado na status bar. Aba IA-Chat: enviar 1 msg → header sob a status bar.
Fix: envolver cada tela em `SafeAreaView` de `react-native-safe-area-context` com `edges={['top']}` (ou aplicar `paddingTop: useSafeAreaInsets().top`). Funciona nas 3 plataformas (no web insets=0).

**Q2 — Telas modal/card usam `SafeAreaView` de `react-native` (no-op no Android)** (`rn-app`)
Arquivos: `app/diagnosis/camera.tsx:2-10,157`, `app/diagnosis/crop-select.tsx:2-10,56`, `app/diagnosis/result.tsx:2-13`, `app/diagnosis/pest/[id].tsx:27`, `app/consent-location.tsx:2-12,125` (+ header de `app/edit-profile.tsx:632-637`).
`SafeAreaView` do core do React Native só tem efeito no iOS; no Android é um `View` comum. Com edge-to-edge obrigatório no Android 15 (targetSdk 36), o header dessas telas (paddingVertical ~12px) encosta na status bar; footers podem encostar na barra de gestos. Impacto maior em camera/crop-select/consent-location/edit-profile (têm header no topo); menor em result/pest (hero full-bleed).
Repro: Android 15, abrir o fluxo de diagnóstico → botão fechar/voltar e título colados na status bar.
Fix: trocar o import para `SafeAreaView` de `react-native-safe-area-context` (com `edges` apropriados) nessas telas; padronizar edit-profile para inset real em vez de `paddingTop` fixo.

### BAIXO

**Q3 — Código morto de paywall (latente, risco 2.3.2 se re-monetizar)** (`rn-app`) · gate=true
`app/diagnosis/result.tsx:510-513,541-544,551-554`, `app/diagnosis/pest/[id].tsx:91-101`, `app/(tabs)/index.tsx:330-377`, `hooks/useNotifications.ts:77`.
Ramos `if(!isPro) push('/paywall')` e o trial-counter da Home apontam para o paywall neutralizado. Inertes hoje (`useSubscription().isPro=true`, `useMonthlyUsage().plan='enterprise'`). Porém, se `isPro`/`plan` voltar a `false`/`free` (regressão ou re-monetização), viram **dead-ends** (paywall renderiza nada e volta → botão "morto") + reintroduzem cadeia de compra = risco Apple 2.3.2/2.1(b). Reintrodução de cobrança é decisão do CEO.
Fix (ao reabrir cobrança): reverter o commit `fix/pragas-free-*` que restaura o paywall real com product IDs novos; enquanto grátis, opcionalmente remover os `push('/paywall')` órfãos.

**Q4 — Biblioteca: itens de praga não navegáveis** (`rn-app`) · gate=false
`app/(tabs)/library.tsx:149-182,326`. `PestItem` não tem `onPress`; a lista é só referência e não abre ficha (`/diagnosis/pest/[id]`). Possível expectativa frustrada do usuário.
Fix: tornar cada item tocável abrindo a ficha da praga (warm do cache + navegação) OU deixar visualmente claro que é conteúdo de leitura.

**Q5 — `+not-found` sem dark mode e fora do token de marca** (`design`) · gate=false
`app/+not-found.tsx:37-67`. Cores hardcoded claras (`#FAFAF7`, `#1B7A3D`) sem `useColorScheme` e verde diferente do token `#0B3D2E`. Cosmético.
Fix: usar `Colors` do tema + suporte a dark mode.

**Q6 — Onboarding com insets hardcoded (sem SafeAreaView)** (`rn-app`) · gate=false
`app/onboarding.tsx:329-359`. `top iOS56/Android24`, `bottom iOS44/Android30` fixos. Full-bleed tolera, mas o botão inferior no Android (30px) pode encostar na barra de gestos em aparelhos com nav-bar por gestos.
Fix: derivar `paddingBottom`/`paddingTop` de `useSafeAreaInsets()` (fallback aos valores atuais).

**Q7 — Constantes/labels mortos de plano pago** (`rn-app`) · gate=false
`app/(tabs)/index.tsx:33` (`FREE_MONTHLY_DIAGNOSES=3`), `app/(tabs)/settings.tsx:41-45` (`PLAN_LIMITS`) e o `SubscriptionCard`/`onUpgrade` inertes. Sem efeito sob free build; limpar reduz risco de reintrodução acidental de UI de cobrança.
Fix: remover/`// eslint` como código de reintrodução futura, documentado.

---

## POSITIVOS CONFIRMADOS (sem ação)
- 0 rotas quebradas; todos os botões principais têm ação e destino válido; navegação/back consistentes; `dismissAll`/`canGoBack` tratados.
- Estados loading/vazio/erro presentes em Home, Histórico, Biblioteca, IA-Chat, Ajustes, Resultado, Ficha.
- i18n 100% PT-BR (default `pt-BR`, fallback `pt-BR`); nenhuma string inglesa vazando na superfície de usuário.
- Web (react-native-web) tratado onde importa: PDF (`Platform.OS==='web'`), notificações, SecureStore (`services/supabase.ts`), diálogos (`services/dialog.ts`).
- Recuperação de senha completa e funcional (fluxo `update-password` — supera o gap do app irmão).
- Pivot-grátis íntegro na UI: nenhum cadeado PRO, nenhum botão de compra, paywall neutralizado, `UsageCounter`/trial-counter escondidos.
- Formulários com validação, guards anti-duplo-submit e `KeyboardAvoidingView` onde há input.
