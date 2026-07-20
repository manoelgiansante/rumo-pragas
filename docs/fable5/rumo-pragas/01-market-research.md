# 01 — Pesquisa de Mercado Global · Rumo Pragas

> Missão `fable5/rumo-pragas-global-benchmark-2026-07-19`. Síntese executiva sobre 40 produtos
> concorrentes/adjacentes (5 lotes: R1 acadêmico/público, R2 scouting/previsão comercial, R3
> LATAM/BR, R4 adjacentes/baseline, recovered-2026-07-18 BR-first). Fontes públicas 2026-07-19,
> 100% documental. Cada afirmação cita o dossiê-fonte `[arquivo.md]`. **Convenção:** OBSERVADO =
> lido em fonte pública/loja; ALEGADO = número de marketing não auditável (sempre marcado).
> Estado do Rumo Pragas vem dos audits `05-ux-ui-audit.md`, `06-ai-safety-and-quality-audit.md`
> e da verdade-terreno `recovered-2026-07-18/a1-verdade-terreno-fluxo-s8.md` (código, não aspiração).

---

## Sumário executivo (TLDR)

O job central do Rumo Pragas — **diagnóstico automático de praga/doença por foto de celular,
grátis, PT-BR, com app iOS real no Brasil** — praticamente não tem concorrente direto vivo. Dos 40
produtos mapeados, **apenas 4 fazem foto-diagnóstico agro de consumo**: Plantix (Android-only, o iOS
"Plantix" na loja BR é clone de terceiro [`dossies-plantix-cropwise-xarvio-agrobase.md`]), Agrio
(que é simultaneamente **nosso provider de IA e o concorrente #1 na loja BR** [`dossies-agrio-futurcrop-picturethis-embrapa.md`]), xarvio Scouting (**morto**, fora das lojas desde 2022
[`dossies-plantix-cropwise-xarvio-agrobase.md`]) e Plant.id/Kindwise (API B2B, sem app consumer
[`plant-id-kindwise.md`]). Todo o resto ataca vizinhanças: scouting **manual** (a foto é registro,
não identificação — FieldView, OneSoil, SIMA, Cropwise), hardware de detecção (Trapview, Semios,
Tarvos, Solinftec), previsão por clima (Pessl, RIMpro, Pest Prophet, Sencrop, FuturCrop, IPM
Decisions), ID de espécie sem diagnóstico clínico (Pl@ntNet, Seek, Google Lens) e enciclopédias sem
foto-IA (Agrobase, Embrapa).

O fosso do Rumo Pragas é a combinação **grátis-sem-paywall + PT-BR nativo + diagnóstico estruturado
(top-k) + manejo MIP curado Brasil-first + ponte AGROFIT**. As ameaças reais são poucas mas sérias:
Climate FieldView (Bayer) se adicionar foto-ID, Plantix ganhando iOS legítimo no BR, e Agrio (que
já monetiza o mesmo público). As maiores lacunas do nosso app vs. a categoria são de
**explicabilidade, gate de qualidade de foto no device, múltiplas imagens/órgão da planta e
escalonamento para humano** — não de posicionamento.

---

## 1. Paisagem por arquétipo

### A. Foto-diagnóstico consumer/agro (a nossa categoria — pouco povoada)
- **Plantix** [`dossies-plantix-cropwise-xarvio-agrobase.md`]: 30 culturas, 400+ danos, tratamento
  químico+biológico em segundos; **alertas regionais de doença por distrito**; comunidade Q&A "500+
  especialistas". Play BR **4,6★ · ~110k avaliações · 10M+ downloads** (OBSERVADO). **iOS real
  inexistente no BR** (o app da busca é clone de terceiro, verificado por iTunes lookup). Monetiza
  via marketplace de insumos.
- **Agrio (Saillog)** [`dossies-agrio-futurcrop-picturethis-embrapa.md`]: foto-diagnóstico + **resposta
  humana de especialistas** + alerta regional por IA + clima hiperlocal + scouting por voz. iOS BR
  **4,87★/93**; ~500–770k downloads Android (ALEGADO). Grátis com **ads agressivos** (reclamação
  dominante) e assinatura AgrioShield. **⚠️ É o provider de IA do próprio Rumo Pragas desde 06/07 E
  o concorrente #1 na loja BR** — dualidade estratégica única.
- **xarvio Scouting (BASF)** [`dossies-plantix-cropwise-xarvio-agrobase.md`]: foto→ID daninhas/doenças
  + contagem de armadilha amarela + **"SCOUTING Radar" (push de risco regional alimentado pela
  comunidade)**. **Descontinuado** (fora das lojas desde dez/2022, absorvido pelo FIELD MANAGER pago).
- **Plant.id / Kindwise** [`plant-id-kindwise.md`]: motor de IA B2B (não app consumer). É a **régua
  técnica** da categoria — top-3 93%/top-1 85%, 288 classes crop.health / 548 plant.health incl.
  desordens abióticas e "sósias benignos" como classe. €0,05/crédito.
- **PictureThis / Picture Insect / Plantum** [`recovered`, `picture-insect.md`, `plantum.md`]:
  consumer de plantas/insetos com UX polida, mas **paywall duro** (PictureThis trial→R$199,90/ano é
  a fonte #1 de reviews 1★; Picture Insect "3 grátis e paga") e **público doméstico/ornamental**, não
  lavoura.

### B. Acadêmico / público (autoridade de conteúdo, tração baixa)
- **PlantVillage Nuru** [`plantvillage-nuru.md`]: object-detection **100% offline no aparelho**;
  acurácia honesta publicada (folha única CBSD 21%, sobe a 93% com ~6 folhas). Modelo híbrido IA +
  especialista humano local. Foco África, sem PT-BR.
- **CABI PlantwisePlus** [`cabi-plantwiseplus.md`]: **biblioteca IPM curada por especialistas,
  específica por país, offline (15k+ peças)** — o moat é conteúdo, não IA (foto terceirizada à
  Plantix). 100+ idiomas.
- **Rice Doctor (IRRI)** [`irri-rice-doctor.md`]: **chave diagnóstica interativa** cobrindo 90+
  distúrbios **incl. abióticos/nutricionais** — o fallback que a IA de foto não cobre.
- **Leaf Doctor** [`leaf-doctor.md`]: só **quantifica % de severidade**, não diagnostica; iOS **1,96★**
  — prova viva de que "métrica sem próximo passo = frustração".
- **Tumaini** [`tumaini.md`]: vertical banana, ~90% ALEGADO, evoluiu para **vigilância
  georreferenciada** (valida mapa de surto regional).
- **IPM Decisions** [`ipm-decisions.md`]: web, agrega **25+ DSS preditivos por clima+geo** (risco
  antes do sintoma).
- **MyPestGuide Reporter** [`mypestguide-reporter.md`]: reporte foto+GPS **offline com verificação por
  especialista humano** (vigilância participativa; até 4 fotos).
- **Embrapa/MAPA** [`dossies-agrio-futurcrop-picturethis-embrapa.md`]: Pragas da Soja, Doutor Milho,
  Guia InNat (inimigos naturais), AGROFIT — **guias de referência PT-BR autoritativos, sem IA/foto**;
  fonte de autoridade citável na nossa biblioteca.

### C. Scouting / previsão comercial (a foto é registro, não diagnóstico)
- **Climate FieldView (Bayer)** [`climate-fieldview-scouting.md`]: **maior sobreposição de mercado BR**
  — PT-BR, iOS+Android, 25M+ ha no BR (ALEGADO). Mas scouting é **manual**: tira foto e anota, NÃO
  diz "isto é ferrugem".
- **OneSoil** [`onesoil.md`]: app **grátis** (mesmo posicionamento), satélite/NDVI aponta anomalia mas
  não identifica praga; offline+notas+clima retêm.
- **Cropwise Protector (Syngenta)** [`dossies-plantix-cropwise-xarvio-agrobase.md`]: scouting de
  precisão + **mapas de calor de pressão de praga**, mas **fechado a clientes** e sem foto-IA.
- **Taranis** [`taranis.md`]: imagem aérea 0,3mm/pixel por drone, B2B por hectare — inacessível ao
  produtor de celular.
- **Trapview / Semios / Tarvos** [`trapview.md`, `semios.md`, `tarvos.md`]: armadilha/sensor com câmera
  + previsão populacional; hardware caro, foco lepidópteros. **Tarvos dá sinais fortes de encolhimento
  em 2026** (domínios mortos, ~6 funcionários, pivô p/ fruta de exportação).
- **Pessl/METOS, RIMpro, Pest Prophet, Sencrop, FuturCrop, Solinftec** [`pessl-metos-fieldclimate.md`,
  `rimpro.md`, `pest-prophet.md`, `sencrop.md`, `dossies-agrio-...md`, `solinftec.md`]: **previsão de
  risco por clima/grau-dia** (Pessl 80+ modelos de doença; Sencrop alerta antes por molhamento foliar;
  Pest Prophet e FuturCrop provam que dá **sem hardware, só clima remoto**) e o robô Solix (R$370k)
  que fecha o ciclo detecta→pulveriza/elimina.

### D. LATAM / BR (scouting profissional, ERP, hardware, público fragmentado)
- **SIMA** [`sima.md`]: scouting MIP profissional (protocolos, severidade, ordens, offline) sem
  foto-IA; Android 4,12★/954, iOS BR só 5 avaliações. **Auravant** [`auravant.md`]: ERP agrícola com
  protocolo AAPPCE + armadilhas via Metos; **nota altíssima (Play 4,87★/1.299)**, pragas = módulo
  secundário, PT-BR presente.
- **Cromai** [`cromai.md`]: IA visual **proprietária BR** só para daninhas/falhas em cana via imagem
  aérea (~R$17/ha, aporte TOTVS) — benchmark de que IA visual funciona comercialmente no BR, não
  concorrente de produtor.
- **Agrosmart** [`agrosmart.md`]: pivotou p/ clima+ESG corporativo; app grátis BoosterAGRO é
  clima/comunidade; projeto FAPESP de insetos+IA **não virou produto**.
- **manejo.app (PR) + MonitoraOeste (Embrapa/Abapa)** [`extras-br-manejoapp-monitoraoeste.md`]: setor
  público empurra MIP digital grátis mas fragmentado; manejo.app **fora do ar**; MonitoraOeste =
  **alerta regional de risco** soja/algodão (modelo copiável, credibilidade Embrapa).

### E. Adjacentes / baseline grátis (o que o usuário BR já espera)
- **Google Lens** [`google-lens.md`]: **baseline grátis universal já no bolso do usuário BR** — dá o
  nome, mas resultado "preliminar", fraco em cultura/praga tropical regional, sem diagnóstico
  estruturado/manejo. É a régua de fricção-zero que precisamos superar entregando AÇÃO.
- **Pl@ntNet** [`plantnet.md`]: **seleção de órgão** (folha/flor/fruto/casca) + 1–5 fotos do mesmo
  caso + fotos de referência das candidatas; identifica planta, **não diagnostica doença** = nosso
  espaço. PT-BR, grátis.
- **Seek by iNaturalist** [`seek-inaturalist.md`]: **escada taxonômica** (o padrão-ouro de honestidade
  de IA) + **coaching de foto ao vivo na câmera** + **100% offline on-device**.
- **FarmRise (Bayer), DeHaat, BharatAgri** [`farmrise.md`, `bharatagri-dehaat.md`]: híbrido
  IA-instantânea + agrônomo-humano; app vencedor no smallholder é **HUB** (diagnóstico+clima+preço+
  conteúdo), com voz e linguagem simples; "grátis" sustentado por **funil de insumo** (cuidado:
  conflito de interesse quem-diagnostica-vende).

---

## 2. Padrões internacionais dominantes (o que TODO líder faz)

1. **Câmera → resultado em segundos, sem cadastro pesado** (régua Lens/Seek/Picture Insect)
   [`google-lens.md`, `seek-inaturalist.md`].
2. **Top-k com confiança explícita + honestidade na incerteza** — "escada taxonômica" (Seek) /
   degradar para categoria ampla `disease_level=general` em vez de cravar (Kindwise)
   [`seek-inaturalist.md`, `plant-id-kindwise.md`].
3. **Coaching de qualidade de foto antes/durante a captura** — Seek faz ao vivo; Picture Insect e
   Pl@ntNet falham nisso (= oportunidade) [`seek-inaturalist.md`, `picture-insect.md`, `plantnet.md`].
4. **Contexto leve antes do diagnóstico** (órgão/cultura — Pl@ntNet) e **múltiplas fotos do mesmo
   caso (1–5)** [`plantnet.md`, `plantvillage-nuru.md`].
5. **Resposta = diagnóstico + AÇÃO + severidade + imagem de referência**, não só o nome (Kindwise,
   FarmRise, DeHaat, Picture Insect) [`plant-id-kindwise.md`, `farmrise.md`, `bharatagri-dehaat.md`].
6. **Modelar desordens abióticas e sósias benignos como classes** (Kindwise 548 classes; Rice Doctor
   cobre nutricional) — reduz falso-positivo de "está doente" [`plant-id-kindwise.md`, `irri-rice-doctor.md`].
7. **Alerta regional de risco por push** — o gap mais repetido: Plantix "doença no seu distrito",
   xarvio SCOUTING Radar, Agrio, MonitoraOeste, Tumaini [`dossies-plantix-...md`, `dossies-agrio-...md`,
   `extras-br-manejoapp-monitoraoeste.md`, `tumaini.md`].
8. **Camada preditiva por clima/grau-dia** (antes do sintoma) — categoria valorizada e monetizada,
   demonstrada **sem hardware** por Pest Prophet e FuturCrop [`pest-prophet.md`, `dossies-agrio-...md`,
   `ipm-decisions.md`, `sencrop.md`].
9. **Escalonamento para humano** como 2º nível de confiança (FarmRise, DeHaat, Agrio, MyPestGuide,
   CABI) [`farmrise.md`, `bharatagri-dehaat.md`, `mypestguide-reporter.md`, `cabi-plantwiseplus.md`].
10. **Retenção por hábito**: lembretes/diário (Plantum, PictureThis), alerta preditivo recorrente
    (Sencrop), hub multi-serviço (FarmRise), offline on-device (Seek) [`plantum.md`, `sencrop.md`,
    `farmrise.md`, `seek-inaturalist.md`].
11. **App vencedor em mercado emergente é HUB, não recurso único** (diagnóstico+clima+preço+conteúdo)
    [`farmrise.md`, `bharatagri-dehaat.md`].

---

## 3. Onde o Rumo Pragas já ganha (fosso confirmado no código)

- **100% grátis sem paywall e sem ads** — vantagem direta vs. a máquina de 1★ dos concorrentes: o
  trial→anual do PictureThis (R$199,90) e o "3 grátis e paga" do Picture Insect geram reviews de
  "golpe/propaganda enganosa", e o grátis do Agrio é "sufocado por ads sem botão de fechar"
  [`recovered`, `picture-insect.md`, `dossies-agrio-...md`]. Posicionamento ASO explorável.
- **PT-BR nativo + app iOS real no BR** — Plantix não tem iOS legítimo, xarvio morreu, Cropwise é
  fechado, Agrobase não tem foto-ID [`dossies-plantix-cropwise-xarvio-agrobase.md`]. i18n com
  **paridade perfeita 860/860 chaves pt-BR/en/es** (`05-ux-ui-audit.md` §7).
- **Diagnóstico estruturado (top-k) + linguagem de hipótese honesta** — hero com nome PT+científico+
  confiança, alternativas, banner <70%, disclaimer CREA/AGROFIT; "melhor da classe" na comunicação
  de incerteza (`05-ux-ui-audit.md` §8; `a1-verdade-terreno-fluxo-s8.md` item 8,13). Supera o Lens,
  que só dá o nome e se declara "preliminar" [`google-lens.md`].
- **Manejo MIP curado Brasil-first embarcado** — 18 culturas/74 pragas, campo `biologico` (Trichogramma,
  Beauveria, joaninhas — paridade com Guia InNat da Embrapa), referências EMBRAPA/MAPA/IRAC/FRAC/CESB
  com ano (`06-ai-safety-and-quality-audit.md` §9; `verdade-terreno-refutacao-gaps.md` #3,#4). É o
  "e agora o quê?" que falta no Leaf Doctor [`leaf-doctor.md`] e que a CABI aponta como moat
  [`cabi-plantwiseplus.md`].
- **Ponte AGROFIT/MAPA + anti-prescrição forte** — link para base oficial de defensivos como defesa
  de compliance (não vende insumo — diferencial de confiança vs. o conflito de interesse dos
  marketplaces indianos/Plantix) [`verdade-terreno-refutacao-gaps.md` #3; `bharatagri-dehaat.md`].
- **Biblioteca e fichas MIP funcionam offline** (bundle hardcoded); a inferência exige internet —
  claim honesto pronto (`verdade-terreno-refutacao-gaps.md` #5).
- **Segurança de transporte e privacidade** madura (magic-byte, idempotência, rate-limit, coords
  coarsed ~1km, foto não persistida, scrub de PII no Sentry) (`06-ai-safety-and-quality-audit.md`
  §1,§6) — acima do padrão da categoria consumer.

---

## 4. Ameaças reais no BR — ranqueadas

1. **Climate FieldView (Bayer)** — *ameaça #1*. Mesmo mercado, mesmo idioma (PT-BR), mesma plataforma,
   distribuição gigante (25M+ ha ALEGADO), marca Bayer. Hoje o scouting é **manual** (não diagnostica),
   mas **se a Bayer adicionar ID automático de praga por foto, a nossa vantagem encolhe**. Vigiar
   [`climate-fieldview-scouting.md`].
2. **Plantix** — líder de foto-diagnóstico no BR Android (4,6★/110k, 10M+), com comunidade + alertas
   regionais + tratamento. Vulnerabilidade explorável: **Android-only (sem iOS legítimo)** e
   reclamações de cobertura de culturas [`dossies-plantix-cropwise-xarvio-agrobase.md`].
3. **Agrio** — concorrente direto com foto+humano+alerta regional+forecast e presença na loja BR
   (4,87★). **Dualidade crítica: é o nosso provider de IA** — dependência estratégica a gerenciar
   (manter path `claude` vivo como rollback; declarar Agrio como subprocessador) [`dossies-agrio-...md`;
   `06-ai-safety-and-quality-audit.md` R3].
4. **Reativação de projetos dormentes BR** — Agrosmart (FAPESP MIP+IA) e Cromai (expansão soja anunciada)
   têm IA visual e capital; se pivotarem para foto-diagnóstico de produtor, entram na categoria
   [`agrosmart.md`, `cromai.md`].
5. **Setor público empurrando MIP grátis** — Embrapa/IDR-PR/SENAR (manejo.app, MonitoraOeste, Doutor
   Milho): não competem hoje (fragmentados, sem foto-IA), mas comprimem a disposição a pagar e são
   fonte de autoridade que um rival poderia capturar antes de nós [`extras-br-manejoapp-monitoraoeste.md`,
   `dossies-agrio-...md`].

---

## 5. Oportunidades não-ocupadas (ranqueadas por relação valor/esforço)

1. **Alerta regional de risco por clima (leve, sem hardware)** — o gap mais repetido no mercado
   (Plantix/xarvio/Agrio/MonitoraOeste) e a categoria que Pest Prophet/FuturCrop provam viável só com
   clima remoto. **Metade já entregue localmente** (regras de risco em `services/alerts.ts` +
   notificação local), falta targeting geográfico servidor (migration+cron+edge fn) — pós-lançamento
   [`verdade-terreno-refutacao-gaps.md` #1; `pest-prophet.md`, `sencrop.md`, `ipm-decisions.md`].
2. **Coaching de qualidade de foto no device (gate anti-foto-ruim)** — buraco de TODOS os concorrentes
   consumer (Picture Insect/Pl@ntNet aceitam foto ruim e erram; Seek é o único bom). Hoje o Rumo Pragas
   só valida `invalid_image` **após** upload+60s. Diferencial barato e percebido [`picture-insect.md`,
   `seek-inaturalist.md`; `a1-verdade-terreno-fluxo-s8.md` item 4].
3. **Órgão da planta + múltiplas fotos do mesmo caso** — padrão Pl@ntNet/Nuru que sobe acurácia real
   e o usuário já aceita; hoje somos mono-imagem sem órgão [`plantnet.md`, `plantvillage-nuru.md`;
   `a1-verdade-terreno-fluxo-s8.md` itens 2,5].
4. **Escada taxonômica / degradar para categoria ampla + desordens abióticas como classe** — honestidade
   de IA (Seek/Kindwise/Rice Doctor) que reduz o dano de recomendar manejo errado; hoje devolvemos
   `invalid_image` seco abaixo de 0,5 [`seek-inaturalist.md`, `plant-id-kindwise.md`, `irri-rice-doctor.md`].
5. **Lembrete de re-inspeção (retenção pura, client-only)** — infra pronta, zero servidor, zero risco
   legal; **TOP-1 para hoje** na verdade-terreno [`verdade-terreno-refutacao-gaps.md` #2; `plantum.md`].
6. **Janela de condições climáticas para manejo (24h favorável/desfavorável)** — paridade
   "screenshotável" com Plantix/OneSoil, client-only (Open-Meteo hourly), com guarda de copy
   não-prescritiva [`verdade-terreno-refutacao-gaps.md` #7; `onesoil.md`, `sencrop.md`].
7. **Escalonamento opcional para agrônomo humano** — 2º nível de confiança padrão da categoria; hoje o
   estado incerto/incorreto termina em beco (feedback unidirecional) [`farmrise.md`, `mypestguide-reporter.md`;
   `a1-verdade-terreno-fluxo-s8.md` item 14]. Custo humano — decisão de modelo, não lançamento.
8. **Fotos de referência das candidatas + severidade quantificada** — Pl@ntNet mostra referência
   visual; Leaf Doctor mostra que severidade sem ação frustra (fazer as duas juntas) [`plantnet.md`,
   `leaf-doctor.md`].

---

## 6. Observado × alegado — ressalvas de integridade

- Números de **acurácia são quase sempre ALEGADOS** e inflados no marketing: Nuru "2× humano" mascara
  CBSD 21% em folha única [`plantvillage-nuru.md`]; Tumaini ~90%, FuturCrop >90%, Cromai/Taranis
  "150M/500M pontos" — nenhum auditável de fora. **Honestidade de acurácia é gap de mercado** e
  diferencial de confiança do Rumo Pragas (comunicar hipótese, não certeza).
- **Escala declarada ≠ tração na loja**: Agrosmart "+100k produtores" mas iOS BR 4,4★/80; SIMA "4M ha"
  mas iOS BR 5 avaliações; Auravant "5,2M ha" sem cases BR nomeados [`agrosmart.md`, `sima.md`,
  `auravant.md`]. Distinguir marketing B2B2C de adoção orgânica.
- **Produtos "vivos" no marketing podem estar mortos**: xarvio Scouting fora das lojas desde 2022;
  Tarvos com domínios à venda e ~6 funcionários; manejo.app HTTP 000 [`dossies-plantix-...md`,
  `tarvos.md`, `extras-br-manejoapp-monitoraoeste.md`].
- O estado do Rumo Pragas neste doc é **OBSERVADO em código** (audits A1/A2/UX), não aspiração — várias
  features que a pesquisa de mercado listou como "gap" já existem (ponte AGROFIT, controle biológico,
  botão de discordar, biblioteca offline) [`verdade-terreno-refutacao-gaps.md` #3,#4,#5,#6].
