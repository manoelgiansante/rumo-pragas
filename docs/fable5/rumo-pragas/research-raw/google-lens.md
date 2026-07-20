# Dossiê R4 — Google Lens (baseline "grátis universal")

> Pesquisa de mercado defensiva, produto próprio (Rumo Pragas). Fontes públicas. Data de acesso: 2026-07-19.
> Objetivo: entender o que o usuário BR JÁ tem de graça no bolso — a régua mínima que o Rumo Pragas precisa superar. Baseado em docs/páginas públicas; NÃO inventar comportamento.

### Identidade
- **Google Lens** — busca visual multimodal do Google, embutida no app Google, Google Photos, Chrome e câmera Android de muitos aparelhos. Confiança: confirmado.
- É genérico (produtos, texto, tradução, lugares, plantas) — **não é um app agronômico**. Confiança: confirmado.

### Plataformas e preço
- **Grátis, universal**, iOS + Android (e web via Chrome/Photos). **Já pré-instalado** em grande parte dos Androids brasileiros. Confiança: confirmado. → é o concorrente "default" mais perigoso porque tem custo zero e fricção zero de instalação.

### Fluxo de captura e resultado
- Aponta a câmera (ou usa foto existente) → Lens faz **correspondência visual** e devolve **resultados de busca**: possíveis correspondências, imagens semelhantes, nome (científico quando reconhece planta), links de artigos, dicas de cuidado. Confiança: confirmado (docs/help + write-ups públicos).
- Para folha doente / praga: OBSERVADO em material público — Lens **pode sugerir prováveis correspondências com nome e imagens** e às vezes tratamentos, analisando textura/padrão/contraste. Confiança: confirmado (ALEGADO em guias de terceiros; a "análise entomológica" é linguagem de marketing dos blogs, não spec oficial → tratar precisão como inferido).

### Top-k / confiança
- Não entrega um score de confiança agronômico nem um diagnóstico estruturado — entrega **resultados de busca visual ranqueados** que o usuário interpreta. Confiança: confirmado. Não há "top-3 doenças com % e manejo".

### Comportamento "não sei" / limitações (o ponto-chave)
- Fontes públicas são explícitas: para doença/dano de praga, **os resultados do Lens são PRELIMINARES** e um diagnóstico real costuma exigir exame de especialista ou laboratório. Confiança: confirmado.
- Precisão **varia muito**: bom para espécie comum e bem documentada, fraco para casos raros, híbridos ou **específicos de região** (culturas/pragas do Brasil tropical são exatamente o ponto fraco). Confiança: confirmado.
- Lens confunde "que planta é" com "o que a planta tem" — ele identifica melhor a ESPÉCIE do que DIAGNOSTICA o problema. Confiança: confirmado/inferido.

### Velocidade
- Rápido (segundos), resultado instantâneo de busca. Confiança: confirmado.

### Offline
- Requer conexão (é busca na nuvem do Google). Confiança: inferido/confirmado.

### Biblioteca / especialista
- Não tem base agronômica curada nem manejo estruturado nem especialista humano — é busca visual genérica + links da web. Confiança: confirmado.

### Monetização
- Não monetiza diretamente; é feature do ecossistema Google (dados/engajamento de busca). Confiança: inferido.

### Fontes
- Guias/help públicos sobre Google Lens plant/disease ID (ubos.tech, simplysmartgardening.com, aidirectori.es) (2026-07-19; terceiros = ALEGADO/inferido para precisão)
- support.google.com (Search Community) sobre ID de plantas (2026-07-19, confirmado que o recurso existe)
- Vídeos públicos "identify leaf diseases using Google Lens" (2026-07-19, demonstram o comportamento)

### Lição aplicável ao Rumo Pragas
- **O usuário BR já tem um "identificador grátis" universal no bolso (Lens) — então o Rumo Pragas NÃO pode ser só "mais um que dá o nome"**. O que o Lens NÃO faz e é a nossa cunha: (1) **diagnóstico estruturado** (top-k de praga/doença com % de confiança), (2) **manejo acionável** específico da cultura brasileira, (3) **severidade/nível de dano econômico**, (4) **contexto regional/tropical** que o Lens erra.
- **Enquadrar o valor como "diagnóstico + o que fazer", não "identificação"** — competir com o Lens no jogo do "nome da coisa" é perder; ganhar é entregar a AÇÃO agronômica confiável que o Lens declara não fazer ("resultado preliminar, procure especialista").
- **Velocidade e fricção-zero do Lens são a régua de UX**: o Rumo Pragas precisa ser TÃO rápido/simples quanto apontar o Lens, senão o usuário volta pro default grátis. Abrir → fotografar → diagnóstico em segundos, sem cadastro pesado.
- **Ser especialista e regional é o fosso** contra um generalista global — a curadoria de pragas/doenças de culturas BR e a linguagem do produtor brasileiro são exatamente onde o Lens é fraco.
