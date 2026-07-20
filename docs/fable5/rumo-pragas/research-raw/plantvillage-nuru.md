# PlantVillage Nuru (Penn State / PlantVillage)

**Lote:** R1 (soluções acadêmicas/públicas globais) · **Acesso:** 2026-07-19

## Identidade
- **Origem:** PlantVillage, laboratório do Prof. David Hughes na Penn State University (EUA). Desenvolvido como "bem público" (public good) em parceria com FAO, IITA, CIMMYT, CGIAR e outros. [confirmado]
- **Plataformas:** Android é a plataforma principal (foco em campo na África/Sudeste Asiático). Existe listagem iOS na App Store (id 1441395371, seller "David Hughes"), mas é muito fina — versão 1.0, apenas 3 avaliações. [confirmado — iTunes lookup]
- **Idiomas:** interface e aconselhamento em vários idiomas locais citados publicamente — suaíli, twi, hindi, francês e inglês. [confirmado — material PlantwisePlus/PlantVillage]
- **Modelo de negócio:** 100% grátis, sem fins lucrativos, financiado por doadores/pesquisa. Sem assinatura. [confirmado]
- **Região-alvo:** África subsaariana e Sudeste Asiático (foco em pequenos produtores). Não há foco no Brasil. [confirmado]

## Mecânica real (OBSERVADO em fontes públicas + paper)
- **Captura de foto:** o produtor fotografa a parte da planta afetada (ex.: folha de mandioca) diretamente no campo. [confirmado]
- **Modelo de IA:** modelo de **object detection** (detecção de objeto, não só classificação de imagem inteira) rodando com TensorFlow, treinado sobre banco de imagens curado por especialistas. [confirmado]
- **Offline:** roda **100% offline** dentro de um smartphone Android padrão — este é o diferencial central (campo sem internet). [confirmado]
- **Culturas/doenças iniciais:** mandioca (cassava) — mosaico da mandioca (CMD), estria marrom (CBSD) e ácaro-verde (CGM). Expandiu depois para outras culturas via parceria (Nuru foi integrado ao ecossistema PlantwisePlus da CABI). [confirmado]
- **Diagnóstico diferencial / múltiplas fotos:** o app recomenda **capturar ~6 folhas** para elevar a acurácia — o veredito melhora muito com várias amostras vs. folha única. [confirmado — paper Frontiers 2020]
- **Comportamento offline + blend humano:** liga ao platform PlantVillage para receber conselho "sob medida" de especialistas de governo/academia em idioma local — modelo híbrido IA + humano. [alegado/observado em material institucional]
- **Vigilância/geo:** evolução recente da linha de pesquisa (Nature Sci Reports 2025) usa **YOLO + human-in-the-loop + georreferenciamento multiplataforma** para vigilância de murcha da banana — indica trajetória rumo a mapas/surveillance, mas é braço de pesquisa, não necessariamente o app do produtor. [confirmado como pesquisa relacionada]

## Acurácia declarada vs. medida (IMPORTANTE — separar)
- **Alegação de marketing:** "Nuru é ~2× mais preciso que os agentes humanos testados". [ALEGADO — material institucional]
- **Medido em paper independente (Frontiers Plant Science, 2020):** [confirmado]
  - Folha única: CMD 52–59%, **CBSD apenas 21%**, dano CGM 40–56%.
  - Múltiplas folhas (6): CMD 93%, CBSD 73%, CGM 93%.
  - Acurácia geral subiu de ~40% (versão 2018) para ~65% ±3 (versão 2020).
  - Testado em campo com Huawei P10 + validação em 4 modelos de celular; desempenho **varia bastante entre aparelhos**.
  - Limitação assumida: sintomas leves detectados com só 13–37% de acurácia; CBSD é "críptico e sazonalmente variável", difícil até para humanos.

## Tração
- Download gratuito no Android desde 2018; relatos de uso em todos os continentes, uso intenso na África e Sudeste Asiático. [alegado — sem número duro público consolidado]
- iOS: 3 avaliações, nota 5 (base minúscula, não representativa). [confirmado — iTunes]

## Pontos fortes vs. Rumo Pragas
- **Offline real** rodando modelo no aparelho — algo que Rumo Pragas (diagnóstico por IA, provável server-side) provavelmente não faz. Valioso para campo sem sinal.
- Modelo **híbrido IA + especialista humano** com aconselhamento local.
- Estratégia de **múltiplas fotos** para elevar confiança — padrão de UX que aumenta acurácia honesta.
- Transparência científica (acurácia publicada e auditada por terceiros).

## Pontos fracos vs. Rumo Pragas
- Cobertura de culturas estreita (foco histórico em mandioca/banana/poucas culturas africanas) — irrelevante para o mix de culturas brasileiro.
- Sem foco em português/Brasil, sem manejo IPM local brasileiro.
- Acurácia real modesta em folha única (o marketing "2× humano" mascara CBSD 21%).
- UX/produto data (versão iOS 1.0 parada) — é ferramenta de pesquisa/ONG, não produto polido de consumo.

## Insight acionável para Rumo Pragas
- **Offline no aparelho** e **captura de múltiplas fotos para subir a confiança** são dois padrões defensáveis a considerar.
- Publicar/curar a acurácia por doença de forma honesta (observado × alegado) é diferencial de confiança que a maioria dos apps comerciais não faz.

## Fontes (acesso 2026-07-19)
- App Store PlantVillage Nuru (id 1441395371) — metadados via iTunes lookup.
- Paper Frontiers Plant Science 2020 (10.3389/fpls.2020.590889) — acurácia CMD/CBSD/CGM.
- PlantwisePlus Blog (blog.plantwise.org, 2020) — expansão Nuru.
- IITA / CGIAR Big Data Platform — descrições do Nuru.
- Penn State AgSci / Business Insider — contexto XPRIZE e desenvolvimento.
- Nature Scientific Reports 2025 (s41598-025-87588-2) — evolução YOLO/georreferenciada (pesquisa relacionada).
