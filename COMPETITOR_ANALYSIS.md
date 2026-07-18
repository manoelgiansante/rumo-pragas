# Analise Competitiva Internacional - Rumo Pragas IA

> [!CAUTION]
> **ARQUIVO HISTÓRICO — NÚMEROS, PREÇOS E CLAIMS NÃO ESTÃO APROVADOS PARA PUBLICAÇÃO.**
> Use `docs/audit/competitive-matrix-2026-07-14.md`, que registra fontes e data de verificação.
## Pesquisa de Concorrentes para Posicionamento como #1 no Brasil

**Data:** 2026-03-25
**Objetivo:** Mapear os melhores apps internacionais de identificacao de pragas e gestao agricola para definir roadmap competitivo do Rumo Pragas.

---

## ATUALIZACAO 2026-07-02 — MEGA-AUDIT LANÇAMENTO (delta rápido)

> Revalidação completa + tabela nova + TOP 10 features priorizadas em `AUDIT/06_CONCORRENTES.md`. Resumo do delta:
> - **Aegro EM ACELERAÇÃO:** cresceu >30% no 1º tri/2026, meta anual revisada R$38M→R$42M. Segue R$500+/mês e SEM IA de foto.
> - **ADICIONADOS ao radar:** **InCeres** (precisão BR, satélite/fertilidade/monitoramento manual, B2B, sem IA de foto) e **FarmSense** (FlightSensor — sensor óptico de contagem de insetos, hardware B2B EUA, sem presença BR; tendência, não ameaça).
> - **Agrio** tem listing PT-BR na App Store BR ("Agrio: fitossanitário") — presença BR crescente, freemium pago US$4–32/mês confirmado.
> - **Plantix, Cropwise, Farmbox, Pragueiro, manejo.app, Embrapa:** sem mudança de modelo. Nenhum concorrente novo com IA de foto grátis PT-BR detectado.
> - **Código atual JÁ cobre** P0.5, P0.7 (share texto) e P0.8 (confiança+alternativas) do roadmap abaixo, além de clima (Open-Meteo), alertas clima→risco com push, chat IA e fila offline de diagnóstico — checar `AUDIT/06_CONCORRENTES.md` §4 antes de citar gaps deste doc.

## ATUALIZACAO 2026-07-01 — REVALIDACAO + MUDANCA DE POSICIONAMENTO (100% GRATIS)

> Revalidado via firecrawl-search (Google Play, App Store, sites oficiais). Os dados de mercado abaixo (Plantix, Agrio, Aegro, Cropwise, Farmbox, Pragueiro) permanecem VALIDOS. Mudanca principal e no NOSSO app.

### MUDANCA CRITICA: Rumo Pragas agora e 100% GRATIS, sem paywall
- Codigo (`expo-app/app/(tabs)/index.tsx`, `app/paywall.tsx`, `app/(tabs)/settings.tsx`): **diagnosticos ILIMITADOS para todos**, paywall NEUTRALIZADO (rota inerte, sem botao de compra em lugar nenhum), motivado por Apple Guideline 2.3.2. O `FREE_MONTHLY_DIAGNOSES = 3` ainda existe como fallback mas o gate de Pro esta desligado.
- Consequencia: a tabela de precos Free/Basico/Pro (R$19,90 / R$49,90) das secoes abaixo esta **SUPERADA**. Nao ha upsell hoje. O posicionamento deixa de ser "freemium generoso" e passa a ser **"gratis de verdade, ilimitado, sem pegadinha"**.

### Mapa GRATIS vs PAGO do mercado BR (o eixo que importa agora)
| App | ID por foto (IA) | Preco real | Limite no gratis |
|---|---|---|---|
| **Rumo Pragas** | **Sim** | **GRATIS total** | **Nenhum (ilimitado)** |
| Plantix | Sim | Gratis **com anuncios** | Diagnostico ok, mas monetiza com ads + venda de insumo |
| Agrio | Sim | **Freemium PAGO** ($4–$32/mes por hectare) | Individual basico so |
| Aegro | Nao (registro manual) | **PAGO forte** (planos a partir de ~R$500+/mes; Plano Premium/BI) | So teste gratis |
| Cropwise Protector (Syngenta) | Parcial (IA prioriza) | **B2B via canal** (nao self-serve) | Nao ha gratis publico |
| Farmbox (Checkplant) | Nao (georref. manual) | **Pago** (via Conecta.ag; "monitoramento gratuito" e chamariz, plataforma e paga) | Limitado |
| Pragueiro (upCampo) | Nao | **Gratis ate 1.000 ha** | Acima de 1.000 ha e pago |
| Apps Embrapa (InNat, Bioinsumos, AgroPragas) | Nao (comparacao manual) | Gratis | Especificos por cultura, sem gestao |
| manejo.app (CNA/Agrolink — NOVO 2025) | A confirmar | Gratis (institucional) | Foco MIP, recem-lancado |

**Leitura estrategica:** o unico concorrente que hoje entrega **ID de praga por foto com IA + 100% gratis + ilimitado + PT-BR** e o Plantix — e o Plantix monetiza com anuncios e empurra venda de insumo, tem rating baixo (3.89) e foco India/hortalicas. Todos os apps BR fortes em pragas (Aegro, Cropwise, Farmbox) ou sao PAGOS/B2B ou NAO tem IA de foto. **A vaga "app de IA de pragas, gratis de verdade, feito pro produtor brasileiro" esta aberta.** Esse e o angulo de aquisicao.

### NOVO concorrente detectado (2025)
- **manejo.app** (CNA/Senar + Agrolink) — app de MIP para produtores, lancado em 2025, institucional/gratuito. Monitorar: pela distribuicao CNA/Senar pode ganhar base rapido (mesmo modelo do Conecta Produtor, que fez 100k produtores em 6 meses). Nao parece ter IA de foto — nossa vantagem se mantem.

---

## 1. PLANTIX (PEAT GmbH) - Lider Global

**Site:** plantix.net | **Origem:** Alemanha
**Downloads:** 34M+ (Google Play) | **Rating:** 3.89/5 (94K avaliacoes)
**Idiomas:** 20 idiomas locais

### Features Principais
- **Identificacao por IA:** 800 sintomas em 60+ culturas, precisao de 98%
- **Base de dados:** 120M+ imagens de culturas com sintomas
- **Tratamentos:** Opcoes convencionais E alternativas/organicas
- **Previsao meteorologica agricola:** Melhor horario para capina, pulverizacao e colheita
- **Calculadora de fertilizantes:** Demanda baseada no tamanho da area
- **Alertas de doencas:** Rastreamento de surtos ate nivel distrital
- **Comunidade:** 500+ especialistas respondendo perguntas de agricultores
- **Marketplace:** Conexao com vendedores locais de insumos

### Monetizacao
- **Gratuito** com anuncios
- Comissao sobre vendas de pesticidas geradas pelo app
- Licenciamento de dados/ML para empresas (BASF, Corteva)
- Consultas premium com especialistas

### Offline
- Informacoes essenciais disponiveis offline
- Diagnostico requer internet

### Diferenciais Unicos
- Parceria com Corteva Agriscience
- Maior base de imagens do mundo para ML agricola
- Fundadores fizeram PhD no Brasil (conhecem mercado)
- Radar de doencas por regiao

### Pontos Fracos
- Rating relativamente baixo (3.89)
- Interface pode ser confusa
- Nao tem app iOS nativo forte
- Foco maior em India/Asia

---

## 2. AGRIO - Agricultura de Precisao com IA

**Site:** agrio.app | **Downloads:** 580K+ | **Rating:** 4.55/5 (3.3K avaliacoes)

### Features Principais
- **Diagnostico por foto:** IA identifica doencas, pragas e deficiencias nutricionais
- **Monitoramento por satelite:** Imagens NDVI e indices avancados
- **IPM (Manejo Integrado de Pragas):** Protocolos baseados em pesquisa
- **Scouting:** App de monitoramento de campo com insights por satelite
- **Previsao meteorologica:** Dados por hora, hiperlocais, ao nivel do campo
- **GDD (Graus-dia):** Calculo do estagio de crescimento da planta
- **Alertas preditivos:** Big data + modelos meteorologicos para alertas antecipados
- **Clorofila foliar:** Monitoramento para aplicacao de fertilizante variavel
- **Workgroup:** Gestao de equipe com compartilhamento em tempo real

### Monetizacao
- **Gratis:** Uso individual basico
- **$4/mes:** Ate 200 hectares
- **$32/mes:** Ate 5.000 hectares

### Diferenciais Unicos
- Unico app que combina satelite + IA de foto + previsao + IPM
- Drones para deteccao (usado no Brasil com Embrapa)
- Modelagem de dispersao de pragas com dados meteorologicos
- Interface profissional para agronomos

### Pontos Fracos
- Base de usuarios relativamente pequena (580K)
- Poucos idiomas
- Complexidade pode afastar pequenos produtores

---

## 3. PICTURE THIS / PICTURE INSECT

### PictureThis
**Downloads:** 10M+ (Google Play) | **Rating:** 4.6/5 (1M+ avaliacoes iOS)

- **Identificacao:** 400K+ especies de plantas com 98% de precisao
- **1M identificacoes diarias**
- **Guias de cuidado detalhados:** Rega, solo, pragas
- **Diagnostico de doencas e pragas por foto**
- **Alerta de plantas toxicas** (pets e criancas)
- **Lembrete de rega** com notificacoes
- **Medidor de luz** para exposicao adequada
- **Consultoria com especialistas 24/7**

**Monetizacao:** Trial 7 dias gratis, depois $3.99-$49.99/ano

### Picture Insect
**Downloads:** 62K/mes Android | **Rating:** 4.28/5 (33K avaliacoes)

- **Identificacao visual + sonora** de insetos (reconhecimento de audio!)
- **Colecao pessoal** de especies identificadas
- **Modelo de IA novo (2024):** Reconhece insetos mesmo pouco visiveis

**Monetizacao:** Gratis com premium a partir de $3/mes

### Diferenciais Unicos
- UX extremamente polida e bonita
- Onboarding gamificado
- Reconhecimento de audio (Picture Insect)
- Volume massivo de usuarios

---

## 4. CROPIO (Cropwise Operations - Syngenta)

**Site:** cropwise.com | **Cobertura:** 70M+ hectares em 30+ paises

### Features Principais
- **Monitoramento satelital em tempo real** de campos
- **Mapas de saude de campo** com GPS, drones e imagens multiespectrais
- **Gestao de registros:** Semeadura, fertilizacao, pulverizacao, colheita
- **Previsao de rendimento:** Algoritmos com dados historicos + safra atual
- **Sensores IoT:** Coleta automatizada de dados de campo
- **VRA (Aplicacao de Taxa Variavel):** Mapas de prescricao
- **Rastreamento de insumos:** Fertilizantes, pesticidas, irrigacao
- **Relatorios detalhados:** ROI e tomada de decisao baseada em dados

### Monetizacao
- Planos empresariais (preco sob consulta)
- Integrado ao ecossistema Syngenta

### Diferenciais
- Plataforma aberta para desenvolvedores (2025)
- IA Cropwise em desenvolvimento
- Suite completa: Protector, Grower, Spray Assist, Operations

---

## 5. CLIMATE FIELDVIEW (Bayer)

**Site:** climate.com | **Integracao:** 60+ parceiros

### Features Principais
- **FieldView Drive 2.0:** Hardware com GPS integrado, sync automatico
- **Scripts de plantio:** +5 bu/ac vs scripts manuais
- **Imagens de saude de campo:** Satelite semanal
- **Scouting reports:** Relatorios de campo
- **Analise de dados:** Visualizacao e analise de plantio e colheita
- **Zone management:** Gerenciamento de zonas variaveis
- **Conectividade:** 60+ parceiros de equipamentos

### Monetizacao
- **Prime:** Gratuito (trial) - basico
- **Plus:** $299/ano - recomendado
- **Premium:** Preco superior - avancado
- **Hardware:** FieldView Drive 2.0 Starter Kit - $649.99

### Diferenciais
- Integracao profunda com equipamentos de campo
- Conectividade com 60+ parceiros
- Dados automaticos via hardware

---

## 6. XARVIO SCOUTING (BASF, ex-Bayer)

**Site:** xarvio.com | **Preco:** Gratuito

### Features Principais
- **Identificacao de ervas daninhas** por foto
- **Contagem de insetos** em armadilhas amarelas
- **Reconhecimento de doencas** de plantas
- **Analise de dano foliar**
- **Status de nitrogenio** por foto
- **SCOUTING Radar:** Mapa de riscos na regiao
- **Notificacoes push:** Alertas automaticos de riscos proximos

### Diferenciais
- App de scouting mais completo e gratuito
- Radar comunitario de pragas
- Contagem de insetos em armadilhas (funcao unica)

---

## 7. YARA (FarmCare + Atfarm)

### FarmCare (Gratis)
- **Map My Farm:** Caminhar pela fazenda ou desenhar limites
- **Calculadora de fertilizantes:** Tipo e quantidade precisos
- **Compra direta:** Produtos Yara no app

### Atfarm
- **Agricultura de precisao** via satelite
- **NDVI e VRA:** Mapas de aplicacao variavel
- **Simulacao de estagio de crescimento**
- **Previsao meteorologica** para pulverizacao
- **Planejamento nutricional pre-safra**

---

## 8. FBN (Farmers Business Network)

**Membros:** 55K+ agricultores | **Preco:** Gratuito

### Features Principais
- **Precos de insumos:** Media nacional antes de comprar
- **Marketing de graos:** Calculo automatico de custos de producao e frete
- **Inteligencia de mercado:** Futuros, clima, insights diarios, podcast semanal
- **Satelite semanal:** Imagens EVI dos campos
- **Forum comunitario:** Membros discutem e se ajudam
- **Financiamento:** 2.99% juros ou 0% com qualificacao
- **IA (2025):** Plataforma expandida com AI para comercio e financiamento

---

## TABELA COMPARATIVA RESUMIDA

| Feature | Plantix | Agrio | PictureThis | Cropio | FieldView | XARVIO | Yara | FBN | **Rumo Pragas (Atual)** |
|---|---|---|---|---|---|---|---|---|---|
| ID de pragas por IA | ★★★★★ | ★★★★ | ★★★★ | ★★ | ★★ | ★★★★ | ★ | ★ | ★★★ |
| Monitoramento satelite | ✗ | ★★★★★ | ✗ | ★★★★★ | ★★★★ | ✗ | ★★★★ | ★★★ | ✗ |
| Previsao meteorologica | ★★★ | ★★★★★ | ✗ | ★★★★ | ★★★ | ✗ | ★★★★ | ★★★ | ✗ |
| Comunidade/Social | ★★★★ | ★★ | ★★ | ✗ | ✗ | ★★★ | ✗ | ★★★★★ | ✗ |
| Marketplace | ★★★★ | ✗ | ✗ | ✗ | ★★★ | ✗ | ★★★ | ★★★★★ | ✗ |
| Offline | ★★★ | ★★ | ★★ | ✗ | ★★★ | ★★ | ★ | ★ | ★★ |
| Alertas/Notificacoes | ★★★★ | ★★★★★ | ★★★ | ★★★ | ★★★ | ★★★★ | ★★ | ★★★ | ★ |
| Relatorios/Dashboard | ★★ | ★★★★ | ★★ | ★★★★★ | ★★★★★ | ★★ | ★★★ | ★★★ | ✗ |
| Integracao ferramentas | ★★ | ★★★ | ★ | ★★★★★ | ★★★★★ | ★★ | ★★★ | ★★★★ | ✗ |
| UX/Design | ★★★ | ★★★ | ★★★★★ | ★★★ | ★★★★ | ★★★ | ★★★ | ★★★ | ★★★★ |
| Portugues BR | ★★★ | ✗ | ★★★ | ★★ | ★★ | ★★ | ★★ | ✗ | ★★★★★ |
| Foco Brasil | ★★ | ★★ | ★ | ★★ | ★★ | ★ | ★★ | ✗ | ★★★★★ |

---

## GAPS CRITICOS DO RUMO PRAGAS vs CONCORRENCIA

### O que o Rumo Pragas JA TEM (pontos fortes):
1. IA de diagnostico por foto (core feature)
2. Historico de diagnosticos
3. Biblioteca de pragas por cultura
4. Sistema de assinatura (Free/Basico/Pro)
5. Foco 100% no Brasil e em portugues
6. Design moderno (emerald + tech blue)
7. Suporte a culturas brasileiras chave (soja, milho, cafe, algodao, cana, trigo)

### O que FALTA (gaps criticos identificados):

#### vs Plantix:
- Comunidade de agricultores/agronomos
- Alertas regionais de surtos
- Marketplace de insumos
- Calculadora de fertilizantes
- Previsao meteorologica agricola
- Base de dados com 120M+ imagens (vs nosso dataset menor)

#### vs Agrio:
- Monitoramento por satelite (NDVI)
- IPM com protocolos formais
- Modelagem preditiva de dispersao de pragas
- Gestao de equipe (Workgroup)
- Dados meteorologicos hiperlocais
- GDD (graus-dia de desenvolvimento)

#### vs PictureThis/Picture Insect:
- UX extremamente polida com onboarding gamificado
- Volume de identificacoes diarias
- Reconhecimento de audio de insetos
- Sistema de colecoes pessoais
- Lembretes e rastreamento de cuidados

#### vs Cropio/FieldView:
- Monitoramento satelital em tempo real
- Gestao completa de operacoes de campo
- Previsao de rendimento
- Integracao com equipamentos
- Relatorios detalhados com ROI

#### vs XARVIO:
- Radar comunitario de pragas na regiao
- Contagem automatica de insetos em armadilhas
- Analise de status de nitrogenio

#### vs FBN:
- Forum comunitario ativo
- Inteligencia de precos de insumos
- Marketing de graos
- Financiamento integrado

---

## ROADMAP COMPETITIVO - FEATURES PRIORITIZADAS

### P0 - OBRIGATORIO PARA LANCAMENTO (Antes do Go-Live)
> *Features criticas que todo concorrente serio tem e cuja ausencia impede competicao*

| # | Feature | Justificativa | Referencia |
|---|---|---|---|
| P0.1 | **Alertas Push de Pragas por Regiao** | Plantix, Agrio e XARVIO todos tem. Agricultores PRECISAM ser avisados de surtos proximos | Plantix Radar, XARVIO Scouting Radar |
| P0.2 | **Previsao Meteorologica Agricola Integrada** | 7/10 concorrentes oferecem. Agricultura depende de clima. Mostrar melhor horario para pulverizar, plantar, colher | Plantix, Agrio, FieldView |
| P0.3 | **Modo Offline Robusto** | Agricultores ficam em areas sem sinal. Biblioteca de pragas, historico e tratamentos devem funcionar 100% offline | Plantix, FieldView |
| P0.4 | **Comunidade Basica (Perguntas e Respostas)** | Plantix tem 500+ experts. FBN tem forum. Agricultores querem trocar experiencias. Criar Q&A por cultura/regiao | Plantix Community, FBN Forum |
| P0.5 | **Onboarding Guiado com Tutorial** | PictureThis tem onboarding impecavel. Primeiro uso deve guiar: tirar foto > ver resultado > entender valor | PictureThis, Picture Insect |
| P0.6 | **Dashboard com Metricas do Produtor** | Resumo visual: diagnosticos do mes, pragas mais frequentes, status das culturas, alertas ativos | Agrio, FieldView |
| P0.7 | **Compartilhamento de Diagnostico** | Permitir enviar resultado via WhatsApp/Telegram para agronomo ou vizinho. Brasil vive no WhatsApp | Unico - vantagem competitiva |
| P0.8 | **Nivel de Confianca + Alternativas no Diagnostico** | Mostrar top 3 possiveis pragas com % de confianca, nao apenas uma resposta. Plantix e Agrio fazem isso | Plantix, Agrio |

### P1 - DEVE TER EM 30 DIAS (Primeiras semanas pos-lancamento)
> *Features que diferenciam e aumentam retencao*

| # | Feature | Justificativa | Referencia |
|---|---|---|---|
| P1.1 | **Mapa de Calor de Pragas (Regional)** | Visualizacao de onde pragas estao sendo detectadas na regiao. Crowdsourced com dados dos usuarios | XARVIO Radar, Plantix outbreak tracking |
| P1.2 | **Calculadora de Defensivos/Fertilizantes** | Plantix e Yara tem. Input: area + cultura + praga = dosagem recomendada | Plantix, Yara FarmCare |
| P1.3 | **Chat com Agronomo (Premium)** | PictureThis tem consultoria 24/7. Oferecer no plano Pro: chat com agronomo real em ate X horas | PictureThis, Plantix experts |
| P1.4 | **Notificacoes Inteligentes por Cultura** | Alertas customizados: "Epoca de lagarta-do-cartucho no milho na sua regiao" baseado em safra + localizacao + historico | Agrio, XARVIO |
| P1.5 | **Relatorio PDF/Excel Exportavel** | Agronomos precisam documentar. Exportar historico de diagnosticos com fotos, datas, tratamentos aplicados | Cropio, FieldView |
| P1.6 | **Sistema de Favoritos e Colecoes** | Organizar pragas favoritas, diagnosticos importantes, tratamentos salvos | PictureThis colecoes |
| P1.7 | **Feedback do Diagnostico (Confirmar/Corrigir)** | Usuario confirma se IA acertou. Melhora modelo + engajamento. Plantix usa isso para treinar ML | Plantix, Agrio |
| P1.8 | **Integracao com Google Maps/Localizacao** | Geo-tag automatico nos diagnosticos. Base para mapa de calor e alertas regionais | Agrio, XARVIO |
| P1.9 | **Multi-idioma: Espanhol** | Expandir para LATAM (Argentina, Colombia, Peru). 2o maior mercado agricola da regiao | Plantix (20 idiomas) |
| P1.10 | **Widget iOS/Android** | Resumo rapido: alertas da regiao, clima, ultimo diagnostico. Engajamento passivo | FieldView, apps de clima |

### P2 - BOM TER EM 90 DIAS (Crescimento e diferenciacao)
> *Features avancadas para se tornar plataforma completa*

| # | Feature | Justificativa | Referencia |
|---|---|---|---|
| P2.1 | **Monitoramento Satelital Basico (NDVI)** | Agrio e Cropio lideram. Oferecer visualizacao simples de saude da lavoura por satelite | Agrio, Cropio, FieldView |
| P2.2 | **Marketplace de Insumos** | Conectar agricultores a revendas locais. Monetizacao via comissao (modelo Plantix) | Plantix, Yara FarmCare |
| P2.3 | **Gamificacao** | Pontos por diagnostico, badges por culturas, ranking regional. Aumenta retencao massivamente | PictureThis, tendencias de mercado |
| P2.4 | **Gestao de Talhoes/Propriedade** | Mapeamento de areas, registro de atividades por talhao, historico por area | Cropio, FieldView, Agrio |
| P2.5 | **IA Conversacional (Chatbot Agronomo)** | Claude/GPT como consultor agricola. Perguntar sobre qualquer duvida agricola em linguagem natural | Diferenciador unico |
| P2.6 | **Reconhecimento de Audio de Insetos** | Picture Insect faz isso. Inovador para identificacao complementar | Picture Insect |
| P2.7 | **Integracao WhatsApp Business** | Enviar alertas, resumos semanais e diagnosticos via WhatsApp. Canal #1 do agricultor brasileiro | Unico - vantagem competitiva Brasil |
| P2.8 | **API Publica para Agronomos/Consultorias** | Cropwise abriu plataforma em 2025. Permitir integracao com sistemas de gestao agricola | Syngenta Cropwise Open Platform |
| P2.9 | **Previsao de Safra Simplificada** | Baseado em diagnosticos + clima + historico, estimar rendimento | Cropio, FieldView |
| P2.10 | **Diario de Campo Digital** | Registro de todas atividades: plantio, aplicacoes, colheita. Caderno de campo digital | Cropio, FieldView |
| P2.11 | **Modo Agronomo (B2B)** | Dashboard para consultores gerenciarem multiplos clientes/fazendas | Agrio Workgroup, Cropio |
| P2.12 | **Comparativo Safra a Safra** | Visualizar evolucao entre safras: pragas, produtividade, custos | FieldView, Cropio |

---

## ESTRATEGIA DE MONETIZACAO RECOMENDADA

Baseado na analise dos 10 concorrentes, o modelo ideal para o Brasil:

### Plano Gratuito (Aquisicao)
- 5 diagnosticos/mes
- Biblioteca de pragas completa
- Alertas basicos da regiao
- Previsao meteorologica
- Comunidade (leitura)

### Plano Basico - R$19,90/mes (Retencao)
- Diagnosticos ilimitados
- Historico completo
- Exportacao de relatorios
- Comunidade (participacao)
- Notificacoes personalizadas
- Calculadora de defensivos

### Plano Pro - R$49,90/mes (Profissionais)
- Tudo do Basico +
- Chat com agronomo
- Monitoramento satelital (NDVI)
- Dashboard avancado
- Gestao de talhoes
- API de integracao
- Modo Agronomo (multiplas fazendas)

### Receita Adicional
- **Marketplace:** Comissao 5-10% sobre venda de insumos (modelo Plantix)
- **B2B:** Licenciamento de dados para empresas de defensivos
- **Parcerias:** Revendas agricolas, cooperativas, Embrapa

---

## VANTAGENS COMPETITIVAS UNICAS DO RUMO PRAGAS

O que NENHUM concorrente internacional faz bem no Brasil:

1. **100% em Portugues Brasileiro** - Plantix tem PT, mas nao e nativo. Rumo Pragas pode dominar linguagem, giriass e realidade do produtor BR
2. **Culturas brasileiras nativas** - Soja BR, milho safrinha, cafe especial, cana-de-acucar paulista, algodao MT - cada regiao com suas peculiaridades
3. **Integracao WhatsApp** - Nenhum concorrente faz. No Brasil, WhatsApp E a internet do produtor rural
4. **Parceria potencial com Embrapa** - Credibilidade cientifica + base de dados brasileira
5. **Realidade do campo brasileiro** - Conectividade limitada, diversidade de perfis (pequeno produtor familiar ate grande fazenda), cooperativismo forte
6. **Clima e calendario agricola brasileiro** - Safra/safrinha, seca, chuvas, geadas no sul - timing de alertas especifico
7. **Regulamentacao brasileira** - Defensivos registrados no MAPA, receituario agronomico, normativas locais

---

## CONCLUSAO E PROXIMOS PASSOS

### Para ser o #1 no Brasil, o Rumo Pragas precisa:

1. **CURTO PRAZO (P0):** Implementar alertas regionais, previsao meteorologica, modo offline robusto e comunidade basica. Sem isso, nao compete nem com Plantix gratuito.

2. **MEDIO PRAZO (P1):** Adicionar mapa de calor, calculadora de defensivos, chat com agronomo e notificacoes inteligentes. Isso coloca no nivel do Agrio.

3. **LONGO PRAZO (P2):** Satelite, marketplace, gamificacao e modo B2B. Isso transforma o app de "identificador de pragas" em "plataforma agricola completa" - nivel Cropio/FieldView mas acessivel.

4. **DIFERENCIACAO:** WhatsApp integration, foco laser no Brasil, parceria Embrapa, linguagem nativa = impossivel de copiar por apps internacionais.

O mercado global de deteccao de pragas por IA passa de $1.2B em 2026, crescendo 22% ao ano. O Brasil e o 3o maior mercado agricola do mundo. Nao existe um app dominante em PT-BR focado em pragas. A janela de oportunidade esta aberta.

---

*Pesquisa realizada em 2026-03-25 com dados de Google Play, App Store, sites oficiais e fontes de mercado.*
