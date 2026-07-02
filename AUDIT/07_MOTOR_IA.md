# 07 — MOTOR IA (Pipeline de Identificação de Pragas)

> App: **Rumo Pragas IA** · Branch: `perfect/pragas-launch-2026-07-02` · Fase: **read-only**
> Data: 2026-07-02 · Escopo: câmera/upload → edge fn `diagnose` → resultado → recomendação de manejo + `ai-chat`
> Backend: Supabase **jxcnfyeemdltdfqtgbcl** · Modelo: `claude-haiku-4-5-20251001` (Vision + Chat)
> Estado: 100% GRÁTIS (FREE_MODE=true, caps free=-1) · diagnose v48 / ai-chat v33 deployados

---

## Veredito

O coração do app é **sólido e bem-blindado**. Não há CRITICAL no motor de IA. A cadeia
câmera → compressão → edge fn → Claude Vision → parse → persistência → resultado tem
defesas maduras: timeout de 60s no cliente (nunca spinner eterno), botão cancelar,
fail-closed na cota mensal, validação de magic bytes, defesa contra prompt-injection,
sanitização de HTML na saída, disclaimer legal obrigatório (Lei 7.802/89), gate de
confiança (<0.5 → imagem inválida; <0.7 → aviso), consentimento de localização
duplo-travado (cliente + servidor, fail-closed LGPD), DLQ com TTL de 30 dias e backoff
exponencial com jitter na fila offline.

Os achados abaixo são de **robustez, cobertura e custo/acurácia** — nenhum bloqueia o
lançamento, mas **A1, A2 e A3** valem correção antes/junto da v1.0.8.

**Score da dimensão: 8.0/10**

---

## Achados

### A1 · MÉDIO · Fila offline pode gerar diagnósticos DUPLICADOS (sem chave de idempotência)
**Área:** rn-app / web-api
**Evidência:** `hooks/useDiagnosisSync.ts:120-128` + `supabase/functions/diagnose/index.ts:771-784`
**Repro:** usuário offline tira foto → `addToQueue`. Ao reconectar, `syncQueue` chama
`sendDiagnosis`. Se o servidor JÁ inseriu a linha em `pragas_diagnoses` mas a conexão cai
**antes** do cliente receber o 200, `sendDiagnosis` lança → o item **permanece na fila**,
`incrementRetry` → é reenviado → **segunda linha inserida** para a mesma foto. Mesma classe
no path online: se o `fetch` estoura o `DIAGNOSE_TIMEOUT_MS` de 60s (`services/diagnosis.ts:16,149`)
**após** o insert, o cliente aborta e mostra erro, mas a linha ficou órfã no histórico.
**Impacto:** histórico com entradas duplicadas/fantasmas + **gasto duplicado de Anthropic Vision**
(o item mais caro do app). Sem `Idempotency-Key`/`client_request_id`, o edge fn não deduplica.
**Fix proposto:** gerar um `client_request_id` (UUID) no momento da captura (guardá-lo no
`PendingDiagnosis`), enviá-lo no body do `diagnose`, e no edge fn fazer
`INSERT ... ON CONFLICT (user_id, client_request_id) DO NOTHING RETURNING *` (adicionar coluna
+ índice único parcial). Se conflito, retornar a linha existente (200) em vez de inserir de novo.
Alternativa mais barata: antes do `fetch` no `syncQueue`, checar se já existe linha recente com
mesmo hash de imagem. Funciona em iOS/Android/Web.
**gate:** false

### A2 · MÉDIO · Path offline (fila + sync) não é guardado para Web (viola regra de plataforma)
**Área:** rn-app
**Evidência:** `app/diagnosis/loading.tsx:186-210` (`addToQueue` quando `isConnected===false`),
`hooks/useDiagnosisSync.ts` (sem guard de plataforma), `services/diagnosisQueue.ts:6,11,15`
(`expo-file-system/legacy` — `documentDirectory` é `null` no web → `QUEUE_DIR="nulldiagnosis-queue/"`).
**Repro:** no build **web** (react-native-web), usuário offline submete diagnóstico →
`addToQueue` → `FileSystem.writeAsStringAsync(null...)` lança. O `catch` de `loading.tsx` cai em
`offlineQueueError` em vez de uma mensagem limpa "sem conexão". `useDiagnosisSync` também roda no
web e chama `getQueue`/`getInfoAsync` em path nulo a cada reconexão (hoje mascarado pelo try/catch
de `getQueue`, mas gera ruído no Sentry e comportamento fantasma).
**Impacto:** promessa de "salvo offline / sincroniza depois" **não existe no web** — degrada para
erro. Viola a regra inegociável do SKILL (offline logic deve ser `Platform.OS !== 'web'`).
**Fix proposto:** em `loading.tsx`, só entrar no ramo de fila se
`isConnectedRef.current === false && Platform.OS !== 'web'`; no web offline, mostrar
`errors.networkError` direto. Em `useDiagnosisSync`, `if (Platform.OS === 'web') return;` no topo
do efeito de sync. Preserva iOS/Android.
**gate:** false

### A3 · MÉDIO · "Pastagem" não é cultura selecionável, apesar de estar no catálogo MIP e ser cultura-alvo
**Área:** rn-app / web-api / design
**Evidência:** `constants/crops.ts:9-28` (18 culturas, **sem pastagem**);
`supabase/functions/diagnose/index.ts:139-143` (`VALID_CROP_TYPES` sem pastagem);
porém `data/mip/outras.ts:353-373` tem `pastagem_cigarrinha` (Cigarrinha-das-pastagens) e
`data/mip/index.ts:10` documenta pastagem no catálogo.
**Repro:** produtor de pastagem abre `crop-select` → não encontra "Pastagem" → segue sem cultura
ou escolhe errado. O edge fn então não injeta contexto de cultura no prompt (ou mapeia p/ "outro"),
reduzindo a precisão do diagnóstico exatamente na cultura que o catálogo já suporta.
**Impacto:** gap de cobertura numa das culturas pedidas (soja/milho/cana/algodão/**pastagem**).
Mitigado parcialmente porque `useMipKnowledge` faz fallback de busca sem filtro de cultura
(`hooks/useMipKnowledge.ts:156-158`), mas o hint de cultura para o Claude se perde.
**Fix proposto:** adicionar `{ id:'pastagem', displayName:'Pastagem', apiName:'Pasture', icon:'🌱', color:'#7CB342' }`
em `CROPS`, incluir `"Pasture"` em `VALID_CROP_TYPES` e no `cropMap` (→ `pastagem`) do edge fn
(mesmo commit, deploy do edge fn é do próprio app Pragas — não é slug shared). Cobre 3 plataformas.
**gate:** true — adicionar cultura é decisão de produto (nova superfície de usuário PT-BR).

### A4 · MÉDIO · Modelo de visão = `claude-haiku-4-5` (mais barato/rápido, menos acurado) para decisão que afeta a lavoura
**Área:** web-api
**Evidência:** `supabase/functions/diagnose/index.ts:14` (`CLAUDE_MODEL = "claude-haiku-4-5-20251001"`)
**Repro:** diagnóstico de praga/doença por foto usando o tier Haiku. Para identificação
fitossanitária fina (diferenciar percevejos, ferrugens, deficiências), Haiku tende a errar mais
que Sonnet; erro → recomendação química errada → dano à cultura + risco reputacional.
**Impacto:** acurácia do produto-núcleo. Mitigado pelo gate de confiança <0.5 (descarta incerto) e
pelo disclaimer CREA obrigatório, mas o teto de qualidade é o do Haiku.
**Fix proposto:** decisão de custo do CEO. Opções: (a) manter Haiku (app grátis, custo mínimo);
(b) subir só o `diagnose` (visão) para Sonnet e manter `ai-chat` em Haiku; (c) A/B por
confiança — reprocessar em Sonnet quando Haiku retorna 0.5–0.7. Medir com A6 antes de decidir.
**gate:** true — troca de modelo = decisão de custo/OPEX.

### A5 · BAIXO · Edge fn sem timeout/abort no fetch ao Claude → linhas órfãs quando o cliente aborta em 60s
**Área:** web-api
**Evidência:** `supabase/functions/diagnose/index.ts:609-643` (fetch à Anthropic sem `AbortController`);
cliente aborta em 60s (`services/diagnosis.ts:16`).
**Impacto:** se o Claude demora >60s, o cliente já desistiu (mostra "tempo esgotado"), mas o edge fn
continua, insere `pragas_diagnoses` e paga a chamada → diagnóstico aparece no histórico sem o usuário
ter visto o resultado. Baixa frequência.
**Fix proposto:** `AbortController` com timeout ~50s no fetch à Anthropic (abaixo dos 60s do cliente);
em timeout, retornar 504 amigável sem inserir. Alinha o relógio servidor↔cliente.
**gate:** false

### A6 · BAIXO · Sem telemetria de acurácia / loop de feedback do usuário
**Área:** rn-app / web-api
**Evidência:** `supabase/functions/diagnose/index.ts:674-681` captura só tokens/latência
(`captureGenAiRequest`); `app/diagnosis/result.tsx` não tem "este diagnóstico ajudou? sim/não".
**Impacto:** impossível medir taxa de acerto, distribuição de confiança em produção ou decidir A4
(Haiku vs Sonnet) com dados. Ghost de qualidade — "shipped" sem sinal de "working" (ZERO-P).
**Fix proposto:** (a) emitir métrica leve de distribuição de `confidence` e taxa de `invalid_image`
(sem PII) no `captureGenAiRequest`/PostHog; (b) botão discreto de feedback (👍/👎) no result.tsx
gravando em tabela `pragas_diagnosis_feedback` (RLS own-only). Cobre 3 plataformas.
**gate:** false

### A7 · BAIXO · `cropApiName` cai silenciosamente em `'Soybean'` quando ausente
**Área:** rn-app
**Evidência:** `app/diagnosis/loading.tsx:149-156` (`cropApiName || 'Soybean'`),
`app/diagnosis/loading.tsx:125` (breadcrumb com o mesmo default).
**Repro:** `crop-select` hoje exige seleção (`crop-select.tsx:46-48` só navega com `selected.apiName`),
então o caminho normal é seguro. Mas qualquer entrada alternativa em `/diagnosis/loading` sem o
param manda "Soja" ao Claude como contexto — hint de cultura errado silencioso.
**Impacto:** latente; hoje não alcançável pelo fluxo padrão. Trap para regressões futuras.
**Fix proposto:** se `cropApiName` ausente, enviar cultura vazia (`''`) — o edge fn já trata
`safeCropType` vazio e simplesmente não injeta contexto — em vez de assumir soja.
**gate:** false

### A8 · BAIXO · Limiar `invalid_image` em confiança <0.5 é agressivo + persiste linha de foto ruim no histórico
**Área:** web-api
**Evidência:** `supabase/functions/diagnose/index.ts:731-743` (confiança <0.5 → `invalid_image`),
`:771-784` (insere `pragas_diagnoses` mesmo para `invalid_image`, confidence=0).
**Impacto:** fotos legítimas de pragas genuinamente ambíguas (~0.4) são descartadas como
"imagem não clara" mesmo com boa foto; e cada tentativa ruim gera linha no histórico
(sob FREE_MODE ilimitado, sem custo de cota, mas polui o histórico).
**Fix proposto:** para 0.4–0.5, considerar retornar as 2-3 `predictions` como "possibilidades"
com aviso forte, em vez de bloquear; e opcionalmente **não persistir** `invalid_image`
(retornar transitório sem INSERT) para não sujar o histórico. Ajuste fino, não bloqueia.
**gate:** false

---

## Pontos fortes confirmados (não regredir)

- **Nunca spinner eterno:** `AbortController` 60s + botão cancelar + rota de erro com mensagem PT-BR
  (`services/diagnosis.ts:147-175`, `loading.tsx:245-263`).
- **Fail-closed na cota mensal** (503 em erro de count, não fail-open) — `diagnose/index.ts:393-419`.
- **FREE_MODE íntegro:** free=-1 em diagnose e ai-chat; sob free ilimitado as RPCs `chat_usage`
  nem são chamadas (sem dead-end 403) — `ai-chat/index.ts:142-151,391`.
- **Segurança de entrada:** magic bytes de imagem, allowlist de cultura, validação de coordenadas,
  defesa de prompt-injection (system prompt + delimitador), sanitização HTML da saída.
- **LGPD:** localização duplo-travada (cliente `diagnosis.ts:58-75` + servidor
  `diagnose/index.ts:536-553`), fail-closed sem consentimento.
- **Disclaimer legal obrigatório** (Lei 7.802/89) em todo diagnóstico — `diagnose/index.ts:745-747`.
- **Compressão antes do upload:** 1024px / JPEG 0.75 no cliente (`camera.tsx:27-47`), validação de
  5MB no cliente e 7.5MB no servidor.
- **Resiliência offline (mobile):** imagem em disco (não em AsyncStorage), backoff exponencial +
  jitter, DLQ com TTL 30d, captura Sentry — `diagnosisQueue.ts` + `useDiagnosisSync.ts`.
- **Catálogo MIP consumido de verdade** (não ghost): `useMipKnowledge` → `MipCard` enriquece o
  resultado offline com manejo cultural/biológico — `hooks/useMipKnowledge.ts:27-32,156-175`.
- **Observability de IA:** `captureGenAiRequest` (tokens/latência, sem PII) em diagnose e ai-chat.

## Notas de verificação (não-achados)

- Cobertura de culturas no prompt do sistema: soja, milho, café, algodão, cana, trigo detalhadas
  com pragas/nomes científicos BR — boa (`diagnose/index.ts:192-201`).
- `ai-chat` slug é SHARED com rumo-vet; já há detecção de colisão de persona via header `X-Rumo-App`
  + Sentry (`ai-chat/index.ts:155-169,276-290`). Fix durável (slug dedicado) é gate de deploy do CEO —
  fora do escopo do motor.
- Drift repo↔prod: o MAPA confirmou diagnose v48 / ai-chat v33 com FREE_MODE e free=-1 no código
  deployado. Recomendo confirmar que o limiar de confiança <0.5 (P0-1) está no v48 deployado antes
  do release (verificação, não achado).
