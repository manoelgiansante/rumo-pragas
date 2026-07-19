# Rice Doctor (IRRI — International Rice Research Institute) — EXTRA (Ásia)

**Lote:** R1 (extra acadêmico/público, Ásia) · **Acesso:** 2026-07-19

## Identidade
- **Origem:** IRRI (International Rice Research Institute, Filipinas), com equipe internacional: Lucid team da University of Queensland (Austrália), PhilRice (Filipinas) e Instituto de Pesquisa de Arroz da Indonésia. Bem público. [confirmado]
- **Plataformas:** iOS (App Store id 898699255, publisher técnico "Identic Pty. Ltd." — a Lucid/Identic hospeda a chave), Android (Google Play), e web (ricedoctor.irri.org). Versões localizadas: Tagalog e Odisha. [confirmado]
- **Modelo de negócio:** 100% grátis. [confirmado]
- **Idiomas:** inglês, filipino/tagalog, odia (Índia). [confirmado]
- **Região/cultura:** Ásia produtora de arroz (Filipinas, Indonésia, Índia). Cultura única: **arroz**. Não é Brasil (embora o Brasil tenha arroz irrigado no Sul — relevância marginal). [confirmado]

## Mecânica real (OBSERVADO)
- **NÃO é diagnóstico por foto com IA.** É uma **chave diagnóstica interativa (Lucid key / árvore de decisão)**: o usuário responde a perguntas sobre sinais/sintomas (com apoio de texto + imagens de referência) e a ferramenta **estreita as possibilidades** até o problema provável. [confirmado]
- **Cobertura:** mais de **90 pragas, doenças e distúrbios** (inclui desordens nutricionais/abióticas, não só doenças). [confirmado]
- **Saída:** factsheets por distúrbio com descrição de sinais/sintomas + **opções de manejo** disponíveis. [confirmado]
- **Offline:** app baixável funciona no campo (chave + factsheets locais). [inferido — app nativo com conteúdo empacotado]
- **Sem:** IA de imagem, top-k por foto, confiança probabilística, geo/mapa, alertas regionais. É determinístico (chave). [confirmado por natureza]

## Governança de conteúdo
- Conteúdo curado por instituto de pesquisa de arroz (IRRI + parceiros nacionais) — **alta autoridade agronômica**, incluindo desordens abióticas (deficiência nutricional) que apps de foto costumam ignorar. [confirmado]

## Tração
- Google Play: 10.000+ instalações; App Store: 1.000+ downloads. iOS com só 1 avaliação (nota 5, base irrelevante). [confirmado]

## Pontos fortes vs. Rumo Pragas
- **Chave diagnóstica cobre desordens abióticas** (deficiência nutricional, distúrbio fisiológico), não só pragas/doenças biológicas — a IA de foto de Rumo Pragas pode errar aqui (confunde deficiência com doença). Cobertura de "distúrbio" é um gap que Rumo Pragas deve cobrir.
- Conteúdo profundo e curado por cultura, com manejo.
- Funciona sem depender de reconhecimento visual perfeito (útil quando o sintoma é ambíguo/atípico — o caso "fora de distribuição" que quebra IA de imagem).

## Pontos fracos vs. Rumo Pragas
- UX de questionário/chave é mais lenta e exige conhecimento do usuário ("responda 10 perguntas") vs. "tire uma foto".
- Cultura única (arroz), foco Ásia.
- Sem geo/alertas/histórico.

## Insight acionável para Rumo Pragas
- **Fallback de chave diagnóstica quando a IA de foto tiver baixa confiança:** se o modelo não reconhece bem a imagem (fora de distribuição, sintoma atípico, deficiência nutricional), oferecer um **fluxo de perguntas guiadas** (chave) em vez de devolver um palpite errado ou "não identificado" seco. Combina o melhor dos dois mundos — foto rápida + chave como rede de segurança.
- **Cobrir distúrbios abióticos** (deficiência nutricional, dano por herbicida, estresse hídrico) no conteúdo, não só doença/praga biológica.

## Fontes (acesso 2026-07-19)
- irri.org/rice-doctor e knowledgebank.irri.org/decision-tools/rice-doctor — descrição oficial.
- App Store Rice Doctor (id 898699255) — metadados via iTunes lookup.
- Google Play com.lucidcentral.mobile.ricedoctor — instalações.
- World Grain (2019), IRRI News (2017) — cobertura e localização Tagalog.
