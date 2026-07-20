# Verificação adversarial (D3) — IMPL 1-3, 9 commits de 2026-07-19

Missão: fable5/rumo-pragas-global-benchmark-2026-07-19 · Branch: `fable5/rumo-pragas-global-benchmark-2026-07-19`
Refutador: agente D3 read-only · Data: 2026-07-19 · Método: leitura integral dos diffs (`git show`), leitura dos arquivos vivos, execução real dos testes citados (jest + deno), tsc e deno check.

## Evidência de gates rodados NESTA verificação (D1)

| Comando | Resultado |
|---|---|
| `npx jest --runInBand <6 suítes citadas>` | **6 passed, 64 tests passed** (1.7s) |
| `npx jest --runInBand` (suíte completa) | **75 suites / 784 tests passed, 1 snapshot** (12.9s) |
| `npx jest --listTests` | 0 caminhos contendo `artifacts` (ignore provado) |
| `deno test _tests/ai-versioning-meta.test.ts _tests/agrio-credit-telemetry.test.ts` | **15 passed / 0 failed** |
| `deno check diagnose/index.ts` (slug legado, FORA do gate `deno task check`) | limpo |
| `npm run typecheck` (tsc --noEmit) | 0 erros |

Working tree no momento da verificação: `supabase/functions/deno.lock` e `supabase/.temp/cli-latest` modificados + `supabase/migrations/20260713120000_paid_photo_quota.sql` untracked — **pré-existentes de outra sessão, nenhum dos 9 commits depende deles**. Meus comandos foram read-only sobre código.

---

## 1. a174529 — deep link re-inspeção → histórico · **CONFIRMADO**

- Causa raiz real: `result.tsx:631` agenda notificação local com `data:{screen:'diagnosis-reinspection',days}`; o allowlist em `useNotifications.ts` não tinha a entrada → todo tap era `invalid_payload`. O fix adiciona a entrada e roteia para `/(tabs)/history` (destino correto: a tela de resultado não hidrata por id — mesmo racional do case `'diagnosis'`).
- **Classe substring/prefixo checada e descartada**: o matching é `Set.has()` (igualdade exata) + `switch` por literal — `'diagnosis-reinspection-evil'` e `'admin'` continuam rejeitados; testes reais cobrem exatamente esses payloads (`__tests__/hooks/useNotifications.test.ts:145,226-227`) e passaram ao vivo.
- Ressalva (não-bloqueante, pré-existente): o response listener só é instalado com push preference ON (`useNotifications.ts:181`). O agendamento é fail-closed pela MESMA preferência (`result.tsx:615-619`), então a janela é só "usuário desliga push DEPOIS de agendar" → tap abre o app sem navegar, sem crash. Coerente com o design.

## 2. 3e55d45 — confiança qualitativa no hero · **CONFIRMADO**

- Thresholds idênticos aos históricos do TopAlternatives (≥0.7/≥0.4), extraídos para `lib/confidence.ts`; TopAlternatives agora deriva os tons do mesmo helper (tons `CONFIDENCE_TONES` byte-idênticos aos antigos; labels `'high'|'medium'|'low'` preservados como valores).
- i18n: 4 chaves novas presentes nas 3 línguas (grep = 3/3 em cada); `confidenceBarA11y` removida das 3 e **zero uso remanescente** (`grep confidenceBarA11y|displayConfidence` = 0 fora de .artifacts).
- Ticker numérico removido junto com seu único consumidor (`useAnimatedReaction`/`runOnJS` importados só pra isso); barra animada preservada (`confidenceBarStyle` intacto). tsc limpo prova que não sobrou referência.
- Coerência com o banner de baixa confiança (<0.7 nunca "Alta") pinada em teste. `getConfidenceLevel(NaN/∞/negativo)` → 'low' sem throw (render path seguro).

## 3. a8b7c34 — hitSlop 4 alvos <44pt · **CONFIRMADO**

- 4 alvos, 8pt/lado, zero mudança visual (só prop `hitSlop`).
- **Sobreposição checada e descartada**: close/share do hero ficam em `heroTopRow` com `justifyContent:'space-between'` + `paddingHorizontal:Spacing.lg` (`result.tsx:1409-1421`) — cantos opostos da tela; crop-select back e camera close são únicos nos seus headers.

## 4. b2a8ddc — resize preserva aspect ratio · **CONFIRMADO**

- Bug real: `resize:{width:1024,height:1024}` distorcia toda foto não-quadrada. Fix passa UMA dimensão (lado maior → 1024). Claim da lib verificada no vendored: `expo-image-manipulator@55.0.19`, `ImageManipulator.types.ts:34` ("will be calculated automatically to preserve image ratio").
- Call sites: **único** fluxo (câmera E galeria passam por `result.assets[0]` → `compressImage(asset)`); único outro `manipulateAsync` do app (avatar edit-profile) é quadrado por design — confirmado sem mudança.
- Sem upscale (retorna `[]` se lado maior ≤1024; re-encode JPEG mantido); dims desconhecidas → width-only (aspect-safe, portrait outlier tolerado pelo guard de 5MB — documentado no código).
- Ressalva teórica (não-refutante): asset com dims trocadas por EXIF poderia limitar o lado errado → lado maior ~1365px no pior 4:3; sem distorção, dentro do cap de upload.

## 5. b3b7ca1 — gate SOFT de qualidade de foto · **CONFIRMADO**

- Heurística pura JS O(1) (dims + `base64.length`) — **zero latência de I/O nova**; thresholds conservadores documentados (480px short-side / 0.04 B/px).
- Nunca hard-block: alerta com retake (cancel) + use_anyway; "sem veredito" quando inputs não-confiáveis (dims ausentes → não avisa). `setProcessing(false)` antes do alerta evita overlay preso; retake mantém o usuário na tela.
- **Web checado**: `showAlert` (services/dialog.ts) mapeia 1 cancel + 1 ação → `window.confirm` — a Promise SEMPRE resolve também no web (react-native-web Alert é no-op; helper já cobre).
- Telemetria: nomes passam no `EVENT_NAME_RE` client e no `EVENT_PATTERN` do server (`pragas-analytics` **não tem allowlist de nomes** — verificado; só schema de chaves). Props bounded, sem PII. `trackEvent` é guarded/fire-and-forget.
- i18n: 6 chaves × 3 línguas (grep = 3/3 em todas). 28 testes passaram ao vivo (2 suítes).

## 6. f55f785 — jest ignora /.artifacts/ · **CONFIRMADO**

- `.artifacts` vive DENTRO de `expo-app/` (confirmado: `expo-app/.artifacts` existe) — logo o jest cru coletava mesmo. `testPathIgnorePatterns` +`"/.artifacts/"` resolve; provado ao vivo: `--listTests` sem nenhum caminho de artifacts e suíte completa verde (75/784 — 74/782 do commit + home-hierarchy de 530294e).
- Nitpick inofensivo: o `.` não-escapado no pattern regex overmatcharia `/Xartifacts/` — inexistente no repo.

## 7. a42353d — ai_meta nos 2 slugs · **CONFIRMADO**

- Insert: `notes: JSON.stringify({...notes, ai_meta})` nos DOIS slugs; `notes` é objeto FRESCO construído no request — **o insert nunca parseia notes legado**, logo não pode falhar por notes não-JSON antigo (a preocupação do briefing não se aplica ao caminho de escrita).
- **Resposta ao cliente SEM ai_meta — confirmado nos dois slugs**: `{...saved, notes: JSON.stringify(notes), parsedNotes: notes}` — o override de `notes` vem DEPOIS do spread de `saved` (que traria o ai_meta do banco). Legado: `diagnose/index.ts:913-917`; dedicado: `diagnose-pragas/index.ts:1092-1098` (select inclui `notes` → override necessário e presente). Serialização do `notes` da resposta reproduz byte a byte o contrato antigo (mesmo objeto, mesmo stringify).
- **Cliente velho (binário 1.0.9) contra rows novas**: todos os parsers client de notes (`result.tsx:129,149,732`, `DiagnosisCard.tsx` parseSeverity/parseName) fazem `JSON.parse` em try/catch e leem chaves específicas — chave extra `ai_meta` é ignorada. Sem colisão de chave (`notes` fresco nunca contém `ai_meta`).
- Versões honestas: legado stampa `2026-07-19.1-legacy` (SYSTEM_PROMPTs dos gêmeos realmente divergem) e `fn_slug` próprio; teste deno trava mapa AGRIO idêntico entre gêmeos + versões distintas + bloco completo no insert + resposta limpa (15/15 verdes ao vivo).
- Ressalva metodológica: os testes dos `index.ts` são de CONTRATO TEXTUAL (`Deno.readTextFile` + asserts no fonte), não E2E — adequados como trava de drift; o comportamento foi confirmado por leitura de código nesta verificação. `deno check diagnose/index.ts` rodado à parte (o gate `deno task check` NÃO cobre o slug legado — vale adicionar, fora de escopo).

## 8. ce99d70 — telemetria crédito Agrio default-ON + fail-safe · **CONFIRMADO (com ressalva operacional)**

- Default-ON correto: `(env ?? "true").toLowerCase() === "false"` — só `false` explícito desliga (case-insensitive; `"0"`/`"off"` NÃO desligam, coerente com a mensagem do commit). Portado por inteiro pro slug legado (que não tinha NADA — o apagão de 06/jul se repetiria mudo no slug que o binário público chama).
- Fail-safe triplo verificado no código: try/catch interno engolindo tudo + `.catch` no captureException interno + `.catch(() => undefined)` no call site dos DOIS slugs. Timeout de 5s por AbortController com `clearTimeout` em finally. Testes deno COMPORTAMENTAIS (fetch stub + env real) provam default-ON, kill-switch e resolução sem throw em rede/500/payload malformado — 15/15 ao vivo.
- **Ressalva (design consciente, não bug — deixo registrado pro CEO)**: (a) a chamada é `await` sequencial no caminho crítico do diagnóstico → +1 RTT ao Agrio por diagnóstico (típico ~100-400ms; pior caso bounded 5s se o endpoint pendurar). O padrão `await` é o MESMO que o gêmeo dedicado já tinha antes do commit — o commit só muda o default. (b) Sem dedup: com saldo ≤ threshold, CADA diagnóstico emite 1 captureMessage warning (agrupa numa issue só, mas consome quota Sentry — cf. gate aberto "quota Sentry"). Fix mínimo se desejado: mover pra fire-and-forget antes do insert (concorrente, não sequencial) e/ou dedup por janela no server.

## 9. 530294e — CTA home 1ª posição · **CONFIRMADO**

- Bloco JSX movido VERBATIM (diff é move puro: mesmo testID, mesmas cores/copy/estilos/handlers); nenhum card removido; `home-cta-diagnose` ocorre exatamente 1× no arquivo (sem duplicação).
- testID/e2e: contrato novo trava ordem + presença de todos os markers; suíte completa verde prova que nenhum teste existente dependia da ordem antiga. Sem scroll-to/index-based access na home (verificado por leitura).
- ZERO-N: mudança de UI em produção autorizada pela ordem do CEO da missão (citada no commit); escopo respeitado (só ordem).

---

## Veredito consolidado

**9/9 CONFIRMADOS.** Nenhuma refutação. Duas ressalvas operacionais não-bloqueantes registradas (ce99d70 latência sequencial bounded + ruído Sentry em saldo baixo; a42353d gate deno não cobre o slug legado — coberto manualmente aqui). Todos os claims de teste dos commits são reais e re-executados verdes nesta sessão.
