# 03 — Benchmark de IA · Rumo Pragas vs. a categoria

> Missão `fable5/rumo-pragas-global-benchmark-2026-07-19`. Foco: **como cada classe de produto trata
> a IA** — confiança/top-k, OOD/"não sei", explicabilidade, feedback-loop, human-in-the-loop,
> privacidade de imagem, inferência offline. Fontes públicas dos 40 dossiês; estado da IA do Rumo
> Pragas = OBSERVADO em código via `06-ai-safety-and-quality-audit.md` (Agrio + normalização
> `adaptAgrio` + `AGRIO_LABEL_MAP` + enrichment local do catálogo MIP). **Todo número de acurácia é
> ALEGADO** salvo o paper independente do Nuru.

---

## Sumário executivo

O pipeline de IA do Rumo Pragas é **forte no transporte e na segurança agronômica** (magic-byte,
idempotência, rate-limit durável, filtro anti-prescrição multilíngue, consentimento por versão) e
**competitivo na apresentação de hipótese honesta** — melhor que o Google Lens (que se declara
"preliminar" e não estrutura) e no nível dos apps consumer top-k. Onde fica **atrás da fronteira da
categoria**: (1) **calibração/apresentação de confiança** — mostra o % cru do Agrio sem rótulo
qualitativo, enquanto Seek (escada taxonômica) e Kindwise (`disease_level=general`) degradam com
honestidade; (2) **OOD nativo** — o caminho Agrio não tem contrato "não é planta", só o limiar
`<0,5`, contra o `is_plant` do Kindwise e a escada do Seek; (3) **explicabilidade zero do caso
concreto**; (4) **feedback-loop aberto** (write-only, ninguém lê); (5) **sem versionamento de
modelo/prompt por diagnóstico** → drift indetectável; (6) **mono-imagem, sem órgão** vs. o padrão
Pl@ntNet/Nuru de múltiplas fotos que comprovadamente sobe acurácia. As 5 recomendações fecham
exatamente os P0/P1 do doc 06.

---

## 1. Confiança / top-k / calibração

| Padrão da categoria | Quem faz | Rumo Pragas |
|---|---|---|
| Top-k com score explícito | Kindwise (top-3 93%/top-1 85% ALEGADO), Pl@ntNet (0–1 + fotos de referência), Picture Insect (top-3), Agrio | **top-k SIM** (`result.tsx` hero + alternativas) |
| Rótulo qualitativo em vez de % cru | Seek (escada taxonômica), Kindwise (`disease_level=general`), TopAlternatives interno | **PARCIAL** — hero mostra `{displayConfidence}%` **cru, sem "alta/média/baixa"**; tons qualitativos só nas alternativas (`06` §2, R5) |
| Calibração contra ground-truth próprio | nenhum player expõe camada de calibração pública | **NÃO** — score do Agrio repassado verbatim; limiares `<0,5`/`<0,7` são cortes heurísticos sobre número do fornecedor (`06` §2) |
| Múltiplas fotos sobem confiança | Pl@ntNet (1–5 órgãos), Nuru (6 folhas → CBSD 21%→73%) | **NÃO** — mono-imagem (`06` §1; `a1` item 5) |

- **Leitura:** o Rumo Pragas está **na régua** em ter top-k, mas **atrás na honestidade da
  apresentação** — "87%" sugere precisão que o modelo não tem [`google-lens.md`, `plant-id-kindwise.md`,
  `seek-inaturalist.md`]. O banner `<70%` mitiga em parte (`06` §2). Nenhum concorrente calibra
  publicamente, então calibração é campo aberto, não dívida.

## 2. OOD / "não sei" (fail-closed)

- **Fronteira da categoria:** Seek sobe a **escada taxonômica** ("é um percevejo/uma ferrugem foliar"
  em vez de cravar espécie) — padrão-ouro de honestidade [`seek-inaturalist.md`]; Kindwise expõe
  `is_plant` e `disease_level=general` para **degradar a categoria ampla** e modela **sósias benignos
  e desordens abióticas como classes** [`plant-id-kindwise.md`]; Rice Doctor cobre **abióticos/
  nutricionais** que a IA de foto confunde [`irri-rice-doctor.md`].
- **Rumo Pragas (OBSERVADO):** fail-closed existe (`invalid_image` se `pest_id==='invalid_image'` OU
  `confidence<0,5`, `06` §3), **mas**: (a) o **caminho Agrio não tem contrato "não é planta" nativo**
  — só o limiar e o `Healthy`; o contrato OOD do `SYSTEM_PROMPT` só existe no path `claude` legado
  (`06` §1,§3); (b) devolve um **`invalid_image` seco**, não uma categoria ampla ("provavelmente fungo
  foliar") nem escada taxonômica; (c) **não modela abióticos/sósias benignos como classe**.
- **Leitura:** atrás de Seek/Kindwise em graciosidade de incerteza; a arquitetura de "degradar em vez
  de chutar" é a maior oportunidade de IA honesta.

## 3. Explicabilidade

- **Categoria:** fraca em quase todos — Picture Insect/Lens não explicam; Kindwise entrega sintomas/
  severidade/propagação embutidos [`plant-id-kindwise.md`]; Pl@ntNet mostra **fotos de referência das
  candidatas** para o usuário comparar visualmente [`plantnet.md`].
- **Rumo Pragas (OBSERVADO):** conteúdo é **enciclopédico** (descrição/sintomas da praga via enrichment
  MIP), **não explicativo do caso concreto** — não há "o que NESTA foto levou a este resultado" nem
  sinais que diferenciem as alternativas (`a1` itens 11,12). **Não mostra foto de referência** da
  candidata (gap vs. Pl@ntNet).
- **Leitura:** paridade de conteúdo enciclopédico com a categoria; **atrás** em explicabilidade do caso
  e em referência visual comparativa.

## 4. Feedback-loop / human-in-the-loop

- **Categoria:** FarmRise/DeHaat/BharatAgri/Agrio/MyPestGuide/CABI têm **humano no loop** (agrônomo
  responde, especialista verifica) como 2º nível de confiança [`farmrise.md`, `bharatagri-dehaat.md`,
  `dossies-agrio-...md`, `mypestguide-reporter.md`, `cabi-plantwiseplus.md`]; Pl@ntNet usa a **massa da
  comunidade** para corrigir [`plantnet.md`]. Reclamação real do Agrio: **ausência de botão de
  discordar** [`dossies-agrio-...md`].
- **Rumo Pragas (OBSERVADO):** tem o **botão de discordar** (correto/incorreto/não sei, radiogroup,
  idempotente) — **à frente do Agrio nesse ponto** (`06` §4; `verdade-terreno-refutacao-gaps.md` #6).
  **MAS o loop não fecha:** `pragas_diagnosis_feedback` é **write-only** — o único acesso no código é a
  escrita; não há leitura, métrica, curadoria nem retorno humano ao usuário (`06` §4, R4). Sem canal
  "falar com agrônomo" — o estado incerto/incorreto termina em beco (`a1` item 14).
- **Leitura:** **à frente** em captar feedback, **atrás** em usá-lo (não vira sinal de retreino/
  curadoria do `AGRIO_LABEL_MAP`) e sem escada para humano.

## 5. Drift / versionamento

- **Categoria:** ninguém expõe publicamente; Pl@ntNet faz ~6 updates de modelo/ano e restringe por
  flora regional [`plantnet.md`].
- **Rumo Pragas (OBSERVADO — P0 do doc 06):** **nenhum diagnóstico registra provider/modelo/versão de
  prompt/versão do `AGRIO_LABEL_MAP`** (`init_schema` colunas fixas; insert não grava no `notes`) →
  drift **indetectável e resultado irreproduzível**; `AGRIO_LABEL_MAP` cobre só 4 pares
  (rust/fallarmyworm) e labels fora do mapa viram laudo pobre sinalizado só por `captureMessage` info
  que ninguém observa; catálogo MIP **sem versão/revisão** (`06` §1,§5, R1,R7,R8).
- **Leitura:** invisível ao usuário, mas é o **maior risco silencioso de qualidade** — não dá para
  medir se a IA piorou.

## 6. Privacidade de imagem

- **Categoria:** APIs de nuvem (Kindwise, Pl@ntNet) exigem enviar a foto ao servidor; Seek roda
  **on-device** (nada sai) [`seek-inaturalist.md`, `plant-id-kindwise.md`]; nenhum publica prática de
  retenção clara.
- **Rumo Pragas (OBSERVADO — forte):** foto **não persistida** (insert sem `image_url`), EXIF/GPS
  removido pelo reencode JPEG, coords **duplamente coarsed a ~1 km**, scrub de PII no Sentry (`06`
  §6). **Ressalva P0:** o **Agrio recebe a foto crua desde 06/07 e NÃO está declarado como
  subprocessador** em Data Safety/privacidade (só Anthropic declarado) — gap de conformidade
  LGPD/loja (`06` §6, R3).
- **Leitura:** privacidade de dado **acima da categoria**; falha é de **declaração legal**, não de
  engenharia.

## 7. Inferência offline

- **Categoria:** **Seek e Nuru rodam o modelo 100% on-device/offline** — trunfo real de campo sem sinal
  [`seek-inaturalist.md`, `plantvillage-nuru.md`]; Kindwise/Pl@ntNet/Lens/Plantix são **online-only**.
- **Rumo Pragas (OBSERVADO):** inferência **online** (fila offline só adia o envio); **biblioteca e
  fichas MIP são offline** (bundle hardcoded) (`verdade-terreno-refutacao-gaps.md` #5).
- **Leitura:** **atrás de Seek/Nuru** na inferência offline (aceitável dado o contrato "requer
  internet"); **à frente da maioria** por ter conteúdo consultável sem sinal — claim honesto a
  comunicar.

## 8. Latência / custo / observabilidade

- **Rumo Pragas (OBSERVADO):** timeouts coerentes (Agrio 45s, Claude 30s, cliente 60s), payload bem
  contido (`06` §7). **Riscos:** app **grátis e público sem teto global de orçamento** (só cap
  10/h/usuário) + **telemetria de saldo Agrio DESLIGADA por default** → risco de repetir a **queda
  total de 06/07 (créditos a zero)** sem alerta (`06` §7, R2). Chat cego por design
  (`pragas_chat_messages`=0). Sem tag de provider por linha de diagnóstico (§8).
- **Categoria:** Kindwise mostra que **custo por crédito de nuvem por foto é a maior pressão de um app
  grátis de volume** — desenhar cache/compressão/triagem antes de gastar crédito [`plant-id-kindwise.md`].

---

## Onde a IA do Rumo Pragas está À FRENTE / ATRÁS

**À frente:**
- Segurança agronômica anti-prescrição determinística multilíngue + disclaimer CREA/AGROFIT (`06` §9)
  — mais rigorosa que os marketplaces indianos e que o Plantix (que recomenda produto).
- Privacidade de dado (foto não retida, coords coarsed, scrub PII) acima da categoria consumer.
- **Tem botão de discordar** (Agrio não tem) e linguagem de **hipótese honesta** melhor que o Lens.
- Conteúdo MIP curado Brasil-first embarcado (biológico/AGROFIT) = moat de conteúdo que a CABI aponta.

**Atrás:**
- Apresentação de confiança (% cru vs. escada taxonômica Seek / degradar Kindwise).
- OOD nativo no path Agrio (sem "não é planta"; sem abióticos/sósias como classe).
- Explicabilidade do caso + foto de referência da candidata (Pl@ntNet).
- Feedback-loop fechado + escada para humano (FarmRise/Agrio/MyPestGuide).
- Versionamento de modelo/prompt (drift indetectável) — invisível mas crítico.
- Mono-imagem sem órgão (Pl@ntNet/Nuru sobem acurácia com múltiplas fotos).
- Inferência offline on-device (Seek/Nuru).

---

## 5 recomendações priorizadas para a nossa IA (citando doc 06)

1. **[P0] Carimbar versão em cada diagnóstico** — adicionar `ai_provider/ai_model/prompt_version/
   labelmap_version` (coluna ou bloco no `notes`) gravado em todo insert (`06` R1). Sem isso, drift é
   indetectável e nenhuma das melhorias abaixo é mensurável. Base para tudo.
2. **[P0] Ligar telemetria de saldo Agrio + alerta Sentry** (`AGRIO_CREDIT_TELEMETRY_ENABLED=true` +
   alerta de saldo baixo/zero, `06` R2) e **declarar Agrio (Saillog) como subprocessador** em Data
   Safety/privacidade (`06` R3). Evita repetir a queda total de 06/07 e fecha o gap LGPD/loja.
3. **[P1] Apresentar confiança com honestidade** — bucketizar o hero em faixas "alta/média/baixa" (ou
   arredondar a passos de 10%) e documentar que é score do fornecedor, adotando o padrão Seek/Kindwise
   de degradar em vez de exibir precisão falsa (`06` R5) [`seek-inaturalist.md`, `plant-id-kindwise.md`].
4. **[P1] OOD do path Agrio + testes** — dar ao caminho Agrio um contrato "não é planta" (ou fallback de
   categoria ampla quando `<0,5`, estilo `disease_level=general`) e adicionar testes Deno de
   `adaptAgrio` (healthy/unmapped/OOD/limiar) com fixture de não-planta (`06` R6) [`plant-id-kindwise.md`,
   `irri-rice-doctor.md`].
5. **[P1] Fechar o loop de feedback** — criar leitura/métrica de taxa `incorrect` por versão e ligar o
   feedback à revisão do `AGRIO_LABEL_MAP` + dashboard/alerta de `agrio_label_unmapped` para o mapa
   melhorar com o tráfego (`06` R4,R7). Aproveita que já captamos o feedback (vantagem sobre o Agrio),
   que hoje é jogado fora.
