# 04 — AUDITORIA DE BANCO (Supabase jxcn · tabelas `pragas_*`)

> [!CAUTION]
> **ARQUIVO HISTÓRICO — NÃO USAR PARA ALTERAR BANCO OU PRODUÇÃO.**
> Snapshot anterior à revisão de 14/07/2026; use `docs/audit/launch-coverage-2026-07-14.md` e
> migrations/testes versionados em `supabase/`.

**Data:** 2026-07-02 · **Fase:** read-only (nenhuma migration aplicada) · **Projeto:** `jxcnfyeemdltdfqtgbcl` (SHARED — jamais confundir com byfg/RM)
**Método:** pg_catalog direto via MCP (`pg_policies`, `pg_proc`, `pg_indexes`, `pg_constraint`, `storage.buckets/objects`, `supabase_migrations.schema_migrations`) + advisors + grep do código vivo em `expo-app/` e `supabase/functions/`.

---

## Resumo executivo

| Dimensão | Estado |
|---|---|
| RLS em toda tabela `pragas_*` | ✅ PASS — 20/20 com RLS ON e ≥1 policy (`pragas_notification_queue` com FORCE RLS) |
| ZERO-AD (entitlement freeze) | ✅ PASS — `pragas_subscriptions` só tem 2 policies SELECT own; user NÃO tem UPDATE/INSERT; `pragas_profiles` não tem coluna de entitlement |
| Secrets no client | ✅ PASS — zero service_role/JWT hardcoded em `expo-app/` (só comentários); anon key via env |
| Advisors security (filtro pragas) | ⚠️ 2 WARN — RPCs `chat_usage` SECDEF executáveis por `authenticated` (= B1/B3 do mapa, já gated) |
| Advisors performance | ❌ o linter do Supabase está QUEBRADO server-side neste projeto (erro 42601 interno) — checks feitos manualmente |
| **Drift schema prod ↔ código** | 🔴 **CRITICAL** — `pragas_profiles` e `pragas_push_tokens` em prod NÃO têm as colunas/chaves que o app e as edge fns usam (detalhe abaixo) |
| Migrations repo ↔ prod | 🔴 drift estrutural — histórico do repo (mar–mai/2026) nunca foi aplicado em prod; prod tem histórico próprio via MCP |
| Storage | ⚠️ `pragas-images` legível por QUALQUER portador da anon key (bucket hoje vazio e sem consumer) |

**Nota da dimensão: 6.0/10** — segurança RLS/ZERO-AD/secrets sólida, mas o drift de schema quebra silenciosamente 2 features inteiras (perfil e push) para 100% dos usuários.

---

## 🔴 DB-C1 · CRITICAL · Drift `pragas_profiles`: o app inteiro escreve numa forma de tabela que NÃO existe em prod

**Evidência (prod, verificado 02/jul):**
- `pragas_profiles` prod = `id uuid DEFAULT gen_random_uuid()` (PK) + `user_id uuid NOT NULL` (unique) + colunas `farm_name/farm_location/farm_size_hectares/main_crops/...`.
- **59/59 linhas têm `id ≠ user_id`** (query: `count(*) filter (where id=user_id) = 0`).
- Colunas **inexistentes** em prod: `push_token`, `notification_preferences`, `city`, `state`, `crops`, `deletion_requested_at`.
- O repo (`supabase/migrations/20260317123844_init_schema.sql:23-33`) define `pragas_profiles(id uuid PK REFERENCES auth.users)` com `city/state/crops` — o código foi escrito contra ESSA forma, que nunca chegou ao prod.

**Código quebrado (todos os call sites usam `.eq('id', user.id)` / `onConflict:'id'`):**
| Arquivo:linha | O que quebra em runtime |
|---|---|
| `expo-app/app/edit-profile.tsx:103-105` | load do perfil: `select('full_name, city, state, phone, crops, avatar_url').eq('id', user.id)` → coluna inexistente/0 linhas → tela carrega VAZIA |
| `expo-app/app/edit-profile.tsx:270-278` | **salvar perfil FALHA SEMPRE**: upsert `{id: user.id, city, state, crops}` `onConflict:'id'` → nunca conflita (id≠uid) → INSERT sem `user_id` → 23502 NOT NULL violation → erro pro usuário |
| `expo-app/app/edit-profile.tsx:207-209` | avatar: upsert `{id: user.id, avatar_url}` → mesma falha → avatar NUNCA persiste |
| `expo-app/app/(tabs)/settings.tsx:307-310` | avatar do settings: `.eq('id', user.id)` → 0 linhas → sempre fallback letra |
| `expo-app/services/notificationPreferences.ts:86-89 e 139-144` | prefs de notificação: coluna `notification_preferences` inexistente → save FALHA em iOS/Android (com rollback do cache) — toggle reverte na cara do usuário |
| `expo-app/hooks/useNotifications.ts:130-133` | `update({push_token})` → PGRST204 → **throw que também aborta o passo 2** (ver DB-A1) |
| `expo-app/services/googleAuth.ts:201-203` · `appleAuth.ts:158-160` | update full_name `.eq('id', ...)` → 0 linhas, no-op silencioso |

**Por que passou no QA:** 440 testes jest são mockados; a fase 02 navegou telas mas não validou persistência server-side (padrão SVP: shipped ≠ working). Sentry deve ter `editProfile.load` / `push_prefs` warnings acumulados — verificar como confirmação.

**Fix proposto (2 pernas, mesmo PR/release 1.0.8):**
1. **Migration aditiva pragas-only** (não-destrutiva, mas em projeto SHARED → gate): `ALTER TABLE pragas_profiles ADD COLUMN IF NOT EXISTS push_token text, notification_preferences jsonb, city text, state text, crops text[], deletion_requested_at timestamptz;` (ou decidir alinhar o código a `farm_location/main_crops` — decisão de produto).
2. **Client v1.0.8:** trocar TODA chave de perfil para `user_id` (`.eq('user_id', user.id)`, upsert `{user_id: user.id, ...}` `onConflict:'user_id'` — o unique index `pragas_profiles_user_id_key` já existe em prod). ZERO-Q: varrer os 8 call sites listados no mesmo commit.

**gate=true** (migration em jxcn compartilhado + decisão de forma canônica do schema).

---

## 🔴 DB-A1 · ALTO · Push remoto morto fim-a-fim — 3 quebras de banco independentes

Mesmo com credencial FCM ok (M2 do mapa), **nenhum push jamais será entregue**:

1. **RPC `touch_push_token` NÃO EXISTE em prod** (verificado em `pg_proc`: 0 linhas). `expo-app/services/notifications.ts:251-255` chama `supabase.rpc('touch_push_token', ...)` → erro sempre → token nunca persiste (Sentry `persistPushTokenToServer rpc error`).
2. **Caminho legacy também quebrado:** `useNotifications.ts:130-136` grava `pragas_profiles.push_token` (coluna inexistente) e o `throw updateError` **impede** que `persistPushTokenToServer` sequer rode.
3. **`send-push` v26 (live) lê colunas inexistentes:** `supabase/functions/send-push/index.ts:303-305` seleciona `pragas_push_tokens.expo_token` + `.eq('is_active', true)` — a tabela prod só tem `(id, user_id, token, platform, created_at, updated_at)`. Fan-out retornaria erro → 500. Bônus: linha 359-361 filtra prefs com `.in('id', userIds)` comparando `pragas_profiles.id` com `user_id` (nunca bate — mesmo bug do DB-C1); e o alvo `target_state` usa `pragas_profiles.state` (inexistente).

**Fix proposto:** migration pragas-only criando o contrato que código + edge fn esperam — `ALTER TABLE pragas_push_tokens ADD COLUMN expo_token text, is_active boolean DEFAULT true, device_info jsonb, last_seen_at timestamptz` (ou renomear `token`→`expo_token` com backfill — tabela tem poucas linhas), + `CREATE FUNCTION touch_push_token(p_expo_token text, p_platform text, p_device_info jsonb) SECURITY DEFINER SET search_path=''` com `auth.uid()` interno e `GRANT EXECUTE TO authenticated` — e redeploy coordenado do `send-push`. **gate=true** (migration + deploy de edge fn).

---

## 🟠 DB-A2 · MÉDIO · Storage `pragas-images`: SELECT aberto pra role `public` (anon incluso) — risco latente LGPD

**Evidência:** policy `"Pragas: Anyone can view images"` em `storage.objects`: `cmd=SELECT, roles={public}, using (bucket_id='pragas-images')` — sem checagem de dono. Bucket é `public=false`, mas a policy torna TODOS os objetos listáveis/baixáveis por qualquer portador da anon key (que está no bundle do app). Também: INSERT exige apenas `auth.role()='authenticated'` sem travar a pasta ao `auth.uid()` (upload na pasta de outro usuário possível), e o bucket não tem `file_size_limit` nem `allowed_mime_types`.

**Mitigantes:** bucket está **VAZIO** (0 objetos) e **nenhum código atual** (client ou edge fn) usa `pragas-images` — o diagnose recebe base64 e não armazena. A migration prod `145_pragas_images_deny_listing_v12` (23/mai) tentou endurecer mas a policy aberta persiste.

**Fix proposto:** endurecer agora, enquanto está vazio: SELECT/DELETE restritos a `(storage.foldername(name))[1] = auth.uid()::text`, INSERT com o mesmo with_check de pasta, `file_size_limit` (~10MB) + `allowed_mime_types` de imagem. Alternativa: remover bucket (decisão — pode ser roadmap de upload de fotos). **gate=true** (mudança de policy storage em prod compartilhado; potencial feature futura).

Nota `avatars`: bucket `public=true` (avatar por `getPublicUrl` — design ok), policies de dono corretas por pasta, `edit-profile.tsx:188` usa `${user.id}/...` ✓. Falta só `file_size_limit` (BAIXO, embutido no fix acima).

---

## 🟠 DB-M1 · MÉDIO · Trigger `notify_outbreak_reported` referencia coluna inexistente → qualquer INSERT em `pragas_outbreaks` aborta

**Evidência:** função (prod) faz `JOIN pragas_profiles p ... WHERE p.state = NEW.state` — `pragas_profiles.state` NÃO existe. Trigger `on_outbreak_notify` está ATIVO em `pragas_outbreaks`. Qualquer INSERT (até via service_role) morre com 42703 em runtime. Hoje é tabela fantasma (B4 do mapa), mas o trigger transforma o fantasma em bomba: o dia que alguém ligar a feature, o INSERT falha.
**Fix:** `DROP TRIGGER on_outbreak_reported` (ou corrigir para `farm_location`/coluna real) dentro da decisão B4 sobre o schema comunidade/outbreaks. **gate=true** (DDL em prod).

## 🟠 DB-M2 · MÉDIO · `handle_new_pragas_user` roda para TODO signup do jxcn — dados pessoais copiados para tabelas do Pragas sem uso do app

**Evidência:** trigger `on_auth_user_created_pragas` em `auth.users` (sem filtro de app); counts exatos: `auth.users=59`, `pragas_profiles=59`, `pragas_subscriptions=59`. Ou seja, usuário do Finance/CampoVivo/etc. ganha linha com `email` + `full_name` em `pragas_profiles` + linha `inactive/basico` em `pragas_subscriptions` sem nunca abrir o Pragas (LGPD minimização de dados; infla métricas). Mitigante: FK `ON DELETE CASCADE` limpa tudo quando o auth user é deletado.
**Fix:** decisão de portfólio (outros apps do jxcn têm o mesmo padrão): filtrar por `raw_user_meta_data->>'app'` no trigger OU aceitar o design e documentar (auth compartilhado = perfil pré-criado para SSO entre apps). **gate=true** (trigger em objeto SHARED `auth.users`).

## 🟠 DB-M3 · MÉDIO · Migrations do repo ≠ histórico do prod — repo NÃO é fonte de verdade do schema

**Evidência:** `supabase_migrations.schema_migrations` do prod não contém NENHUMA das versões 20260317…–20260416 do repo; prod tem histórico próprio (ex.: `pragas_audit_*_2026_05_20`, `pragas_chat_usage_counter_20260628`). É a causa-raiz de DB-C1/DB-A1: `20260326000000_add_push_token.sql` (repo) nunca foi aplicada; a forma de `pragas_profiles` do `init_schema.sql` nunca existiu em prod. Confirmado também: repo `20260628140000_subscriptions_consolidate_duplicate_select_policies.sql` é PROPOSAL-only (gated, tabela SHARED `subscriptions`) e corretamente NÃO aplicada.
**Fix:** gerar baseline real do prod (dump filtrado `pragas_*`) para `supabase/migrations/` (ou doc `SCHEMA_PROD.md`) ANTES da próxima migration; toda migration futura via MCP `apply_migration` com nome versionado. **gate=false** (documental), mas a aplicação do baseline em si segue o fluxo normal de PR.

---

## 🟡 BAIXOS

- **DB-B1 · Policies duplicadas (perf/hygiene):** `pragas_subscriptions` tem 2 SELECT own idênticas (`Users can view own subscription` + `deprecated_select_only_own`, esta com `auth.uid()` SEM initplan-wrap `(select auth.uid())`); `pragas_analytics` tem 2 policies ALL service_role idênticas; `pragas_chat_messages` tem policy service_role redundante (service_role bypassa RLS). Fix: migration de higiene dropando duplicatas. gate=true (DDL prod, zero mudança de acesso efetivo).
- **DB-B2 · Colunas órfãs em `pragas_outbreaks`:** DOIS pares de coordenadas (`latitude/longitude` E `location_lat/location_lng`) cada um com índice próprio — consolidar na decisão B4 (schema fantasma). gate=true.
- **DB-B3 · Catálogo `pragas` fantasma:** tabela `pragas` (seed agronômico, SELECT authenticated `ativa=true`) tem ZERO consumer no app (`from('pragas')` inexistente em `expo-app/` — a library usa dados locais). Somar à decisão B4. gate=true.
- **DB-B4 · Advisor performance do projeto quebrado:** `get_advisors(performance)` retorna erro SQL interno do próprio linter (42601 em `'storage.buckets'`) — não é causado pelo Pragas; abrir ticket/ignorar. Os checks (índices, initplan, policies múltiplas) foram feitos manualmente: **índices OK** (todas as queries do app cobertas por `user_id`/composites; únicos FKs sem índice estão em tabelas fantasma).
- **Confirmações sem re-reporte** (já no mapa da fase 1): B1 (RPCs `chat_usage` executáveis por authenticated com `p_user_id` arbitrário — grants confirmados: `{authenticated,postgres,service_role}`, anon revogado ✓ migration 02/jul aplicada), B3 (SECDEF `search_path=public` em vez de `''`), B4 (9 tabelas comunidade/outbreaks sem tela). `chat_usage` (tabela SHARED com coluna `app`) tem RLS ON + SELECT own ✓; `webhook_events` service_role-only ✓; `mcp_api_tokens` RLS sem policy user (admin-only via service_role, token_hash SHA-256) ✓.

---

## Checks que PASSARAM (evidência)

1. **RLS ON em 20/20 `pragas_*`** — nenhuma tabela sem policy; `pragas_notification_queue` com FORCE RLS + service_role only.
2. **ZERO-AD PASS** — `pragas_subscriptions`: apenas SELECT own (2×) + escrita exclusiva via service_role (webhook); nenhuma policy UPDATE/INSERT para user em tabela com coluna de entitlement (`status/plan/product_id/...`). `pragas_profiles` sem coluna de entitlement.
3. **Policies own-only corretas** — INSERT/UPDATE/DELETE com `auth.uid() = user_id` (initplan-wrapped nas ativas) em chat, diagnoses, feedback, community, push_tokens.
4. **FKs íntegros** — 23 FKs, todos `user_id → auth.users ON DELETE CASCADE` (analytics/error_logs `SET NULL` = anonimização ok). Deleção LGPD: `process-deletions`/`delete-user-account` deletam `pragas_profiles` por `.eq('id', userId)` (0 linhas — mesmo bug do DB-C1), **mas o CASCADE do auth.users cobre o resultado final** — sem sobra de dados pós-purge ✓ (corrigir o `.eq` para `user_id` junto do DB-C1 por clareza).
5. **Secrets** — grep `service_role|eyJhb` em `expo-app/`: só comentários; `api/mcp/_supabase.ts` usa service key apenas server-side (Vercel).
6. **Índices** — cobertura completa para as queries reais do app (`user_id, created_at DESC` em diagnoses/chat/analytics; unique `user_id` em profiles/subscriptions; GIN em `pragas.culturas_alvo`).

---

## Ordem de aterrissagem recomendada (v1.0.8)

1. Migration aditiva `pragas_profiles` + `pragas_push_tokens` + RPC `touch_push_token` (DB-C1 + DB-A1) — **gate CEO** (jxcn shared, ordem: migration → deploy `send-push` → binário).
2. Client sweep `id`→`user_id` (8 call sites) no mesmo PR (ZERO-Q).
3. Hardening storage `pragas-images` enquanto vazio (DB-A2).
4. `DROP TRIGGER on_outbreak_notify` ou fix (DB-M1) junto da decisão B4.
5. Higiene: policies duplicadas + baseline de migrations (DB-B1, DB-M3).
