# 04 — Análise por Plataforma (Web · iOS · Android) · Rumo Pragas

> Missão `fable5/rumo-pragas-global-benchmark-2026-07-19` §5. O que a categoria entrega em **mobile
> vs. web** (dos 40 dossiês), o que o Rumo Pragas tem **por plataforma HOJE** (OBSERVADO em código /
> audits / CLAUDE.md do repo), **paridade intencional recomendada** (o que NÃO replicar) e **gaps por
> plataforma ranqueados**. Estado do app = `05-ux-ui-audit.md`, `06-ai-safety-and-quality-audit.md`,
> `recovered-2026-07-18/*`, `rumo-pragas/CLAUDE.md`.

---

## Sumário executivo

Na categoria, **foto-diagnóstico de consumo é mobile-first** (a câmera está no campo) e **web é o
território dos profissionais/times**: dashboards, relatórios, coordenação de equipe, analytics de
dado pesado e APIs. Os líderes de foto-diagnóstico consumer (Plantix, Agrio, Picture Insect,
PictureThis, Pl@ntNet) vivem no celular; as plataformas de scouting/previsão/ERP (IPM Decisions,
RIMpro, Taranis, Pessl, Cropwise, Auravant, SIMA, OneSoil, Kindwise) têm web robusto porque o valor
é gestão/relatório/API, não a câmera. O Rumo Pragas **acerta a aposta**: app Expo iOS+Android
completo + web apenas como **landing de marketing** (`pragas.agrorumo.com`, repo Next.js separado),
**sem fluxo de diagnóstico na web**. A recomendação central é **NÃO construir um app de diagnóstico
na web** — a categoria não faz e não é onde o produtor está. Os gaps reais são **cross-platform**
(os P0/P1 de IA/UX dos docs 05/06) e **Android-específicos** (bug de resize 1024², verificação de
push em device, screenshots de loja defasados). A vantagem estrutural: **temos iOS real no BR onde o
líder Plantix não tem**.

---

## 1. O que a categoria entrega — mobile vs. web

### Mobile (onde mora o foto-diagnóstico de consumo)
- **Foto-diagnóstico + captura de campo é 100% mobile:** Plantix (Android-only) [`dossies-plantix-cropwise-xarvio-agrobase.md`], Agrio (iOS+Android) [`dossies-agrio-futurcrop-picturethis-embrapa.md`],
  Picture Insect / PictureThis / Plantum [`picture-insect.md`, `plantum.md`], Seek / Pl@ntNet
  [`seek-inaturalist.md`, `plantnet.md`]. A câmera ao vivo (Seek), o coaching de foto, o offline
  on-device — tudo é recurso de celular no campo.
- **Android domina o mercado emergente:** FieldView lançou o "Cab" **para Android porque 80% dos
  brasileiros usam Android** [`climate-fieldview-scouting.md`]; FarmRise/DeHaat/BharatAgri são
  **Android-first** na Índia [`farmrise.md`, `bharatagri-dehaat.md`]; **Plantix é Android-only e não
  tem iOS legítimo no BR** [`dossies-plantix-cropwise-xarvio-agrobase.md`].
- **iOS concentra receita/reviews de consumo:** PictureThis iOS BR 48,6k avaliações, Plantum 118k,
  Agrio iOS BR 4,87★ [`recovered`, `plantum.md`] — mas o líder de pragas (Plantix) **abandonou o iOS
  no BR**, deixando o segmento iOS aberto.

### Web (onde mora o profissional/time/relatório/API)
- **Plataformas web-only ou web-core:** IPM Decisions (web puro) [`ipm-decisions.md`], RIMpro (nuvem)
  [`rimpro.md`], Taranis (portal de agronomia) [`taranis.md`], Cropwise (Web Panel) [`dossies-plantix-...md`],
  Auravant (núcleo web) [`auravant.md`], SIMA (dashboard + Excel/PDF) [`sima.md`], OneSoil (web com
  extras de dado de máquina) [`onesoil.md`], Kindwise/Pl@ntNet (API + ferramenta web) [`plant-id-kindwise.md`,
  `plantnet.md`].
- **Papel da web na categoria:** relatórios/export, coordenação multiusuário (monitor+coordenador),
  analytics de satélite/NDVI, integração de dados de máquina, API B2B. **Não é onde o produtor tira a
  foto.**
- **Baseline web = Google Lens via Chrome/Photos** [`google-lens.md`]: o "identificador grátis" também
  existe no navegador, reforçando que a web serve para busca/consulta, não diagnóstico estruturado.

**Padrão-chave:** o produto vencedor de consumo é **mobile-first com web opcional de apoio (marketing
+ leitura)**; web robusto só aparece em plays **B2B/times/enterprise** — que NÃO é o posicionamento
grátis-para-produtor do Rumo Pragas.

---

## 2. O que o Rumo Pragas tem por plataforma HOJE (OBSERVADO)

### iOS — **app completo, publicado**
- App Expo SDK 55 / RN 0.83, todas as 5 tabs, fluxo de diagnóstico integral, MIP, chat, LGPD, i18n
  860/860 (`05` §7). Baseline de loja iOS 63 (mutável, `CLAUDE.md`).
- Permissões just-in-time honestas, copy anti-2.1(a) (`05` §1). `maxFontSizeMultiplier` presente em
  poucos arquivos (`05` §6).
- **Comportamento iOS específico:** `allowsEditing:true` entrega crop **quadrado** → o bug de resize
  1024² **não distorce no iOS** (só no Android/galeria) (`05` §3, P1-3).

### Android — **app completo, publicado (1 bug de entrada Android-específico)**
- Mesma base Expo; baseline de loja Android 54. Canais de notificação Android e fluxo de push token
  existem e rodam (`persistPushTokenToServer`, `notifications.ts`) — **refuta** o "push Android nem
  está ligado" dos candidatos-a-gap; só falta **targeting geográfico servidor**, não o push em si
  (`verdade-terreno-refutacao-gaps.md` #1, transversal a). *Verificar disparo em device Android é D1.*
- **Bug de qualidade de entrada Android-específico:** o resize forçado `{width:1024,height:1024}`
  **esmaga foto não-quadrada** — no Android o crop é livre e a galeria é retangular → imagem
  distorcida vai para a IA e para o hero (`05` §3 P1-3; `a1` extra d). Fix de 1 linha
  (`[{ resize:{ width:MAX } }]`).

### Web — **SEM app funcional (por decisão; correto)**
- A presença web é a **landing de marketing** `pragas.agrorumo.com` (repo Next.js separado
  `rumo-pragas-landing-nextjs`, candidato no PR #3; deploy Vercel de produção à parte) — `CLAUDE.md`
  "Escopo canônico". **Não há fluxo de diagnóstico, câmera, histórico ou biblioteca na web.**
- Existe `npx expo export --platform web` como **gate de build** (`CLAUDE.md` Gates) — ou seja, o
  bundle web compila, mas **não é um produto publicado nem uma experiência de usuário**; é higiene de
  CI, não app.
- **Contrato do produto:** "A inferência exige internet… não existe inferência offline" e "lançamento
  gratuito, sem paywall" (`CLAUDE.md`) — a landing precisa refletir isso e **não prometer "offline
  analysis"** (STORE_LISTING linha 73, `verdade-terreno-refutacao-gaps.md` #5).

---

## 3. Paridade intencional recomendada — o que NÃO replicar na web

1. **NÃO construir um app de diagnóstico na web.** A categoria de consumo não faz — foto-diagnóstico é
   mobile (câmera de campo). Web de diagnóstico só existe como busca genérica (Lens) ou API B2B
   (Kindwise). Replicar o fluxo de câmera/upload/resultado na web gastaria esforço num canal onde o
   produtor não está e onde o Lens já é o baseline grátis [`google-lens.md`, `plant-id-kindwise.md`].
2. **NÃO portar câmera/offline-queue/push/GPS para a web** — são capacidades de contexto mobile; no
   navegador degradam e não agregam ao produtor de campo.
3. **NÃO virar plataforma web de time/relatório/dashboard** (padrão Cropwise/Auravant/SIMA) — isso é
   play **B2B/enterprise** que contradiz o posicionamento grátis-para-produtor e o foco de lançamento
   [`dossies-plantix-...md`, `auravant.md`, `sima.md`].
4. **Paridade correta:** manter a web como **landing de marketing + (no máximo) leitura** — comunicar
   o diferencial "100% grátis, sem paywall, sem ads, PT-BR, MIP curado + AGROFIT" contra as queixas de
   paywall/ads dos rivais [`recovered`, `picture-insect.md`, `dossies-agrio-...md`]. Se algum dia
   houver web funcional, o teto defensável é **biblioteca MIP/AGROFIT consultável (read-only)** — nunca
   o diagnóstico. Landing é **ZERO-N** (não alterar copy/design sem autorização do CEO).

---

## 4. Gaps por plataforma — ranqueados

### Cross-platform (iOS + Android) — prioridade máxima
1. **[P0/P1 de IA — doc 06]** apresentação de confiança crua, OOD só-limiar no path Agrio, feedback-loop
   aberto, sem versionamento de modelo/prompt, telemetria de saldo Agrio OFF, Agrio não declarado como
   subprocessador. Atingem os dois binários igualmente (`06` R1–R6).
2. **[P0 UX — doc 05]** deep link do lembrete de re-inspeção morto (`diagnosis-reinspection` fora do
   `ALLOWED_SCREENS`) → tap = `invalid_payload` nas duas plataformas (`05` P0-1; `a1` item 16).
3. **[P1 UX]** CTA de diagnóstico abaixo do clima na Home; 5 toques até a foto; histórico travado em 50
   sem paginação; 6 alvos de toque <44pt (`05` §10 P1).
4. **[cross]** sem gate de qualidade de foto no device, mono-imagem sem órgão, sem escada
   taxonômica/degradação — as maiores lacunas de IA vs. a categoria (`03-ai-product-benchmark.md`).

### Android-específico
1. **[P1] Bug de resize 1024² distorce foto** (crop livre + galeria retangular) — só afeta Android;
   degrada o input da IA e o hero (`05` §3 P1-3). Verificar em device Android antes de fechar (D1).
2. **[loja] Screenshots 1.0.9 mostram paywall/limite/dark-mode que não existem** (contradiz "grátis
   ilimitado", Guideline 2.3.3 análogo na Play) → regravar (`CLAUDE.md` Estado 17/07, gate loja).
3. **[verificar] Disparo real de push em device Android** (infra existe; falta prova de campo — D1).

### iOS-específico
1. **[loja] Screenshots defasados** (mesmo problema, Guideline 2.3.3) + review notes com afirmação
   falsa de "grupos de assinatura vazios" (há 2 subs `MISSING_METADATA` da re-monetização — completar
   ou deletar e corrigir a nota) (`CLAUDE.md` gate loja).
2. **[oportunidade] iOS real no BR onde o Plantix não tem** — vantagem de segmento a explorar no ASO/
   copy (não é gap, é fosso) [`dossies-plantix-cropwise-xarvio-agrobase.md`].
3. Sem bug de resize (o `allowsEditing` iOS entrega quadrado) — a correção do resize deve preservar o
   comportamento iOS ao consertar o Android.

### Web
1. **Nenhum gap de produto** — a ausência de app funcional na web é **intencional e correta** para a
   categoria e o lançamento. O único "gap" é de **conformidade de copy**: a landing (ZERO-N) deve
   refletir honestamente "grátis/sem paywall" e "diagnóstico exige internet; biblioteca funciona
   offline" — sem prometer "offline analysis" (`verdade-terreno-refutacao-gaps.md` #5; STORE_LISTING
   linha 73). Qualquer alteração de copy/design da landing exige autorização explícita do CEO.
