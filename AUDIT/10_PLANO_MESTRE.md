# 10 — PLANO MESTRE · Rumo Pragas IA (Mega-Audit Lançamento 02/jul/2026)

> Sintetizado a partir das fases 00–09, 11 e 13 + verify adversarial + fixers.
> Branch: `perfect/pragas-launch-2026-07-02` (main = `b6e5716`).
> **Já corrigido nesta rodada (EXCLUÍDO da lista):** D1 contraste WCAG AA (commit `701df06`) · L3 docs ASO pagos deprecados (commit `ad46f8f`). Gate de testes: typecheck ✅ · lint ✅ · jest 440/440 ✅.
> Convenção: itens marcados **[GATE]** exigem decisão/autorização do CEO — agrupados também na seção final.

---

## LISTA ÚNICA ORDENADA — O QUE RESTA

### 🔴 CRÍTICO

| # | ID | Item | Ação | Gate |
|---|---|---|---|---|
| 1 | **DB-C1** | **Drift de schema `pragas_profiles` prod ≠ código** — prod tem `id=gen_random_uuid()≠auth.uid` (59/59 linhas) e NÃO tem `push_token/notification_preferences/city/state/crops`. Salvar perfil **falha sempre** (23502), load vem vazio, avatar nunca persiste, prefs de notificação revertem na cara do usuário (iOS/Android/Web). | 2 pernas no MESMO release 1.0.8: (a) migration aditiva pragas-only no jxcn (`ADD COLUMN IF NOT EXISTS push_token, notification_preferences, city, state, crops, deletion_requested_at`); (b) sweep client `id`→`user_id` nos 8 call sites (`edit-profile.tsx` ×3, `settings.tsx`, `notificationPreferences.ts` ×2, `useNotifications.ts`, `googleAuth.ts`/`appleAuth.ts`) com `onConflict:'user_id'` (unique já existe em prod). Ordem: **migration → edge → binário**. | **[GATE]** migration em jxcn compartilhado + decisão da forma canônica |
| 2 | **L1 (lançamento)** | **iOS 1.0.7 REJECTED no ASC** (submissão 02/jul 12:47 UTC em UNRESOLVED_ISSUES) — o "WAITING_FOR_REVIEW intocável" do plano está superado. Motivo só no Resolution Center (UI-only). Forte candidato a causa: **L2 — Review Notes ainda descrevem app PAGO** ("Assinar Pro", paywall, IAP, conta expired) num app 100% grátis com subs deletadas. | CEO abre Resolution Center → reescrever Review Notes p/ modelo grátis (via `update-app-store-review-detail`, write ASC) → popular 2–3 diagnósticos na conta demo (L8) → resubmeter a MESMA 1.0.7 (build novo SÓ se o motivo exigir binário). **NUNCA cancelar a submissão** (cai DEVELOPER_REJECTED). | **[GATE]** UI-only + write ASC |

### 🟠 ALTO

| # | ID | Item | Ação | Gate |
|---|---|---|---|---|
| 3 | **DB-A1** | **Push remoto morto fim-a-fim** — 3 quebras: RPC `touch_push_token` NÃO existe em prod; write legacy em `pragas_profiles.push_token` (coluna inexistente) lança throw que aborta o fallback; edge fn `send-push` v26 lê `pragas_push_tokens.expo_token/is_active` (colunas inexistentes — prod só tem `token/platform`). Nenhum push jamais será entregue mesmo com FCM ok. | Migration pragas-only (`ADD COLUMN expo_token, is_active, device_info, last_seen_at` + `CREATE FUNCTION touch_push_token` SECDEF `search_path=''` + GRANT authenticated) + redeploy coordenado de `send-push` + fix client `useNotifications.ts`. Empacotar junto do DB-C1 (mesma janela). | **[GATE]** migration + deploy edge fn |
| 4 | **L1 (legal)** | **Web /termos e /privacidade (16/abr) contradizem o modelo grátis e descrevem OUTRO produto** — termos §7 reembolso de assinatura, §8 suspensão por falta de pagamento; privacidade declara telefone/CPF/Stripe/OneSignal/PostHog e finalidade de GPS errada ("talhões, máquinas, apontamentos", "condição do animal" — template Máquinas/Vet); não declara lat/lng junto da foto. 4ª perna do pivot grátis ABERTA — reviewer que abrir a URL da política lê que o app cobra. | Reescrever termos+privacidade da landing Astro espelhando o in-app de 01/jul (grátis; sub-operadores reais: Supabase, Anthropic, Open-Meteo, Sentry, Expo push; GPS honesto fail-closed). Empacotar L2-legal (foro Goiânia abusivo → sede + ressalva consumidor) e L3-legal (páginas de exclusão: sem senha, caminho "Ajustes", prazo imediato/15d — hoje 3 prazos diferentes) na MESMA autorização. | **[GATE]** ZERO-N landing prod — `CEO_CODE_AUTH` |
| 5 | **W1** | **Web deploy 100% atrás de Vercel Authentication + sem domínio custom** — nenhum usuário real acessa o web hoje (302 SSO); `/api/mcp` inalcançável externamente. | Decisão binária: (a) web NÃO é superfície de lançamento → documentar "web privado por decisão", zero ação; (b) web público → desativar Deployment Protection + domínio custom (`app.pragas.agrorumo.com`) + aplicar CSP (W2) antes. | **[GATE]** decisão de produto |
| 6 | **L8 (legal) / M1 (mapa)** | **`delete-user-account` prod = v12 (~13/mai)**, anterior aos fixes LGPD do repo (app-scoping em `subscriptions`/`chat_usage` — sem ele a exclusão via Pragas apaga dados do usuário em apps IRMÃOS; purga de `pragas_push_tokens`). Promessa legal nova executada por código velho. | Diff `get_edge_function` vs repo → redeploy. ANTES: confirmar que nenhum app irmão invoca o slug genérico `delete-user-account` no jxcn. Carona: alinhar `STORAGE_BUCKETS` p/ `["pragas-images","avatars"]` (SP-04). | **[GATE]** deploy de fn com slug genérico em projeto shared |

### 🟡 MÉDIO

| # | ID | Item | Ação | Gate |
|---|---|---|---|---|
| 7 | Q1 | Abas Histórico/Biblioteca/IA-Chat sem inset superior de safe-area (conteúdo sob status bar em iPhone notch e Android 15 edge-to-edge) | `SafeAreaView` de `react-native-safe-area-context` `edges={['top']}` nas 3 telas | não |
| 8 | Q2 | Telas modal/card importam `SafeAreaView` de `react-native` (no-op no Android): camera, crop-select, result, pest/[id], consent-location, edit-profile | Trocar import p/ safe-area-context com `edges` | não |
| 9 | SP-01 | **Sessão web não persiste** — `SecureStoreAdapter` retorna null no web → todo refresh desloga | Adapter por plataforma (localStorage no web), ~6 linhas | não |
| 10 | SP-02 | Device compartilhado: signOut sem sweep local — chat history global, fila offline sem userId (foto+GPS de A viram diagnóstico de B), push token ativo pós-logout | 1 commit: userId no enqueue + sweep no signOut + chave de chat escopada por uid | não |
| 11 | A1 (IA) | Fila offline sem idempotência → diagnósticos duplicados + gasto duplo de Anthropic Vision | `client_request_id` UUID no capture + `ON CONFLICT DO NOTHING RETURNING` no edge fn | não |
| 12 | A2 (IA) | Path offline (fila+sync) roda no web com `documentDirectory=null` → erro em vez de mensagem limpa | Guard `Platform.OS !== 'web'` no enfileiramento e no sync (regra nº1 da skill) | não |
| 13 | A3 (IA) | "Pastagem" ausente do crop-select apesar de estar no catálogo MIP — produtor de pastagem diagnostica sem hint de cultura | Adicionar cultura em `CROPS` + `VALID_CROP_TYPES` + `cropMap` (mesmo commit + deploy diagnose) | **[GATE]** decisão de produto |
| 14 | A4 (IA) | Modelo de visão = Haiku 4.5 (barato, menos acurado) para decisão fitossanitária | Decidir: manter / Sonnet só no diagnose / A-B por faixa de confiança — medir com A6 antes | **[GATE]** custo/OPEX |
| 15 | P-01 | Settings badge-ia usuário grátis como "Enterprise" + diamante + "obrigado por apoiar" (sinal de tier pago que o reviewer procura; app já rejeitado 4× por IAP) | Badge neutro ("Acesso completo"/folha) + tagline sem "apoiar"/"Enterprise" na 1.0.8 | não |
| 16 | DB-A2 | Storage `pragas-images`: SELECT aberto p/ role public (anon key) sem checagem de dono; INSERT sem trava de pasta; sem size/mime limit. Bucket vazio hoje | Endurecer AGORA enquanto vazio (policies por `auth.uid()` + limits) ou remover bucket | **[GATE]** policy storage em prod shared |
| 17 | DB-M1 | Trigger `notify_outbreak_reported` referencia coluna inexistente → qualquer INSERT em `pragas_outbreaks` aborta (bomba na feature fantasma) | `DROP TRIGGER` ou corrigir — junto da decisão B4 (schema comunidade) | **[GATE]** DDL prod |
| 18 | DB-M2 | `handle_new_pragas_user` roda p/ TODO signup do jxcn — dados pessoais copiados p/ tabelas do Pragas sem uso (LGPD minimização; 59/59) | Decisão de portfólio: filtrar por `raw_user_meta_data->>'app'` OU aceitar e documentar (SSO multi-app) | **[GATE]** trigger em `auth.users` shared |
| 19 | DB-M3 | Migrations do repo ≠ histórico prod (repo não é fonte de verdade — causa-raiz de DB-C1/DB-A1) | Gerar baseline real do prod (`SCHEMA_PROD.md` ou dump filtrado) ANTES da próxima migration | não (documental) |
| 20 | A1 (arq) | 3 suítes de teste desabilitadas escondem cobertura (diagnosisQueue = fila offline core) | Desflakar e reativar (prioridade diagnosisQueue) ou deletar+documentar | não |
| 21 | A2 (arq) | `api/mcp/` sem Sentry (gap ZERO-O) — 500s invisíveis | `captureException` no catch do server.ts | não |
| 22 | L4 (lançamento) | Time-to-value: conta obrigatória + 3 prompts nativos antes do 1º diagnóstico; push prompt "frio" logo após login → opt-in despenca | (a) adiar push prompt p/ pós-1º-diagnóstico com pre-prompt PT-BR; (b) avaliar modo visitante | **[GATE]** comportamento novo |
| 23 | L5 (lançamento) | Universal/App Links "pega-tudo" (`paths:["*"]`) — links de /termos, /suporte, /excluir-conta abrem o APP em 404 | Restringir AASA/assetlinks (repo landing) + `pathPrefix` no app.json 1.0.8, ou `+native-intent.tsx` | **[GATE]** deploy landing + build |
| 24 | L6 (lançamento) | `rumopragas://update-password` precisa estar na allowlist de Redirect URLs do jxcn (não verificável por SQL; fluxo com 1 uso na história) | Conferir Dashboard jxcn → Auth → URL Config; smoke E2E do reset real | não (verificação) |
| 25 | L7 (lançamento) | Template/sender do e-mail de recovery é o do jxcn compartilhado (possível EN/marca genérica) | Ler template no Dashboard; personalizar PT-BR neutro multi-app | **[GATE]** config shared afeta todos os apps |
| 26 | L5 (legal) | Consent promete revogação "em Ajustes > Privacidade", mas não há toggle de localização lá (LGPD art. 8º §5) | Barato sem gate: corrigir copy p/ "Ajustes do celular". Preferido: switch de revogação (UI nova) | **[GATE]** só a opção switch |
| 27 | L4/L6/L7 (legal) | Emendas de texto in-app: §3 diz que fotos "são armazenadas em buckets" (não são); §4 omite Sentry/push-token/transferência internacional e cita "pagamentos" inexistente; sem cláusula de menores de 18 | 1 commit `fix(legal)` na privacy.tsx + terms.tsx (1.0.8) | não |
| 28 | M2 (mapa) | Push Android: sem `googleServicesFile` — credencial FCM V1 no EAS não confirmada | `eas credentials -p android` verificar/anexar | não |
| 29 | M3 (mapa) | Envs `EXPO_PUBLIC_SUPABASE_*` não inline no eas.json — ZERO-L exige plaintext antes do build 1.0.8 | `eas env:list --environment production` confirmar | não |
| 30 | W2 | App web sem CSP + `X-XSS-Protection` deprecado | Aplicar CSP Report-Only quando decidir W1 | não |
| 31 | W3 | Secrets órfãos no Vercel: `SUPABASE_SERVICE_ROLE_KEY` + `MCP_API_TOKEN` sem caller (risco latente de bypass RLS) | `vercel env rm` dos dois + debris `NEXT_PUBLIC_*` | não |
| 32 | D2 | Duas famílias de verde convivendo (AI-slop: `#0F6B4D/#29B887/#4CAF50` + teal WeatherCard) | Unificar no verde-campo do DS — Onda 2 de design | não |
| 33 | D3 | `DarkColors` morto; dark mode 100% ad-hoc (126 `isDark &&` inline) | `lightColors/darkColors` + `useThemeColors()` — Onda 2 | não |
| 34 | D4 | 84 cores hex hardcoded fora do token | Mapear a tokens — Onda 2 | não |
| 35 | D5 | Touch targets <44pt sem hitSlop (mão com luva) | `hitSlop`/`minHeight:44` nos alvos-ícone | não |

### 🟢 BAIXO

| # | ID | Item | Gate |
|---|---|---|---|
| 36 | Q3/B5/P-02/A3(arq) | Código morto de paywall/gating (push('/paywall') órfãos, purchases.ts, trial-counter) — latente 2.3.2; + teste de regressão "paywall não renderiza CTA" | **[GATE]** qualquer mexida em superfície de cobrança |
| 37 | Q4 | Biblioteca: itens de praga não tocáveis (expectativa frustrada) — ligar à ficha `/diagnosis/pest/[id]` | não |
| 38 | Q5 | `+not-found` sem dark mode, verde fora do token | não |
| 39 | Q6 | Onboarding com insets hardcoded (barra de gestos Android) | não |
| 40 | Q7/P-03 | Constantes/strings mortas de plano pago (`FREE_MONTHLY_DIAGNOSES`, `PLAN_LIMITS`, preços i18n defasados) | não |
| 41 | P-04 | RevenueCat inicializado a cada login (benigno, inconsistente) — guard de flag | não |
| 42 | P-05/B2 | Verificar `supabase secrets list` que não há `FREE_MODE=false` + smoke 4º diagnóstico/11ª msg | não |
| 43 | P-06 | privacy.tsx cita "processamento de pagamentos" (coberto no item 27) | não |
| 44 | A5 (IA) | Edge fn sem AbortController no fetch à Anthropic → linhas órfãs pós-timeout do cliente | não |
| 45 | A6 (IA) | Sem telemetria de acurácia nem loop de feedback (pré-requisito da decisão A4 e da feature #1) | não |
| 46 | A7 (IA) | `cropApiName` cai silenciosamente em 'Soybean' — enviar vazio | não |
| 47 | A8 (IA) | Limiar invalid_image <0.5 agressivo + persiste foto ruim no histórico | não |
| 48 | A4/A5 (arq) | result.tsx god component (1.545 linhas); 66 `console.*` sem logger central | não |
| 49 | SP-03 | vercel.json sem HSTS/Permissions-Policy (app web) | não |
| 50 | SP-04 | Purge de exclusão aponta bucket "diagnoses" (inexistente) — alinhar no redeploy L8/M1 | **[GATE]** carona no item 6 |
| 51 | SP-05/SP-06 | Contexts sem useMemo no value; `DiagnosisContext.reset()` nunca chamado (base64 retida no heap) | não |
| 52 | SP-07 | Bundle web 6,8–7,1MB chunk único (cold start 3G rural) | não |
| 53 | SP-08 | `fetchWeather` sem timeout | não |
| 54 | SP-09 | Confirmar que o deploy Vercel do api/mcp é a versão JWT (não token estático) | não |
| 55 | DB-B1/B2/B3 | Higiene: policies duplicadas; colunas de coordenada órfãs; catálogo `pragas` sem consumer | **[GATE]** DDL prod |
| 56 | B4 (mapa) | 9 tabelas comunidade/outbreaks sem tela (ghost schema) — decidir roadmap ou remoção | **[GATE]** decisão de produto |
| 57 | B6 (mapa)/L9 (lançamento) | Debris: `.aab` na raiz, `dist/` stale, `store-screenshots/` com print de erro, worktree defasada; eleger `expo-app/store-assets/` fonte única de screenshots | não |
| 58 | L8 (lançamento) | Popular 2–3 diagnósticos na conta demo `pragas.review@agrorumo.com` antes do resubmit | não |
| 59 | L10 (lançamento) | Corrigir `/support`→`/suporte` no doc aso-final.md | não |
| 60 | L11 (lançamento) | Subir metadata do repo p/ ASC/Play (remove claim "82,5%" forte demais; injeta "100% grátis") | **[GATE]** write de loja |
| 61 | L9 (legal) | Fila `deletion_requests` sem writer — runbook de suporte agora; form web depois | **[GATE]** só o form |
| 62 | L10 (legal) | Permission string promete "alertas de infestações próximas" — feature sem tela (suavizar copy ou priorizar feature #4) | não (copy) |
| 63 | D6–D9 | Adoção parcial de tokens; teal WeatherCard; PDF com paleta antiga; sem fonte de marca (Poppins) | D9 = **[GATE]** |
| 64 | C-08 | Monitoramento trimestral do manejo.app (CNA/Senar) — alerta se lançarem IA de foto | não |
| 65 | W5/W6 | api/mcp sem CORS (ok server-to-server); offline-path web funciona via NetInfo (documentado) | não |

> **Cauda:** 76 achados MEDIUM/LOW adicionais não passaram pelo verify adversarial — tratá-los como backlog de higiene, re-triados oportunisticamente (nenhum é candidato a CRITICAL pela triagem das fases).

---

## FEATURES NOVAS CANDIDATAS (de 06_CONCORRENTES — todas **[GATE]** CEO)

Lente correta para um app grátis: **retenção + viralidade + custo servido baixo** (não conversão). Ordenadas por impacto × esforço, com escopo mínimo viável:

| # | Feature | Impacto/Esforço | MVP (escopo mínimo) |
|---|---|---|---|
| 1 | **Feedback do diagnóstico ("A IA acertou?" 👍/👎)** | ALTO / BAIXO | 1 componente no result.tsx gravando em `pragas_diagnosis_feedback` (tabela já existe, RLS own). Constrói o dataset proprietário BR (moat) e destrava a decisão Haiku×Sonnet (A4) com dados. Sinergia direta com A6. |
| 2 | **Card de compartilhamento VISUAL p/ WhatsApp** | ALTO / BAIXO-MÉDIO | Evoluir `buildShareText` → imagem (foto + praga + confiança + logo + link da loja) via `react-native-view-shot` + fallback web. Motor de CAC-zero nº1 no BR. |
| 3 | **"Posso pulverizar hoje?" (janela de aplicação)** | ALTO / BAIXO | Open-Meteo já entrega vento/chuva/umidade → semáforo bom/atenção/ruim com regra Delta-T no WeatherCard. Utilidade diária = retenção D30. |
| 4 | **Radar regional de pragas v1 (sem mapa)** | ALTO / MÉDIO | Agregação anonimizada dos diagnósticos por região (GPS coarse já coletado, LGPD ok se agregado) → push "aumento de lagarta-do-cartucho na sua região". Ninguém no BR grátis tem. Também SANEIA o item 62 (permission string que promete alertas). |
| 5 | **Biblioteca + tratamentos offline** | ALTO / MÉDIO | Cache local do catálogo (dataset já é local — falta garantir imagens/tratamentos). Padrão obrigatório `if (!isOnline && Platform.OS !== 'web')`. |
| 6 | **Export PDF do histórico** | MÉDIO-ALTO / BAIXO | `expo-print` (já usado no result) estendido à lista do histórico + print CSS web. |
| 7 | **Notificações sazonais por cultura** | MÉDIO-ALTO / BAIXO-MÉDIO | Calendário agrícola BR estático × culturas do perfil → push de época. Depende de push funcionando (DB-A1!). |
| 8 | **Mapa de calor de pragas** | MÉDIO-ALTO / MÉDIO-ALTO | Só depois do #4 provar volume; web exige MapLibre/Leaflet. |
| 9 | **Consulta de defensivos registrados (Agrofit/MAPA)** | MÉDIO / MÉDIO | Informativo apenas: produtos REGISTRADOS praga×cultura + link à bula. ⚠️ NUNCA recomendar dose (CDC art. 14 — lição RM). Revisão advogado-brasil obrigatória. |
| 10 | **Espanhol (LATAM)** | MÉDIO / MÉDIO | i18n já estruturado; só após consolidar BR. |

**Fora deliberado:** comunidade/fórum, satélite NDVI, talhões, marketplace, receituário digital, IoT — features de plataforma paga; custo sem receita num app grátis.

---

## DECISÕES DO CEO (todos os gate=true consolidados)

1. **iOS REJECTED (L1+L2)** — abrir Resolution Center (UI-only), autorizar reescrita das Review Notes p/ modelo grátis e o resubmit da 1.0.7. NÃO cancelar a submissão. *(bloqueia o lançamento iOS)*
2. **Pacote DB v1.0.8 (DB-C1 + DB-A1)** — autorizar migration aditiva em jxcn (`pragas_profiles` + `pragas_push_tokens` + RPC `touch_push_token`) + redeploy `send-push` + sweep client, na ordem migration→edge→binário. *(perfil e push quebrados p/ 100% dos usuários)*
3. **Pacote legal web (L1+L2+L3 legal)** — 1 autorização ZERO-N (`CEO_CODE_AUTH`) para reescrever /termos, /privacidade, /excluir-conta e /delete-account da landing Astro. *(4ª perna do pivot grátis; risco de rejeição por contradição)*
4. **Redeploy `delete-user-account` (L8/M1 + SP-04)** — após confirmar que nenhum app irmão invoca o slug genérico. *(exclusão LGPD roda código de maio; risco de apagar dados de apps irmãos)*
5. **Web público ou privado (W1/W4)** — decidir se o web é superfície de produto; se sim: tirar Vercel Auth + domínio + CSP; se não: documentar. 
6. **Features novas** — quais do top 10 entram na v1.0.8/1.0.9 (recomendação: #1 feedback + #3 pulverização + #2 share card; #4 radar em seguida — resolve tb o item 62).
7. **Pastagem no crop-select (A3-IA)** — cultura nova (superfície PT-BR + deploy diagnose).
8. **Modelo de visão (A4-IA)** — manter Haiku / Sonnet no diagnose / A-B por confiança (medir com A6/feature #1 antes).
9. **Storage + schema fantasma (DB-A2, DB-M1, DB-B1–B3, B4)** — endurecer `pragas-images` enquanto vazio; drop do trigger quebrado de outbreaks; decidir destino das 9 tabelas de comunidade.
10. **Trigger de signup jxcn (DB-M2)** — decisão de PORTFÓLIO: filtrar `handle_new_pragas_user` por app ou aceitar perfil pré-criado (afeta o padrão de todos os apps não-RM).
11. **Onboarding/push timing (L4 lançamento)** — pre-prompt de push pós-1º-diagnóstico + modo visitante (maior alavanca de conversão restante).
12. **Universal links (L5)** — restringir AASA/assetlinks (deploy landing) + pathPrefix no build 1.0.8.
13. **E-mail de recovery do jxcn (L7)** — personalizar template/sender PT-BR neutro (afeta todos os apps do projeto).
14. **Metadata de loja (L11)** — subir copy nova do repo (remove claim "82,5%", injeta "100% grátis") no resubmit.
15. **Código morto de paywall (Q3/B5/A3-arq)** — autorizar higienização dos call-sites órfãos na v1.0.8 (sem tocar o mecanismo de reversão documentado).
16. **Fonte de marca Poppins (D9) + Onda 2 de design** — aprovar (ou não) a proposta de tokens do 03_DESIGN (fundo #FAFAF7 + verde-ação #2E7D32) antes de qualquer aplicação visual.
