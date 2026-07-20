# Leaf Doctor (University of Hawaiʻi at Mānoa / Cornell)

**Lote:** R1 · **Acesso:** 2026-07-19

## Identidade
- **Origem:** app acadêmico criado por patologista de plantas da University of Hawaiʻi at Mānoa (seller na App Store = "University of Hawaii"), com divulgação também via Cornell (CALS). [confirmado]
- **Plataformas:** iOS (App Store id 874509900, versão 1.1) e Android (Google Play). Introduzido em 2015 no iOS; Android veio depois. [confirmado]
- **Modelo de negócio:** 100% grátis, sem assinatura. [confirmado]
- **Idioma:** inglês. **Região:** global (ferramenta de pesquisa/extensão), sem localização Brasil. [confirmado]

## Mecânica real (OBSERVADO)
- **Não é um app de "diagnóstico por foto com IA".** É uma ferramenta de **quantificação de severidade** de doença: mede a **porcentagem de área foliar doente**, não identifica QUAL doença é. [confirmado — descrição oficial + reviews]
- **Fluxo:** o usuário fotografa (ou carrega) a folha/órgão doente; toca na tela para marcar até **8 cores** que representam o tecido saudável; depois arrasta um **slider de threshold** até que só o tecido sintomático fique realçado (tom azul). O app conta os pixels e calcula o **% de tecido doente**. [confirmado]
- **Sem seleção de cultura, sem top-k, sem confiança de classe, sem recomendação de manejo, sem histórico/geo, sem alertas.** É monofuncional (severidade). [confirmado]
- **Offline:** processamento local de imagem (não depende de nuvem). [inferido — algoritmo de pixel local]

## Acurácia declarada
- Paper (Plant Disease, APS, 2019) alega estimativas de severidade **altamente acuradas** vs. o padrão-ouro "Assess" (R² ≥ 0,79; Cb ≥ 0,959). [confirmado como alegação de paper — sobre severidade, não sobre identificar a doença]
- Marketing acadêmico: ~10× mais rápido, mais fácil e grátis vs. o software desktop "Assess" (~US$800). [alegado]

## Tração e reclamações recorrentes (parafraseado)
- **iOS: nota 1,96 de 5, 23 avaliações.** [confirmado — iTunes lookup] — nota muito baixa.
- Reclamações recorrentes (parafraseadas de reviews públicas): usuários esperavam **diagnóstico** ("o que a planta tem e como tratar") e frustraram-se ao receber só um número de % de doença; vários relataram que o app marca planta doente como "saudável" independentemente do threshold; instruções em cinza/fonte pequena difíceis de ler; um review resume bem a expectativa quebrada dizendo que só aprendeu que a folha está "49% doente com uma doença misteriosa". [parafraseado — reviews App Store]
- Um review de 5 estrelas defende o app: quem quer diagnóstico deve ir ao agente de extensão; o app serve para **quem precisa quantificar % de lesão** com iPad. Ou seja: a nota baixa vem de **desalinhamento de expectativa**, não necessariamente de defeito técnico. [parafraseado]

## Pontos fortes vs. Rumo Pragas
- Faz **uma coisa muito bem**: medir severidade com rigor científico. Rumo Pragas poderia oferecer uma **estimativa de severidade** ("~X% da folha afetada") como complemento ao diagnóstico — nicho técnico que quase nenhum app de consumo cobre.

## Pontos fracos vs. Rumo Pragas
- Não identifica a praga/doença (Rumo Pragas já é superior nisso).
- UX datada, sem manejo, sem histórico, sem localização.
- **Lição de posicionamento:** entregar só uma métrica sem o "e agora o que faço?" gera frustração e nota baixa — exatamente o gap que Rumo Pragas deve preencher (diagnóstico + recomendação de manejo).

## Insight acionável para Rumo Pragas
- Adicionar **severidade quantificada** ao resultado do diagnóstico é diferencial barato e defensável — mas **sempre acompanhado de recomendação de ação**, senão vira a frustração do Leaf Doctor.
- Caso de estudo vivo de que "métrica sem ação = nota 1,96". Confiança e utilidade percebida vêm do próximo passo, não só do dado.

## Fontes (acesso 2026-07-19)
- App Store Leaf Doctor (id 874509900) — metadados + reviews via iTunes RSS.
- Paper "Leaf Doctor: A New Portable Application for Quantifying Plant Disease Severity" (Plant Disease / APS; PubMed 30690990).
- University of Hawaiʻi News (hawaii.edu, 2014) e Cornell Chronicle/CALS (2015/2017) — divulgação.
- Quantitative-plant.org — ficha de software.
