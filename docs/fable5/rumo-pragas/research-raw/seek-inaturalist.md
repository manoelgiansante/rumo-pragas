# Dossiê R4 — Seek by iNaturalist

> Pesquisa de mercado defensiva, produto próprio (Rumo Pragas). Fontes públicas. Data de acesso: 2026-07-19.

### Identidade
- App gratuito de identificação de organismos (plantas, insetos, animais, fungos), da **iNaturalist** (parceria California Academy of Sciences + National Geographic). Confiança: confirmado (apps.apple.com id 1353224144).
- Filosofia: educação/biodiversidade + gamificação, com forte apelo de **privacidade para crianças** (não exige login, não coleta localização precisa por padrão). Confiança: confirmado.

### Plataformas e preço
- **iOS + Android**, **100% grátis, sem assinatura, sem anúncios**. Confiança: confirmado. → mesmo modelo do Rumo Pragas.

### Fluxo de captura de foto e validação de qualidade (o diferencial forte)
- **Identificação em tempo real pela câmera AO VIVO**, antes mesmo de tirar a foto: aponta e o nome aparece no topo. Confiança: confirmado (blog iNaturalist "Seek 2.0", Bay Nature).
- OBSERVADO/chave: a UI **guia o usuário a uma foto melhor** — uma fileira de "pontos" no topo representa a árvore taxonômica; conforme o usuário chega mais perto / enquadra melhor, os pontos vão preenchendo em direção a "espécie". Ou seja, a própria interface faz **coaching de qualidade de foto** de forma visual e contínua. Confiança: confirmado.

### Top-k / confiança / "escada taxonômica" (o padrão mais importante deste dossiê)
- Em vez de cravar espécie de qualquer jeito, o Seek **sobe na escada taxonômica até o nível em que tem confiança**: de longe pode dizer só "grupo: dicotiledônea"; aproximando, refina para gênero e então espécie. Confiança: confirmado (Bay Nature).
- Ou seja, o comportamento de incerteza é **explícito e honesto**: ele prefere dar uma resposta CERTA porém genérica ("é uma joaninha / família X") do que uma espécie ERRADA. Confiança: confirmado.

### Comportamento "não sei"
- Não existe "não sei" cru — existe "subir de nível". Se não consegue espécie, entrega o táxon superior confiável e sinaliza (via pontos não preenchidos) que precisa de mais proximidade/detalhe. Confiança: confirmado.

### Velocidade
- Tempo real (on-device), reconhecimento instantâneo no viewfinder. Confiança: confirmado.

### Offline
- **Funciona 100% offline** — o modelo de visão roda no dispositivo, sem internet. Confiança: confirmado (post iNaturalist "56. Seek offline database"). Diferencial enorme para uso em campo sem sinal.

### Biblioteca / base de conhecimento
- Baseado em **milhões de observações do iNaturalist**. Fichas de espécie, badges, "desafios" mensais, coleção pessoal (gamificação). Confiança: confirmado.

### Comunidade / especialista humano
- O **Seek em si é solo/offline** (sem envio à comunidade por padrão, pró-privacidade). A validação por humanos/especialistas mora no **app irmão iNaturalist** (não no Seek). Confiança: confirmado. → separação deliberada: ferramenta pessoal (Seek) × plataforma de ciência-cidadã com curadoria humana (iNaturalist).

### Monetização
- Não monetiza — financiado por instituições/ONGs (Academy of Sciences, Nat Geo). Confiança: confirmado.

### Reclamações recorrentes em reviews (paráfrase, máx. 1 frase cada)
- Precisa chegar MUITO perto para identificar; erra à distância mesmo com o bicho visível. (confirmado, ★3)
- Percepção de que uma atualização "piorou" o reconhecimento vs. antes. (confirmado, ★2)
- Não identifica animais domésticos/raças de cães (fora do escopo de biodiversidade). (confirmado, ★3)

### Fontes
- https://apps.apple.com/us/app/seek-by-inaturalist/id1353224144 (2026-07-19, confirmado)
- https://itunes.apple.com/us/rss/customerreviews/id=1353224144/... (reviews, 2026-07-19, confirmado)
- https://www.inaturalist.org/blog/23075-real-time-computer-vision-predictions-in-seek-by-inaturalist-version-2-0 (2026-07-19, confirmado)
- https://baynature.org/2019/06/24/... (2026-07-19, confirmado)
- https://www.inaturalist.org/posts/44986-56-seek-offline-database... (offline, 2026-07-19, confirmado)

### Lição aplicável ao Rumo Pragas
- **A "escada taxonômica" é o padrão de ouro de honestidade de IA**: quando a confiança na espécie cai, RESPONDER O NÍVEL SUPERIOR CERTO ("é um percevejo / é uma ferrugem foliar") em vez de cravar espécie errada. Aumenta confiança e reduz o dano de recomendar o manejo errado.
- **Coaching de foto embutido na câmera ao vivo** (pontos que preenchem conforme melhora o enquadramento) é a melhor UX de captura da categoria — muito superior a "tire a foto e torça". Ótimo alvo de inspiração para o fluxo de câmera do Rumo Pragas.
- **Offline on-device é um diferencial real de campo** — no agro brasileiro com conectividade fraca, uma triagem on-device (mesmo que grosseira) antes de chamar a nuvem seria um trunfo de UX e de custo.
