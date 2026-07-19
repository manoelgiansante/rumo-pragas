# INDEX R4 — Adjacentes de foto-diagnóstico (padrão de UX que o usuário BR já espera)

> Pesquisa de mercado defensiva, produto próprio Rumo Pragas. Fontes públicas. Data: 2026-07-19.
> Pergunta do lote: "que padrão de UX/arquitetura de foto-diagnóstico esses produtos estabelecem que o usuário brasileiro já espera?"
> Formato: nome | categoria | 1 lição de UX/produto aplicável ao Rumo Pragas.

| # | Produto | Categoria | Lição aplicável (1 linha) |
|---|---------|-----------|---------------------------|
| 1 | **Plant.id / Kindwise** | API B2B de ID + health assessment (nuvem) | Retornar top-k com % + tratamento + severidade E modelar "sósias benignos"/desordens abióticas como classes → menos falso-positivo; degradar para categoria ampla quando a confiança cai (anti-chute). |
| 2 | **Picture Insect (Glority)** | App consumer de ID de inseto (freemium) | Enciclopédia por espécie com "é perigoso? o que fazer?" fideliza; freemium "3 grátis e paga" gera reviews ruins → nosso "grátis sem limite" é vantagem a comunicar. |
| 3 | **Seek by iNaturalist** | App consumer de ID de organismo (grátis, offline) | "Escada taxonômica": dar o nível superior CERTO quando não tem a espécie, em vez de cravar errado; coaching de foto na câmera ao vivo; on-device/offline como trunfo de campo. |
| 4 | **Pl@ntNet** | ID de planta ciência-cidadã + API | Perguntar órgão/contexto antes de diagnosticar e aceitar 1–5 fotos do mesmo caso; mostrar fotos de referência das candidatas; ele identifica planta mas NÃO diagnostica doença = nosso espaço. |
| 5 | **FarmRise (Bayer)** | Advisory smallholder grátis (Índia/global) | Modelo híbrido IA-instantânea + agrônomo-humano no caso difícil; app vencedor é HUB (diagnóstico+clima+preço+conteúdo), não recurso único; "grátis" sustentado por funil de ecossistema. |
| 6 | **BharatAgri / DeHaat** | Advisory por foto + marketplace de insumo (Índia) | Diagnóstico é TOPO de funil → oferecer "próximo passo acionável" (manejo/onde encontrar); voz+linguagem simples destravam baixa alfabetização digital; diagnóstico independente (sem vender insumo) é diferencial de confiança. |
| 7 | **Sencrop** | Estações meteo IoT + alerta preditivo de doença (EU) | Preditivo (antes) complementa reativo (foto, depois): camada leve SEM hardware usando clima público (INMET) → alertas de risco por região = retenção recorrente que o diagnóstico episódico não dá. |
| 8 | **Google Lens** | Baseline grátis universal (busca visual) | O usuário BR já tem ID grátis no bolso → NÃO ser "mais um que dá o nome"; ganhar entregando diagnóstico estruturado + manejo acionável + severidade + contexto regional/tropical, na mesma velocidade/fricção-zero do Lens. |

## Padrões transversais (o que o usuário BR já espera de um foto-diagnóstico em 2026)
1. **Câmera → resultado em segundos, sem cadastro pesado** (régua Lens/Seek/Picture Insect).
2. **Top-k com confiança explícita** e honestidade na incerteza — "escada taxonômica" (Seek) / degradar para categoria ampla (Kindwise) em vez de cravar errado.
3. **Coaching de qualidade de foto** antes/durante a captura (Seek faz; Picture Insect e Pl@ntNet falham nisso = oportunidade).
4. **Contexto leve antes do diagnóstico** (órgão/cultura — Pl@ntNet) e **múltiplas fotos do mesmo caso**.
5. **Resposta = diagnóstico + AÇÃO + severidade + imagem de referência**, não só o nome (Kindwise, FarmRise, DeHaat).
6. **Ser especialista/regional e independente** é o fosso contra generalistas globais (Lens) e contra marketplaces com conflito de interesse (BharatAgri).
7. **Diferenciais de retenção**: offline on-device (Seek), alerta preditivo recorrente (Sencrop), hub multi-serviço (FarmRise), grátis-sem-paywall (nosso).
