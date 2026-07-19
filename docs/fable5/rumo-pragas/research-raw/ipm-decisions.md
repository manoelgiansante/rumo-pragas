# IPM Decisions Platform (Pan-European, projeto Horizon 2020)

**Lote:** R1 · **Acesso:** 2026-07-19

## Identidade
- **Origem:** plataforma pan-europeia desenvolvida pelo projeto IPM DECISIONS (financiado pela EU / Horizon 2020), consórcio de institutos de pesquisa agrícola europeus. [confirmado]
- **Plataforma:** **web** (framework baseado em navegador; não é app de câmera de celular). [confirmado]
- **Modelo de negócio:** acesso **grátis** ("one-stop-shop" de acesso livre a DSS de IPM). [confirmado]
- **Região:** Europa (dados de clima e modelos por país europeu). Não é Brasil. [confirmado]
- **Público:** produtores, consultores/advisors e pesquisadores. [confirmado]

## Mecânica real (OBSERVADO)
- **Não é diagnóstico por foto.** É um agregador de **Decision Support Systems (DSS)** — sistemas de apoio à decisão que geram **previsão de risco de pragas/doenças/plantas daninhas** com base em modelos + dados meteorológicos. Filosofia totalmente diferente de Rumo Pragas. [confirmado]
- **Fluxo:** o usuário define a localização da fazenda; a plataforma **seleciona automaticamente os dados meteorológicos open-access mais apropriados** para aquele local; roda os DSS relevantes; cada DSS devolve **guia-resumo de próximos passos** (ex.: pulverizar ou não, janela de risco). [confirmado]
- **Arquitetura:** 4 dashboards; formatos padronizados para que pesquisadores/devs adicionem novos DSS de forma consistente (modelo de plataforma aberta, extensível). [confirmado]
- **Conteúdo:** lançada em setembro/2023; em maio/2024 já tinha **mais de 25 DSS totalmente integrados** + vários linkados, cobrindo pragas invertebradas, doenças e plantas daninhas. [confirmado]
- **Benefício central:** melhor **timing** e **targeting** de aplicação de defensivo → evita pulverização desnecessária (redução de custo + ambiental). [confirmado]
- **Sem:** câmera/foto, top-k de imagem, offline (é web dependente de dados de clima), biblioteca de fotos de sintoma. [confirmado por ausência nas descrições]

## Governança de conteúdo
- Os DSS são **modelos científicos validados** contribuídos por institutos de pesquisa europeus, em formato padronizado — governança acadêmica/institucional forte. [confirmado]

## Tração
- Ferramenta institucional/profissional (advisors); não é app de consumo em massa, sem nota de loja. [confirmado por natureza]
- Publicação formal de 2025 descrevendo a plataforma (PubMed 41234780 / PMC12605576). [confirmado]

## Pontos fortes vs. Rumo Pragas
- **Previsão de risco baseada em clima + modelo** (preditiva, não reativa): avisa ANTES do sintoma aparecer, com base em condições meteorológicas favoráveis à praga/doença. Isso é uma camada que o diagnóstico-por-foto (reativo, pós-sintoma) não cobre.
- Integração automática de **dados meteorológicos** por geolocalização.
- Foco em **reduzir aplicação desnecessária de defensivo** (IPM real, timing).

## Pontos fracos vs. Rumo Pragas
- Nada de diagnóstico visual por foto (public diferente).
- Só web, só Europa, orientado a consultor/pesquisador (curva de uso alta para o produtor comum).
- Depende de modelos DSS por praga/cultura já construídos — cobertura limitada ao que o consórcio integrou.

## Insight acionável para Rumo Pragas
- **Camada preditiva por clima+geo é a evolução natural de um app de diagnóstico reativo.** Depois que Rumo Pragas tem volume de diagnósticos georreferenciados no Brasil, cruzar com dados meteorológicos abre "alerta de risco de praga X na sua região nos próximos dias" — passa de reativo (já tenho o problema) para preditivo (evite o problema). É o mesmo salto que a IPM Decisions representa, mas com a vantagem brasileira de dado próprio.
- **Timing de manejo** ("quando pulverizar") como recurso premium/diferencial de IPM.

## Fontes (acesso 2026-07-19)
- ipmdecisions.net/the-platform/about — descrição oficial.
- PubMed 41234780 / PMC12605576 — paper descritivo da plataforma (2025).
- EU CAP Network e EUFRAS — descrição de projeto e benefícios.
- advisorynetpest.eu / farmpep.net — disponibilidade e escopo (25+ DSS).
