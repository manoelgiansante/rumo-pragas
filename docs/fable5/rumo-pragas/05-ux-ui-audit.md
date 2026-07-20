# 05 — Auditoria UX/UI · Rumo Pragas (missão fable5/rumo-pragas-global-benchmark-2026-07-19)

> Read-only, branch `mega-trabalho/pragas-2026-07`, 2026-07-19. Base: leitura integral das 5 tabs,
> fluxo `app/diagnosis/*`, onboarding/consent, theme, componentes e locais i18n; greps mecânicos
> (hex, a11y, fontScale, strings PT) e diff programático das 3 línguas. NÃO refaz a verdade-terreno
> do fluxo §8 (A1: `research-raw/recovered-2026-07-18/a1-verdade-terreno-fluxo-s8.md`) — referencia e aprofunda.

## Sumário executivo

O app está acima da média da categoria em polimento: tokens de design maduros e documentados
(`constants/theme.ts`), i18n com **paridade perfeita 860/860 chaves em pt-BR/en/es** (diff
programático), cobertura de `accessibilityLabel`/`Role`/`State` rara de se ver em RN, permissões
todas just-in-time com copy honesta, e linguagem de "hipótese/triagem educativa" consistente.
Os problemas são de fricção e acabamento, não de quebra: **1 P0** (deep link morto do lembrete —
achado do A1, confirmado), **5 P1** (CTA principal abaixo do clima; 5 toques até a foto; resize
1024×1024 que distorce foto não-quadrada; 6 alvos de toque <44pt; histórico truncado em 50 sem
paginação), **9 P2** e **7 P3**. Dark mode não existe por decisão (`userInterfaceStyle:"light"`),
mas ~20 arquivos carregam branches `isDark` mortos. Divergência de paleta vs portfólio AgroRumo é
**decisão documentada do CEO** (theme.ts:1-4), não bug.

---

## 1. Onboarding e permissões — **EXISTE (forte)**

- **Carrossel 3 páginas** com skip sempre visível, dots animados, haptics e instrumentação de
  conversão (`app/onboarding.tsx:54-76`, `112-123`). A11y exemplar: `accessibilityValue` +
  `accessibilityActions` increment/decrement no FlatList (`onboarding.tsx:232-248`), páginas fora
  de vista escondidas do leitor (`onboarding.tsx:172-174`). CTA 54pt + hitSlop (`onboarding.tsx:292-296,445-458`).
- **Nenhuma permissão pedida no onboarding** — correto. Timing das 3:
  - **Câmera**: pedida no toque em "Tirar foto", com recuperação "Abrir Ajustes" quando negada
    (`app/diagnosis/camera.tsx:77-101`) — **EXISTE**. Galeria usa Photo Picker sem permissão (`camera.tsx:103-105`).
  - **Localização**: tela LGPD dedicada pós-primeiro-login, com benefícios, aviso LGPD, opt-out
    explícito e prompt nativo só após o aceite (`app/consent-location.tsx:158-177`); back físico
    Android não fura o gate (`consent-location.tsx:85-89`). Decisão persistida offline-first com
    retry (`consent-location.tsx:58-72`) — **EXISTE**. Ordem dos gates: onboarding → auth →
    consent-location → tabs (`app/_layout.tsx:412-417`).
  - **Notificações**: opt-in apenas no toggle dos Ajustes (`services/notifications.ts:100-115`) —
    prompt nunca dispara no boot — **EXISTE** (efeito colateral: ver P2-8).
- **Copy dos pedidos iOS** honesta e anti-2.1(a): "triagem visual educativa e probabilística…
  pode estar incorreto" (`app.json:28-30`); Android declara só CAMERA/COARSE_LOCATION/POST_NOTIFICATIONS.
- Gap menor: chaves `onboarding.page2*` ficaram órfãs nos 3 locales após a redução 4→3 páginas e
  as páginas 2/3 usam chaves `page3*`/`page4*` (`onboarding.tsx:62-75`; `i18n/locales/pt-BR.ts:968-977`) — P3.

## 2. Home — **PARCIAL** (hierarquia invertida)

- **O CTA de diagnóstico NÃO domina a tela**: a ordem de render é hero (190pt) → cards de erro →
  `WeatherCard` → `FieldConditionsCard` → só então o CTA "Diagnosticar agora"
  (`app/(tabs)/index.tsx:287-382`; clima em 353-354, CTA em 356). Em telas comuns o CTA da tarefa
  nº 1 do app cai para perto/abaixo da dobra. Padrão da categoria (Plantix/Agrio, dossiês
  recovered-2026-07-18) é diagnóstico em primeiro plano — **P1-1**.
- CTA em si é bom: gradiente de marca, ícone 56pt, subtítulo, a11y label+hint (`index.tsx:356-382`);
  CTA secundário "Sem foto? Descreva os sintomas" prefila o chat sem auto-enviar (`index.tsx:384-416`,
  `ai-chat.tsx:103-122`) — **EXISTE**.
- **Fila offline: EXISTE e madura** — card de pendentes com `accessibilityRole="alert"`
  (`index.tsx:418-425`) e card de falhas com retry/descarte por item, estados disabled e a11y
  (`index.tsx:427-476`). Gap: o item mostra `item.cropType` cru = apiName em inglês ("Soybean")
  (`index.tsx:445`) — P2-2.
- **Clima/alertas silenciosamente ausentes sem consentimento**: `loadData` só busca clima `if
  (location)` (`index.tsx:136-161`) e não existe empty state "ative a localização para ver clima
  e alertas" — usuário que recusou nunca descobre o que perdeu nem tem caminho de reversão fora
  dos Ajustes — **P2-7**.
- Stats row: card "Diagnósticos" com erro vira "!" clicável p/ retry (bom, `index.tsx:248-257`);
  cards "MIP" e "Monitoramento" são estáticos, sem ação nem explicação do termo MIP
  (`index.tsx:258-271`) — P3-4.
- Empty/skeleton: `HomeScreenSkeleton` no primeiro load (`index.tsx:276-278`) — **EXISTE**.
- Higiene: styles mortos `scanRow/scanIcon/scanTitle/scanSub` (`index.tsx:590-604`, zero usos) — P3-1.

## 3. Fluxo de diagnóstico tela a tela (aprofunda; vereditos 1-18 no A1)

- **Nº de toques até a foto: 5 + etapa de crop do OS** — Home CTA (1) → tela intermediária
  "Tirar foto" (2) → obturador (3) → confirmar/crop do OS (4, `allowsEditing:true` em
  `camera.tsx:107-112`) → "Iniciar diagnóstico" no crop-select (5). Benchmarks operam em ~3.
  A tela intermediária tem valor (dicas/guia, `camera.tsx:190-207,262-289`) mas o crop do OS é
  fricção pura para o produtor no sol — **P1-2**.
- **BUG de qualidade de entrada**: `manipulateAsync(uri, [{ resize: { width: 1024, height: 1024 } }])`
  (`camera.tsx:36-50`) força 1024×1024 **exato** — expo-image-manipulator só preserva proporção
  quando UMA dimensão é passada. No iOS o `allowsEditing` entrega quadrado (sem dano); no Android
  o crop é livre e na galeria a foto é retangular → imagem **esmagada** vai para a IA e para o
  hero do resultado. Fix de 1 linha: `[{ resize: { width: 1024 } }]` — **P1-3** (verificar em
  device Android antes de fechar, D1).
- Crop-select: consentimento IA pedido no 1º uso, no contexto certo (`crop-select.tsx:63-74`) —
  **EXISTE**. Default silencioso Soja (`crop-select.tsx:34`) já apontado no A1 (item 1).
- Loading: 4 steps animados, contador "x de 4", cancelar 44pt+hitSlop, timeout 60s, fila offline
  no catch (`loading.tsx:35-40,255-273,291-302`) — **EXISTE** (A1 item 7).
- Estados de erro: copy **acionável** — invalid_image explica luz/foco/aproximação
  (`pt-BR.ts:300-302`; server `diagnose-pragas/index.ts:982-984`), erro genérico oferece "Tirar
  outra foto" + "Fechar" (`result.tsx:678-712`) — **EXISTE**. Retry reinicia da câmera, não
  reenvia payload (A1 item 7/15).
- Resultado: hero com foto + nome PT via catálogo MIP + científico em itálico real + barra de
  confiança animada com a11y `progressbar` (`result.tsx:836-859`) — **EXISTE**. Duplicação real:
  painel "Outras possibilidades" (`result.tsx:878-927`) E card `TopAlternatives`
  (`result.tsx:1131`) com o MESMO título "Outras possibilidades"
  (`pt-BR.ts` `alternativeDiagnoses`/`topAlternatives`) e os mesmos dados — **P2-5** (A1 item 9).
- Feedback correto/incorreto/não sei com radiogroup a11y e idempotência (`result.tsx:947-1020`) —
  **EXISTE**; sem canal humano (A1 item 14, FALTA).
- Lembrete de re-inspeção 3/7d: fail-closed sem permissão, mas o alerta apenas manda o usuário
  aos Ajustes em vez de pedir inline ou deep-linkar (`result.tsx:613-616`) — **P2-8**; e o deep
  link agendado `screen:'diagnosis-reinspection'` (`result.tsx:629`) **não está no allowlist**
  `hooks/useNotifications.ts:44-50` → tap na notificação morre como `invalid_payload` — **P0-1**
  (achado A1 item 16, reconfirmado por leitura do allowlist).

## 4. History / Library / Chat / Ajustes — **EXISTE** com gaps pontuais

- **Estrutura real das tabs**: `index | history | library | ai-chat | settings` (não há tab
  "profile"; perfil é `edit-profile` empilhada) — `app/(tabs)/_layout.tsx:33-88`, todas com
  `tabBarAccessibilityLabel` e testID.
- **History**: skeleton, erro com retry, empty state ilustrado com CTA, busca com
  KeyboardAvoiding, a11y por item com praga+cultura+confiança (`history.tsx:158-324`) — **EXISTE**.
  Gaps: (a) **fetch fixo de 50 sem paginação nem aviso** — diagnóstico nº 51+ é inalcançável e a
  busca só filtra os 50 baixados (`history.tsx:58`, `services/diagnosis.ts:250`) — **P1-5**;
  (b) **excluir só existe via long-press**, sem affordance visível (swipe/ícone/hint) — descoberta
  por acidente (`history.tsx:311`) — **P2-6**.
- **Library**: 18 culturas / 74 pragas, chips de filtro com `accessibilityState.selected`, empty
  state com limpar-filtros + CTA, severidade nunca só-por-cor (ponto+texto, WCAG 1.4.1,
  `library.tsx:154-169`) — **EXISTE**. Gaps: busca não cobre nome científico
  (`library.tsx:241-249`) — P3-6; conteúdo 100% PT mesmo em en/es (ver §7) — **P2-4**; chips ~33pt
  de altura (`library.tsx:404-412`) — P3-3.
- **Chat IA**: consentimento no 1º envio com retomada da mensagem pendente
  (`ai-chat.tsx:179-183,246-258`), histórico isolado por usuário com reset anti-vazamento na troca
  de conta (`ai-chat.tsx:126-154`), retry preservando UUID p/ idempotência (`ai-chat.tsx:236-238`),
  denúncia de conteúdo IA por mensagem (`ai-chat.tsx:260-290`), limpar com confirmação 44pt
  (`ai-chat.tsx:566-572`), send 44pt com estados — **EXISTE**. Gap menor: o disclaimer "assistente
  especializado…" só existe no empty state; numa conversa longa não há aviso persistente de IA — P3.
- **Ajustes**: seções nativas (Section/Row com minHeight 52, `settings.tsx:890-899`), switches com
  role/state/busy, LGPD completo na UI (consentimentos IA revogáveis, exportar dados com
  idempotência, excluir conta em rota própria), idioma via ActionSheet, versão real do runtime —
  **EXISTE**. Toggle de consentimento IA "ligar" mostra alerta "re-aceite no uso" em vez de ligar
  (`settings.tsx:360-365`) — intencional, mas vale microcopy no rótulo — P3.

## 5. Design system — **EXISTE** (tokens fortes; sujeira localizada)

- Tokens completos e comentados com racional de contraste (`constants/theme.ts:5-38`), ramp
  sequencial p/ charts, Spacing/BorderRadius/FontSize/FontFamily usados de forma consistente em
  todas as telas lidas. Poppins bundlada com itálico real p/ nome científico (`theme.ts:118-126`).
- **Hex fora do theme**: grep em `app/`+`components/` achou ~30 ocorrências, majoritariamente
  benignas (`#FFF`/`#000`/rgba de overlay). Exceções reais: (a) **PDF do resultado usa paleta
  ANTIGA** `#F06652/#EBB026/#D32F2F/#8E8E93` em vez dos tokens (`result.tsx:481-492,505`) — P2-9;
  (b) dark-hexes órfãos `#1C1C1E/#2C2C2E/#2A2A2C` em settings/ai-chat/edit-profile/SearchInput —
  ver dark mode; (c) `edit-profile.tsx:515-537` pinta chips de cultura com `crops.ts` `color`
  (rainbow #FFC107/#9C27B0/#F44336… — paleta AI-slop que o próprio theme baniu) — P3-6.
- **Dark mode: FALTA por decisão** — `app.json:8` trava `"userInterfaceStyle": "light"`, logo
  `useColorScheme()` nunca retorna 'dark'. Ainda assim ~20 arquivos carregam branches `isDark`
  (ex.: `index.tsx:70-71`, `_layout.tsx:10-23`, `settings.tsx:175`) e `DarkColors` exportado
  (`theme.ts:40-46`) — dead code nunca testado que vira bug no dia em que a flag mudar — **P3-2**.
- **Componentização**: PremiumCard/CollapsibleSection/SearchInput/Section+Row bem reusados.
  Duplicações reais: painel de alternativas em dobro (P2-5) e **4 mapas paralelos de cultura**
  (`constants/crops.ts`, `DiagnosisCard.tsx:69-104`, `library.tsx PESTS_BY_CROP`, edge fn
  `cropMap` em `diagnose-pragas/index.ts:999-1018`) — o drift já é observável: DiagnosisCard e
  `crops.*` i18n não conhecem sorgo/amendoim/girassol/cebola — **P2-3**.

## 6. Acessibilidade — **PARCIAL** (labels exemplares; alvos e contraste falham)

- **Labels/roles: EXISTE** — cobertura quase total: botões-ícone todos com label (fechar/share do
  resultado `result.tsx:801-819`, lixeira do chat `ai-chat.tsx:375-383`, discard da fila
  `index.tsx:462-472`), ícones decorativos com `accessibilityElementsHidden`, alerts com
  `role="alert"`, radiogroup no feedback, carrossel adjustable no onboarding.
- **Touch targets <44pt — 6 superfícies** (3 do A1 + 3 novas):
  A1: voltar crop-select 36×36 (`crop-select.tsx:215-222`), fechar câmera 36×36
  (`camera.tsx:320-327`), fechar/share resultado 38×38 (`result.tsx:1404-1411`).
  Novas: fechar do pest detail 38×38 sem hitSlop (`app/diagnosis/pest/[id].tsx:606-608`),
  descartar da fila falha 38×38 (`index.tsx:832-838`), limpar busca ~18pt+hitSlop 8 = ~34pt
  (`components/SearchInput.tsx:36-42`) — **P1-4**.
- **Contraste dos tons de confiança/severidade (medido WCAG):**
  - contagem "Biológico" em `accentLight #4CAF50` sobre card branco = **2.78:1 FALHA**
    (`result.tsx:1104-1107,1372`);
  - tom "low" das alternativas `systemGray #8A8373` sobre `systemGray6` = **3.28:1 FALHA** p/
    caption 12pt (`TopAlternatives.tsx:44,109-111`);
  - badge de severidade média no hero: branco sobre `warmAmber+CC` = **~2.56:1 FALHA** 11pt
    (`result.tsx:831-834`, `theme.ts:16` já avisa que warmAmber falha como texto);
  - `earthText` sobre `systemGray6` = 4.39:1 (borderline; sobre branco passa) — **P2-1**.
  Positivo: severidade nunca é só-cor (chip ponto+texto na library; label textual no card).
- **DynamicType/fontScale: PARCIAL** — scaling livre na maioria (bom), mas `maxFontSizeMultiplier`
  existe em só 5 arquivos (login, result, pest, loading) e há alturas fixas que clipam em escala
  grande: tab bar 88/64 (`(tabs)/_layout.tsx:23`), startBtn height 56 (`crop-select.tsx:308`) — P3-7.

## 7. i18n — **EXISTE** (paridade perfeita; furos são de DADOS, não de chaves)

- **Diff programático das 3 línguas: 860 = 860 = 860 chaves, zero órfãs/faltantes nos dois
  sentidos** (script sobre `i18n/locales/{pt-BR,en,es}.ts`) — supera o spot-check de 10 chaves.
- **Zero texto PT hardcoded em JSX** (grep por acentos em texto/props: só os nomes de idioma
  'Português/Español' em `settings.tsx:62-66`, corretos por convenção). Exceção real: label de
  a11y com sufixo fixo `"...${count} itens."` em PT (`result.tsx:1361`) — lida em EN/ES pelo leitor
  de tela — **P2-9**.
- **Furos de dado (não de chave):**
  - `crops.*` só cobre 14 de 18 ids (faltam sorgo/amendoim/girassol/cebola nas 3 línguas,
    `pt-BR.ts:951-966`) e o `DiagnosisCard` cai no id cru minúsculo + 🌱 (`DiagnosisCard.tsx:86,152`) — **P2-3**;
  - hero e "Detalhes da análise" mostram `result.crop` cru ('soja', minúsculo, sem i18n)
    (`result.tsx:828,1310`); fila de falhas na Home mostra apiName inglês 'Soybean' (`index.tsx:445`) — **P2-2**;
  - biblioteca inteira (nomes de praga `library.tsx:42-152`) e `crops.ts displayName` são PT-only:
    em en/es a UI traduz mas o conteúdo permanece PT — **P2-4**.

## 8. Linguagem do resultado — **EXISTE** (melhor da classe; 2 lacunas)

- Comunicação de **hipótese, não certeza**, consistente ponta a ponta: "Hipótese principal" no PDF
  (`pt-BR.ts:287`), disclaimer compartilhamento "resultado probabilístico e educativo… confirme em
  campo" (`pt-BR.ts:282-283`), disclaimer legal CREA/AGROFIT em todo resultado
  (`result.tsx:1323-1337`, `pt-BR.ts:306-307`), alternativas com "talvez seja uma delas… consulte
  um agrônomo antes de tratar" (`pt-BR.ts:357-360`), campos químicos deletados do enrichment no
  client (`result.tsx:120-126`).
- Banner <70% acionável: "consulte um agrônomo antes de aplicar qualquer tratamento"
  (`result.tsx:864-875`) — mitiga o % cru do hero (A1 item 10: falta rótulo alta/média/baixa no
  hero — segue válido).
- Erros acionáveis: invalid_image dá 3 correções concretas; permissão negada dá "Abrir Ajustes";
  fila cheia informa o limite (`loading.tsx:215-217`).
- Lacunas: termos "MIP" (stats da Home) e "AGROFIT/Resolução Confea" aparecem sem explicação ou
  link no ponto de uso (chat/biblioteca explicam MIP, a Home não) — P3-4.

## 9. Consistência com o portfólio AgroRumo — **EXISTE (divergência documentada)**

- **Poppins**: sim, âncora do DS AgroRumo, 4 pesos + itálico bundlados (`theme.ts:111-126`).
- **Verde**: o portfólio ancora em #4CAF2F/#0D2B1E; o Pragas usa ação #2E7D32→#4CAF50, marca
  #0B3D2E e fundo claro #FAFAF7 — **decisão explícita do CEO 02/jul documentada no próprio token
  file** ("DS claro/profissional p/ agronegócio… folha profunda permanece só como MARCA",
  `theme.ts:1-4`). Acento da vertical = dourado-trigo #C89B3C no lugar do #F4B400. Veredito:
  divergência intencional e coerente internamente — **nenhum fix**; apenas registrar no doc de
  marca do portfólio para ninguém "corrigir" de volta (ZERO-N espírito).
- Ionicons como família única de ícones (comentário anti-slop em `onboarding.tsx:18-20`) e
  gradientes só na rampa da folha — consistente com a doutrina anti-AI-slop do theme.

---

## 10. Ranking P0–P3 (fix em 1 linha cada)

| # | Prio | Problema (evidência) | Fix |
|---|------|----------------------|-----|
| 1 | **P0** | Deep link do lembrete de re-inspeção morto: agenda `diagnosis-reinspection` (`result.tsx:629`) que não está no allowlist (`hooks/useNotifications.ts:44-50`) → tap = `invalid_payload` (A1 item 16) | Adicionar `'diagnosis-reinspection'` ao `ALLOWED_SCREENS` + rotear p/ history |
| 2 | **P1** | CTA "Diagnosticar agora" renderiza abaixo de Weather+FieldConditions (`index.tsx:353-356`) | Mover o bloco do CTA (linhas 356-416) para antes do WeatherCard |
| 3 | **P1** | 5 toques + crop do OS até a foto (`camera.tsx:107-112` `allowsEditing:true`) | Remover `allowsEditing` (o resize já normaliza) e/ou Home→câmera direta |
| 4 | **P1** | Resize forçado 1024×1024 distorce foto não-quadrada (Android/galeria) antes da IA e do hero (`camera.tsx:36-50`) | `[{ resize: { width: MAX_DIMENSION } }]` (só width preserva proporção) |
| 5 | **P1** | 6 alvos de toque <44pt sem hitSlop: `crop-select.tsx:215`, `camera.tsx:320`, `result.tsx:1404`, `pest/[id].tsx:606`, `index.tsx:832`, `SearchInput.tsx:36` | `hitSlop={{top:8,bottom:8,left:8,right:8}}` (ou 12) em cada |
| 6 | **P1** | Histórico trava nos 50 mais recentes sem paginação nem aviso; busca só filtra os baixados (`history.tsx:58`) | `onEndReached` com offset/range no `fetchDiagnoses` |
| 7 | **P2** | Contraste AA falha: accentLight 2.78:1 (`result.tsx:1372`), tone low 3.28:1 (`TopAlternatives.tsx:44`), branco/warmAmber 2.56:1 (`result.tsx:831`) | Trocar p/ `Colors.accent`/`earthText` e badge medium com texto `earthText` em bg claro |
| 8 | **P2** | Cultura crua na UI: hero/detalhes mostram 'soja' sem i18n (`result.tsx:828,1310`); fila falha mostra 'Soybean' EN (`index.tsx:445`) | Reusar `CROP_NAME_KEYS`+`t()` (extrair helper único de cultura) |
| 9 | **P2** | 4 culturas (sorgo/amendoim/girassol/cebola) fora de `crops.*` i18n e dos mapas do DiagnosisCard (`DiagnosisCard.tsx:89-104`, `pt-BR.ts:951-966`) | Completar as 4 chaves ×3 línguas + 4 entradas emoji/label |
| 10 | **P2** | Biblioteca e nomes de cultura PT-only em en/es (`library.tsx:42-152`, `crops.ts:10-27`) | Mover nomes p/ chaves i18n (ou declarar biblioteca PT-BR-only no listing) |
| 11 | **P2** | "Outras possibilidades" duplicada — painel legado (`result.tsx:878-927`) + TopAlternatives (`result.tsx:1131`), mesmo título e dados | Deletar o painel legado 878-927 |
| 12 | **P2** | Excluir diagnóstico só por long-press invisível (`history.tsx:311`) | Ícone lixeira no card (ou hint no empty/1º uso) |
| 13 | **P2** | Sem consentimento de localização, clima/alertas somem em silêncio — sem empty state/CTA (`index.tsx:136-161`) | Card "Ative a localização p/ clima e alertas" → toggle dos Ajustes |
| 14 | **P2** | Lembrete re-inspeção exige ida manual aos Ajustes p/ ativar notificação (`result.tsx:613-616`) | Botão do alerta chama `setPushNotificationsEnabled(true)` inline |
| 15 | **P2** | A11y label com "itens." PT fixo (`result.tsx:1361`) + PDF com paleta antiga hardcoded (`result.tsx:489-492`) | Chave i18n p/ o label; tokens do theme no template PDF |
| 16 | **P3** | Styles mortos `scanRow/scanIcon/scanTitle/scanSub` (`index.tsx:590-604`) | Deletar |
| 17 | **P3** | Dead code dark-mode: `isDark` em ~20 arquivos + `DarkColors` com `userInterfaceStyle:"light"` (`app.json:8`) | Decidir: remover branches OU planejar dark real (não deixar meio-termo) |
| 18 | **P3** | Chips de filtro da biblioteca ~33pt (`library.tsx:404-412`) | `minHeight: 44` (ou paddingVertical 12) |
| 19 | **P3** | Card "MIP" estático e sem explicação na Home (`index.tsx:258-264`) | onPress → biblioteca/seção MIP; label "Estratégia MIP" |
| 20 | **P3** | Chaves `onboarding.page2*` órfãs + naming page3/page4 defasado (`onboarding.tsx:62-75`) | Remover page2* dos 3 locales; renomear chaves |
| 21 | **P3** | Busca da biblioteca ignora nome científico (`library.tsx:246`); chips do edit-profile com rainbow de `crops.ts` (`edit-profile.tsx:515-537`) | Incluir `p.scientific` no filtro; chips em `accent`/`systemGray6` |
| 22 | **P3** | fontScale sem teto em containers fixos: tab bar 88/64 (`(tabs)/_layout.tsx:23`), startBtn 56 (`crop-select.tsx:308`) | `maxFontSizeMultiplier={1.3}` nos rótulos desses containers |

**Totais: 1 P0 · 5 P1 · 9 P2 · 7 P3.** Buracos estruturais (gate de qualidade de foto, órgão da
planta, explicabilidade, escada p/ humano, talhão) permanecem os do A1 §"5 maiores buracos" — não
duplicados aqui.
