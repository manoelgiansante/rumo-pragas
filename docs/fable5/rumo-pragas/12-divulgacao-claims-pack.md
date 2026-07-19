# 12 — Pacote de Divulgação e Claims Honestos · Rumo Pragas

> Missão `fable5/rumo-pragas-global-benchmark-2026-07-19`. Material de **redação de marketing**:
> claims 100% verificáveis no app real + copy pronta por canal (propostas). **Nada aqui é publicado
> sem o CEO.** Toda peça respeita CONAR/CDC: sem % de acurácia, sem "melhor", sem prometer
> inferência offline, sem prescrição/dose, sem endosso sem contrato. App **100% grátis, sem anúncios,
> sem paywall**. Fontes: `01-market-research.md` (§3 fosso, §4 ameaças),
> `research-raw/recovered-2026-07-18/verdade-terreno-refutacao-gaps.md` (os 4 claims honestos
> prontos + evidência arquivo:linha), `11-final-report.md` (§2-§3-§5), `expo-app/STORE_LISTING.md`
> (linha 73 = lista de claims proibidos que herdamos).

---

## 1. Claims honestos aprovados (12)

> Cada linha: **claim** · onde nasce no app (evidência) · risco legal. "OK" = verificável e defensável.
> "ATENÇÃO" = usável, mas com a guarda indicada. Tom: de produtor pra produtor, sem tecnojargão.

| # | Claim (1 linha, pronto pra usar) | Evidência no app | Risco |
|---|----------------------------------|------------------|-------|
| C1 | **100% grátis, sem anúncios e sem paywall — nada de "3 grátis e paga".** | Contrato do produto (`CLAUDE.md`); `STORE_LISTING.md:7` "Free app, no purchase/subscription/paywall". Diferencial direto vs. PictureThis (trial→R$199,90) e Picture Insect ("3 grátis e paga") [doc 01 §3]. | **OK** |
| C2 | **Diagnóstico de praga e doença por foto, na hora, direto do celular.** | Fluxo câmera→resultado (`diagnose`/`diagnose-pragas`); job central do app [doc 01 §1A]. Evitar "em X segundos" (proibido — tempo fixo). | **OK** |
| C3 | **Tudo em português — pensado pro produtor brasileiro.** | i18n com paridade 860/860 chaves pt-BR (`05-ux-ui-audit.md` §7). Plantix não tem iOS legítimo no BR; Agrobase não tem foto-ID [doc 01 §3]. | **OK** |
| C4 | **App de verdade no iPhone e no Android.** | iOS 1.0.11 READY_FOR_SALE público; Android 1.0.9 na Play (`11-final-report.md` §10). Explora o buraco do Plantix (Android-only, o "Plantix" da App Store BR é clone) [doc 01 §4]. Ver anti-claim A9: **não usar "único no iPhone"** (Agrio tem iOS legítimo). | **OK** |
| C5 | **O resultado vem como hipótese, com o nível de confiança e outras possibilidades — a gente não finge certeza.** | Hero com confiança Alta/Média/Baixa + alternativas + banner <70% (`3e55d45`; `05-ux-ui-audit.md` §8). Honestidade de IA é gap de mercado [doc 01 §6]. Reforça "não é laudo nem receituário". | **OK** |
| C6 | **A biblioteca de pragas e as fichas de manejo funcionam sem sinal, no meio do talhão.** | `library.tsx:42` `PESTS_BY_CROP` hardcoded no bundle, zero fetch (`verdade-terreno` #5). | **ATENÇÃO**: SEMPRE emparelhar com "o diagnóstico por foto precisa de internet" (`STORE_LISTING.md:73` proíbe "offline analysis"). |
| C7 | **Toda ficha traz controle biológico e inimigos naturais — não é só veneno.** | `data/mip/*.ts` campo `biologico` (Trichogramma, Beauveria, joaninhas); `MipCard.tsx:176-179` (`verdade-terreno` #4). Paridade com o Guia InNat da Embrapa. | **OK** |
| C8 | **Manejo integrado (MIP) curado pra lavoura brasileira: 18 culturas, 74 pragas.** | `06-ai-safety-and-quality-audit.md` §9; referências EMBRAPA/MAPA/IRAC/FRAC com ano [doc 01 §3]. Citar as fontes ≠ endosso — ver anti-claim A6. | **OK** |
| C9 | **Link direto pra base oficial de defensivos do MAPA (AGROFIT).** | `MipCard.tsx:86-88`; `pest/[id].tsx:157-158` (`verdade-terreno` #3). É a defesa anti-prescrição — o app não vende insumo. | **OK** |
| C10 | **Avisos de condições do tempo pra te ajudar a decidir o manejo.** | `WeatherCard.tsx` (vento/temp/UR/chuva) + card 24h (`34c2570`; `verdade-terreno` #7). | **ATENÇÃO**: copy só condição climática genérica ("hoje o vento está alto"), **nunca** "pulverize agora", nunca produto/dose. |
| C11 | **Novo: o app avisa se a foto está escura ou tremida antes de você enviar.** | Gate soft de qualidade de foto no device, fail-open "usar assim mesmo" (`b3b7ca1`; `lib/photoQuality.ts`). | **ATENÇÃO**: é ajuda de captura, **não** prometer "mais acurácia/precisão" (proibido). |
| C12 | **A foto do diagnóstico não fica guardada e sua localização é aproximada.** | Foto não persistida, sem URL no histórico (`STORE_LISTING.md:14`); geo arredondada ~1,1 km (`services/locationPrivacy.ts:18-23`). Acima do padrão da categoria consumer [doc 01 §3]. | **OK** |

**Bônus de confiança (usar com moderação):** *"Discordou do diagnóstico? Tem um botão pra você dizer
e a gente aprende com isso."* — `result.tsx:867-940` (`verdade-terreno` #6). Honestidade/UGC leve, sem
risco. E *"Diagnosticou? O app te lembra de reinspecionar em 3 ou 7 dias."* — lembrete de re-inspeção
(`f554bbb`). Retenção pura, zero risco.

---

## 2. Copy pronta por canal (propostas — nada publicado sem o CEO)

### (a) Meta Ads — 3 primary text + 3 headlines

> Formato curto, dor→solução, sem CAPS abusivo. Selo/toggle "AI Info" do Meta quando houver criativo IA.

**Primary text 1 (dor → solução, foco grátis):**
> Achou uma mancha estranha na folha e não sabe o que é?
> Tira uma foto no Rumo Pragas e recebe na hora a praga ou doença mais provável — com as opções de
> manejo, inclusive controle biológico. Grátis, sem anúncio e sem "assine pra ver".

**Primary text 2 (foco confiança/honestidade):**
> A gente não finge certeza. O Rumo Pragas mostra a hipótese mais provável, o nível de confiança e
> outras possibilidades — e ainda te leva pra base oficial do MAPA. De produtor pra produtor, em
> português, grátis.

**Primary text 3 (foco campo/offline da biblioteca):**
> No talhão sem sinal? A biblioteca de pragas e as fichas de manejo do Rumo Pragas funcionam offline.
> Quando pegar internet, é só mandar a foto pro diagnóstico. Grátis, iPhone e Android.

**Headlines (≤40 caracteres, sem superlativo):**
1. `Foto da praga, resposta na hora`
2. `Diagnóstico de praga grátis`
3. `Manejo em português, sem paywall`

### (b) 2 roteiros UGC de 20s (formato ZERO-AB: fala-dor selfie → solução com celular)

> Persona: produtor(a) real, camisa de trabalho, luz natural de fazenda. Clipe A = selfie fala-dor.
> Clipe B = mesma pessoa DE COSTAS/lateral, celular na mão, tela do app. VO da solução + card ~1,2s
> pós-corte. End card: "No rumo certo." Máquinas red/gray se aparecerem — nunca verde-amarelo.
> Legendas queimadas conferidas (QA visual). Sem texto de IA queimado no vídeo.

**Roteiro 1 — "A mancha na folha" (0-20s)**
- **0-8s (selfie, dor):** "Toda safra é a mesma novela: aparece uma mancha na folha e eu fico na
  dúvida se é praga, se é doença, o que eu faço. Já perdi lavoura por diagnóstico errado."
- **8-9s (corte):** card branco 1,2s — *"Rumo Pragas · grátis"*.
- **9-18s (de costas, celular na mão, tela do app):** VO — "Agora eu tiro uma foto no Rumo Pragas.
  Ele me diz a praga mais provável, o nível de confiança e o que dá pra fazer — inclusive controle
  biológico. Tudo em português e de graça."
- **18-20s:** end card — *"Rumo Pragas. No rumo certo."*

**Roteiro 2 — "Sem sinal no talhão" (0-20s)**
- **0-8s (selfie, dor):** "Lá no fundo do talhão não pega sinal nenhum. E é justo na hora que eu
  preciso saber o que é aquele bicho na planta."
- **8-9s (corte):** card 1,2s — *"Biblioteca funciona offline"*.
- **9-18s (de costas, tela do app na biblioteca):** VO — "A biblioteca de pragas e as fichas de
  manejo do Rumo Pragas abrem sem internet. Consulto ali mesmo, e quando volto a pegar sinal, mando
  a foto pro diagnóstico. Grátis, sem anúncio."
- **18-20s:** end card — *"Rumo Pragas. No rumo certo."*

### (c) 1 post orgânico IG/TikTok

> Caption + roteiro curto de tela (screen-record do app). Hashtags moderadas.

**Legenda:**
> Manchou a folha? 📸 Antes de sair passando veneno no escuro, tira uma foto.
> O Rumo Pragas mostra a praga ou doença mais provável, com o nível de confiança e as opções de
> manejo — inclusive controle biológico e inimigos naturais. Ainda te leva direto pra base oficial
> do MAPA (AGROFIT).
> Em português, no iPhone e no Android. 100% grátis, sem anúncio e sem paywall. 🌱
> A biblioteca até funciona sem sinal no talhão (o diagnóstico por foto precisa de internet).
> Link na bio. #agro #manejointegrado #pragas #agricultura #produtorrural #MIP

### (d) Google Play — short + full description (proposta honesta)

> Copy canônica vive em `store-assets/metadata`; isto é **proposta** de conteúdo, a validar contra
> `STORE_LISTING.md:73`. Sem paywall fantasma, sem % de acurácia, sem "offline analysis".

**Short description (≤80 caracteres):**
> Diagnóstico de pragas por foto, manejo integrado e AGROFIT. Grátis, em português.
> *(78 caracteres — validar contagem UTF-8 no script de release)*

**Full description (proposta):**
> **Identifique pragas e doenças da sua lavoura por foto — grátis.**
>
> O Rumo Pragas ajuda o produtor brasileiro a entender o que está atacando a plantação. Tire uma
> foto da folha, do fruto ou da praga e receba uma hipótese com o nível de confiança e outras
> possibilidades. Sem anúncios, sem assinatura, sem paywall.
>
> **O que você encontra:**
> • Diagnóstico por foto assistido por IA, com confiança e alternativas — é uma hipótese pra te
>   orientar, não um laudo.
> • Manejo integrado de pragas (MIP) para 18 culturas e 74 pragas, com controle biológico e inimigos
>   naturais em todas as fichas.
> • Link direto para a base oficial de defensivos do MAPA (AGROFIT).
> • Biblioteca de pragas e fichas de manejo que funcionam sem internet no campo (o diagnóstico por
>   foto precisa de conexão).
> • Avisos de condições do tempo para apoiar suas decisões de manejo.
> • Aviso de qualidade da foto antes de enviar, pra você não perder tempo com imagem escura ou
>   tremida.
>
> **Feito com respeito ao produtor:** a foto do diagnóstico não fica guardada e sua localização é
> tratada de forma aproximada.
>
> O Rumo Pragas não indica produto, dose ou receituário. Decisões sobre defensivos exigem um
> profissional legalmente habilitado e a base oficial AGROFIT (Lei nº 14.785/2023). Diagnóstico por
> IA é apoio à decisão, não substitui o agrônomo.

### (e) 3 bullets de release notes

> ≤500 caracteres no Android. Sem prometer acurácia.

- Novo aviso de qualidade da foto: o app te avisa se a imagem está escura ou tremida antes de enviar.
- O resultado agora mostra a confiança em Alta, Média ou Baixa, junto com as outras possibilidades.
- Lembrete de re-inspeção: agende um aviso para revisitar a planta em 3 ou 7 dias após o diagnóstico.

---

## 3. O que NÃO pode ser dito (10 anti-claims)

> Herdados de `STORE_LISTING.md:73` + CONAR/CDC + contrato do produto. Cada linha: **o que não dizer**
> · **por quê**.

1. **Nenhum número de acurácia** ("95% de precisão", "acerta X%"). Não é auditável, é a mentira
   padrão do mercado (Nuru "2× humano" mascara 21% em folha única) [doc 01 §6]; expõe a CONAR/CDC
   por publicidade enganosa. Comunicamos **hipótese e confiança**, nunca porcentagem de acerto.
2. **Nenhuma promessa de inferência offline** ("diagnostica sem internet", "funciona 100% offline").
   Só a **biblioteca e as fichas** são offline; o diagnóstico por foto exige internet
   (`STORE_LISTING.md:12,73`). Sempre qualificar.
3. **Nenhuma prescrição, dose ou receituário** ("use o produto X", "aplique Y ml/ha", "pulverize
   agora"). Zona regulada (Lei 14.785/2023, Confea 1.149/2025); o app é apoio à decisão, não laudo.
4. **Nada de tempo fixo** ("resposta em 3 segundos", "diagnóstico instantâneo garantido"). Proibido
   em `STORE_LISTING.md:73`; latência varia com rede e provider.
5. **Nada de "aprovado/validado por agrônomos" ou "por profissional habilitado"** sem contrato. Citar
   fontes (Embrapa/MAPA/IRAC/FRAC) é referência bibliográfica; afirmar endosso institucional sem
   acordo é falso e enganoso.
6. **Nenhum endosso de marca ("parceria com Embrapa/MAPA")** — usamos as fontes como referência, não
   temos parceria. "Referências EMBRAPA/MAPA" ≠ "chancelado pela Embrapa".
7. **Nenhum comparativo nominal a concorrente** ("melhor que o Plantix", "diferente do Agrio").
   CONAR restringe publicidade comparativa; e o Agrio é nosso próprio provider de IA — comparação é
   tiro no pé estratégico [doc 01 §4]. Falar do **nosso** benefício, não do defeito do outro.
8. **Nenhum superlativo absoluto** ("o melhor app de pragas", "o mais preciso", "o número 1"). CONAR
   exige comprovação; não temos como provar "melhor".
9. **Não usar "único ... no iPhone"** nem "só nós temos foto-diagnóstico". O Agrio tem app iOS
   legítimo no BR (4,87★) [doc 01 §1A]. O fato defensável é "app de verdade no iPhone e Android"
   (C4), não exclusividade.
10. **Nada de severidade medida, histórico de fotos, feed de comunidade ou mapa regional de usuários.**
    O app não mede severidade nem guarda foto, e não tem community feed/UGC map por decisão de
    contrato e privacidade (`STORE_LISTING.md:15,73`). Prometer isso = propaganda enganosa + abre
    obrigações de moderação (Apple 1.2) que não temos.

**Extras de tom (não são proibições legais, mas quebram a voz AgroRumo):** evitar tecnojargão
("modelo multimodal", "top-k", "inferência"), CAPS abusivo, e emoji em excesso na loja. Falar como
produtor fala.
