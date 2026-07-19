# Dossiê R4 — FarmRise (Bayer)

> Pesquisa de mercado defensiva, produto próprio (Rumo Pragas). Fontes públicas. Data de acesso: 2026-07-19.

### Identidade
- App gratuito de advisory agronômico da **Bayer** (raiz na plataforma Climate/The Climate Corporation), foco em **pequenos produtores da Índia** (e presença global). Confiança: confirmado (farmrise.bayer.com, Play com.climate.farmrise).
- Escala: **5+ milhões de produtores registrados** na Índia (marco anunciado 2026). Confiança: confirmado (bayer.in news 2026).

### Plataformas e preço
- **Android** (principal, Play Store), gratuito. Confiança: confirmado. iOS: não confirmado como foco (mercado indiano é Android-first).
- **Grátis** — sem assinatura. Confiança: confirmado.

### Fluxo de captura de foto e validação de qualidade (padrão-chave: HUMANO no loop)
- OBSERVADO: o usuário **envia foto da lavoura afetada** e **agrônomos especialistas analisam a imagem** e devolvem diagnóstico + solução de manejo. Ou seja, o diagnóstico por foto é **assíncrono e humano-assistido**, não IA instantânea. Confiança: confirmado (Medium oficial FarmRise, jun/2025).
- Desde 2025 há também um **chatbot com IA** para respostas instantâneas a perguntas de cultivo. Confiança: confirmado. → arquitetura híbrida: IA para perguntas rápidas + humano para o diagnóstico visual sério.

### Top-k / confiança / diferencial
- Não é um motor top-k de visão computacional público; o valor é **diagnóstico humano confiável + advisory da marca Bayer**. Confiança: confirmado/inferido.
- Diferencial: credibilidade de marca (Bayer) + conselho de cientistas/agrônomos + integração com clima e preços de mercado local (mandi). Confiança: confirmado.

### Comportamento "não sei" / escalada
- Como o diagnóstico visual passa por humano, o "não sei" é absorvido pelo especialista (pede mais detalhes, contextualiza). O chatbot cobre o "pergunta rápida". Confiança: inferido.

### Velocidade
- Chatbot IA: instantâneo. Diagnóstico por foto (humano): **latência de horas** (assíncrono). Confiança: inferido — trade-off clássico "rápido e raso (IA)" vs "lento e confiável (humano)".

### Offline
- Não confirmado offline; conteúdo advisory pode ser consultável, mas diagnóstico/clima/preços exigem rede. Confiança: inferido.

### Biblioteca / conteúdo
- **Hub agregado**: advisory agronômico diário, previsão do tempo local, **preços de mercado (mandi)**, esquemas do governo, conteúdo por cultura. "Locate My Farm" para dados locais. Confiança: confirmado.
- Multilíngue forte: **10 idiomas** em 15 estados (hindi, kannada, marathi, telugu, etc.). Confiança: confirmado.

### Comunidade / especialista humano
- **Sim, central** — agrônomos da Bayer analisam fotos e dão conselho. É o coração da confiança do produto. Confiança: confirmado.

### Monetização (por que uma multinacional dá de graça)
- App **grátis como topo de funil de insumos**: a Bayer vende sementes/defensivos; o advisory gratuito gera relacionamento, dados e recomendação (implícita/explícita) de manejo que favorece o ecossistema de produtos Bayer. É estratégia "phygital" de fidelização e distribuição. Confiança: confirmado/inferido (posicionamento público Bayer).

### Reclamações / limitações (paráfrase)
- Diagnóstico por foto depende de disponibilidade/tempo de agrônomo → não é instantâneo. (inferido)
- Forte viés Índia (idiomas, culturas, mandi) → conteúdo pouco portável direto ao Brasil. (inferido)

### Fontes
- https://farmrise.bayer.com/ (2026-07-19, confirmado)
- https://play.google.com/store/apps/details?id=com.climate.farmrise (2026-07-19, confirmado)
- https://medium.com/@bayerfarmrise/... (jun/2025, confirmado — descreve foto→agrônomo)
- https://www.bayer.in/en-in/media/news/2026/... 5M usuários (2026-07-19, confirmado)

### Lição aplicável ao Rumo Pragas
- **Modelo híbrido IA + humano é a régua de confiança do smallholder**: IA instantânea para o comum + escalada opcional para especialista no caso difícil. Rumo Pragas pode diferenciar oferecendo IA GRÁTIS instantânea (que a FarmRise só faz via chatbot), reservando o "humano" para casos de baixa confiança.
- **O app vencedor em mercado emergente é um HUB, não um recurso único**: diagnóstico + clima + preço + conteúdo por cultura num só lugar. O usuário BR de baixo/médio porte espera esse pacote — diagnóstico isolado retém menos.
- **"Grátis" tem modelo de negócio por trás (funil de insumo)** — a Bayer prova que advisory gratuito em escala é sustentável como aquisição. Para o Rumo Pragas (grátis por decisão do CEO), a lição é que o valor futuro pode vir de dados/relacionamento/cross-sell no ecossistema AgroRumo, não de paywall.
- **Multilíngue/vernáculo é decisivo em base ampla** — no Brasil o análogo é linguagem simples, regionalismos e leitura fácil para o produtor com baixa proficiência de smartphone.
