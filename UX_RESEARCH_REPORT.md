# Relatório de Pesquisa UX/UI — Rumo Pragas

> [!CAUTION]
> **ARQUIVO HISTÓRICO — NÃO USAR COMO ESCOPO, PREÇO OU EVIDÊNCIA DE USUÁRIO ATUAL.**
> Use `docs/audit/competitive-matrix-2026-07-14.md` e
> `docs/audit/launch-coverage-2026-07-14.md`.
## Diretor de Pesquisa UX para Apps Agrícolas

**Data:** 25 de Março de 2026
**Escopo:** Pesquisa de mercado, padrões UX, gamificação, monetização e arquitetura técnica
**Foco:** Apps de identificação de pragas agrícolas para o mercado brasileiro

---

## Sumário Executivo

Este relatório consolida pesquisa de mercado sobre os melhores apps agrícolas do mundo (Plantix, Agrio, Farmonaut, FarmRoad, HelpFarm) para extrair padrões de UX, estratégias de engajamento e modelos de monetização aplicáveis ao **Rumo Pragas**. O mercado AgriTech brasileiro está avaliado em ~USD 400 milhões e em rápida expansão, com espaço significativo para um app nativo focado em pragas com UX superior.

---

## 1. Padrões UX para Tela de Diagnóstico de Pragas

### O Que os Melhores Apps Fazem

**Plantix** (líder mundial, 780+ tipos de danos, 30+ culturas, 19 idiomas):
- Diagnóstico em segundos via foto
- Resultado mostra: nome da praga, confiança da IA, severidade visual
- Recomendações de tratamento imediatas
- Comunidade de 500+ especialistas para segunda opinião

**Agrio** (premium, foco em precisão):
- IA + visão computacional para diagnóstico rápido
- Protocolos de Manejo Integrado de Pragas (MIP) detalhados
- Imagens de satélite NDVI para monitoramento de campo
- Dados meteorológicos hiperlocais com alertas por hora
- Preços: gratuito para produtores individuais, $4-32/mês para fazendas

**HelpFarm** (case study UX):
- 7 critérios de funcionalidade: precisão da ID, cobertura de espécies, detecção de doença, visualização de área infectada, estimativa de severidade, recomendações de tratamento, suporte de comunidade/especialista
- Fluxo: seleção de idioma > login > especificação da cultura > diagnóstico > comunidade

### Recomendações Específicas para Rumo Pragas

#### Tela de Resultado do Diagnóstico (Redesign Proposto)

```
┌─────────────────────────────────┐
│ [Hero Image da foto capturada]  │
│                                 │
│ ┌─────────┐  ┌───────────────┐ │
│ │ SEVERO   │  │ 94% Confiança │ │
│ │ 🔴       │  │ IA            │ │
│ └─────────┘  └───────────────┘ │
│                                 │
│ Lagarta-do-Cartucho             │
│ Spodoptera frugiperda           │
│                                 │
│ ┌─ Impacto Financeiro ────────┐ │
│ │ Perda estimada: R$ X/ha     │ │
│ │ Se não tratado: R$ XX/ha    │ │
│ └─────────────────────────────┘ │
│                                 │
│ [Tratamento Cultural]     ✅    │
│ [Tratamento Convencional] 💊    │
│ [Tratamento Orgânico]     🌿    │
│ [Prevenção]               🛡️    │
│                                 │
│ ┌─ Risco Climático ──────────┐ │
│ │ Temperatura: 28°C (ideal)  │ │
│ │ Umidade: 78% (alto risco)  │ │
│ │ Próx. chuva: 2 dias        │ │
│ └─────────────────────────────┘ │
│                                 │
│ [Compartilhar] [Salvar] [PDF]   │
│                                 │
│ ── Pragas Similares ──          │
│ [Card] [Card] [Card]           │
│                                 │
│ ── Pergunte a um Especialista ──│
│ [Consultar Agrônomo] (Premium)  │
└─────────────────────────────────┘
```

**Elementos Diferenciadores a Implementar:**

1. **"Financial Overlay"** — Mostrar impacto financeiro estimado (perda por hectare) ao lado do diagnóstico. Nenhum concorrente brasileiro faz isso bem. Referência: Gapsy Studio recomenda combinar mapas de saúde com dados de custo ("Green Zones" vs "Red Zones")

2. **"Agentic UI"** — Em vez de dados brutos, apresentar recomendações acionáveis: "Aplicar inseticida biológico agora?" com botões de ação claros (Sim/Agendar/Ignorar)

3. **Seções colapsáveis** com ícones de cor: verde (cultural), azul (convencional), laranja (orgânico) — já planejado no PLAN.md, manter

4. **Micro-animações** de carregamento com mensagens educativas durante o processamento da IA

---

## 2. Gamificação para Engajamento

### O Que Funciona no Agro

Baseado em pesquisa da IEEE, Smartico.ai e case studies (SeedWorks, Plantix, Cropway):

| Mecânica | Exemplo no Agro | Eficácia |
|----------|-----------------|----------|
| **Pontos** | Pontos por diagnóstico correto, por completar perfil | Alta |
| **Badges** | "Detector de Ferrugem", "Mestre do MIP", "100 Diagnósticos" | Alta |
| **Leaderboard** | Ranking regional de diagnósticos | Média |
| **Streaks** | "7 dias consecutivos monitorando" | Alta |
| **Desafios** | "Identifique 5 pragas esta semana" | Média |
| **Recompensas** | Desconto em insumos, dias Premium grátis | Muito Alta |

### Sistema de Gamificação Proposto para Rumo Pragas

**Nível 1 — "Olho de Águia" (Iniciante)**
- Primeiro diagnóstico realizado
- Perfil completo
- Badge: Folha Bronze

**Nível 2 — "Sentinela do Campo" (Intermediário)**
- 25 diagnósticos
- 7 dias de streak de monitoramento
- Compartilhou 3 diagnósticos com comunidade
- Badge: Folha Prata

**Nível 3 — "Guardião da Lavoura" (Avançado)**
- 100 diagnósticos
- Ajudou 10 agricultores na comunidade
- Completou quiz de pragas
- Badge: Folha Ouro

**Nível 4 — "Mestre Agrônomo" (Expert)**
- 500 diagnósticos
- 30 dias de streak
- Reconhecido como especialista da comunidade
- Badge: Folha Diamante + selo verificado

**Recompensas Tangíveis (Parcerias):**
- Descontos em defensivos agrícolas com revendas locais (modelo Plantix)
- Dias de acesso Premium gratuito
- Consulta grátis com agrônomo parceiro
- Destaque no ranking regional

---

## 3. Visualização de Dados para Agricultores

### Princípios Baseados em Pesquisa

A pesquisa (Farm21, FarmRoad, Farmonaut, InetSoft) mostra que dashboards agrícolas devem:

1. **Ser visuais, não textuais** — Heat maps > tabelas numéricas
2. **Usar contraste alto (7:1 mínimo)** — Agricultores usam o celular sob sol forte (10.000+ lux)
3. **Substituir branco puro** — Usar off-whites (#F5F5F0) em vez de #FFFFFF para evitar fadiga em turnos de 12h
4. **Fontes com peso pesado** — Linhas finas desaparecem sob luz solar direta
5. **Touch targets 48x48dp mínimo** — Agricultores frequentemente usam luvas

### Dashboards Recomendados para Rumo Pragas

#### Dashboard Principal (Home Redesenhada)

```
┌─────────────────────────────────┐
│ Bom dia, Manoel! 🌾             │
│ Fazenda São José • Soja         │
│                                 │
│ ┌─ Alerta de Risco ───────────┐│
│ │ ⚠️ ALTO RISCO: Ferrugem      ││
│ │ Umidade 85% + Temp 22-28°C  ││
│ │ [Ver Detalhes]              ││
│ └─────────────────────────────┘│
│                                 │
│ ┌─ Seus Números ──────────────┐│
│ │ 📊 12 diagnósticos este mês  ││
│ │ 🔥 Streak: 5 dias            ││
│ │ 🏆 Ranking: #3 na região     ││
│ └─────────────────────────────┘│
│                                 │
│ ── Tendência de Pragas (30d) ──│
│ [Gráfico de linha mini]        │
│ Lagarta ↑ 23%  Ferrugem ↓ 12% │
│                                 │
│ ── Clima Próximos 7 Dias ──    │
│ [Cards horizontais com ícones] │
│ Seg  Ter  Qua  Qui  Sex       │
│ 28°  30°  27°  25°  26°       │
│ ☀️   ☀️   🌧️   🌧️   ⛅       │
│                                 │
│      [  DIAGNOSTICAR  ]        │
│      (botão grande central)    │
│                                 │
│ ── Últimos Diagnósticos ──     │
│ [Card 1] [Card 2] [Card 3]    │
└─────────────────────────────────┘
```

#### Tela de Tendências (Nova Feature Premium)

```
┌─────────────────────────────────┐
│ Tendências de Pragas            │
│ [Mês] [Safra] [Ano]            │
│                                 │
│ ┌─ Heat Map Regional ─────────┐│
│ │ [Mapa com zonas coloridas]  ││
│ │ Verde = Baixo risco          ││
│ │ Amarelo = Médio risco        ││
│ │ Vermelho = Alto risco        ││
│ └─────────────────────────────┘│
│                                 │
│ ── Top 5 Pragas na Região ──   │
│ 1. Lagarta-do-cartucho  ████▌  │
│ 2. Ferrugem asiática    ███▌   │
│ 3. Percevejo marrom     ██▌    │
│ 4. Mosca-branca         █▌     │
│ 5. Ácaro rajado         █      │
│                                 │
│ ── Correlação Clima x Pragas ──│
│ [Gráfico dual-axis]            │
│ Linha: umidade/temperatura     │
│ Barras: incidência de pragas   │
│                                 │
│ [Exportar PDF] [Compartilhar]  │
└─────────────────────────────────┘
```

---

## 4. Padrões de Onboarding

### Pesquisa: O Que Funciona para Agricultores com Baixa Alfabetização Digital

Fontes: GSMA Mobile for Development, Gapsy Studio, TheFinch Design, F1 Studioz

**Princípio Central: "Interface Zero-Treinamento"**
Software intuitivo o suficiente para pegar e usar instantaneamente, sem manual.

### Padrões Específicos Recomendados

1. **Máximo 3 telas de onboarding** — Pesquisa mostra que mais que 3 mensagens de boas-vindas entedia o usuário

2. **Pictogramas estilo "história em quadrinhos"** — Em vez de texto "Calibrar Sensor", mostrar animação de como fazer passo a passo

3. **Ícones literais, não abstratos** — Mostrar exatamente como o equipamento/planta aparece no campo. Ícones abstratos confundem agricultores com menor letramento digital

4. **Seleção de idioma PRIMEIRO** — Antes de qualquer outra coisa (já planejado no HelpFarm)

5. **Modo simplificado para temporários** — Apenas botões essenciais (Capturar/Diagnosticar)

### Fluxo de Onboarding Proposto para Rumo Pragas

```
Tela 1: "Tire uma foto da praga"
  [Animação: mão fotografando folha doente]
  [Ícone grande de câmera]

Tela 2: "Receba o diagnóstico em segundos"
  [Animação: IA analisando → resultado aparece]
  [Ícone de lupa + check verde]

Tela 3: "Saiba como tratar e prevenir"
  [Animação: planta doente → planta saudável]
  [Ícone de escudo protetor]

Tela 4: Cadastro Simplificado
  [Nome] [Estado/Cidade] [Principal Cultura]
  [Botão: "Começar a Usar"]

  * Sem exigir email inicialmente
  * Permitir uso como "visitante" com limite de 3 diagnósticos
  * Solicitar cadastro completo apenas quando necessário
```

**Diferencial:** Permitir "Test Drive" — o agricultor pode fazer 1 diagnóstico ANTES de se cadastrar. Isso reduz atrito e demonstra valor imediatamente.

---

## 5. Features Sociais e Comunidade

### Análise dos Concorrentes

**Plantix:**
- Maior comunidade online de agricultores do mundo
- Aba "Comunidade" com Q&A estilo fórum
- 500+ especialistas respondendo perguntas
- Respostas em poucas horas
- Se a IA não for suficiente, conecta com especialistas locais

**Agrio:**
- Equipes de fazenda com comunicação integrada
- Compartilhamento de notas e insights
- Gerenciamento de tarefas colaborativo

### Sistema de Comunidade Proposto para Rumo Pragas

#### Aba "Comunidade" (5a aba ou seção dentro de Home)

```
┌─────────────────────────────────┐
│ Comunidade Rumo Pragas          │
│ [Buscar] [Filtrar por cultura]  │
│                                 │
│ ── Perguntas Recentes ──        │
│ ┌─────────────────────────────┐ │
│ │ 📸 [foto da folha]          │ │
│ │ "Alguém sabe o que é isso   │ │
│ │  na minha soja?"            │ │
│ │ João Silva • Goiás • 2h     │ │
│ │ 💬 8 respostas  ❤️ 12       │ │
│ │ ✅ Respondido por Agrônomo  │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 📸 [foto da praga]          │ │
│ │ "Lagarta no milho - qual    │ │
│ │  produto usar?"             │ │
│ │ Maria Costa • MT • 5h       │ │
│ │ 💬 3 respostas              │ │
│ └─────────────────────────────┘ │
│                                 │
│ [+ Fazer Pergunta]              │
│                                 │
│ ── Especialistas Online ──      │
│ [Avatar] Dr. Paulo - Agrônomo   │
│ [Avatar] Ana - Eng. Agrícola    │
│ [Consultar] (Premium)           │
└─────────────────────────────────┘
```

**Features de Comunidade Priorizadas:**

| Feature | Prioridade | Plano |
|---------|-----------|-------|
| Feed de perguntas com foto | P0 (MVP) | Free |
| Respostas da comunidade | P0 (MVP) | Free |
| Selo "Especialista Verificado" | P1 | Free |
| Chat direto com agrônomo | P1 | Premium |
| Compartilhar diagnóstico no feed | P0 | Free |
| Grupos por cultura (Soja, Milho, etc.) | P2 | Free |
| Alertas regionais de praga | P1 | Premium |
| Ranking de contribuidores | P2 | Free |

---

## 6. Features Premium e Monetização

### Modelos de Sucesso no Mercado

**Plantix:** Receita via comissão na venda de defensivos conectando agricultor → revendedor
**Agrio:** Freemium — gratuito para indivíduos, $4-32/mês para fazendas (por área monitorada)
**Farmonaut:** Assinatura por hectare monitorado via satélite
**Modelo DaaS:** Dados anonimizados vendidos para institutos de pesquisa

### Estratégia de Monetização Proposta para o Mercado Brasileiro

#### Planos Revisados

| Feature | Free | Básico (R$19,90/mês) | Pro (R$49,90/mês) |
|---------|------|----------------------|---------------------|
| Diagnósticos por mês | 5 | 30 | Ilimitado |
| Biblioteca de pragas | Completa | Completa | Completa |
| Histórico de diagnósticos | 30 dias | 6 meses | Ilimitado |
| Tratamentos detalhados | Básico | Completo | Completo + dosagem |
| Dashboard de tendências | Não | Básico | Completo + heat map |
| Alertas de risco | Não | Push básico | Push + SMS + WhatsApp |
| Comunidade | Ler | Ler + Escrever | Ler + Escrever + Chat Privado |
| Consulta com agrônomo | Não | 1/mês | 5/mês |
| Relatório PDF | Não | Básico | Completo com logo |
| Suporte satélite (NDVI) | Não | Não | Até 500 ha |
| Impacto financeiro | Não | Não | Detalhado por hectare |
| Exportação de dados | Não | CSV | CSV + PDF + Integração ERP |
| Modo equipe | Não | Não | Até 10 membros |

#### Táticas de Conversão Que Funcionam

1. **Paywall no 6o diagnóstico** — Pesquisa mostra que 80% das conversões acontecem no primeiro paywall. Deixar fazer 5 grátis demonstra valor
2. **Trial de 7 dias do Pro** — Após primeiro diagnóstico, oferecer teste grátis
3. **Preço por safra** — Oferecer plano semestral (R$99/safra) em vez de mensal para alinhar com ciclo agrícola
4. **Créditos de IA** — Modelo híbrido: plano base + créditos adicionais para diagnósticos extras (tendência 2025-2026 em apps de IA)
5. **Marketplace de insumos** — Comissão na conexão agricultor → revenda de defensivos (modelo Plantix, potencial enorme no Brasil)
6. **B2B para cooperativas** — Plano empresarial para cooperativas agrícolas (ex: R$5/membro/mês, mínimo 50 membros)

#### Receita Adicional (Data-as-a-Service)

- Dados anonimizados de incidência de pragas por região → Universidades, EMBRAPA, empresas de defensivos
- Mapa epidemiológico em tempo real → Secretarias estaduais de agricultura
- Relatórios de tendência → Revendas e cooperativas

---

## 7. Estratégia de Push Notifications

### Pesquisa de Mercado

- Alertas de pragas devem ser enviados ASSIM QUE uma doença é detectada na região (Agrio faz isso)
- Alertas de clima funcionam melhor como push (urgente), resumos diários via email
- Segmentação é essencial: nem todos querem todos os alertas
- Agricultores querem controle sobre suas preferências de notificação

### Sistema de Notificações Proposto

#### Categorias de Alertas

| Tipo | Urgência | Canal | Exemplo |
|------|----------|-------|---------|
| **Alerta de Praga Regional** | ALTA | Push + SMS | "⚠️ Ferrugem asiática detectada a 50km da sua fazenda" |
| **Risco Climático** | ALTA | Push | "🌧️ Chuva forte prevista para amanhã. Adie a aplicação" |
| **Lembrete de Tratamento** | MÉDIA | Push | "💊 Reaplicação de fungicida recomendada hoje (14 dias)" |
| **Janela de Aplicação** | ALTA | Push | "✅ Próximas 6h: condições ideais para aplicação" |
| **Tendência Semanal** | BAIXA | In-app | "📊 Resumo semanal: 3 diagnósticos, tendência de mosca-branca ↑" |
| **Comunidade** | BAIXA | Push | "💬 Seu post recebeu 5 respostas" |
| **Gamificação** | BAIXA | In-app | "🏆 Parabéns! Você completou 7 dias de streak" |
| **Dica Educativa** | BAIXA | Push (1x/semana) | "💡 Dica: Rotação de culturas reduz 40% da incidência de nematóides" |

#### Lógica de Disparo Inteligente

```
SE (umidade > 80% E temperatura entre 20-28°C E cultura = soja)
  → Enviar alerta de risco de ferrugem asiática

SE (último diagnóstico tinha tratamento E dias_passados >= intervalo_reaplicação)
  → Enviar lembrete de reaplicação

SE (nova praga detectada por outros usuários E distância < raio_configurado)
  → Enviar alerta de praga regional
```

**Configuração granular por usuário:** Permitir ativar/desativar cada categoria individualmente na tela de Settings.

---

## 8. Capacidades Offline

### O Problema Real

Pesquisadores chamam de **"Lie-Fi"** — a situação frustrante onde o celular mostra sinal, mas a conexão é instável, com latência alta e requests que falham intermitentemente. É mais comum que "No-Fi" (sem sinal) e mais difícil de gerenciar.

### Arquitetura Offline-First Recomendada

#### Stack Técnico para o Rumo Pragas (Expo + Supabase)

**Opção Recomendada: WatermelonDB + Supabase**

Referência: [Supabase Official Guide](https://supabase.com/blog/react-native-offline-first-watermelon-db)

```
Fluxo de Dados:
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  UI (React  │ ←── │ WatermelonDB │ ←── │  Supabase   │
│  Native)    │ ──→ │  (SQLite)    │ ──→ │  (Postgres) │
│             │     │  Local-first │     │  Cloud sync │
└─────────────┘     └──────────────┘     └─────────────┘
```

**Como funciona:**
1. Todas as queries vão direto para SQLite local (thread nativa separada = instantâneo)
2. Modificações são salvas localmente e marcadas como "pending sync"
3. Sync automático quando conexão disponível via pull/push com timestamps
4. Conflitos resolvidos por "last write wins" ou CRDTs para dados críticos

**Plugin necessário:** `@morrowdigital/watermelondb-expo-plugin` para Expo managed workflow

**Alternativas avaliadas:**
- **Prisma (Early Access)** — Solução completa local-first, mas ainda imatura
- **RxDB** — NoSQL reativo, bom para sync, mais complexo
- **TinyBase** — Leve, plugável, mas menos robusto para dados complexos

#### O Que Deve Funcionar Offline

| Feature | Offline | Nota |
|---------|---------|------|
| Ver diagnósticos anteriores | SIM | Cache local completo |
| Ver biblioteca de pragas | SIM | Pré-download de toda a biblioteca |
| Tirar foto para diagnóstico | SIM (parcial) | Foto salva, enfileira para quando voltar online |
| Ver tratamentos | SIM | Cache dos tratamentos já visualizados |
| Comunidade | NÃO | Requer conexão |
| Dashboard de tendências | PARCIAL | Últimos dados disponíveis em cache |
| Alertas de risco | NÃO | Requer dados meteorológicos em tempo real |
| Editar perfil | SIM | Sync quando online |

#### Padrões de Sync

1. **Delta Sync** — Enviar/receber apenas mudanças desde último sync (eficiente em dados)
2. **Exponential Backoff** — Retries com intervalos crescentes (1min, 5min, 15min) via WorkManager
3. **Indicador de status** — Barra discreta mostrando "Offline — dados locais" ou "Sincronizando..."
4. **Queue de diagnósticos** — Fotos capturadas offline entram numa fila visível ao usuário, processadas automaticamente quando online
5. **Compressão de imagens** — Comprimir fotos antes do upload (JPEG quality 80%, max 1MB) para sync mais rápido

---

## 9. Geração de Relatórios PDF

### O Que o Mercado Faz

- Farmonaut: relatórios de temporada em PDF com mapas e dados
- AgriXP: registro de pesticidas com exportação
- FarmQA: relatórios com heat maps e gráficos
- Agroscout: relatórios de praga e doença com geolocalização

### Tipos de Relatório Propostos

#### Relatório de Diagnóstico Individual

```
┌─────────────────────────────────────────┐
│           RUMO PRAGAS                   │
│     Relatório de Diagnóstico            │
│                                         │
│ Data: 25/03/2026                        │
│ Produtor: Manoel Nascimento             │
│ Fazenda: São José • Goiás              │
│ Cultura: Soja • Talhão 5               │
│ Coordenadas: -15.xxx, -49.xxx          │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │        [Foto da Praga]              │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ IDENTIFICAÇÃO                           │
│ Praga: Lagarta-do-cartucho              │
│ Nome científico: Spodoptera frugiperda  │
│ Confiança da IA: 94%                    │
│ Severidade: ALTA (7/10)                 │
│                                         │
│ CONDIÇÕES CLIMÁTICAS                    │
│ Temperatura: 28°C | Umidade: 78%        │
│ Precipitação últimas 48h: 12mm          │
│ Risco de proliferação: ALTO             │
│                                         │
│ TRATAMENTO RECOMENDADO                  │
│                                         │
│ Cultural:                               │
│ • Rotação de culturas                   │
│ • Destruição de restos culturais        │
│                                         │
│ Convencional:                           │
│ • Clorantraniliprole 200 SC             │
│   Dose: 100 mL/ha                      │
│   Intervalo: 14 dias                    │
│   Carência: 21 dias                     │
│                                         │
│ Biológico:                              │
│ • Bacillus thuringiensis (Bt)           │
│   Dose: 500 mL/ha                      │
│                                         │
│ PREVENÇÃO                               │
│ • Monitoramento semanal com armadilhas  │
│ • Plantio de refúgio (20% da área)      │
│                                         │
│ ─────────────────────────────────────── │
│ Gerado por Rumo Pragas IA              │
│ Este relatório não substitui            │
│ orientação agronômica profissional      │
└─────────────────────────────────────────┘
```

#### Relatório Consolidado da Safra (Premium)

- Todos os diagnósticos do período
- Gráficos de tendência de pragas
- Mapa de incidência por talhão
- Custo estimado de tratamento total
- Comparativo com safra anterior
- **Formato:** PDF com logo da fazenda (personalizável)

#### Implementação Técnica

```typescript
// Usar react-native-html-to-pdf ou expo-print
// Template HTML → renderizar com dados → gerar PDF → compartilhar

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const generateDiagnosisReport = async (diagnosis) => {
  const html = buildReportHTML(diagnosis); // Template com CSS inline
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri);
};
```

**Planos:**
- Free: sem relatório
- Básico: relatório individual simples
- Pro: relatório individual completo + consolidado da safra com logo

---

## 10. Integrações

### APIs e Serviços Recomendados

#### Clima

| API | Uso | Custo |
|-----|-----|-------|
| **Open-Meteo** | Previsão 7 dias, histórico | Gratuito |
| **OpenWeatherMap** | Dados atuais + previsão | Free tier generoso |
| **AccuWeather** | ETo (evapotranspiração) para agricultura | Pago |
| **INMET** | Dados oficiais Brasil | Gratuito (API pública) |

**Recomendação:** Open-Meteo (gratuito, sem chave API) + INMET para dados brasileiros

#### Satélite / NDVI

| Serviço | Resolução | Custo |
|---------|-----------|-------|
| **Sentinel Hub** | 10m (Sentinel-2) | Free tier |
| **Farmonaut API** | Variável | API paga por hectare |
| **Google Earth Engine** | Variável | Gratuito para pesquisa |

**Recomendação:** Sentinel Hub para NDVI gratuito (já usado pelo Campo Vivo)

#### IoT / Sensores (Roadmap Futuro)

- Integração com estações meteorológicas (KestrelMet)
- API genérica para receber dados de sensores de solo
- Protocolo MQTT para comunicação em tempo real

#### Drones (Roadmap Futuro)

- Upload de imagens de drone para análise em lote
- Integração com DJI SDK para captura automatizada
- Análise de imagens multiespectrais

---

## 11. Features Diferenciadores — O Que Faria o Rumo Pragas se Destacar

### Features que NENHUM Concorrente Brasileiro Faz Bem

1. **"Diagnóstico Offline com Fila Inteligente"**
   - Capturar foto offline → ver estimativa local básica → resultado completo quando online
   - Usar modelo TFLite comprimido no device para classificação preliminar (top 5 pragas mais comuns)

2. **"Impacto no Bolso"**
   - Cada diagnóstico mostra perda financeira estimada por hectare
   - Custo do tratamento vs custo da perda sem tratamento
   - Integração com preços atuais de defensivos (API de preço ou parceria com revendas)

3. **"Alerta Comunitário de Pragas"**
   - Quando X diagnósticos da mesma praga são registrados numa região em Y dias
   - Push automático para todos os produtores da região
   - Mapa epidemiológico em tempo real

4. **"Calendário de Aplicação"**
   - Baseado nos diagnósticos, gerar calendário automático de reaplicação
   - Push de lembrete na data
   - Registro de aplicação para relatório de rastreabilidade

5. **"Modo Agrônomo"**
   - Interface dedicada para agrônomos profissionais
   - Gerenciar múltiplas fazendas/clientes
   - Relatórios profissionais com cabeçalho personalizado
   - Selo de verificação CREA

6. **"Quiz de Pragas" (Gamificação + Educação)**
   - Quiz diário: "Qual praga é esta?"
   - Aprende enquanto joga
   - Pontos para o ranking
   - Conteúdo gerado a partir da biblioteca de pragas

7. **"Scan de Rótulo"**
   - Escanear rótulo de defensivo → ver indicações, dosagem, carência
   - Verificar se o produto é indicado para a praga diagnosticada
   - Alerta se produto vencido ou não registrado para a cultura

8. **"WhatsApp Bot"**
   - Agricultor manda foto por WhatsApp → recebe diagnóstico
   - Enorme potencial no Brasil (WhatsApp é ubíquo no agro)
   - Conversão natural para o app completo

---

## 12. Recomendações Técnicas Consolidadas

### Arquitetura Recomendada

```
┌─────────────────────────────────────────────────────┐
│                    RUMO PRAGAS                       │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │              Expo / React Native               │  │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────────┐  │  │
│  │  │   UI    │  │ State   │  │ Offline      │  │  │
│  │  │ (RN +   │  │ Mgmt    │  │ Queue        │  │  │
│  │  │ NativeW)│  │ (Zustand│  │ (WatermelonDB│  │  │
│  │  │         │  │  + RQ)  │  │  + sync)     │  │  │
│  │  └─────────┘  └─────────┘  └──────────────┘  │  │
│  │                                               │  │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────────┐  │  │
│  │  │ Camera  │  │ Push    │  │ PDF Gen      │  │  │
│  │  │ + Image │  │ Notif   │  │ (expo-print) │  │  │
│  │  │ Picker  │  │ (Expo)  │  │              │  │  │
│  │  └─────────┘  └─────────┘  └──────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
│                         │                           │
│  ┌───────────────────────────────────────────────┐  │
│  │              Supabase Backend                  │  │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────────┐  │  │
│  │  │ Auth    │  │ Database│  │ Edge         │  │  │
│  │  │         │  │ (Postgres│  │ Functions    │  │  │
│  │  │         │  │  + RLS) │  │ (AI, PDF)    │  │  │
│  │  └─────────┘  └─────────┘  └──────────────┘  │  │
│  │                                               │  │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────────┐  │  │
│  │  │ Storage │  │ Realtime│  │ Cron Jobs    │  │  │
│  │  │ (fotos) │  │ (alerts)│  │ (sync, push) │  │  │
│  │  └─────────┘  └─────────┘  └──────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
│                         │                           │
│  ┌───────────────────────────────────────────────┐  │
│  │              APIs Externas                     │  │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────────┐  │  │
│  │  │ Claude  │  │ Open-   │  │ Sentinel     │  │  │
│  │  │ AI      │  │ Meteo   │  │ Hub (NDVI)   │  │  │
│  │  │(diagnóst│  │(clima)  │  │              │  │  │
│  │  └─────────┘  └─────────┘  └──────────────┘  │  │
│  │  ┌─────────┐  ┌─────────┐                    │  │
│  │  │ Stripe  │  │ INMET   │                    │  │
│  │  │(pagament│  │(clima BR│                    │  │
│  │  └─────────┘  └─────────┘                    │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Priorização de Implementação

#### Fase 1 — MVP Aprimorado (4 semanas)
- [ ] Redesign da tela de resultado do diagnóstico (Financial Overlay + Agentic UI)
- [ ] Onboarding com 3 telas + "Test Drive" sem cadastro
- [ ] Offline: cache de histórico + biblioteca (WatermelonDB)
- [ ] Fila offline para fotos (captura → enfileira → processa quando online)
- [ ] Geração de PDF individual (expo-print)

#### Fase 2 — Engajamento (4 semanas)
- [ ] Sistema de gamificação (pontos, badges, streaks)
- [ ] Dashboard principal redesenhado (alertas + tendências)
- [ ] Push notifications (alerta de praga, clima, reaplicação)
- [ ] Comunidade básica (feed de perguntas com foto)

#### Fase 3 — Monetização (4 semanas)
- [ ] Paywall revisado com 3 planos (Free/Básico/Pro)
- [ ] Relatório PDF completo (Premium)
- [ ] Dashboard de tendências e heat map (Premium)
- [ ] Consulta com agrônomo (Premium)
- [ ] Alertas regionais (Premium)

#### Fase 4 — Diferenciação (8 semanas)
- [ ] Alerta comunitário automático de pragas
- [ ] Calendário de aplicação com lembretes
- [ ] Quiz de pragas (gamificação educativa)
- [ ] Modo Agrônomo (multi-fazenda)
- [ ] Integração NDVI / satélite
- [ ] WhatsApp Bot

---

## 13. Métricas de Sucesso

| Métrica | Meta (6 meses) | Referência |
|---------|----------------|------------|
| Downloads | 50.000 | Plantix: milhões, mas foco em BR |
| DAU/MAU ratio | > 30% | Padrão bom para utility apps |
| Diagnósticos/usuário/mês | > 3 | Indica valor real |
| Conversão Free → Pago | > 5% | Média apps subscription |
| Retenção D7 | > 40% | Benchmark para agri apps |
| Retenção D30 | > 20% | Benchmark para agri apps |
| NPS | > 50 | Excelente para agritech |
| Tempo no primeiro diagnóstico | < 2 min | UX de onboarding |

---

## Fontes da Pesquisa

- [Best Free Plant Diagnosis Apps 2026 — Farmonaut](https://farmonaut.com/precision-farming/best-free-plant-diagnosis-app-7-powerful-ai-tools-for-2026)
- [Plantix — GSMA Mobile for Development](https://www.gsma.com/solutions-and-impact/connectivity-for-good/mobile-for-development/programme/agritech/detecting-and-managing-crop-pests-and-diseases-with-ai-insights-from-plantix/)
- [Agrio — Plant Diagnosis App](https://agrio.app/)
- [Gamification in Agriculture — Smartico.ai](https://www.smartico.ai/blog-post/gamification-in-agriculture)
- [SeedWorks Agritech Case Study — NetBramha](https://netbramha.com/work/seedworks-agritech-case-study/)
- [UX Case Study: HelpFarm — Medium](https://medium.com/design-bootcamp/ux-case-study-designing-helpfarm-an-app-empowering-farmers-gardeners-to-combat-crop-diseases-c5bc98f767c0)
- [Agriculture App UX/UI Guide — Gapsy Studio](https://gapsystudio.com/blog/agriculture-app-design/)
- [UX in Agriculture — F1 Studioz](https://f1studioz.com/blog/from-seed-to-screen-ux-in-agriculture/)
- [GSMA: User-Centred Design for Farmers](https://www.gsma.com/mobilefordevelopment/mobile-for-development-2/how-user-centred-design-can-improve-agri-e-commerce-interfaces-that-cater-to-the-needs-and-literacy-levels-of-smallholder-farmers/)
- [Plantix Business Model Canvas — Vizologi](https://vizologi.com/business-strategy-canvas/plantix-business-model-canvas/)
- [Brazil AgriTech Market — Ken Research](https://www.kenresearch.com/brazil-agritech-startups-and-smart-farming-market)
- [Offline-First Mobile Architecture — ResearchGate](https://www.researchgate.net/publication/393910615_Offline-First_Mobile_Architecture_Enhancing_Usability_and_Resilience_in_Mobile_Systems)
- [Offline-First React Native with Expo + WatermelonDB + Supabase](https://supabase.com/blog/react-native-offline-first-watermelon-db)
- [Local-First Architecture — Expo Documentation](https://docs.expo.dev/guides/local-first/)
- [Agritech App Trends 2025 — IdeaUsher](https://ideausher.com/blog/agritech-app-trends-reshaping-farming-2025/)
- [Smart Farming App Features 2026 — MyPCOT](https://www.mypcot.com/blog/smart-farming-app-features/)
- [7 Best Plant Disease Identification Apps — FarmstandApp](https://www.farmstandapp.com/30754/7-best-plant-disease-identification-apps-for-farmers/)
- [Weather API Agriculture — Farmonaut](https://farmonaut.com/precision-farming/weather-api-agriculture-smart-farming-weather-data/)
- [Best Agriculture API — Farmonaut](https://farmonaut.com/api-development/best-agriculture-api-farming-api-boost-yields-2025/)
- [Plantix Wikipedia](https://en.wikipedia.org/wiki/Plantix)
- [App Monetization Trends 2025 — RevenueCat](https://www.revenuecat.com/blog/growth/2025-app-monetization-trends/)
- [Farm Dashboard — Farm21](https://www.farm21.com/farm-dashboard-make-data-driven-decisions/)
- [Offline-First Sync Patterns — DevelopersVoice](https://developersvoice.com/blog/mobile/offline-first-sync-patterns/)
- [Gamification IEEE Conference](https://ieeexplore.ieee.org/document/8320713/)
