# Auditoria competitiva — Rumo Pragas

Pesquisa atualizada em 2026-07-14. Métricas de loja, preços e ofertas mudam; os valores abaixo são
o retrato público da data, sem inferir preço quando o fornecedor exige demonstração ou proposta.
Claims dos concorrentes foram tratados como claims dos próprios fornecedores, não como validação
independente de eficácia.

## Mercado e modelos de produto

| Produto | Mercado e alcance público | Capacidades e modelo comercial | Impacto para o Rumo Pragas | Decisão executada |
| --- | --- | --- | --- | --- |
| [Agrio](https://agrio.app/) | Concorrente direto internacional e provedor visual atual; Google Play mostrava 4,3, cerca de 4,66 mil avaliações e 500 mil+ downloads | Diagnóstico visual, MIP, comunidade/especialista, parcelas, alertas, clima e satélite; app com anúncios/IAP. A [API](https://pro.agrio.app/image-diagnosis-api/pricing) oferece pacote inicial de 1.000 créditos e créditos adicionais a US$ 0,05; o preço inicial não estava exposto | A dependência exige transparência, timeout, falha segura e nenhuma promessa de acurácia própria | **IMPLEMENTADO E TESTADO:** Agrio como padrão, Claude configurável no servidor, hipótese/confiança/alternativas, imagem inválida, fila de retry e disclosure. Satélite, equipe e consultoria humana são **NÃO APLICÁVEIS** ao produto individual desta versão |
| [Plantix](https://plantix.net/en/) | Líder direto Android; [Google Play](https://play.google.com/store/apps/details?id=com.peat.GartenBank) mostrava 4,3, 108 mil avaliações e 10 milhões+ downloads | Diagnóstico gratuito com anúncios, biblioteca, tratamento, alertas, clima, calculadora e comunidade. A oferta [Plantix Intelligence](https://plantix.net/mr/plantix-intelligence/) comercializa API/dados por demonstração | Demonstra valor de biblioteca ampla e ajuda humana, mas também concentra risco de prescrição, moderação e compartilhamento de geodados | **IMPLEMENTADO E TESTADO:** biblioteca MIP educacional, aviso profissional, alternativas e relatório de conteúdo. Comunidade, marketplace, calculadora de insumo e tratamento prescritivo são **NÃO APLICÁVEIS** sem especialistas verificados, moderação e controles regulatórios |
| [PictureThis](https://play.google.com/store/apps/details?id=cn.danatech.xingseus) | Líder indireto de consumo; Google Play mostrava 4,6, cerca de 779 mil avaliações e 50 milhões+ downloads; App Store mostrava 4,8 e cerca de 1,1 milhão de avaliações | Identificação, diagnóstico, cuidado e especialista, com compra/assinatura; foco principal em jardinagem, não lavoura comercial | Prova que captura simples converte, mas avaliações expõem inconsistência de orientação, divergência entre anúncio e função e atrito de trial/cobrança | **IMPLEMENTADO E TESTADO:** ação primária simples, copy correspondente ao produto, app gratuito sem anúncio/compra e saída probabilística. Rotinas de jardim e assinatura são **NÃO APLICÁVEIS** |
| [Aegro](https://aegro.com.br/) | Solução indireta brasileira de gestão rural | Safra, financeiro, estoque, MIP, fotos/geolocalização, equipe, relatórios, offline, máquinas e API. [Oferta pública](https://aegro.com.br/teste-gratis/) indicava teste de 7 dias e planos a partir de R$ 99/mês | Define a expectativa brasileira de operação com conectividade rural ruim e histórico útil | **IMPLEMENTADO E TESTADO:** fila local com retry, histórico estruturado e PDF. Offline completo, talhão, equipe, estoque, fiscal, máquinas e API empresarial são **NÃO APLICÁVEIS** ao escopo de triagem individual |
| [DigiFarmz](https://www.digifarmz.com/pt-br) | Concorrente brasileiro de decisão agronômica; preço sob demonstração | Modelos preditivos com mais de 50 parâmetros, histórico de doenças, recomendação por talhão, plataforma de consultoria e assistente no WhatsApp | A diferenciação depende de pesquisa agronômica e dados de talhão; copiar apenas a aparência produziria prescrição sem base | **IMPLEMENTADO E TESTADO:** contexto de cultura, clima opcional e assistente educacional com avisos. “O que/quando/quanto aplicar”, programa fungicida e WhatsApp prescritivo são **NÃO APLICÁVEIS** sem validação agronômica e fluxo legal próprio |
| [Tarvos](https://www.linkedin.com/company/tarvosagro) | Startup brasileira de monitoramento automatizado; preço empresarial não público | Armadilhas eletrônicas, visão computacional, dinâmica populacional e previsão de estágios de pragas | É detecção contínua por hardware, não diagnóstico pontual por câmera de celular | Armadilha, contagem populacional e previsão regional são **NÃO APLICÁVEIS**: exigem hardware, calibração por espécie, instalação e uma operação B2B distinta |
| [Cromai](https://www.cromai.com/) | Agtech brasileira de visão computacional; preço sob proposta | Imagens aéreas para localizar/classificar daninhas, arquivos de pulverização localizada e inspeção de cana | Mostra a direção de IA especializada e geoespacial validada por cultura | Drone, segmentação aérea e mapa de pulverização são **NÃO APLICÁVEIS** ao fluxo por foto; o Rumo Pragas não apresenta área, severidade medida nem arquivo de aplicação |
| [Auravant](https://www.auravant.com/pt/ajuda-pt/primeiros-passos/o-que-e-auravant/) | Plataforma latino-americana de agricultura digital, com presença no Brasil | Plano gratuito e Premium mensal/anual, monitoramento por satélite, mapas, scouting, integrações e contas empresariais; a [página de preços](https://www.auravant.com/pt/pricing-pt/) não renderizava valores estáveis na consulta | Reforça colaboração e mapas para consultorias, além de flexibilidade comercial | Localização opcional minimizada e histórico estão implementados. Espaços, satélite, mapa de talhões, extensões e licenças são **NÃO APLICÁVEIS** ao produto individual atual |
| [Cropwise Protector](https://www.cropwise.com/protector) | Plataforma empresarial global da Syngenta; preço sob contato | Scouting, infestação, tarefas, custo, estoque, zonas de manejo, mapas e integrações com John Deere, Trapview, ERPs e API aberta | Compete com equipes técnicas e operações completas, não com entrada leve de identificação | PDF e histórico cobrem o job de compartilhamento desta versão. Equipe, inventário, ordem de serviço, integração de máquinas e decisão de pulverização são **NÃO APLICÁVEIS** |
| [xarvio SCOUTING](https://www.xarvio.com/) | Scouting especializado internacional; preço varia por mercado | Modelos estreitos para doença/daninha, análise de armadilhas, nitrogênio e dano foliar | Evidencia que medição confiável requer captura e dataset dedicados | O app não anuncia contagem, nitrogênio ou dano medido. Essas funções são **NÃO APLICÁVEIS** sem protocolo, dataset e validação separados |
| [Solinftec ALICE AI](https://www.solinftec.com/en-us/alice-ai-platform/) | Plataforma brasileira/global de operação agrícola; preço empresarial | Telemetria, logística, monitoramento, robótica e automação operacional | É uma categoria de capital e integração completamente diferente | Automação de fazenda, máquina e robô são **NÃO APLICÁVEIS**; o posicionamento ficou restrito a triagem visual assistida |

## Evidência de avaliações e dores recorrentes

Números são voláteis e avaliações individuais não medem eficácia clínica/agronômica, mas revelam
fricção real de uso:

| Evidência pública em 2026-07-14 | Dor observada | Resposta terminal no candidato |
| --- | --- | --- |
| [Agrio no Google Play](https://play.google.com/store/apps/details?id=com.agrio) e [avaliações na App Store](https://apps.apple.com/gb/app/agrio-plant-diagnosis-app/id1239193220?see-all=reviews) | Identificação errada ou inconclusiva, processamento que não termina, expectativa de especialista e irritação com anúncio/assinatura | **IMPLEMENTADO E TESTADO:** timeout/erro, retry, incerteza, alternativas, feedback, app sem anúncio e sem paywall |
| [Plantix no Google Play](https://play.google.com/store/apps/details?id=com.peat.GartenBank) | Rejeição repetida por foto borrada e lacunas de idioma, ao lado de avaliações positivas sobre utilidade | **IMPLEMENTADO E TESTADO:** orientação de captura, estado de imagem inválida e interface pt-BR/en/es; não promete cobertura universal |
| [PictureThis no Google Play](https://play.google.com/store/apps/details?id=cn.danatech.xingseus) | Resultado contraditório, função percebida abaixo do anúncio e confusão com cobrança/trial | **IMPLEMENTADO E TESTADO:** metadata compatível com o fluxo, resultado probabilístico e modelo gratuito sem assinatura |
| [Plant App na App Store](https://apps.apple.com/us/app/plant-app-plant-identifier/id1595795215) | Recurso bloqueado por paywall e falta de opções quando a IA erra | **IMPLEMENTADO E TESTADO:** acesso gratuito, hipóteses alternativas e feedback do diagnóstico |

## Movimento tecnológico relevante

| Movimento atual | Valor real | Estado no Rumo Pragas |
| --- | --- | --- |
| Modelos multimodais com contexto | Cultura, sintomas e contexto ajudam a evitar uma classe única sem explicação | **IMPLEMENTADO E TESTADO:** cultura, hipótese, confiança, alternativas e contexto opcional minimizado |
| API especializada em vez de modelo genérico | Agrio e Plantix Intelligence expõem motores com corpus agrícola | **IMPLEMENTADO E TESTADO:** rota visual especializada padrão e fallback configurável; fornecedor é divulgado |
| Human-in-the-loop e feedback | Discordância e imagem problemática precisam voltar ao ciclo de qualidade | **IMPLEMENTADO E TESTADO:** feedback de diagnóstico e denúncia de conteúdo de IA com moderação administrativa |
| Edge/offline | Útil no campo, mas um modelo desatualizado ou grande demais pode trocar disponibilidade por erro silencioso | **NÃO APLICÁVEL:** não há modelo on-device validado; o candidato declara análise online e preserva pedido em fila para retry |
| Sensores, armadilhas, satélite e drones | Transformam foto isolada em série temporal e área mensurável | **NÃO APLICÁVEL:** requer hardware/dataset/operação empresarial; nenhuma copy sugere que o app já mede área ou população |
| Geração agronômica aterrada em fontes | Reduz alucinação, mas não transforma LLM em prescritor nem valida produto/dose | **IMPLEMENTADO E TESTADO:** conteúdo MIP educacional, restrições de prescrição e referência ao AGROFIT; seleção de produto/dose é bloqueada |
| Transparência e governança de IA | Consentimento, fornecedor, contestação e exclusão reduzem risco jurídico e de confiança | **IMPLEMENTADO E TESTADO NO CANDIDATO:** consentimentos por finalidade, report/feedback e exclusão dos dados do app; comprovação contratual de compartilhamento/retensão permanece **BLOQUEADA EXTERNAMENTE** aos contratos dos provedores |

## Fechamento de lacunas

| Lacuna | Prioridade | Estado obrigatório | Evidência |
| --- | --- | --- | --- |
| Certeza indevida | P0 | **IMPLEMENTADO E TESTADO** | Hipótese, confiança, alternativas, baixo sinal e validação profissional no produto e metadata |
| Conteúdo químico prescritivo | P0 | **IMPLEMENTADO E TESTADO** | Produto/dose não são promessa pública; MIP é educacional e aponta profissional/AGROFIT |
| Imagem inadequada e falha do provedor | P1 | **IMPLEMENTADO E TESTADO** | Estados de imagem inválida, timeout, erro e retry |
| Internet rural instável | P1 | **IMPLEMENTADO E TESTADO** | Fila local e recuperação após reconexão; nenhuma alegação de inferência offline |
| Contestação e abuso de IA | P1 | **IMPLEMENTADO E TESTADO** | Feedback de diagnóstico, denúncia de resposta e fluxo administrativo |
| Histórico e compartilhamento | P1 | **IMPLEMENTADO E TESTADO** | Histórico estruturado e PDF sem afirmar que a imagem é persistida |
| Fricção de assinatura/anúncio | P1 | **NÃO APLICÁVEL POR DECISÃO COMERCIAL COMPROVADA** | Cliente gratuito, sem SDK/caminho ativo de compra, trial, plano ou anúncio |
| Comunidade e especialista em tempo real | P2 | **NÃO APLICÁVEL** | Sem quadro verificado/moderação/SLA; o chat permanece educacional e não se apresenta como profissional |
| Gestão completa da fazenda | P3 | **NÃO APLICÁVEL** | Outro ICP, modelo multiusuário, integrações e estrutura de dados; não é defeito da triagem individual |
| Hardware/satélite/drones | P3 | **NÃO APLICÁVEL** | Exigem produto, captura, contratos e validação independentes |
| Contratos de tratamento/compartilhamento dos provedores | P0 legal | **BLOQUEADO EXTERNAMENTE** | DPO/operador precisa obter termos vigentes sobre treinamento, retenção, região e papel de serviço; o repositório não inventa garantias |
| Copy pública antiga nas lojas e landing | P0 comunicação | **BLOQUEADO EXTERNAMENTE** | Arquivos canônicos e candidato web foram corrigidos/testados; consoles e deploy de produção ainda exigem autorização autenticada |

## Diferencial aceito para o lançamento

- pt-BR como idioma principal, com interface em inglês e espanhol.
- Gratuito, sem anúncio, compra, trial ou interrupção por paywall.
- Hipótese com confiança e alternativas, não um rótulo definitivo.
- Fila explícita para conectividade intermitente.
- MIP educacional, feedback/denúncia e validação humana visível.
- Exclusão dos dados do Rumo Pragas e consentimento separado de localização/IA.
- Enquadramento brasileiro por Lei nº 14.785/2023, Resolução Confea nº 1.149/2025 e
  [AGROFIT](https://www.gov.br/agricultura/pt-br/assuntos/insumos-agropecuarios/insumos-agricolas/agrotoxicos/agrofit).

Todos os itens acima são estados implementados ou bloqueios externos explícitos; não são roadmap.
