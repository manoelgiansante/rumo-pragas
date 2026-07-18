# 06 — CONCORRENTES (Mega-Audit Lançamento Rumo Pragas IA)

> [!CAUTION]
> **ARQUIVO HISTÓRICO — DADOS DE MERCADO E CLAIMS NÃO ESTÃO APROVADOS PARA PUBLICAÇÃO.**
> Use a matriz atual, com fontes verificáveis, em
> `docs/audit/competitive-matrix-2026-07-14.md`.

**Data:** 2026-07-02 · **Fase:** read-only · **Branch:** `perfect/pragas-launch-2026-07-02`
**Fontes-base:** `COMPETITOR_ANALYSIS.md` + `PESQUISA_CONCORRENTES_BRASIL.md` (revalidados 01/jul) — este relatório é a ATUALIZAÇÃO 02/jul, não substitui os docs-raiz.
**Método:** firecrawl-search (Google Play, App Store, sites oficiais, Capterra, imprensa agro) + verificação no código atual (`expo-app/`) do que JÁ existe pós ~100 fixes mergeados na main.

---

## 1. Resumo executivo

O posicionamento vencedor continua sendo o detectado em 01/jul e ficou MAIS forte com a decisão do CEO (app 100% grátis, IAP deletado):

> **Rumo Pragas é o único app do mercado BR com identificação de praga por FOTO via IA + chat agronômico IA + 100% grátis + ilimitado + sem anúncios + PT-BR nativo.**

- **Plantix** (único rival direto no eixo "IA por foto grátis") monetiza com anúncios e venda de insumo, tem rating medíocre (~3.9) e foco Índia/hortaliças. Continua se promovendo como "#1 FREE app" — nós somos grátis SEM anúncios, esse é o contraste a explorar em ASO/loja.
- **Agrio** é freemium pago (US$4–32/mês) — bom produto, mas paywall.
- **Aegro** acelerou em 2026 (crescimento >30% no 1º tri, meta de receita revisada R$38M→R$42M) — mas segue caro (R$500+/mês) e SEM IA de foto; é gestão, não diagnóstico.
- Os fortes em MIP no BR (**Cropwise Protector, Farmbox/Checkplant, Pragueiro, InCeres**) são B2B/monitoramento manual georreferenciado — nenhum tem IA de foto self-serve grátis.
- **FarmSense** (novo no radar): sensor óptico de hardware (FlightSensor) para contagem de insetos em tempo real — EUA, B2B hardware, sem presença BR. Tendência a monitorar, não ameaça direta.
- **manejo.app** (CNA/Senar+Agrolink): segue sem evidência de IA por foto; risco = distribuição institucional (Conecta Produtor fez 100k produtores em 6 meses). Monitorar trimestralmente.

**Nenhum concorrente novo com IA de foto grátis em PT-BR foi detectado entre 01/jul e 02/jul.** A janela segue aberta.

---

## 2. Delta por concorrente (o que mudou vs docs de 01/jul)

| Concorrente | Status 02/jul | Delta relevante |
|---|---|---|
| **Plantix** (PEAT, Alemanha) | Válido | Sem mudança de modelo: grátis com anúncios + comissão insumos + comunidade 500+ experts + calculadora de fertilizante. Rating ~3.9 (94k reviews), 34M+ downloads. Segue foco Índia/Ásia. |
| **Agrio** (Israel) | Válido | Freemium pago confirmado (individual básico grátis; US$4/mês até 200ha, US$32/mês até 5.000ha). Satélite NDVI + alertas preditivos + IPM. Rating ~4.5. Tem listing PT na App Store BR ("Agrio: fitossanitário") — presença BR crescente, atenção. |
| **Aegro** | Válido, EM ACELERAÇÃO | Cresceu >30% no 1º tri/2026; meta anual revisada para R$42M. Preço segue R$500+/mês. SEM IA de foto (registro manual). Reclame Aqui: cobrança/cancelamento seguem as queixas nº1. |
| **Cropwise Protector** (Syngenta) | Válido | B2B via canal de distribuição; 400+ problemas no banco; IA prioriza, não diagnostica foto self-serve. ~19k downloads Play (irrelevante em consumer). |
| **Farmbox / Checkplant** | Válido | "Monitoramento grátis" segue sendo chamariz (plataforma paga via Conecta.ag). Registro manual georreferenciado, sem IA de foto. Farmbox Classic e Farmbox novo coexistem nas lojas. |
| **Climate FieldView** (Bayer) | Válido | Identificação de praga só indireta (variação NDVI + notas geolocalizadas). Hardware Drive p/ plano Plus. Sem mudança. |
| **InCeres** (BR, Piracicaba) | **ADICIONADO** | Plataforma de agricultura de precisão: mapas de fertilidade/produtividade por satélite, álgebra de mapas, monitoramento de pragas e doenças (registro/mapa, não IA de foto). B2B/agrônomo, preço sob consulta. NÃO compete no eixo "diagnóstico por foto grátis". |
| **FarmSense** (EUA) | **ADICIONADO** | FlightSensor™: sensor óptico patenteado que conta/classifica insetos em tempo real (demo Almond Conference 2025). Hardware B2B, foco nozes/Califórnia, sem app consumer nem presença BR. Tendência tecnológica (armadilha inteligente) — item de roadmap P2, não ameaça. |
| **Pragueiro (upCampo)** | Válido | Grátis até 1.000 ha, MIP manual excelente (NC/NDE), sem IA. |
| **manejo.app (CNA/Agrolink)** | Válido, MONITORAR | Lançado 2025, institucional/grátis, foco MIP. Sem evidência de IA por foto. Risco = canal de distribuição Senar. |
| **Apps Embrapa** (InNat, Bioinsumos, AgroPragas) | Válido | Grátis, científicos, mas fragmentados por cultura, comparação manual, UI datada. |
| **PictureThis / Picture Insect** | Válido | Consumer/jardinagem global, UX referência, trial→US$30–50/ano. Não focados em lavoura BR. |

---

## 3. Tabela comparativa (eixo que importa: IA por foto × preço real × BR)

| App | ID por foto (IA) | Chat IA agronômico | Preço real | Anúncios | PT-BR nativo | Foco lavoura BR |
|---|---|---|---|---|---|---|
| **Rumo Pragas** | **Sim (ilimitado)** | **Sim (ilimitado)** | **GRÁTIS total** | **Não** | **Sim** | **Sim** |
| Plantix | Sim | Não (comunidade humana) | Grátis | **Sim** + venda insumo | Traduzido | Parcial (hortaliças) |
| Agrio | Sim | Não | Freemium US$4–32/mês | Não | Traduzido | Parcial |
| Aegro | Não | Não | R$500+/mês | Não | Sim | Sim (gestão) |
| Cropwise Protector | Parcial (prioriza) | Não | B2B via canal | Não | Sim | Sim (B2B) |
| Farmbox/Checkplant | Não | Não | Pago (chamariz grátis) | Não | Sim | Sim (B2B) |
| InCeres | Não | Não | B2B sob consulta | Não | Sim | Sim (precisão) |
| Climate FieldView | Indireta (NDVI) | Não | Entry/Plus + hardware | Não | Sim | Sim |
| Pragueiro | Não | Não | Grátis ≤1.000 ha | Não | Sim | Sim (MIP) |
| Embrapa (3 apps) | Não (comparação) | Não | Grátis | Não | Sim | Sim (nicho) |
| FarmSense | N/A (hardware sensor) | Não | Hardware B2B | Não | Não | Não |
| manejo.app | Não (a confirmar) | Não | Grátis (institucional) | Não | Sim | Sim (MIP) |

---

## 4. O que o Rumo Pragas JÁ TEM (verificado no código 02/jul — NÃO recomendar de novo)

| Feature | Evidência |
|---|---|
| Diagnóstico IA por foto ilimitado (grátis) | edge fn `diagnose` FREE_MODE; fluxo `diagnosis/crop-select→camera→loading→result` |
| Confiança % + top alternativas no resultado | `components/ConfidenceBar.tsx`, `components/TopAlternatives.tsx` |
| Compartilhar diagnóstico (texto, share sheet) | `app/diagnosis/result.tsx:252` (`buildShareText`) + `trackShareDiagnosis` |
| Clima na home (Open-Meteo) | `services/weather.ts:127`, `components/WeatherCard.tsx` |
| Alertas de praga clima→risco (regras) + push local | `services/alerts.ts` (ALERT_RULES umidade/temp), `services/notifications.ts` (`schedulePestAlertNotifications`) |
| Chat IA agronômico ilimitado | `app/(tabs)/ai-chat.tsx` + edge fn `ai-chat` FREE_MODE |
| Biblioteca de pragas + histórico + fila offline de diagnóstico | `app/(tabs)/library.tsx`, `history.tsx`, `services/diagnosisQueue.ts`, `components/OfflineBanner.tsx` |
| i18n estruturado (PT-BR) | módulo `i18n` importado em `services/alerts.ts:2` |

Isso já cobre P0.2, P0.5, P0.7 e P0.8 do roadmap de março — os docs-raiz estão parcialmente quitados.

---

## 5. Gaps vs concorrência (considerando que somos GRÁTIS)

Sendo grátis, o jogo NÃO é converter — é **retenção + viralidade + custo servido baixo**. Gaps reordenados por essa lente:

1. **Loop viral fraco:** share é só texto; Plantix cresce por comunidade, nós precisamos crescer por WhatsApp (imagem de card compartilhável). CAC zero é a estratégia — grátis sem viralidade = servidor pago sem crescimento.
2. **Sem loop de feedback do diagnóstico** ("a IA acertou?"): Plantix/Agrio usam para treinar o modelo e engajar. Nosso dataset proprietário BR é o moat de longo prazo — sem feedback, não construímos o moat.
3. **Alertas ainda não são regionais/crowdsourced:** temos regras clima→risco, mas Plantix/XARVIO têm radar de surto por região. Nossos próprios diagnósticos georreferenciados (GPS coarse já coletado) são a matéria-prima — ninguém no BR grátis tem isso.
4. **Clima não vira decisão:** WeatherCard mostra tempo, mas não responde "posso pulverizar hoje?" (vento/chuva/Delta-T) — feature nº1 de utilidade diária do produtor (Plantix, Agrio, FieldView têm).
5. **Biblioteca/tratamentos não funcionam offline:** campo sem sinal é a realidade BR; Pragueiro e Farmbox são offline-first.
6. **Sem export PDF do histórico:** agrônomo/banco/certificação pedem papel; Aegro/Farmbox têm.
7. **Sem coleções/personalização por cultura** (PictureThis referência) e **sem espanhol** (LATAM = expansão futura).
8. **Sem mapa de calor visual, sem talhões, sem marketplace, sem satélite** — deliberadamente P2+: são features de plataforma paga; para um app grátis são custo sem receita. Só perseguir quando houver decisão de re-monetização.

---

## 6. TOP 10 FEATURES RECOMENDADAS (impacto × esforço, quick wins primeiro)

> ⚠️ **TODAS = feature nova = GATE CEO (gate=true).** Nenhuma entra na v1.0.8 sem autorização explícita. Nenhuma pode reintroduzir cobrança/paywall. Todas devem funcionar em iOS + Android + Web.

| # | Feature | Impacto | Esforço | Racional |
|---|---|---|---|---|
| 1 | **Feedback do diagnóstico ("A IA acertou?" 👍/👎 + correção)** | ALTO | BAIXO | 1 componente no result + tabela `pragas_diagnosis_feedback` (jxcn). Constrói dataset proprietário BR (moat) + sinal de qualidade. Plantix faz. |
| 2 | **Card de compartilhamento VISUAL (imagem para WhatsApp)** | ALTO | BAIXO-MÉDIO | Evoluir `buildShareText` para card-imagem (foto + praga + confiança + logo + link da loja). Motor de crescimento orgânico nº1 no BR; `react-native-view-shot` + fallback web. |
| 3 | **"Posso pulverizar hoje?" — janela de aplicação no WeatherCard** | ALTO | BAIXO | Open-Meteo já entrega vento/chuva/umidade; derivar semáforo (bom/atenção/ruim) com regra Delta-T. Utilidade diária = retenção D30. |
| 4 | **Alertas regionais crowdsourced (radar de pragas v1, sem mapa)** | ALTO | MÉDIO | Agregar diagnósticos anonimizados por região (GPS coarse já coletado, LGPD ok se agregado) → push "aumento de lagarta-do-cartucho na sua região". Nenhum app grátis BR tem. Base: `services/notifications.ts` já existente. |
| 5 | **Biblioteca + tratamentos 100% offline (cache local)** | ALTO | MÉDIO | Cache do catálogo/último histórico. Padrão obrigatório: `if (!isOnline && Platform.OS !== 'web')` — guard NUNCA no web (regra da skill). |
| 6 | **Export PDF do histórico de diagnósticos** | MÉDIO-ALTO | BAIXO | `expo-print` (iOS/Android) + print CSS (web). Destrava uso profissional (agrônomo documenta, banco pede) sem custo de servidor. |
| 7 | **Notificações sazonais por cultura ("minhas culturas")** | MÉDIO-ALTO | BAIXO-MÉDIO | Usuário marca culturas → push de época ("época de percevejo na soja"). Calendário agrícola BR estático + prefs existentes (`notificationPreferences.ts`). |
| 8 | **Mapa de calor de pragas (visualização do #4)** | MÉDIO-ALTO | MÉDIO-ALTO | Heatmap por município/UF dos dados agregados do #4. Cuidado web: mapa precisa lib compatível react-native-web (ex.: MapLibre/Leaflet no web). Só depois do #4 provar volume. |
| 9 | **Consulta de defensivos registrados (Agrofit/MAPA) — informativo** | MÉDIO | MÉDIO | Listar produtos REGISTRADOS para praga×cultura com link à bula. ⚠️ Jurídico: NUNCA recomendar dose (responsabilidade objetiva CDC art.14 — lição RM catálogo); só informação pública MAPA + disclaimer "consulte um engenheiro agrônomo". Gate CEO + revisão advogado-brasil. |
| 10 | **Espanhol (LATAM)** | MÉDIO (longo prazo) | MÉDIO | i18n já estruturado → custo marginal de tradução. Argentina/Paraguai/Colômbia sem player grátis de IA de pragas. Só após consolidar BR. |

**Fora do top 10 (deliberado):** comunidade/fórum (custo de moderação alto p/ app grátis), satélite NDVI, talhões/gestão, marketplace de insumos, receituário agronômico digital (CONFEA 1.149/2025 — só faz sentido COM re-monetização B2B), armadilhas IoT (tendência FarmSense, horizonte 12m+).

---

## 7. Achados (formato audit)

| ID | Sev | Achado | Evidência | Fix proposto | Gate |
|---|---|---|---|---|---|
| C-01 | MÉDIO | Sem loop de feedback do diagnóstico — dataset proprietário (moat) não está sendo construído | `expo-app/app/diagnosis/result.tsx` (sem wasHelpful/thumbs; grep negativo) | Feature #1 do top 10 | ✅ CEO (feature nova) |
| C-02 | MÉDIO | Share do diagnóstico é só texto — loop viral (estratégia central de um app grátis) subaproveitado | `expo-app/app/diagnosis/result.tsx:252` (`buildShareText`) | Feature #2 | ✅ CEO (feature nova) |
| C-03 | MÉDIO | Alertas são clima→regra local; não há radar regional apesar de o app já coletar GPS coarse por diagnóstico | `expo-app/services/alerts.ts` (ALERT_RULES estáticas) | Feature #4 (agregação anonimizada) | ✅ CEO (feature nova + agregação de dados) |
| C-04 | MÉDIO | Biblioteca/tratamentos exigem rede; concorrentes BR de campo são offline-first | `expo-app/services/` (sem cache de library; só `diagnosisQueue.ts` p/ fila) | Feature #5 (com guard `Platform.OS !== 'web'`) | ✅ CEO (feature nova) |
| C-05 | BAIXO | WeatherCard informa clima mas não decide (janela de pulverização) | `expo-app/services/weather.ts:127` + `components/WeatherCard.tsx` | Feature #3 | ✅ CEO (feature nova) |
| C-06 | BAIXO | Sem export PDF do histórico (Aegro/Farmbox têm) | grep `pdf|print` negativo em `expo-app/app/`, `lib/` | Feature #6 | ✅ CEO (feature nova) |
| C-07 | BAIXO | `PESQUISA_CONCORRENTES_BRASIL.md` §7 ainda propõe monetização paga (R$49/149/mês) sem nota de supersedência — risco de agente/pessoa futura usar como fonte e violar o pivot grátis | `PESQUISA_CONCORRENTES_BRASIL.md:834-873` | Nota de supersedência no topo do §7 (adicionada 02/jul por este audit — só doc, não código) | Não (doc interno) |
| C-08 | BAIXO | manejo.app (CNA/Senar) sem IA de foto hoje, mas com canal de distribuição capaz de 100k usuários/6m — sem rotina de monitoramento | `COMPETITOR_ANALYSIS.md` (seção novo concorrente 01/jul) | Re-checar trimestral (out/2026) por firecrawl; alerta se lançarem IA de foto | Não |

Nenhum achado CRITICAL ou ALTO: a posição competitiva pós-pivot grátis é a MELHOR do mercado BR no eixo core. Os gaps são de crescimento/retenção, não de paridade mínima.

---

## 8. Fontes (02/jul)

- plantix.net/pt/download · play.google.com (com.peat.GartenBank) · gsma.com (case Plantix deep learning)
- agrio.app · apps.apple.com/br (Agrio: fitossanitário) · flypix.ai/agrio-tool-review (review 2026)
- aegro.com.br · capterra.com.br/software/216112/aegro · Agro Espresso (crescimento 30% 1º tri 2026, meta R$42M)
- cropwise.com/protector · checkplant.com.br · play.google.com (Farmbox Classic)
- inceres.com.br · sna.agr.br (plataforma InCeres) · farmsense.io (FlightSensor, Almond Conference 2025)
- agrolink.com.br (manejo.app) · climate.com/pt-br (blog monitoramento de pragas)
