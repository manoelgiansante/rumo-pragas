# SIMA (Sistema Integrado de Monitoreo Agrícola) — Argentina

Data da pesquisa: 2026-07-19 · Pesquisador: agente Fable 5 (lote R3 LATAM/BR) · Todas as fontes públicas.

## Identidade
- País de origem: Argentina (startup de Rosario; fundador Agustín Rocha; parceria divulgada com a NASA para dados satelitais).
- Plataformas: Android (Play, `com.voy.sima`, v5.0.0), iOS (App Store id 6448897648, v1.59.0, atualizado 18/07/2026) e painel web para coordenação/relatórios.
- Idiomas: espanhol nativo; **pt-BR presente** — o app iOS na loja BR aparece com nome "SIMA Monitoramento de Cultivos" (CONFIRMADO na loja), embora os metadados de idioma do binário iOS listem apenas EN (inferido: localização parcial).
- Preço/modelo: freemium — grátis até 10 talhões/1 usuário; pago por assinatura ANUAL precificada por número de talhões monitorados, com contas de usuário ilimitadas por licença (monitores + coordenadores). Valores não publicados no site (CONFIRMADO o modelo; valor = não público).
- ICP: equipes profissionais de monitoramento — agrônomos consultores, revendas de insumos, cooperativas e produtores médios/grandes de grãos. NÃO é um app de produtor individual leigo.

## Mecânica real (OBSERVADO em site oficial + fichas de loja)
- Scouting de campo estruturado: registro georreferenciado de daninhas, insetos e doenças com foto, áudio, vídeo e notas; waypoints no talhão.
- Ferramentas específicas de monitoramento: contagem de stand de plantas, avaliação de severidade de doença, perdas de colheita, registro de chuva/irrigação.
- Imagens de satélite NDVI/GNDVI/RGB para direcionar onde monitorar + alertas automáticos com protocolos padronizados por cultura.
- Ordens de trabalho: pulverização, fertilização, colheita — fecha o ciclo monitorou→recomendou→executou.
- **Offline declarado**: coleta de dados sem internet (ALEGADO no site; crítico e coerente com o público de monitores em campo).
- Web: dashboard de status por talhão, geração de relatórios e export Excel/PDF.
- Culturas: soja, milho, girassol, trigo, cevada — foco 100% em grãos extensivos; sem hortifrúti/perenes.
- Integração com Climate FieldView (parceria oficial listada no site da Climate Argentina).
- IA: pouca alegação de IA generativa/visão computacional; a proposta é digitalizar o protocolo humano de monitoramento, não diagnosticar por foto. **Não observei diagnóstico automático por foto** — a foto é registro, não input de IA (diferença central vs Rumo Pragas).

## Tração no Brasil
- Presença declarada em 8 países LATAM incluindo Brasil (ALEGADO site); >4 milhões de hectares monitorados acumulados (ALEGADO).
- Play Store (global, consultado 19/07/2026 via página pública): **nota 4,12 com 954 avaliações** — volume razoável para app B2B de nicho, nota mediana.
- App Store BR: nota 5,0 com apenas **5 avaliações** — presença iOS no BR é recente/pequena.
- Não encontrei cases públicos brasileiros nomeados na varredura (inferido: tração BR ainda pequena vs Argentina).

## IA declarada
- Marketing enfatiza satélite + protocolos + alertas, não "IA". Menções à NASA são sobre acesso a dados satelitais (ALEGADO em imprensa argentina).

## Fortes vs Rumo Pragas
- Workflow completo de MIP profissional (protocolos por praga/cultura, severidade, ordens de aplicação, relatórios p/ cliente) — profundidade que um app de diagnóstico não tem.
- Offline de campo declarado; multiusuário coordenador/monitor.
- Rede de consultores/revendas na Argentina como canal.

## Fracos vs Rumo Pragas
- Sem diagnóstico por foto com IA — o usuário precisa SABER identificar a praga; Rumo Pragas resolve o passo anterior.
- Freemium limitado (10 talhões/1 usuário) vs Rumo Pragas 100% grátis.
- Localização pt-BR aparentemente parcial; culturas restritas a grãos extensivos; nota Android mediana (4,1).
- Curva de adoção alta para produtor pequeno — desenhado para equipes.

## Fontes (acessadas 2026-07-19)
- https://sima.ag/en (site oficial — features, preço-modelo, países, offline)
- https://play.google.com/store/apps/details?id=com.voy.sima (rating/volume)
- https://apps.apple.com/br/app (lookup iTunes id 6448897648 — nome pt-BR, v1.59.0, 5 avaliações BR)
- https://climatefieldview.com.ar/socios/sima/ (integração FieldView)
- https://agrolink.com.ar + https://bichosdecampo.com (histórico, parceria NASA — imprensa AR)
- Confiança geral: features = confirmadas (site+lojas); preços exatos = não públicos; tração BR = inferida baixa.
