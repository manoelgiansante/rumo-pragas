# Dossiê R4 — Sencrop (estações meteo conectadas + alerta preditivo de doença, EU)

> Pesquisa de mercado defensiva, produto próprio (Rumo Pragas). Fontes públicas. Data de acesso: 2026-07-19.
> Adjacente por CONTRASTE: Sencrop é o padrão "prever a doença ANTES de ela aparecer" (dado ambiental), não "diagnosticar pela foto depois que apareceu".

### Identidade
- Empresa francesa (fundada 2016, Ducroquet & Bruniaux), hoje subsidiária do grupo ISAGRI. Confiança: confirmado.
- Escala: **40.000+ estações ativas**, ~30.000 produtores, presença em ~35 países — líder europeu em dados agro-meteorológicos e gestão de risco. Confiança: confirmado (ALEGADO no site; números de marketing, mas consistentes).

### Plataformas e preço
- **Hardware (estação meteo IoT) + app iOS/Android**, modelo por **assinatura** vinculada à(s) estação(ões). Confiança: confirmado (existência) / preço exato **não confirmado** nesta sessão.
- Sensores modulares: Raincrop (chuva), Windcrop (vento), Thermocrop (geada), Soilcrop (solo). Confiança: confirmado.

### Fluxo / dado (não é foto — é sensor)
- O produto NÃO diagnostica por foto. Ele coleta **dado hiperlocal em tempo real**: temperatura do ar, umidade, chuva, vento, **molhamento foliar (leaf wetness)**, ponto de orvalho, temperatura/umidade de solo. Confiança: confirmado.
- Esses dados alimentam **modelos de predição de risco** de doenças/pragas comuns → o produtor recebe **alerta ANTES** (SMS, e-mail ou ligação) para agir preventivamente. Confiança: confirmado (sencrop.com/eu/pests-and-diseases).
- **Janela de pulverização (spray window)**: recomenda o melhor momento para aplicar defensivo conforme o produto e a previsão ultralocal. Confiança: confirmado.

### "Top-k / confiança" (equivalente)
- Aqui o "resultado" é um **nível de risco por doença/praga** ao longo do tempo (curva/probabilidade), não uma classe de imagem. Confiança: confirmado/inferido.
- Alertas **customizáveis** (limiares próprios) ou **presets** por tratamento. Confiança: confirmado.

### Comportamento "não sei"
- Não se aplica igual — é modelo de risco contínuo; a incerteza aparece como probabilidade de risco, não como "não reconheci". Confiança: inferido.

### Velocidade
- Monitoramento **contínuo/tempo real**; alerta chega antecipadamente (dias antes da infecção potencial), que é o oposto do diagnóstico reativo instantâneo. Confiança: confirmado (é a proposta de valor).

### Offline
- Dados sobem via rede da estação (celular/LoRa); app depende de conexão para dashboard. Confiança: inferido.

### Biblioteca / integração
- Conecta-se a **Decision Support Tools** de terceiros (Xarvio, Movida, RIMpro) — ecossistema de modelos agronômicos. Confiança: confirmado.
- Rede **colaborativa**: produtores compartilham dados de estações vizinhas → mais cobertura espacial. Confiança: confirmado.

### Comunidade / especialista
- "Comunidade" = rede de estações compartilhadas entre produtores (dado), não fórum de diagnóstico. Confiança: confirmado.

### Monetização
- **Assinatura de hardware+software** (SaaS agro + IoT). Público mais capitalizado (médio/grande produtor EU). Confiança: confirmado/inferido.

### Limitações / contraste
- Exige **investimento em hardware** e é caro/complexo para pequeno produtor — barreira alta vs um app grátis de foto. (inferido)
- Cobre doenças **modeláveis por clima**; não substitui a identificação visual do que já está na folha. (inferido)

### Fontes
- https://sencrop.com/eu/pests-and-diseases/ (2026-07-19, confirmado)
- https://sencrop.com/eu/private-network/ (2026-07-19, confirmado)
- https://sencrop.com/eu/irrigation/ (2026-07-19, confirmado)
- https://apps.apple.com/us/app/sencrop-local-weather/id1447941336 (2026-07-19, confirmado)
- https://agtecher.com/en/hardware/sencrop/ (2026-07-19, confirmado)

### Lição aplicável ao Rumo Pragas
- **Preditivo (antes) + reativo (foto, depois) são complementares** — o Rumo Pragas é forte no reativo (o produtor já vê a lesão e fotografa). Um roadmap de valor é adicionar uma camada preditiva LEVE e SEM hardware: usar **dados meteorológicos abertos por região** (INMET/OpenWeather) para alertas de risco de doença (ex.: "condições favoráveis à ferrugem nos próximos 3 dias na sua cidade"). Sencrop cobra caro por isso com estação própria; o Rumo Pragas pode aproximar de graça com clima público.
- **Alerta que chega ao usuário sozinho (push/WhatsApp) cria retenção que o "abra o app e fotografe" não cria** — o diagnóstico é episódico; o alerta preditivo é recorrente e traz o usuário de volta.
- **Molhamento foliar / umidade são os gatilhos clássicos de doença fúngica** — mesmo sem sensor, contextualizar o diagnóstico com o clima recente ("choveu muito, ambiente favorável a fungo") enriquece a resposta e a credibilidade.
