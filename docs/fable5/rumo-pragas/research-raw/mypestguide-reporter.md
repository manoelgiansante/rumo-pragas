# MyPestGuide Reporter (DPIRD — Western Australia) — EXTRA (Oceania)

**Lote:** R1 (extra público/governamental, Oceania) · **Acesso:** 2026-07-19

## Identidade
- **Origem:** Department of Primary Industries and Regional Development (DPIRD), governo da Austrália Ocidental; financiado por "Royalties for Regions". Bem público governamental. [confirmado]
- **Plataformas:** iOS (App Store id 1032560930), Android (Google Play com.agric.mpg.reporter) e web (site MyPestGuide). [confirmado]
- **Modelo de negócio:** 100% grátis. [confirmado]
- **Região:** Austrália (biossegurança nacional). Não é Brasil. [confirmado]
- **Família de apps:** MyPestGuide **Reporter** (reporte genérico) + variantes de biblioteca por cultura: MyPestGuide **Crops**, **Diseases**, **Grapes**. [confirmado]

## Mecânica real (OBSERVADO)
- **NÃO é IA de diagnóstico por foto.** É um app de **reporte com identificação por especialista humano** (human-in-the-loop / biossegurança participativa). [confirmado]
- **Fluxo:** o usuário fotografa a praga/doença (**até 4 imagens por reporte**), o app captura **GPS** e descrição do entorno, dados de contato; envia o reporte. **Especialistas do DPIRD investigam, verificam, identificam a praga e devolvem feedback/conselho diretamente ao usuário.** [confirmado]
- **Offline:** funciona **fora da faixa de celular/Wi-Fi** (coleta em campo, sincroniza depois). [confirmado]
- **Propósito duplo:** ajudar o produtor A + alimentar a **rede de vigilância nacional** de pragas exóticas (surveillance colaborativa). [confirmado]
- **Bibliotecas de apoio:** os apps irmãos (Crops/Diseases/Grapes) fornecem **guias de identificação por cultura** para o usuário tentar reconhecer antes/depois. [confirmado]
- **Sem:** classificação automática instantânea por IA (o "diagnóstico" vem do humano, com latência). [confirmado]

## Tração
- iOS: nota 3,89 de 5, 18 avaliações (base pequena; app de nicho governamental). [confirmado — iTunes lookup]

## Pontos fortes vs. Rumo Pragas
- **Modelo de vigilância participativa + verificação humana:** transforma reportes de produtores em rede de biossegurança georreferenciada — dado coletivo de valor público/regional.
- **Especialista humano no loop** dá confiança e cobre o caso "IA não sabe/atípico".
- **Offline com GPS e múltiplas fotos** — bom padrão de captura de campo.

## Pontos fracos vs. Rumo Pragas
- **Latência:** depende de humano responder → não é instantâneo (Rumo Pragas dá resposta na hora via IA — vantagem de UX enorme).
- Não escala sem equipe de especialistas (custo humano); é viável só com respaldo de um órgão de governo.
- Foco em **detecção de pragas exóticas/biossegurança**, não em manejo cotidiano da lavoura.

## Insight acionável para Rumo Pragas
- **Escalonamento para humano como recurso premium/confiança:** quando a IA tiver baixa confiança OU o produtor pedir, permitir **encaminhar o caso a um agrônomo** (fila de revisão humana). Não precisa ser grátis/instantâneo — é o "segundo nível" que a IA sozinha não dá. Une a velocidade da IA (Rumo Pragas) com a autoridade humana (MyPestGuide/CABI).
- **Captura padrão de campo:** até 4 fotos + GPS + offline-first é um bom benchmark de UX de coleta.
- **Camada de vigilância/mapa regional** (mesma ideia do Tumaini): reportes georreferenciados anônimos → mapa de risco de praga por região do Brasil, ativo de rede que cresce com o volume grátis.

## Fontes (acesso 2026-07-19)
- dpird.wa.gov.au/online-tools/mypestguide (Reporter, Crops, Diseases, Grapes) — descrição oficial.
- App Store MyPestGuide Reporter (id 1032560930) — metadados via iTunes lookup.
- Google Play com.agric.mpg.reporter; extensionaus.com.au — guia de uso.
