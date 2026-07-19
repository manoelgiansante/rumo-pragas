# Dossiê R4 — Plant.id / Kindwise (API B2B de identificação e saúde de plantas/culturas)

> Pesquisa de mercado defensiva, produto próprio (Rumo Pragas). Fontes públicas. Data de acesso: 2026-07-19.
> Contexto interno: Kindwise é o fornecedor de IA do nosso app CampoVivo — aqui é estudado **apenas como produto/API pública**.

### Identidade
- Empresa: **Kindwise** (spin-off da FlowerChecker), sediada na **República Tcheca**. Confiança: confirmado (kindwise.com/about).
- Portfólio de APIs: `plant.id` (identificação de plantas), `plant.health` (saúde/doenças de plantas ornamentais/gerais), `crop.health` (doenças de culturas agrícolas), `insect.id`, `mushroom.id`. Confiança: confirmado.
- Posicionamento: API B2B "identification-as-a-service" — vende para desenvolvedores/equipes de P&D que embutem o motor no próprio app. Confiança: confirmado.

### Plataformas e preço
- Modelo: **API REST paga por crédito**. Preço-base público **€0,05 por crédito**; descontos por volume ("contate business@plant.id"). Confiança: confirmado (kindwise.com/plant-id).
- OBSERVADO importante: pedir `plant.id` + `plant.health` juntos para a mesma planta = **2 créditos** (um por produto). Confiança: confirmado.
- Não há preço BR específico (é B2B global em euro). Existe uma ferramenta web pública "Plant Batch Identifier" para testes em lote. Confiança: confirmado.

### Fluxo de captura de foto e validação de qualidade
- Entrada: imagem(ns) via API (não há "app oficial" consumer de referência forte — o valor é o motor). Confiança: confirmado.
- Guia de qualidade OBSERVADO: a FAQ recomenda **fotografar a PARTE DOENTE** da planta em close para melhor acurácia — ou seja, o sistema se beneficia de detalhe/proximidade, não da planta inteira. Confiança: confirmado (kindwise.com/plant-health FAQ).
- Suporta múltiplas imagens por requisição (aumenta acurácia). Confiança: inferido (padrão da família de APIs).

### Top-k / score de confiança / diferencial
- Retorna **lista ranqueada com probabilidades** (top-k) + score de confiança por classe. Ex.: crop.health mostra "93%" para Aphididae; plant.health mostra "91%" para diagnóstico fúngico. Confiança: confirmado.
- **crop.health**: 23 culturas maiores, **288 classes** de doença/praga (~180 pragas, ~80 fungos, ~20 viroses, ~20 bacterioses). **Top-3 acc 93% / Top-1 85%** em dataset de validação. Confiança: confirmado (kindwise.com/crop-health).
- **plant.health**: **548 classes** incluindo pragas, fungos, bactérias, vírus, **desordens abióticas** (nutricional/estresse) E **"sósias não-nocivos"** (non-harmful look-alikes). Confiança: confirmado. Diferencial de arquitetura: **modelar look-alikes benignos como classe** reduz falso-positivo de "está doente".
- Resposta detalhada inclui **códigos EPPO e GBIF IDs**, nomes comuns localizados, sintomas, severidade, forma de propagação. Confiança: confirmado.

### Comportamento "não sei" / incerteza
- OBSERVADO: a resposta é probabilística (top-k com scores) — o consumidor decide o corte. Existe parâmetro **`disease_level=general`** que devolve resultado mais amplo/menos granular em vez de forçar 1 das 500+ classes. Confiança: confirmado. → padrão útil: **degradar para categoria ampla quando a confiança é baixa**, em vez de chutar espécie.
- `plant.id` tem flag `is_plant` (a família expõe "isto é mesmo uma planta?"). Confiança: inferido (documentado em versões da API; não reconfirmado nesta sessão — marcar como inferido).

### Velocidade
- Latência não publicada como SLA numérico nesta sessão; é chamada síncrona de nuvem (sub-segundo a poucos segundos típico de API de visão). Confiança: inferido. Marcar "não confirmado" para número exato.

### Offline
- **Não há opção on-device/offline** — é 100% API de nuvem, exige API key + rede. Confiança: confirmado (nenhuma menção a edge/offline nas páginas).

### Biblioteca / base de conhecimento
- Fornece **treatment instructions, sintomas, severidade, propagação, nomes comuns localizados** e imagens representativas licenciadas junto ao diagnóstico. Confiança: confirmado. → o "conteúdo educativo" vem embutido na resposta, não é um módulo separado.
- Conteúdo multilíngue (15+ idiomas com cobertura variável; inglês default). Português provável mas cobertura não confirmada. Confiança: inferido.

### Comunidade / especialista humano
- **Não** — é motor de IA puro. Sem camada de comunidade/agrônomo humano (isso fica por conta de quem integra a API). Confiança: confirmado.

### Monetização
- B2B por crédito (€0,05/crédito, volume desconta). Receita = volume de chamadas dos apps clientes. Confiança: confirmado.

### Reclamações / limitações recorrentes (paráfrase, máx. 1 frase cada)
- Custo por crédito escala rápido em app grátis de alto volume (2 créditos quando se quer ID + saúde juntos). (inferido do modelo de preço)
- Sem offline força dependência de rede em campo — problema real no agro brasileiro com conectividade ruim. (inferido)

### Fontes
- https://www.kindwise.com/plant-id (2026-07-19, confirmado)
- https://www.kindwise.com/plant-health (2026-07-19, confirmado)
- https://www.kindwise.com/crop-health (2026-07-19, confirmado)
- https://www.kindwise.com/about (2026-07-19, confirmado)
- https://documenter.getpostman.com/view/24599534/2s93z5A4v2 (plant.id API v3, público; não re-fetchado nesta sessão — inferido)

### Lição aplicável ao Rumo Pragas
- **Modelar "sósias benignos" e desordens abióticas como classes próprias** (não só doenças). O padrão que o usuário passa a esperar é: "não é praga, é deficiência de nutriente / dano mecânico" em vez de forçar uma doença. Isso reduz falso-positivo e aumenta confiança percebida.
- **Degradar graciosamente para categoria ampla quando a confiança cai** (equivalente ao `disease_level=general`): responder "provavelmente fungo foliar" com % em vez de cravar a espécie errada. Padrão anti-chute.
- **Retornar top-k com probabilidade + tratamento + severidade na mesma resposta**: o usuário BR já espera o "combo diagnóstico + o que fazer + quão urgente", não só o nome. Kindwise é a régua técnica que os concorrentes usam.
- **Custo/latência de API de nuvem por foto é a maior pressão de um app grátis de volume** — desenhar cache, compressão e (se possível) triagem on-device antes de gastar crédito de nuvem.
