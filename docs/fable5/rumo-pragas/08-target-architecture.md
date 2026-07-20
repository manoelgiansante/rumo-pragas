# 08 — Arquitetura-Alvo do Produto · Rumo Pragas

> Missão `fable5/rumo-pragas-global-benchmark-2026-07-19`. Arquitetura-alvo em 3 horizontes:
> **H0** (o que JÁ existe na branch), **H1** (pré-lançamento, 2–4 semanas), **H2** (pós-lançamento).
> Base: docs 01/03/04/05/06/07, verdade-terreno A1 (18 passos §8), refutação de gaps,
> `10-implementation-log.md`. Decisões aqui citam componente/tabela/fn/flag concretos.
> **Documento de arquitetura — nada aqui autoriza deploy, migration remota ou mudança de loja.**

## Invariantes (o que NENHUM horizonte muda sem gate CEO)

1. **100% grátis até 23/jul** — zero monetização, zero gating pago (contrato do produto;
   `FREE_MODE` permanece; entitlement partido GATE-B só importa pré-`FREE_MODE=false`).
2. **Diagnóstico = hipótese, nunca prescrição** — filtro `_shared/agronomic-safety.ts` +
   disclaimer CREA/AGROFIT em toda superfície nova (missão §7).
3. **jxcn compartilhado** — objeto novo SOMENTE `pragas_*`, com RLS habilitada + REVOKE
   (padrão edge-only do doc 07 §4) **na mesma migration**; nada de tocar objetos compartilhados.
4. **Privacidade por design** — geo arredondada ~1,1 km (`locationPrivacy.ts` +
   `normalizePragasCoordinates`), foto não persistida, EXIF descartado. **Reter precisão de
   talhão = mudança de política de privacidade → decisão explícita do CEO, nunca default** (§5d).
5. **STORE_LISTING** — sem community feed / mapas regionais de usuários sem revisão legal
   (linha 15); sem "offline analysis" (linha 73). Landing = ZERO-N.
6. **Web = landing de marketing apenas** — nenhum app de diagnóstico na web (doc 04 §3).

## Visão por horizonte (resumo)

| Área | H0 (branch atual) | H1 (pré-lançamento) | H2 (pós-lançamento) |
|---|---|---|---|
| Fluxo diagnóstico | 8 EXISTE / 6 PARCIAL / 4 FALTA (A1) | gate de foto no device · órgão opcional · rótulo de confiança · deep link lembrete vivo | múltiplas imagens · explicabilidade · escada taxonômica |
| IA obs/versão | zero versão por linha; telemetria crédito OFF | `ai_meta` em `notes` · telemetria crédito ON + alerta · SQL de drift | colunas dedicadas + painel admin de drift |
| Revisão humana | beco (feedback write-only) | contrato + `pragas_review_requests` + UI atrás de flag OFF | painel de revisão no admin, flag ON |
| Talhão/CampoVivo | nada (A1 §17 FALTA) | nada (não é launch-critical) | referência governada por id externo (recomendada) |
| Alertas pós-diag | weather-genérico + lembrete 3/7d + condições 24h | watch-list local praga→alerta (client-only) | push regional consentido (custo/privacidade gated) |
| Build/release | runner protegido; Android 1.0.11 verde; iOS bloqueado (cert) | retry bounded + cache-seed no `npm ci`; runner = trilho único | esteira CI com evidência de audit |

---

## §2 (a) Fluxo de diagnóstico alvo vs. os 18 passos do §8

**H0 (verdade-terreno A1):** EXISTE = cultura(1), instrução visual(3), processamento(7),
resultado(8), alternativas(9), OOD(13), histórico(15) + extras offline/i18n. PARCIAL =
qualidade pré-envio(4), talhão-contexto(6), confiança(10), fatores(11), evolução(16), alertas(18).
FALTA = órgão(2), múltiplas imagens(5), análise humana(14), propriedade/talhão(17).

### H1-1 · Gate de qualidade de foto no device (passo 4) — lote IMPL-2

- **Onde:** novo `services/photoQuality.ts` + chamada em `app/diagnosis/camera.tsx` entre a
  captura e o `setImage` do `DiagnosisContext`.
- **Como (client-only, sem módulo nativo):** thumbnail 64×64 via `manipulateAsync` (já importado)
  → decodificação JS do JPEG pequeno (`jpeg-js`, dev-vetted, ou parser mínimo próprio) → duas
  métricas baratas: (a) **luminância média** (foto escura/estourada), (b) **variância do
  Laplaciano** (proxy de desfoque). Limiar em constantes nomeadas
  (`PHOTO_QUALITY_THRESHOLDS`), testável em Jest com fixtures.
- **Política fail-open (decisão):** o gate **nunca bloqueia** — exibe aviso acionável
  ("foto escura/desfocada — tirar outra?") com botão "Usar assim mesmo". Evita beco novo e
  não cria promessa de acurácia. Analytics: `photo_quality_warning_shown` /
  `photo_quality_overridden` (sem pest/crop — padrão do `trackReinspectionReminderScheduled`).
- **i18n:** ~8 chaves ×3. **Flag:** constante client `PHOTO_QUALITY_GATE_ENABLED` (build-time),
  default ON — comportamento é aviso, não bloqueio, então não precisa de knob remoto.
- Fecha o buraco nº 1 do A1 e a oportunidade nº 2 do doc 01 (só o Seek faz na categoria).

### H1-2 · Órgão da planta opcional no payload (passo 2)

- **UI:** chips opcionais na `crop-select.tsx` (folha · caule · fruto/espiga · raiz · planta
  inteira · não sei = default), abaixo do seletor de cultura. Nunca obrigatório.
- **Contrato:** campo opcional `plant_organ` (allowlist de 6 valores) no body do
  `POST /functions/v1/diagnose-pragas`. Servidor: valida allowlist, grava em
  `notes.plant_organ`, e repassa ao provider **quando suportado** — Agrio: campo extra no
  `payload` multipart (best-effort, sem quebra se ignorado); path `claude`: entra no
  `SYSTEM_PROMPT` como contexto. Ausente = comportamento atual (backward-compat total,
  binário 1.0.9 não muda).
- **Espelhar no slug legado `diagnose`** enquanto ele viver (paridade doc 07 P1-4).
- **i18n:** ~10 chaves ×3. Esforço S/M. Padrão Pl@ntNet/Nuru (doc 01 §2.4).

### H1-3 · Rótulo qualitativo de confiança (passo 10) — lote IMPL-1 (em curso)

- **Decisão:** helper único `confidenceBucket()` (extrair a lógica de tons já existente em
  `components/TopAlternatives.tsx:41-45`) usado no hero de `result.tsx`: rótulo
  **alta / média / baixa** + % arredondado (passo de 5), microcopy "estimativa do modelo".
  Mantém banner <70% e o disclaimer. Fecha 06-R5 sem tocar servidor.

### H1-4 · Deep link do lembrete vivo (passo 16) — lote IMPL-1 (em curso)

- `'diagnosis-reinspection'` no `ALLOWED_SCREENS` (`hooks/useNotifications.ts:44-50`) roteando
  para a tab history. Fecha o único P0 de UX (05 P0-1 / A1 §16).

### H2 · Múltiplas imagens (passo 5) — contrato preparado AGORA, entrega depois

- **Contrato v2 (preparar em H1, ativar em H2):** body aceita
  `images: [{ image_base64, plant_organ? }]` (máx. 3) **ou** o `image_base64` singular atual;
  servidor normaliza para lista. Idempotência já cobre (request-hash é do body).
  `contexts/DiagnosisContext.tsx` migra para lista com singular como caso n=1.
- **Agregação:** provider-side por imagem → merge por consenso/máximo no `adaptAgrio`
  (regra determinística, testada). Custo: n créditos Agrio por diagnóstico → **ligar somente
  depois do teto de custo do §3 existir**. Sem promessa de acurácia na UI.
- Também H2: explicabilidade do caso (passo 11/12) e escada taxonômica/degradação para
  categoria ampla (doc 03 §2) — dependem de contrato com o provider, não de nós.

---

## §3 (b) Versionamento e observabilidade de IA (fix P0 doc 06 R1/R2)

### Carimbo de versão por diagnóstico — lote IMPL-3

- **Decisão: bloco `ai_meta` dentro do JSON `notes` de `pragas_diagnoses`** — em vez de colunas
  novas. Racional: zero migration no jxcn compartilhado (invariante 3), reversível, consultável
  via `notes->'ai_meta'`; colunas dedicadas + índice ficam para H2 se a query de drift pesar.
- **Campos gravados em TODO insert** (`diagnose-pragas/index.ts:1032-1045` e espelho no
  `diagnose` legado): `provider` (agrio|claude), `model`, `prompt_version`,
  `label_map_version`, `adapter_rev`, `mip_catalog_version`.
- **Fonte das versões:** constantes exportadas no código — `PROMPT_VERSION` em
  `diagnose-pragas/index.ts`, `AGRIO_LABEL_MAP_VERSION` em `agrio.ts`,
  `MIP_CATALOG_VERSION` em `expo-app/data/mip/index.ts` (fecha também 06-R8). Toda edição
  de prompt/mapa/catálogo obriga bump da constante (teste-trava simples: snapshot da versão).

### Telemetria de crédito Agrio — lote IMPL-3

- Ligar `AGRIO_CREDIT_TELEMETRY_ENABLED=true` (secret de runtime — edge fn lê sem redeploy) —
  o código `maybeCaptureAgrioBalance` (`agrio.ts:119-156`) já existe.
- **Alerta:** metric alert no Sentry via REST API (ZERO-T; MCP não cria alerta) sobre o evento
  de saldo: warning < 200 créditos, critical < 50/zero. Evita repetir a queda total de 06/07.
- H2: teto global de orçamento (circuit breaker diário de diagnósticos, knob
  `DIAGNOSE_DAILY_GLOBAL_CAP`, fail-open ausente) — pré-requisito para múltiplas imagens.

### Dashboard de drift mínimo (H1 = 3 queries salvas; H2 = painel)

1. Taxa `invalid_image`/dia (SQL sobre `pragas_diagnoses.pest_id`).
2. Taxa `incorrect` do feedback **por `prompt_version`/`label_map_version`**
   (`pragas_diagnosis_feedback` JOIN `pragas_diagnoses` via `notes->'ai_meta'`) — fecha a
   metade "métrica" de 06-R4; o feedback deixa de ser write-only.
3. Volume `agrio_label_unmapped` (Sentry, tag `step`) + alerta de threshold (06-R7).
H1 é operacional (queries versionadas em `supabase/scripts/drift-queries.sql` + revisão
semanal); painel admin é H2.

---

## §4 (c) Escada de revisão humana (missão §8.14)

**Princípio: a escada NUNCA inventa conteúdo agronômico.** Não há resposta automática; sem
humano operando, o CTA nem aparece (flag OFF). Resposta humana futura passa pelo filtro
`sanitizeAgronomicChatText` antes de renderizar (defesa em profundidade anti-prescrição).

### H1 — contrato + tabela + UI de solicitação (flag OFF)

- **Tabela `pragas_review_requests`** (migration nova, padrão edge-only do doc 07 §4):
  `id uuid pk · user_id uuid · diagnosis_id uuid → pragas_diagnoses · reason
  ('incorrect'|'unsure'|'user_requested') · user_note text bounded (1k) · status
  ('pending'|'in_review'|'answered'|'closed'|'rejected') · reviewer_note text ·
  created_at · updated_at · answered_at · sla_due_at`. **RLS habilitada + REVOKE ALL de
  anon/authenticated na MESMA migration** (acesso só via edge fn, como consents/rate-limit).
  Índices: `(user_id, created_at desc)`, parcial `status='pending'`.
- **Edge fn nova `pragas-review-requests`** (entra na allowlist de deploy): POST cria
  (auth Bearer + posse do diagnosis, mesmo padrão de `report-diagnosis-feedback/index.ts:100-114`;
  rate-limit 5/dia via `consume_pragas_api_rate_limit`; idempotente) e GET lista as do próprio
  usuário com status. Shape `jsonResponse` + `requestId` (`_shared/pragas-edge.ts`).
- **Client:** CTA "Solicitar revisão de um responsável técnico" no `result.tsx`, renderizado
  após feedback `incorrect`/`unsure` — **atrás de `REVIEW_REQUESTS_ENABLED` (server knob lido
  no access-state; default false)**. Sem SLA prometido na copy de H1 ("sem prazo garantido").
- **SLA interno:** `sla_due_at = created_at + 72h` como campo de operação; virar promessa
  pública = decisão CEO quando houver operação humana real.

### H2 — painel de revisão + flag ON

- **Quem revisa:** admin existente — **estender `admin-ai-content-reports`** (mesma auth de
  admin já aprovada) com o recurso `review_requests`: listar pending, assumir (`in_review`),
  responder (`answered` + `reviewer_note` humana), fechar. Sem app novo, sem superfície nova
  de auth.
- Notificação ao usuário na resposta: push individual via `pragas-send-push`
  (`target_user_ids`, já suportado) + badge no histórico.
- Ligar `REVIEW_REQUESTS_ENABLED=true` somente com humano habilitado operando (CEO decide
  quem — agrônomo parceiro é decisão de modelo, doc 01 §5.7).

---

## §5 (d) Integração CampoVivo / talhão (missão §9)

**H0:** nada (A1 §17 FALTA). Scouting/talhão georreferenciado **próprio** foi refutado
(refutação #9): semanas de esforço e **contradiz o design de privacidade** (geo ~1,1 km, sem
precisão de talhão). O caminho é **associação simbólica**, não geográfica.

### Opções analisadas

| Opção | Como | Prós | Contras |
|---|---|---|---|
| A. Identidade compartilhada (combo/`pragas_app_links`) | mesmo `auth.users` do jxcn; ler propriedades/talhões do CampoVivo direto | zero recadastro; base única governada (preferência da missão §9) | acoplamento vivo a outro app; **CampoVivo tem backend tRPC próprio — onde vivem as entidades de talhão precisa de verificação**; contrato sem dono formal |
| B. Referência fraca por id externo | Pragas guarda `{source, property_id, plot_id, label}` opacos; resolução por API governada quando disponível | desacoplado; privacidade preservada (nenhuma geo); degrada para label manual | exige um endpoint de listagem no lado CampoVivo; ids podem apodrecer (tratar como label se a resolução falhar) |
| C. Import manual | usuário digita "Talhão 3" (texto livre bounded) | zero dependência; entregável em dias | duplicação de cadastro (anti-§9); sem ponte futura |

### Recomendação (H2): **B com fallback C, sobre a identidade de A**

- A identidade JÁ é compartilhada (`pragas_app_links` no jxcn) — usá-la para **autorizar** a
  leitura, não para acoplar dados. Novo proxy read-only `pragas-campovivo-properties`
  (edge fn, consent-gated, cache curto) que lista `{property_id, plot_id, label}` do CampoVivo
  **sem coordenadas**; se o usuário não tem CampoVivo (ou a API não responde), campo de label
  manual (opção C) no mesmo lugar da UI.
- **Contrato de gravação:** bloco `location_ref = {source:'campovivo'|'manual', property_id?,
  plot_id?, label}` dentro de `notes` da `pragas_diagnoses` (mesma decisão anti-migration do
  §3); promove a tabela `pragas_property_links` própria (RLS+REVOKE) se histórico/filtro por
  talhão virar feature de 1ª classe.
- **Privacidade (linha dura):** a associação é **por identificador e rótulo, nunca por
  coordenada**. A geo continua arredondada ~1,1 km e desacoplada do talhão. **Reter geo de
  precisão de talhão = mudança explícita de política de privacidade (política publicada + Data
  Safety + consentimento novo) → gate CEO**; nenhum horizonte assume isso por default.
- **Pré-requisito de verificação (antes de H2):** confirmar onde vivem as entidades de
  propriedade/talhão do CampoVivo (backend tRPC próprio × jxcn) — define se o proxy consome
  API do CampoVivo ou SQL governado.

---

## §6 (e) Alertas pós-diagnóstico vinculados à praga detectada

**H0:** alertas climáticos **genéricos** (`services/alerts.ts:27-182` — regras por classe:
ferrugem/fúngicas/mofo/ácaros/cigarrinha) + notificação local high (cap 2/lote) + lembrete
re-inspeção 3/7d (FEITO `f554bbb`) + card condições 24h (FEITO `34c2570`). O que falta é o
**vínculo** com o que o usuário acabou de diagnosticar (A1 §18).

### H1 — watch-list local (client-only, zero servidor)

- **`services/pestWatchlist.ts`:** AsyncStorage por usuário com os últimos diagnósticos
  não-healthy/não-invalid (cap 5, TTL 30 dias, dedupe por pest_id) — alimentado no sucesso do
  diagnóstico (`result.tsx`) e limpo na troca de conta (mesmo padrão anti-vazamento do chat).
- **Cruzamento:** `alerts.ts` ganha um parâmetro `watchlist` — quando uma regra climática já
  existente casa com praga/classe da watch-list, o alerta é **priorizado e rotulado**
  ("relacionado ao seu diagnóstico de {praga}") na Home e na notificação local existente.
  Nenhuma regra nova de risco é inventada — só re-ranqueia e contextualiza as atuais.
- **Copy não-prescritiva obrigatória:** "monitore/reinspecione" — nunca "aplique/pulverize";
  disclaimer padrão. i18n ~10 chaves ×3. Esforço M. Flag: nenhuma (comportamento aditivo).

### H2 — push regional (custo + privacidade gated)

- `pragas_push_tokens` ganha coluna de **região grossa consentida** (município/UF derivado da
  coord já arredondada; consentimento próprio, revogável) + cron de clima por região +
  targeting novo na `pragas-send-push` (hoje só `target_user_ids` —
  `pragas-send-push/index.ts:39,125-131`). Migration + edge fn + cron + custo recorrente de
  API → **gate CEO de custo**. Conformidade: risco climático educacional passa o
  STORE_LISTING; "community reports"/mapas de usuários NÃO (linha 15). É a oportunidade nº 1
  do doc 01 §5 — mas é pós-lançamento por decisão já refutada (refutação #1).

---

## §7 (f) Build & release

- **Trilho canônico = runner protegido** (`scripts/native-local-production-build.mjs`):
  versionCode **derivado** do timestamp do commit (≈206,6M) e validado contra baseline de loja —
  imune ao conflito `android.versionCode 50 ≤ 54`. **Decisão:** declarar o runner trilho único
  e fazer o trilho EAS clássico **falhar alto** (assert no `validate-native-config.mjs` sobre os
  pins do `app.json`), OU rebumpar vc≥55 se o EAS clássico precisar viver — recomendo a
  primeira (1 fonte de verdade; doc 07 P1-2 / sync-r2 §12).
- **Mitigação `npm ci` (doc 07 §9, P0):** (1) retry bounded 2–3× com backoff do MESMO comando
  (cache do work-dir persiste entre tentativas do mesmo build); (2) `PRAGAS_NPM_CACHE_SEED`
  read-only verificado (`npm cache verify` na cópia antes do uso; integridade final continua
  no sha512 do lockfile pinado — o cache não substitui a verificação); (3) log do runner emite a
  **classe** do erro (rede × integridade) mantendo a redação. Build 1.0.11 ficou verde 19/jul
  (aab 70,6MB, commit `2d50f13`) — a mitigação evita a próxima roleta de ECONNRESET.
- **iOS: BLOQUEADO por rotação de certificado** (`store-assets/APPLE_SIGNING_ROTATION_BLOCKER.md`)
  — gate CEO/operador; nenhum trabalho de arquitetura destrava. Pós-rotação, mesmo runner.
- **Ordem de deploy (D10) já codificada:** migrations só pela sequência hash-allowlisted →
  edge fns só pelos 13 slugs da allowlist (`deploy-pragas-allowlist.sh`) → binário por último.
  Novas fns deste doc (`pragas-review-requests`, futura `pragas-campovivo-properties`,
  `pragas-version-check` H2) **entram na allowlist explicitamente** quando aprovadas.
- **Sunset dos slugs compartilhados (H2):** teste-trava de paridade `diagnose`×`diagnose-pragas`
  enquanto o binário 1.0.9 dominar a base; desligar os legados quando a adoção do binário novo
  cruzar o limiar (métrica: version-check/analytics).

## Flags & knobs consolidados

| Knob | Camada | Default | Horizonte |
|---|---|---|---|
| `PHOTO_QUALITY_GATE_ENABLED` | client (build-time) | ON (é aviso, não bloqueio) | H1 |
| `AGRIO_CREDIT_TELEMETRY_ENABLED` | edge secret (runtime) | **true** (mudar de false) | H1 |
| `REVIEW_REQUESTS_ENABLED` | edge knob via access-state | false até painel H2 | H1 (OFF) → H2 (ON) |
| `DIAGNOSE_PROVIDER` | edge secret | agrio (claude = rollback vivo) | H0 (manter) |
| `DIAGNOSE_DAILY_GLOBAL_CAP` | edge secret | ausente = sem teto (fail-open) | H2 |
| `FREE_MODE` | edge | true — **não desligar antes do GATE-B** | H0 (invariante) |

## O que a arquitetura explicitamente NÃO faz

App de diagnóstico na web (doc 04) · comunidade/Q&A (STORE_LISTING/Apple 1.2) · scouting
georreferenciado próprio (privacidade) · inferência offline on-device (contrato "requer
internet") · recomendação de produto/dose em qualquer superfície (missão §7) · retenção de
geo de talhão por default (§5) · monetização antes de 23/jul (invariante 1).
