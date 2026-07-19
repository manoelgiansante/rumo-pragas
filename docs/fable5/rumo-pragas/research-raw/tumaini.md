# Tumaini (Alliance of Bioversity International & CIAT)

**Lote:** R1 · **Acesso:** 2026-07-19 · (nota: página oficial `alliancebioversityciat.org/tools-innovations/tumaini-app...` retornou HTTP 403 no fetch; dossiê baseado em fontes públicas secundárias confiáveis — CGIAR, Nature, imprensa especializada)

## Identidade
- **Origem:** app de bem público desenvolvido pelo cientista Michael Selvaraj (CIAT) com colegas do Bioversity International; "Tumaini" = "esperança" em suaíli. [confirmado]
- **Plataformas:** Android (Google Play, disponível desde junho/2019). Não há evidência pública de versão iOS/web do app do produtor. [confirmado para Android]
- **Modelo de negócio:** grátis. [confirmado]
- **Região-alvo:** produtores de banana em Colômbia, RD Congo, Índia, Benim, China, Uganda (pilotos). Foco global em banana de pequenos produtores; não é focado no Brasil. [confirmado]
- **Idiomas:** não confirmado com precisão nas fontes públicas acessadas.

## Mecânica real (OBSERVADO/ALEGADO)
- **Cultura/escopo:** especializado em **banana** (e material recente cita expansão para feijão — "bananas & beans"). [confirmado banana; feijão = título de página oficial não acessada]
- **Captura de foto:** o produtor sobe uma foto da cultura afetada; a imagem é escaneada por reconhecimento de imagem em busca de sintomas de pragas/doenças. [confirmado]
- **Base de treino:** dataset de **mais de 50.000 imagens**. [alegado — imprensa/CGIAR]
- **Doenças cobertas (declarado):** 5 doenças + 1 praga — murcha por Xanthomonas (BXW), murcha de Fusarium (FWB), sigatoka-negra (BS), sigatoka-amarela (YS), topo-em-tufo/bunchy top (BBTV) e o gorgulho-da-bananeira (BCW). [confirmado]
- **Resultado:** devolve diagnóstico + recomenda passos de manejo. [confirmado]
- **Vigilância/geo:** linha de pesquisa evoluiu para **framework georreferenciado multiplataforma de vigilância de murcha da banana com YOLO + human-in-the-loop** (Nature Scientific Reports 2025) — indica trajetória rumo a mapas/surveillance regional e drones/satélite, além do celular. [confirmado como pesquisa]
- **Offline:** não confirmado explicitamente nas fontes acessadas (o fluxo de "upload de foto para escaneamento" sugere possível dependência de servidor). [não confirmado]

## Acurácia declarada
- **Taxa de detecção ~90%** relatada por produtores nos países-piloto (versão beta). [ALEGADO — declaração de pesquisador, imprensa]
- Pesquisa publicada em 2019 no periódico Plant Methods (um dos papers de maior repercussão do Bioversity/CIAT naquele ano). [confirmado como publicação]

## Tração
- >3.000 downloads no Google Play (número citado publicamente; base pequena, típica de ferramenta de pesquisa/ONG). [alegado/observado]
- Sem nota consolidada de loja nas fontes acessadas.

## Pontos fortes vs. Rumo Pragas
- Especialização profunda em **uma cultura de alto valor** (banana) com dataset grande e acurácia alegada alta — modelo de "vertical foco" que produz confiança na cultura-alvo.
- Trajetória para **vigilância georreferenciada regional** (alertas de surto) — recurso que Rumo Pragas poderia diferenciar no Brasil (mapa de risco de praga por região).

## Pontos fracos vs. Rumo Pragas
- Escopo de 1 cultura (banana) → irrelevante fora do nicho.
- Ferramenta de pesquisa com baixa tração de mercado e sem produto polido/multi-cultura.
- Sem português/Brasil, sem manejo IPM local.

## Insight acionável para Rumo Pragas
- **Mapa/vigilância regional de surtos** (georreferenciar diagnósticos anônimos → alerta "praga X subindo na sua região") é um recurso de rede que fica mais forte quanto mais usuários — vantagem de dado que um app grátis com volume no Brasil pode construir. Tumaini valida o conceito.
- Valida a estratégia de **capturar geolocalização do diagnóstico** desde o início (mesmo que os alertas venham depois).

## Fontes (acesso 2026-07-19)
- CGIAR System — "Tumaini: an AI-powered mobile app for pests and diseases".
- Alliance Bioversity–CIAT — story "AI helps banana growers".
- Nature Scientific Reports 2025 (s41598-025-87588-2) e PMC11775237 — framework de vigilância georreferenciada.
- Rural21 / Labroots — cobertura de imprensa (doenças cobertas, dataset, acurácia alegada).
- MEL CGIAR — métrica de ~3.000 produtores/downloads.
