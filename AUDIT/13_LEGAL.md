# 13_LEGAL — Auditoria Legal/LGPD · Rumo Pragas IA

> [!CAUTION]
> **ARQUIVO HISTÓRICO — NÃO É AVISO LEGAL NEM POLÍTICA VIGENTE.**
> A legislação, os provedores e o fluxo de exclusão descritos abaixo podem estar superados. Use
> as páginas públicas atuais e `docs/audit/launch-coverage-2026-07-14.md`.

**Data:** 2026-07-02 · **Branch:** `perfect/pragas-launch-2026-07-02` (read-only) · **Fase:** mega-audit de lançamento
**Escopo:** privacidade/termos in-app e web, controlador/DPO, consentimento GPS/câmera, exclusão de conta ponta-a-ponta, retenção, menores.
**Nota da dimensão (estado atual): 6.5/10** — o pacote legal **in-app** está forte após os fixes de 01–02/jul; o que derruba é a **web** (landing Astro de 16/abr nunca acompanhou o pivot grátis nem o produto real) e o drift repo↔prod da edge fn de exclusão.

---

## ✅ Verificado OK no estado ATUAL (não re-reportado)

| Item | Evidência |
|---|---|
| **CNPJ 57.169.838/0001-20 — DV mod-11 VÁLIDO** (validado localmente nesta auditoria: DV calc 2-0 = DV real) | script mod-11 executado 02/jul |
| Controlador MM CAMPO FORTE LTDA. + DPO contato@agrorumo.com presentes nas 4 superfícies: in-app privacy §10, in-app terms §13, web /privacidade, web /termos | `expo-app/app/privacy.tsx:296-304`, `expo-app/app/terms.tsx:166-171`, páginas live 200 |
| Privacidade in-app declara HONESTAMENTE que lat/lng acompanha a foto no pedido de diagnóstico, com fail-closed sem consentimento (fix do megaaudit 01/jul aplicado) | `expo-app/app/privacy.tsx:150-160`; `supabase/functions/diagnose/index.ts:770-782` persiste lat/lng só com opt-in |
| Termos in-app §9 = 100% grátis, com cláusula futura de cobrança + CDC art. 49; §14 foro com ressalva do consumidor (CDC art. 101, I) | `expo-app/app/terms.tsx:122-132,174-183` |
| Consentimento GPS: tela dedicada, opt-in explícito, propósito registrado no banco (`CONSENT_PURPOSE_PT`), decisão gravada em `user_preferences`, back-button Android bloqueado, padrão Apple 5.1.1(iv) | `expo-app/app/consent-location.tsx:38-39,52-56,76-122` |
| Strings de permissão iOS/Android 100% PT-BR, honestas, marcando localização como opcional; Android usa só `ACCESS_COARSE_LOCATION` | `expo-app/app.json` (infoPlist + plugins expo-camera/expo-image-picker/expo-location) |
| Câmera: base legal correta — consentimento via prompt nativo do SO no primeiro uso, finalidade declarada na permission string e na política §1; nenhuma captura ocorre sem gesto do usuário | `app.json` NSCameraUsageDescription; fluxo `diagnosis/camera` |
| Exclusão in-app: JWT verify → RC cancel → storage → tabelas (app-scoped em `subscriptions`/`chat_usage`) → `pragas_push_tokens` purgado → `pragas_profiles` → auth delete; erros parciais instrumentados no Sentry (ZERO-O) | `supabase/functions/delete-user-account/index.ts:40-58,265-399` |
| Confirmação de exclusão avisa que a conta AgroRumo é global ("usada para entrar em todos os apps AgroRumo") — fix do blast-radius aplicado na copy | `expo-app/i18n/locales/pt-BR.ts:369-371` |
| `process-deletions` (fila `deletion_requests`, cron jobid 4 03:00 UTC) instrumentado com `withSentry` + captureMessage em falha — item "cron cego" do megaaudit CORRIGIDO | `supabase/functions/process-deletions/index.ts:2,232,447-456` |
| Sentry sem PII: `sendDefaultPii:false` + `beforeSend` strip de email | `expo-app/app/_layout.tsx:61-62,214` |
| Aceite de termos no cadastro: checkbox + links para /privacy e /terms na tela de login | `expo-app/app/(auth)/login.tsx:415-483` |
| Páginas web live (todas 200): /privacidade, /termos, /privacy, /terms, /excluir-conta, /delete-account | curl 02/jul |

---

## Achados

### L1 · ALTO · gate=CEO (ZERO-N) — Web /termos e /privacidade contradizem o modelo 100% GRÁTIS e descrevem OUTRO produto
**Evidência:** páginas live `pragas.agrorumo.com/termos` e `/privacidade` datadas **16/abr/2026**:
- Termos §7 "Cancelamento e Reembolso": "Você pode cancelar sua **assinatura**… reembolso pro-rata…"; §8 suspensão por "**Falta de pagamento** por mais de 14 dias" — não existe cobrança (in-app terms §9 diz "nenhuma cobrança").
- Privacidade §1/§3 declaram coleta de **telefone, CPF, dados de pagamento (Stripe)**, sub-operadores **Stripe, OneSignal, PostHog** e finalidade de GPS **errada** ("registrar coordenadas de **talhões, máquinas**, ocorrências ou **apontamentos**"; câmera para "**condição do animal**, ocorrência operacional") — texto-template de outros apps (Máquinas/Vet), não descreve o Pragas. Não declara que lat/lng acompanha a foto do diagnóstico (a in-app declara).
**Risco:** 4ª perna do pivot grátis ("legal/landing coerentes") continua aberta — vetor documentado de rejeição Apple (exatidão) e violação de transparência/exatidão LGPD art. 6º, V–VI. Reviewer que abrir a URL da política declarada na loja lê que o app cobra assinatura.
**Fix proposto:** reescrever termos/privacidade da landing Astro espelhando o conteúdo in-app de 01/jul (grátis; sub-operadores reais: Supabase, Anthropic, Open-Meteo, Sentry, push Expo; GPS = contexto regional junto da foto, fail-closed; sem Stripe/OneSignal/PostHog se não usados). **Landing prod = design/copy locked (ZERO-N) → execução só com autorização CEO.**

### L2 · MÉDIO · gate=CEO (ZERO-N) — Foro de eleição conflitante entre superfícies e cláusula potencialmente abusiva na web
**Evidência:** web /termos §10: "foro da Comarca de **Goiânia/GO, com renúncia a qualquer outro**" vs in-app terms §14: Ribeirão Preto/SP **com ressalva do domicílio do consumidor**. Empresa sediada em Araraquara/SP.
**Risco:** cláusula de renúncia em contrato de consumo é nula/abusiva (CDC art. 51, IV c/c art. 101, I); Goiânia não tem vínculo com o controlador — cheiro de template.
**Fix:** padronizar nas duas superfícies o modelo in-app (foro da sede + ressalva expressa do domicílio do consumidor). Landing = gate CEO.

### L3 · MÉDIO · gate=CEO (ZERO-N) — Páginas web de exclusão com prazos e instruções que não batem com o app real
**Evidência:** `/excluir-conta` e `/delete-account` (18/abr):
- "Confirme a ação **digitando sua senha**" — o app **não pede senha** (alert de confirmação, `settings.tsx:444-487`).
- "Toque em **Configurações** (engrenagem no canto superior direito)… Role até **Conta**" — no app é a aba **Ajustes**, sem esses nomes.
- Método in-app: "conta **marcada** para exclusão… dados apagados **em até 15 dias**" — a exclusão in-app é **imediata** (edge fn síncrona). Web /privacidade §6 diz "**até 30 dias**". In-app privacy §7 e terms §10 dizem **imediata**. Três prazos diferentes para o mesmo direito.
- Detalhe: in-app terms §10 aponta para `/delete-account` (página em **inglês**); o ideal para PT-BR é `/excluir-conta`.
**Risco:** Google Play Data Safety exige "Account deletion URL" pública com instruções **precisas**; divergência de prazo entre superfícies enfraquece a defesa LGPD (art. 9º, transparência).
**Fix:** atualizar as duas páginas: método in-app = imediato, sem senha, caminho "Ajustes → Excluir Conta"; método e-mail = até 15 dias (mantém); alinhar /privacidade §6 (30d → imediato in-app / 15d via solicitação). In-app: trocar URL do §10 para `/excluir-conta` no build 1.0.8 (edit de app, sem gate). Páginas web = gate CEO.

### L4 · MÉDIO · sem gate (texto in-app) + verificação prod — Política afirma que as fotos são "armazenadas em buckets seguros", mas o servidor NÃO armazena imagem
**Evidência:** in-app privacy §3 (`privacy.tsx:141-145`): "As imagens enviadas para análise **são armazenadas em buckets seguros** com controle de acesso por usuário". O fluxo real: `diagnose` fn recebe base64, envia à Anthropic e **não grava a imagem** — o INSERT em `pragas_diagnoses` persiste só crop/pest/confidence/notes/lat-lng (`supabase/functions/diagnose/index.ts:771-782`); nenhuma chamada a storage na fn; fotos ficam no device (`services/diagnosisQueue.ts`). Web /privacidade repete pior: "ficam armazenadas no Supabase Storage (US-East)… podem ser apagadas a qualquer momento dentro do app".
**Risco:** inexatidão (LGPD art. 6º, V) e labels de App Privacy inflados; também confunde o próprio time (a purga de exclusão varre bucket `diagnoses` que o fluxo atual não usa — no-op inofensivo).
**Fix:** (a) corrigir §3 no build 1.0.8: "as fotos são processadas de forma transitória para o diagnóstico e **não são armazenadas em nossos servidores**; apenas o avatar do perfil é armazenado (bucket `avatars`)"; (b) verificar em prod se o bucket legado `pragas-images` (citado no mapa fase 1) contém fotos históricas de usuários — se sim, adicioná-lo a `STORAGE_BUCKETS` das duas edge fns de exclusão antes de qualquer resposta a titular.

### L5 · MÉDIO · gate=CEO (feature nova) — Consentimento promete revogação "em Ajustes > Privacidade", mas a seção Privacidade NÃO tem toggle de localização
**Evidência:** `consent.location.footnote`: "Você poderá alterar essa escolha a qualquer momento em **Ajustes > Privacidade**" e `lgpdNotice`: "Você pode revogar a qualquer momento em Ajustes" (`i18n/locales/pt-BR.ts:914-918`); comentário do código promete o mesmo (`consent-location.tsx:75`). A seção Privacidade de Ajustes tem **apenas** links para Política e Termos (`settings.tsx:637-656`) — nenhum switch chama `setLocationConsent(user.id,false)`.
**Risco:** LGPD art. 8º §5 (revogação facilitada) + promessa falsa na própria tela de consentimento. Mitigação real: revogar a permissão no SO corta o acesso e o backend é fail-closed — mas o registro de consentimento em `user_preferences` fica ligado para sempre.
**Fix (2 opções):** (a) **preferida** — adicionar switch "Compartilhar localização" na seção Privacidade (v1.0.8) que grava `setLocationConsent(false)` — é UI nova ⇒ **gate CEO**; (b) barata, sem gate — corrigir a copy do footnote/lgpdNotice para "nos Ajustes do seu celular (permissão de localização)" enquanto (a) não sai.

### L6 · MÉDIO · sem gate — Privacidade in-app omite Sentry, tokens de push e transferência internacional; cita "processamento de pagamentos" inexistente
**Evidência:** in-app privacy §4 lista só Anthropic e Open-Meteo como destinatários (`privacy.tsx:150-173`). Faltam: (a) **Sentry** (Functional Software Inc., EUA — crash/erros; a web declara, o app não); (b) **tokens de push Expo** (`pragas_push_tokens` guarda user_id + expo_token + fingerprint de device = dado pessoal, tratado e purgado na exclusão mas nunca declarado na coleta §1); (c) **transferência internacional** (Supabase/Anthropic/Sentry em US — LGPD art. 33; a web declara, o app não); (d) §4 cita "provedores de… **processamento de pagamentos**" — não existe cobrança no modelo grátis.
**Fix:** emendar §1/§3/§4 da privacy.tsx no build 1.0.8 (adicionar Sentry + push token + cláusula art. 33; remover "processamento de pagamentos" ou condicionar a futuro). Texto legal in-app — sem gate de landing; iOS 1.0.7 em review fica intocado (mudança só na 1.0.8).

### L7 · MÉDIO · sem gate — In-app sem cláusula de menores de idade (a web tem, o app não)
**Evidência:** web /termos §3 "Você precisa ter **18 anos ou mais**" e web /privacidade §8 (crianças/adolescentes, LGPD art. 14) — mas `terms.tsx` e `privacy.tsx` in-app não têm nenhuma cláusula de idade mínima/menores.
**Risco:** LGPD art. 14 (tratamento de dados de crianças exige consentimento parental); coerência entre superfícies; rating de loja.
**Fix:** adicionar no build 1.0.8: terms.tsx §3 "conta permitida apenas para maiores de 18 anos" + privacy.tsx seção "Crianças e Adolescentes" espelhando a web.

### L8 · MÉDIO · gate=CEO (deploy edge fn — cross-ref M1 fase 1) — A exclusão in-app REAL roda código de ~13/mai (v12), anterior aos fixes LGPD do repo
**Evidência:** MCP `list_edge_functions` (fase 1): `delete-user-account` prod = **v12 (~2026-05-13)**; o repo atual contém fixes posteriores essenciais: filtro app-scoped em `subscriptions`/`chat_usage` (sem ele, a exclusão via Pragas **apaga dados do mesmo usuário em apps irmãos** — cross-app data loss) e purga de `pragas_push_tokens`.
**Risco:** hoje, quem exclui a conta pelo app recebe a promessa da política nova executada por código velho — possível eliminação além do escopo (apps irmãos) e token de push órfão (eliminação incompleta).
**Fix:** diff `get_edge_function` vs repo; se defasada, redeploy de `delete-user-account` (e conferir `process-deletions`, v18 de hoje, provavelmente já atual). **Gate:** confirmar antes que nenhum app irmão invoca o slug genérico `delete-user-account` no jxcn (fn não é prefixada `pragas_`).

### L9 · BAIXO · gate=CEO (feature nova) — Fila `deletion_requests` não tem NENHUM writer no código: o "método por e-mail" é 100% manual e sem tooling
**Evidência:** grep no repo inteiro: nenhuma inserção em `deletion_requests` (nem form web, nem rota API) — o comentário da fn confirma "web / support inserts a row" (`process-deletions/index.ts:12-17`). As páginas web prometem processamento "em até 15 dias corridos" + e-mail de confirmação.
**Risco:** o prazo prometido depende de alguém ler contato@agrorumo.com e inserir a linha à mão; se a caixa não for monitorada, estoura o prazo do art. 18 §5 e a promessa pública.
**Fix:** curto prazo — runbook de suporte documentado (quem monitora, SQL padrão de insert com `scheduled_hard_delete_at = now()+15d`); médio — form público na página /excluir-conta que insere na fila (feature nova + landing ⇒ gate CEO).

### L10 · BAIXO · sem gate — Permission string e tela de consentimento prometem "alertas de infestações próximas" — feature sem tela (ghost, cross-ref B4)
**Evidência:** `NSLocationWhenInUseUsageDescription` ("…enviar **alertas de infestações próximas** à sua lavoura") e `consent.location.benefit2` ("Alertas climáticos e de pragas da sua área") vs achado B4 da fase 1 (tabelas outbreaks/community sem nenhuma tela/consumer).
**Risco:** menor — justificativa de permissão citando funcionalidade inexistente (exatidão Apple 5.1.1 / expectativa do titular).
**Fix:** ou suavizar a copy ("e, futuramente, alertas regionais") no 1.0.8, ou priorizar a feature de alertas (decisão de produto junto com B4).

---

## Nota sobre itens do megaaudit 01/jul JÁ CORRIGIDOS (confirmados no código atual — não re-reportados)
- Privacidade in-app afirmando que GPS não acompanha foto → **corrigido** (§4 atual declara envio junto e fail-closed).
- Termos §9 contradizendo assinatura → **corrigido** (grátis + cláusula futura CDC).
- Controlador errado/CNPJ fictício → **corrigido** nas 4 superfícies (CNPJ real com DV válido).
- `pragas_push_tokens` fora da purga → **corrigido no repo** (pendente só o deploy — L8).
- Blast-radius cross-app sem aviso → **corrigido** na copy de confirmação + app-scoping no repo (deploy = L8).
- `process-deletions` sem observabilidade → **corrigido** (withSentry + captureMessage).
- Contato DPO inconsistente (dpo@ vs contato@) → **corrigido** (contato@agrorumo.com em tudo).

## Prioridade sugerida
1. **L8** (deploy da fn de exclusão — a promessa legal de hoje roda em código velho) → junto com M1.
2. **L1+L2+L3** (pacote único de reescrita legal da landing Astro — 1 autorização CEO ZERO-N cobre os três).
3. **L4+L6+L7+L10** (emendas de texto in-app na v1.0.8 — um commit `fix(legal)` na branch).
4. **L5** (toggle de revogação — decisão CEO; copy-fix barato disponível sem gate).
5. **L9** (runbook suporte agora; form web depois).
