# Rumo Pragas — Auditoria Técnica de Engenharia (doc 07)

- Missão: `fable5/rumo-pragas-global-benchmark-2026-07-19`, auditor de engenharia (§6). READ-ONLY.
- Branch auditada: `fable5/rumo-pragas-global-benchmark-2026-07-19` (HEAD `d7d4ab0`), como está.
- Convenção: **OBSERVADO** = lido no código nesta sessão, com `arquivo:linha`; **INFERIDO** = deduzido
  e marcado como tal. Nada de Supabase remoto foi tocado; estado de prod citado vem de
  `docs/fable5/rumo-pragas/research-raw/recovered-2026-07-18/sync-backlog-rodada2.md` e `CLAUDE.md`.
- Escopo excluído: qualidade/segurança de IA (coberto pelo doc 06 — não repetido aqui).

## Sumário executivo (≤10 linhas)

A engenharia do Rumo Pragas está muito acima da média do portfólio: idempotência com lease em
diagnóstico/chat/push, rate-limit durável com request-hash, RLS + SECDEF `search_path=''` em todo o
contrato novo, fila offline com DLQ journalada e runner de build hermético com lockfile pinado.
Os problemas reais são de **borda e operação**, não de fundação: (P0) o trilho de build Android está
quebrado HOJE porque o runner faz `npm ci` com cache nascido vazio, sem retry, numa máquina com
ECONNRESET intermitente; (P1) `android.versionCode 50 ≤ 54` conflita com o baseline da Play no
trilho EAS clássico; (P1) o entitlement continua partido (`subscriptions` × `pragas_subscriptions`),
latente sob FREE_MODE; (P1) o binário público 1.0.9 ainda fala com slugs compartilhados enquanto o
candidato usa os dedicados — duas superfícies de API com shapes de erro divergentes para manter; e
(P2) o resize da câmera fixa 1024×1024 **distorcendo** a foto enviada ao provider. Tabela P0–P3 ao final.

---

## 1. Arquitetura geral

**Camadas do app Expo (OBSERVADO, inventário por `find`):** `app/` 25 rotas Expo Router (auth, tabs,
diagnosis/*, admin, legal), `services/` 34 módulos, `hooks/` 9, `contexts/` 3, `components/` 28,
`lib/` 4, `data/mip` (catálogo empacotado), `i18n` pt-BR/en/es, `utils/` 1. Contexto de auth é um
wrapper fino sobre `hooks/useAuth` (`contexts/AuthContext.tsx:10-14`), estado de diagnóstico vive em
`contexts/DiagnosisContext.tsx`. Cliente Supabase é singleton com storage SecureStore chunkado
(manifest v1 + checksum, `services/supabase.ts:13-95`) e `fetch` global com timeout
(`services/supabase.ts:605-644`); há um client efêmero em memória para reauth destrutiva
(`services/supabase.ts:646-666`).

**Acoplamento:** services falam com o backend por três vias — `fetch` direto na edge fn
(`services/diagnosis.ts:184-211`), REST PostgREST direto (`services/diagnosis.ts:243-276`) e
`supabase.functions.invoke` (analytics, `services/analytics.ts:166` via comentário 17-27). Não há
camada genérica de API; cada service repete seu próprio timeout/parse — consistente na prática
(ver §2), mas a política vive espalhada.

**Pontos únicos de falha (OBSERVADO/INFERIDO):**
1. **Projeto jxcn compartilhado** — DB, auth (`auth.users`), Sentry DSN de edge e tabelas
   compartilhadas (`subscriptions`, `analytics_events`, `webhook_events`) são divididos com todos os
   apps não-RM. Consequências já materializadas: poluição de Sentry cross-app que causou um
   misdiagnóstico real e exclusão de conta que apaga a identidade global dos outros apps
   (`CLAUDE.md`, "Estado operacional 17/07", GATE-C e bloco Sentry). Migration alheia ou trigger
   compartilhada é risco permanente — mitigado pelo gate de deploy hash-allowlisted (§10).
2. **Fn `version-check` compartilhada** — o gate de update do app depende de uma função cujo deploy
   é proibido a partir deste repo (`hooks/useAppUpdateCheck.ts:100` consome
   `/functions/v1/version-check`; `docs/launch-runbook.md:206-209` proíbe deployá-la daqui).
   Dependência de runtime sem dono local: outro workload pode mudar o contrato e quebrar o gate.
3. **Agrio como provider único de visão** — queda de crédito 06/07 derrubou o diagnóstico inteiro
   (doc 06 §; caminho `claude` é rollback manual server-side).
4. **Slugs compartilhados `ai-chat`/`diagnose` ainda são o caminho do binário público 1.0.9**
   (CLAUDE.md PR-10) — dupla superfície viva, ver §2/§10.

**Mapa das edge functions (OBSERVADO, `ls supabase/functions` + `deploy-pragas-allowlist.sh:9-24`):**
27 diretórios de função + `_shared` + `_tests`, em três classes:
- **13 dedicadas (allowlist de deploy):** `admin-ai-content-reports`, `ai-chat-pragas`,
  `diagnose-pragas`, `pragas-analytics`, `pragas-delete-user-account`, `pragas-export-user-data`,
  `pragas-global-account-deletion`, `pragas-process-ai-idempotency`, `pragas-process-deletions`,
  `pragas-reactivate-account`, `pragas-send-push`, `report-ai-content`, `report-diagnosis-feedback`.
- **8 shared-slug legadas (fonte local, deploy proibido por este release):** `ai-chat`, `diagnose`,
  `analytics`, `delete-user-account`, `process-deletions`, `send-push`, `revenuecat-webhook`,
  `stripe-webhook` (`docs/launch-runbook.md:206-209`).
- **6 tombstones de billing/legado:** `create-checkout-session-pragas`, `stripe-webhook-pragas`,
  `stripe-customer-portal-pragas`, `asaas-checkout-pragas`, `asaas-webhook-pragas`, `disease-risk` —
  todas delegam ao helper determinístico `_shared/retired-pragas-endpoint.ts:1-40` (410
  `endpoint_retired` / 200 `billing_disabled` sem parsear body).

Estado em prod (INFERIDO de inventário 18/jul, sync-backlog item 11): **todos os slugs dedicados já
estão ACTIVE** — o item "9 fns não deployadas" do coverage 15/jul está obsoleto (§10).

## 2. APIs e contratos

**Shape de erro:** as 12 fns dedicadas que respondem JSON usam `jsonResponse` com `requestId` no
corpo e `X-Request-Id` no header (`_shared/pragas-edge.ts:36-49`; grep: 12 `index.ts` importam
`pragas-edge`). As legadas usam `{error: "<pt-BR>", requestId}` ad-hoc (`diagnose/index.ts:318,329,
347,464-532`). **Inconsistente entre gerações**, mas o client é imune por design: mapeia erro por
status HTTP e nunca parseia o body de erro (`services/diagnosis.ts:101-118` `sanitizeErrorMessage`).
Risco residual: ferramentas/observabilidade que dependam do shape.

**Timeouts (OBSERVADO):**
| Caminho | Timeout | Evidência |
| --- | --- | --- |
| Client → diagnose | 60 s | `services/diagnosis.ts:17,190-220` |
| Client → REST (history/delete/count) | 15 s | `services/diagnosis.ts:18,71-84` |
| Client → chat | 20 s | `services/ai-chat.ts:14,56-60` |
| Client → Supabase SDK (global) | fetch com timeout + override por header sentinel | `services/supabase.ts:605-631` |
| Edge → Agrio | 45 s | `diagnose-pragas/agrio.ts:81` |
| Edge → Anthropic/Gemini/Expo Push | `fetchWithTimeout` (default 30 s) | `_shared/fetch-timeout.ts:8-26`; `ai-chat-pragas/index.ts:199,256`; `pragas-send-push/index.ts:216` |
| Edge → Sentry envelope | 1,5 s | `_shared/pragas-sentry.ts:152-155` |

Nenhum caminho de rede sem timeout foi encontrado no fluxo principal (grep §evidência acima).

**Retry/backoff:** fila offline com backoff exponencial + jitter, teto 16 s, `MAX_RETRIES 3`
(`hooks/useDiagnosisSync.ts:18-28,80-131`); analytics re-enfileira o batch em falha
(`services/analytics.ts:145-158`); caminho interativo online não faz retry automático (o usuário
reenvia) — deliberado e correto para custo de IA.

**Idempotência — onde tem (OBSERVADO):**
- Diagnose/chat: `Idempotency-Key` UUID + request-hash SHA-256 com lease/claim, reclaim só
  pré-provider, `unknown_outcome` terminal (`_shared/ai-idempotency.ts:71-194`;
  RPCs em `supabase/migrations/20260715171000_pragas_prod_compat_runtime.sql:971-1191`).
- Rate-limit durável com binding chave↔hash (retry conta, reuse com hash diferente = 409)
  (`_shared/durable-rate-limit.ts:30-124`; `supabase/functions/RATE_LIMITS.md`).
- Push: claim/lease + provider-start marker (`runtime migration:1424-1605`).
- Analytics: `ON CONFLICT (user_id, pragas_event_id) DO NOTHING`
  (`runtime migration:1326-1334`) — reenvio de batch não duplica evento.
- Deleção: contrato idempotente com retry worker (coverage doc, linhas 70-71).
- Fila local: `idempotencyKey` estável através de retries e da DLQ
  (`services/diagnosisQueue.ts:70,178,884`).

**Onde falta:** nada material. `DELETE /rest/v1/pragas_diagnoses` é naturalmente idempotente
(`services/diagnosis.ts:278-294`); avatar tem rollback compensatório em vez de idempotência
(`services/avatar.ts:145-163`) — aceitável.

**Versionamento de contrato client↔fn:** consentimento de IA versionado por header
(`X-Pragas-AI-Consent-Version`, `services/diagnosis.ts:201`; fail-closed 428 no server); export com
contrato versionado em arquivo (`contracts/pragas-user-data-export-v2.json` +
`_tests/user-data-export-contract.test.ts`); storage de auth com manifest `v1`
(`services/supabase.ts:13-18`). Não há versionamento de path de API — a transição real de contrato é
o par shared-slug (binário 1.0.9) × slug dedicado (candidato), administrada mantendo os dois vivos.
**Risco (INFERIDO):** enquanto o 1.0.9 dominar a base instalada, todo fix de server precisa ser
aplicado em DOIS lugares (`diagnose` E `diagnose-pragas`); não existe teste-trava de paridade entre
as duas gerações. Ver P1-3.

## 3. Armazenamento de imagens

- **Foto de diagnóstico NÃO é retida no servidor:** o insert em `pragas_diagnoses` não grava
  `image_url` nem blob (`diagnose-pragas/index.ts:1032-1043` — colunas: user_id, crop, pest_id,
  pest_name, confidence, notes, location_lat/lng). Trânsito é base64 no body autenticado.
- **Bucket `pragas-images`:** endurecido enquanto vazio — policies owner-only por prefixo
  `auth.uid()`, 10 MB, mime allowlist (`supabase/migrations/20260702191114_pragas_images_storage_
  hardening_20260702.sql:8-22`). Nenhum código do app o usa (0 objetos, comentário da própria
  migration) — TTL/limpeza N/A por ora.
- **Avatares:** bucket `pragas-avatars`, path `<userId>/avatar-<uuid>.<ext>` com validação de
  ownership do path (`services/avatar.ts:7,131-133`), mime allowlist + cap 5 MB no client
  (`avatar.ts:123-127`) e no bucket legado (`migration:24-27`); upload → UPDATE do profile → em
  falha de persistência, remove o objeto recém-subido (rollback compensatório, `avatar.ts:145-160`);
  avatar anterior e legado são removidos após replace (`avatar.ts:160-163`). Sem TTL — a limpeza é
  por substituição/exclusão; órfão só se o rollback falhar (capturado em Sentry, `avatar.ts:71-95`).
- **Fila local:** fotos em disco (`documentDirectory/diagnosis-queue/<uuid>.jpg`,
  `services/diagnosisQueue.ts:20,143-145`), com igualdade exata de path contra traversal
  (`diagnosisQueue.ts:154-158`), journal 2-fases para limpeza e purge por usuário na exclusão de
  conta (`diagnosisQueue.ts:958-978`).
- **EXIF:** o strip acontece como efeito colateral do reencode `manipulateAsync` → JPEG
  (`app/diagnosis/camera.tsx:46-55`) — **INFERIDO** (semântica documentada do ImageManipulator; não
  há teste que prove ausência de EXIF/GPS no payload). Recomendo teste-trava com fixture JPEG
  contendo GPS (P2-2).
- **⚠️ Distorção no resize (OBSERVADO código / INFERIDO efeito):** `resize: {width: 1024,
  height: 1024}` com AMBAS as dimensões (`camera.tsx:36-37,49`) força 1024×1024 exato — pela
  semântica documentada do `expo-image-manipulator`, especificar as duas dimensões NÃO preserva o
  aspect ratio; toda foto não-quadrada chega ao Agrio esticada/achatada. Impacto direto na acurácia
  do modelo. Fix de 1 linha: passar só `{width: 1024}` (ou o menor lado). P2-1.

## 4. Auth e autorização

- **Fluxo:** Supabase auth com sessão em SecureStore chunkado (limite de 2 KB do SecureStore
  respeitado por chunks de 1.800 bytes + manifest com checksum e gerações stale,
  `services/supabase.ts:13-110`); autoRefresh ligado ao AppState com ref-count
  (`supabase.ts:668-698`); client efêmero para reauth de ações destrutivas sem relinkar sessão
  (`supabase.ts:646-666`).
- **Edge:** Bearer → `admin.auth.getUser(token)` (`_shared/pragas-edge.ts:60-70`) — sem confiar em
  header de user_id (ZERO-X ok). Gate de acesso por request: deleção global/app pendente →
  `pragas_app_links.active` **e** `pragas_profiles` **e** `subscriptions(user_id, app='rumo-pragas',
  status='active')` (`pragas-edge.ts:100-165`). Fail-closed comprovado em prod (409 `unlinked`/403/
  428 sem o fluxo completo — CLAUDE.md PR-10).
- **`pragas_app_links`:** service_role-only (`REVOKE ALL ... FROM PUBLIC, anon, authenticated`,
  `runtime migration:544-547`); vínculo criado apenas pela RPC `pragas_link_account` — SECDEF,
  `search_path=''`, advisory lock por usuário, `ON CONFLICT DO NOTHING` (nunca sobrescreve
  entitlement pago), EXECUTE só `authenticated`, REVOKE explícito de `anon` e `service_role`
  (`supabase/migrations/20260715170000_pragas_link_account_prod_hotfix.sql:240-313`).
- **RLS das tabelas `pragas_*`:** o contrato novo habilita RLS em tudo e adota modelo "edge-only" —
  a maioria das tabelas é service_role-only (consents, rate-limit, idempotency, deletion_jobs:
  `runtime migration:493-547,562-566,596-600,729-732,805-815,964-968,1254-1257`); `pragas_profiles`
  tem SELECT/INSERT para authenticated com policies `user_id = auth.uid()` e **UPDATE revogado**
  (`runtime migration:501-527`).
- **Padrão SECDEF + GRANT:** todas as RPCs novas são `SECURITY DEFINER` com `SET search_path = ''`
  e par REVOKE ALL/GRANT mínimo (ex.: `consume_pragas_api_rate_limit` runtime:818-917;
  `record_pragas_analytics_events` runtime:1264-1345 — service_role only). Legadas endurecidas em
  17/07 (`supabase/migrations/20260717005142_pragas_secdef_search_path_hardening.sql:10-11`) e o
  IDOR das RPCs `chat_usage` foi fechado em prod
  (`supabase/migrations/20260713190517_lock_chat_usage_rpc_service_role_only.sql`; verificação viva
  em `CLAUDE.md` PR-04).
- **Risco latente (não é bug de RLS):** o access-state exige linha em `subscriptions`
  app='rumo-pragas' (`pragas-edge.ts:148-154`) enquanto o combo grava entitlement em
  `pragas_subscriptions` (GATE-B, `CLAUDE.md`; lado combo INFERIDO — repo `agrorumo-combo`).
  Comprador de combo não desbloqueia quando FREE_MODE desligar. P1-2.

## 5. Offline/sync (fila de diagnóstico)

- **Design (OBSERVADO):** fila ativa + DLQ recuperável em AsyncStorage (só metadata), fotos em
  disco; mutações serializadas por promise-tail para impedir read-modify-write concorrente
  (`services/diagnosisQueue.ts:25-47`); capacidade 25 itens (ativa+DLQ) com erro tipado — nunca
  evicção silenciosa (`diagnosisQueue.ts:19,691-700`); sync dispara em reconexão e em retry manual
  via subscribe (`hooks/useDiagnosisSync.ts:59-71`).
- **DLQ:** após 3 falhas, move para `FAILED_QUEUE_KEY` com ordem durável (persiste failed antes de
  remover a ativa, preservando a foto; `useDiagnosisSync.ts:108-127`), Sentry capture no move;
  retry/discard só por ação explícita (`diagnosisQueue.ts:869-925`). **Gap:** DLQ não tem
  aging/expiração — item pode ficar para sempre (retenção de foto local indefinida). P3.
- **Duplicação:** `retryFailedDiagnosis` escreve na ativa antes de remover da DLQ — crash entre os
  dois writes gera metadata duplicada, admitida pelo comentário (`diagnosisQueue.ts:864-901`);
  inócua no servidor porque o `idempotencyKey` é estável e o reserve dedupa (§2). 428 de
  consentimento não consome retry nem move pra DLQ (`useDiagnosisSync.ts:103-107`) — correto.
- **Perda:** JSON corrompido em `getQueue` retorna `[]` com Sentry (`diagnosisQueue.ts:750-759`) —
  perda visível de fila é instrumentada, e as fotos permanecem em disco (recuperáveis pelo sweep de
  owner-claim, `diagnosisQueue.ts:412-424`). Claim de dono na troca de conta é fail-closed com
  journal 2-fases (`diagnosisQueue.ts:294-437,650-665`) — fotos de outro dono nunca vazam entre
  contas.
- **Limites do AsyncStorage:** só metadata (~centenas de bytes/item × 25) — muito abaixo dos limites
  (Android ~2 MB/entry, 6 MB default); as imagens nunca entram no AsyncStorage
  (`diagnosisQueue.ts:1-6,71` comentários + implementação). Sem risco de estouro.

## 6. Banco de dados

- **Migrations no repo × histórico prod:** 43 arquivos no diretório, **42 tracked + 1 untracked**
  (`supabase/migrations/20260713120000_paid_photo_quota.sql`, `git status`) — o untracked é
  deliberadamente fora do free launch (`docs/audit/launch-coverage-2026-07-14.md:124-126`), mas
  segue como corpo estranho no working tree há dias. O item 3 do sync-backlog ("history não
  reconciliada na main") está **RESOLVIDO nesta branch**: o commit `adaeb47` ("reconcilia arquivos
  de migrations com historico de prod jxcn", git log) trouxe 15 capturas VERBATIM de prod com md5 no
  header (grep "Capturado VERBATIM" = 15 arquivos).
- **Candidato real:** `20260714143000_pragas_backend_security.sql` é um **no-op superseded**
  intencional (`:1-23`); a compatibilidade de prod é instalada só pela sequência hash-allowlisted
  `20260715170000/171000/172000/173000` via `supabase/scripts/deploy-pragas-prod-compat.sh`
  (`20260714143000:9-13`). O runbook (`docs/launch-runbook.md:176-183`) ainda descreve o par
  `143000+150000` como "the backend candidate" — **documentação defasada** vs. a sequência que de
  fato foi aplicada em prod (as 4 versões 1700-1730 constam do history de prod, sync-backlog item 3).
  P3-5.
- **Índices vs. acessos do app:** o acesso quente do history (`user_id eq + order created_at desc`,
  `services/diagnosis.ts:249-253`) é coberto por `idx_diagnoses_user_created (user_id, created_at
  DESC)` (`supabase/migrations/20260317123844_init_schema.sql:57`); rate-limit e idempotency têm
  índices de expiração (`runtime migration:602,803,961,1252`). Nenhum acesso do app sem índice foi
  encontrado.
- **Colunas/índices órfãos (OBSERVADO):** `pragas_diagnoses.image_url` — o client aceita no parse
  (`services/diagnosis.ts:51`) mas o server nunca escreve (`diagnose-pragas/index.ts:1033-1043`);
  `pragas_diagnoses.severity` — nunca no insert atual, e ainda tem índice dedicado
  `idx_diagnoses_severity` (`20260416000000_add_missing_indexes.sql:7`) — índice pagando custo de
  escrita para coluna morta; `idx_profiles_user_id` na init_schema indexa `id`, não `user_id`
  (nome enganoso, `init_schema.sql:61`). `pragas_chat_messages` é 0-write por design (ZERO-V,
  `CLAUDE.md` PR-10). Nada disso é urgente; consolidar numa migration de higiene futura (P3-1).
- **Fora da esteira:** `supabase/migrations-proposals/` contém 1 proposta
  (`20260628120000_subscriptions_per_app_isolation.sql`) — segregação correta.
- **Rollback:** 6 scripts `.down.sql` transacionais com preflight, preservando dados
  (`supabase/rollback/`; contrato descrito em `docs/launch-runbook.md:294-307`).

## 7. Testes

**Contagem real (OBSERVADO por `find`):**
- Jest (expo-app, excluindo `.artifacts/`): **71 suítes** — services 33, components 22, hooks 8,
  contexts 2, app 3, lib 4, data 2, types/i18n 2.
- Deno (edge): **10 suítes** em `supabase/functions/_tests/` (segurança de boundary, contratos de
  backup/export/report, push eligibility, agronomic-safety, privacy-cleanup).
- Shell: **10 scripts** de integração/unidade em `supabase/tests/` (PostgreSQL 17, gate de
  compatibilidade, storage criptografado).
- Build scripts: **têm teste sim** — `node --test` cobre o runner protegido e o redator
  (`test:eas-redactor` roda `scripts/test-redact-eas-output.mjs` + `scripts/test-native-local-
  production-build.mjs`, `package.json:27`), gates de loja (`test-store-release-gates.mjs`), data
  safety e release-bundle-env (`package.json:17-20`). A hipótese da missão de "build scripts sem
  teste" está **parcialmente refutada**; o que não há é teste do modo de FALHA de rede do `npm ci`
  (exatamente o que quebrou — §9).

**O que NÃO tem teste (OBSERVADO por diff das listas):** `services/passwordRecovery.ts`,
`services/authMetadataGate.ts`, `services/dialog.ts`, `services/sentry-shim.ts`, `utils/phone.ts`,
`hooks/useAppUpdateCheck.ts` (as políticas em `lib/updateCheckPolicy/Response/Mode` são testadas,
o hook não), e quase todas as rotas de `app/` (só `account-deletion` e `consent-location` têm teste
de tela; `result.tsx`, `camera.tsx`, `login.tsx` não). No lado Deno, `diagnose-pragas/agrio.ts`
(adaptador Agrio) não tem suíte — já apontado pelo doc 06.

**Testes-trava de contrato existentes:** `__tests__/app/ai-chat-analytics.contract.test.ts`,
`_tests/user-data-export-contract.test.ts` + `contracts/pragas-user-data-export-v2.json`,
`_tests/backend-security-contract.test.ts`, `validate:diagnosis-contract` (`package.json:22`).
**Faltam:** trava de EXIF ausente no payload (§3), trava de paridade shared-slug × dedicado (§2),
trava do `AGRIO_LABEL_MAP` (doc 06).

**Higiene de runner (OBSERVADO):** `jest.testPathIgnorePatterns` só ignora `/node_modules/`
(`package.json:92-94`), mas existe um snapshot residual do build em
`expo-app/.artifacts/.native-work-g3uEfo/source/__tests__/...` com **cópia integral das 71 suítes**
(find desta sessão). O eslint ganhou ignore para `.artifacts/` (commit `f1856f6`), o jest não — um
`npm test` com o snapshot presente coleta suítes duplicadas (e node_modules embutido do snapshot é
podado só pelo pattern de node_modules). Fix de 1 linha no `testPathIgnorePatterns`. P2-4.
Sem `coverageThreshold` configurado (`package.json:74-95`) — cobertura é informativa, não gate.

## 8. Performance

- **Listas:** `library.tsx` correta — item memoizado (`React.memo(PestItem)`,
  `app/(tabs)/library.tsx:171`), `useMemo` no filtro (233-241), `initialNumToRender 15`.
  `history.tsx` tem `initialNumToRender 10` / `windowSize 5` / keyExtractor estável
  (`app/(tabs)/history.tsx:156,228-247`), mas o `renderItem` é arrow inline não-memoizada
  construindo TouchableOpacity + a11y props a cada render do pai (`history.tsx:307-320`) — o
  `DiagnosisCard` interno é memoizado (`components/DiagnosisCard.tsx:126`), o wrapper não. Custo
  real baixo (lista ≤50 itens, `services/diagnosis.ts:248`); P3.
- **Imagens:** compressão client-side JPEG 0.75 + resize 1024 antes do envio
  (`app/diagnosis/camera.tsx:36-37,46-55`) — bom para payload (~5 MB cap,
  `services/diagnosis.ts:14`); o defeito é a distorção do aspect ratio (§3, P2-1), não o custo.
- **Cold start:** watchdog de splash de 10 s armado em escopo de módulo, independente do React, com
  guard contra double-hide (`app/_layout.tsx:127-156,244`) — defesa direta contra o congelamento
  histórico de boot (cicatriz documentada no `CLAUDE.md` do repo); fonte degrada para system font
  após 3 s sem bloquear (187-190). Sólido.
- **Re-render sistêmico:** nenhum antipattern óbvio além do item history; contexts são pequenos e
  o estado de diagnóstico é resetado por fluxo (INFERIDO de leitura parcial dos contexts).

## 9. Supply chain e build

- **Runner protegido (`expo-app/scripts/native-local-production-build.mjs`):** exige working tree
  100% commitado e HEAD estável (635-650), extrai o source por `git archive` do commit (699-728),
  rejeita symlinks (664-671), valida lockfile v3 com `resolved` apontando exclusivamente para
  `registry.npmjs.org` e `integrity sha512` por pacote (673-694), roda `npm ci --ignore-scripts
  --no-audit` (745-762) e verifica `node_modules` real não-symlink (763-767). Postura de supply
  chain acima do padrão.
- **Fragilidade CONFIRMADA (P0):** o cache npm **nasce vazio a cada build** (`mkdirSync(npmCache)`
  em diretório de trabalho novo, 743-744) e o passo tem **uma única tentativa** com timeout de
  30 min (67, 759). Na máquina atual com ECONNRESET intermitente em runtimes Node, as 2 rodadas do
  build Android 1.0.11 falharam exatamente aqui ("npm ci isolado pelo lockfile falhou",
  `docs/fable5/rumo-pragas/10-implementation-log.md:21`). **Mitigação SEM enfraquecer o
  isolamento** (o `npm ci` já re-verifica o `integrity` sha512 pinado do lockfile ao instalar, e o
  cache do npm é content-addressed — cache não substitui a verificação):
  1. *Retry interno bounded*: 2–3 tentativas do MESMO comando com backoff (o cache do work-dir
     persiste entre tentativas dentro do mesmo build, então a retomada é incremental);
  2. *Cache seed read-only verificado*: aceitar `PRAGAS_NPM_CACHE_SEED` apontando para um diretório
     imutável (montado ro ou copiado com verificação `npm cache verify` antes do uso), populado por
     um passo separado auditável — `npm ci --prefer-offline --cache <seed-copy>`; a integridade
     final continua garantida pelo lockfile pinado, não pelo cache;
  3. Distinguir falha de rede de falha de integridade no log seguro do runner (hoje o fail é
     opaco por design de redação — manter a redação, mas emitir a CLASSE do erro).
- **npm audit:** **não executável nesta sessão** — `npm audit --package-lock-only` falhou por
  rede/registry (runtime Node com ECONNRESET, memória `reference_js_runtime_supabase_connreset_
  2026_07_19`). Evidência de gestão ativa: bloco `overrides` pinando transitivas vulneráveis
  (`expo-app/package.json:36-45+` — xmldom, ajv, esbuild, brace-expansion…) e o gate
  `npm audit --audit-level=high` no contrato de CI do repo (`CLAUDE.md` §Gates). Verificar o estado
  no próximo run de CI com rede sã. P3-4.
- **Gitleaks/higiene de secrets:** `.gitleaks.toml` na raiz; `.husky/pre-commit` encadeia o gate
  global ZERO-AE além do lint-staged (OBSERVADO no arquivo). `git ls-files` não mostra nenhum
  secret real trackeado (só `play-store-key.json.example`); `google-services.json` e
  `play-store-key.json` existem no working tree local mas estão ignorados
  (`expo-app/.gitignore:20,51-52`) — o wire FCM (`b32628e`) aponta o `app.json` para o arquivo
  local deliberadamente fora do git. Correto, mas frágil a `git add -f`: o gitleaks do pre-commit é
  a rede de segurança.

## 10. Deploy e rollout

- **Ordem (D10) codificada, não só documentada:** migrations somente pela sequência
  hash-allowlisted com backup pré-mudança e TLS pinado
  (`supabase/scripts/deploy-pragas-prod-compat.sh`, contrato descrito em
  `docs/launch-runbook.md:219-273`); edge somente pelos 13 slugs exatos com dupla confirmação de
  projeto (`supabase/functions/deploy-pragas-allowlist.sh:9-33`); binário por último via runner
  protegido (`docs/launch-runbook.md:35-58`). Deploy-all é estruturalmente impossível a partir dos
  scripts do repo.
- **Drift repo↔prod (estado 18/jul, INFERIDO do inventário read-only):** prod JÁ tem todos os slugs
  dedicados ACTIVE e as tabelas do candidato (`sync-backlog-rodada2.md` item 11) — a seção
  "Production compatibility evidence" do `docs/audit/launch-coverage-2026-07-14.md:200-216` e o
  blocker 15 (linhas 256-259) descrevem o estado de 15/jul e estão **defasados**; manter o coverage
  como está induz um operador a re-gatear um deploy que já aconteceu. Drift restante real:
  `disease-risk` + 5 fns billing remote-only sem fonte (tombstones locais prontos, gate de
  produção, `docs/launch-runbook.md:311-337`).
- **Versionamento de build:** o runner deriva um buildVersion reproduzível do timestamp do commit
  (epoch − 1577836800; `native-local-production-build.mjs:652-661`,
  `native-signing-policy.mjs:619`) e valida contra os baselines de loja (iOS 63 / Android 54).
  **Conflito de trilho:** `app.json` pina `ios.buildNumber "64"` e `android.versionCode 50`
  (`expo-app/app.json:159,185`) — vc50 ≤ 54 é recusado pela Play se alguém buildar pelo EAS clássico
  com `appVersionSource: local` (sync-backlog item 12). Ou rebumpar vc≥55, ou declarar o runner como
  trilho único e fazer o `app.json` falhar alto. P1-1.
- **Rollback:** landing via Vercel promote; edge por redeploy do last-known-good por slug dedicado;
  DB pelos down-scripts transacionais (§6) — tudo com preflight (`docs/launch-runbook.md:294-309`).

## 11. Ranking P0–P3

| # | Sev | Achado (evidência) | Fix de 1 linha |
| --- | --- | --- | --- |
| 1 | **P0** | Trilho de build Android quebrado hoje: `npm ci` com cache nascido vazio, 1 tentativa, rede com ECONNRESET (`native-local-production-build.mjs:743-762`; `10-implementation-log.md:21`) | Adicionar retry bounded (2-3×, backoff) ao passo `npm ci` do runner + aceitar cache-seed read-only verificado; isolamento preservado pelo `integrity` do lockfile |
| 2 | **P1** | `android.versionCode 50 ≤ 54` conflita com baseline Play no trilho EAS clássico (`app.json:185`; sync-backlog item 12) | Rebumpar `versionCode` ≥ 55 (ou documentar runner como trilho único e assert que falhe alto fora dele) |
| 3 | **P1** | Entitlement partido: access-state lê `subscriptions` (`_shared/pragas-edge.ts:148-154`), combo grava `pragas_subscriptions` (GATE-B, CLAUDE.md); latente sob FREE_MODE | Decisão CEO: apontar o WRITE do combo para `subscriptions` antes de qualquer `FREE_MODE=false` |
| 4 | **P1** | Superfície dupla shared-slug × dedicada sem teste de paridade; shapes de erro divergentes (`diagnose/index.ts:318` × `_shared/pragas-edge.ts:36-49`) | Criar teste-trava de paridade de contrato e plano de sunset dos slugs compartilhados pós-adoção do binário novo |
| 5 | **P2** | Resize da câmera distorce: `{width:1024, height:1024}` não preserva aspect ratio (`camera.tsx:36-37,49`) | Trocar para `[{ resize: { width: 1024 } }]` (uma dimensão só) |
| 6 | **P2** | EXIF strip apenas inferido do reencode; sem prova (`camera.tsx:46-55`) | Teste-trava: fixture JPEG com GPS → assert payload sem EXIF |
| 7 | **P2** | `update-check` depende da fn compartilhada `version-check` sem dono local (`useAppUpdateCheck.ts:100`; runbook:206-209) | Criar `pragas-version-check` dedicada (ou congelar o contrato compartilhado com teste + dono declarado) |
| 8 | **P2** | Jest não ignora `.artifacts/` — snapshot do runner duplica as 71 suítes (`package.json:92-94`; `.artifacts/.native-work-g3uEfo/source/__tests__/`) | Adicionar `"/\\.artifacts/"` ao `testPathIgnorePatterns` (mesma classe do fix eslint `f1856f6`) |
| 9 | **P2** | Sentry do Pragas ainda poluível pelo combo até o secret `SENTRY_DSN_COMBO` ser setado + redeploy (CLAUDE.md PR-08, pendência de deploy) | Setar o secret no jxcn e redeployar as fns do repo combo (ação fora deste repo) |
| 10 | **P3** | Colunas/índice órfãos: `pragas_diagnoses.image_url`, `severity` + `idx_diagnoses_severity` (`diagnose-pragas/index.ts:1033-1043`; `add_missing_indexes.sql:7`) | Migration de higiene futura: DROP INDEX órfão + comentar colunas como deprecated (não destrutivo agora) |
| 11 | **P3** | DLQ sem aging — foto local retida indefinidamente (`diagnosisQueue.ts:806-818`) | Definir política de expiração com aviso ao usuário (ou documentar retenção indefinida como decisão) |
| 12 | **P3** | Sem teste: `passwordRecovery`, `authMetadataGate`, `useAppUpdateCheck`, adapter `agrio.ts` (diff §7) | Adicionar 4 suítes-alvo (priorizar passwordRecovery e agrio) |
| 13 | **P3** | `renderItem` inline não-memoizada no history (`history.tsx:307`) | Extrair componente de linha memoizado |
| 14 | **P3** | `npm audit` não verificável offline nesta sessão; estado gerido por `overrides` (`package.json:36-45`) | Anexar evidência do gate `npm audit --audit-level=high` do próximo CI run |
| 15 | **P3** | Docs de deploy defasados: coverage §prod-compat e runbook §backend candidate descrevem estado pré-deploy de 15/jul (`launch-coverage:200-216,256-259`; `launch-runbook:176-183`) | Atualizar os dois docs com o estado 18/jul (slugs ACTIVE, sequência 1700-1730 aplicada) |
| 16 | **P3** | Migration untracked residual no working tree (`20260713120000_paid_photo_quota.sql`, `git status`) | Decidir: trackear em `migrations-proposals/` ou remover (é da re-monetização, fora do free launch) |
