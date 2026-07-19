# Dossiê R4 — Pl@ntNet

> Pesquisa de mercado defensiva, produto próprio (Rumo Pragas). Fontes públicas. Data de acesso: 2026-07-19.

### Identidade
- Plataforma científica de **ciência cidadã** de identificação de plantas por foto, mantida por consórcio de pesquisa francês (Cirad, INRAE, INRIA, IRD). Confiança: confirmado.
- Um dos apps de ID de plantas mais usados no mundo, forte na Europa e presente no Brasil. Total acumulado: **~1,487 bilhão de identificações**. Confiança: confirmado (my.plantnet.org).

### Plataformas e preço
- **App iOS + Android grátis** (uso pessoal). Confiança: confirmado.
- **API pública** para desenvolvedores/organizações: my.plantnet.org — plano gratuito com cota diária + **Pro Plan por contrato** (ex.: 200.000 requisições upfront, cota diária alta, faturamento por uso excedente, contrato de 12 meses). Confiança: confirmado (my.plantnet.org/pricing).

### Fluxo de captura de foto e validação de qualidade (padrão-chave)
- **Seleção de ÓRGÃO da planta** antes/junto da foto: folha, flor, fruto, casca/tronco, ou hábito inteiro — ou `auto` para a IA detectar o órgão. Confiança: confirmado (docs API `organs`).
- Permite enviar **1 a 5 fotos do MESMO indivíduo** (órgãos diferentes) numa consulta para refinar a resposta. Confiança: confirmado (docs API identify).
- Restrições técnicas OBSERVADAS: JPEG/PNG, POST total ≤ 50 MB. Confiança: confirmado.

### Top-k / confiança / diferencial
- Retorna **lista ranqueada de espécies mais prováveis com score de confiança 0–1** por espécie, + **fotos de referência** de cada candidata para o usuário comparar visualmente. Confiança: confirmado.
- Base: **~78.795 espécies**, nomes comuns em **54–60 idiomas**, ~6 atualizações de modelo/ano. Confiança: confirmado. Cobertura por "flora regional" (o usuário pode restringir à flora do seu país/continente → melhora acurácia). Confiança: confirmado/inferido.

### Comportamento "não sei"
- OBSERVADO: entrega top-k com scores; se a melhor candidata tem score baixo, o usuário vê isso e pode adicionar mais fotos/órgãos. A validação COMUNITÁRIA (abaixo) é o mecanismo de correção quando a IA erra. Confiança: confirmado.
- Uma review ★1 aponta falha real: **"não conseguiu fotografar a planta e não deu instrução de como corrigir"** — ou seja, quando o app rejeita a foto, o feedback de recuperação é fraco. Confiança: confirmado (review iOS).

### Velocidade
- Resposta de nuvem em poucos segundos (é API online). Confiança: inferido.

### Offline
- **NÃO funciona offline** — requer conexão (contraste direto com o Seek). Confiança: confirmado/inferido (é serviço de nuvem).

### Biblioteca / base de conhecimento
- Ficha da espécie, fotos de referência da comunidade, mapa de observações, dados taxonômicos abertos. Confiança: confirmado.

### Comunidade / especialista humano (diferencial)
- **Cada identificação alimenta um banco de ciência cidadã**; a **comunidade vota/confirma** as identificações, o que retroalimenta e melhora o modelo. Confiança: confirmado. → o "humano no loop" aqui é a MASSA de usuários, não um especialista pago.

### Limitação declarada importante
- Pl@ntNet **identifica a ESPÉCIE, não diagnostica doença/praga** de forma clínica (embora a base taxonômica inclua alguns fitopatógenos). O foco é "que planta é essa", não "o que essa planta tem". Confiança: confirmado/inferido. → deixa aberto exatamente o espaço do Rumo Pragas (diagnóstico de problema, não só ID da planta).

### Reclamações recorrentes em reviews (paráfrase, máx. 1 frase cada)
- Falha ao capturar a foto sem orientar como resolver. (confirmado, ★1)
- Elogios dominam: mais preciso e gratuito que os concorrentes, bom para distinguir "flor x erva daninha". (confirmado, vários ★5)

### Fontes
- https://apps.apple.com/us/app/... (id 600547573) + reviews RSS (2026-07-19, confirmado)
- https://my.plantnet.org/ e https://my.plantnet.org/pricing (2026-07-19, confirmado)
- https://my.plantnet.org/doc/api/identify e /doc/getting-started/pro-plan (2026-07-19, confirmado)
- https://docs.plantnet.org/en/reference/api-plantnet/ (2026-07-19, confirmado)

### Lição aplicável ao Rumo Pragas
- **Perguntar o "órgão"/contexto antes de diagnosticar** é um padrão que o usuário já conhece: no Rumo Pragas, um passo leve de "é folha? caule? fruto? qual cultura?" antes de mandar pra IA aumenta muito a acurácia e o usuário aceita bem (Pl@ntNet provou que funciona em escala de bilhão de fotos).
- **Múltiplas fotos do mesmo caso (1–5) refinam o diagnóstico** — permitir anexar 2–3 ângulos da mesma lesão é um padrão esperado e barato.
- **Mostrar fotos de referência das candidatas** (para o usuário comparar "parece com esta?") é validação visual poderosa — o Rumo Pragas deveria exibir imagens de referência da praga/doença diagnosticada, não só texto.
- Pl@ntNet identifica planta mas **não diagnostica doença**: esse é o espaço de mercado que o Rumo Pragas ocupa — comunicar que somos o "o que essa planta TEM", não o "que planta é essa".
