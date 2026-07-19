# Rumo Pragas — Auditoria de Qualidade e Segurança da IA (A2)

- Missão: `fable5/rumo-pragas-global-benchmark-2026-07-19`, auditor A2. READ-ONLY.
- Branch auditada: `fable5/rumo-pragas-global-benchmark-2026-07-19` (estado atual).
- Escopo: pipeline de inferência, calibração/apresentação de confiança, OOD, feedback,
  drift/versionamento, privacidade, latência/custo, observabilidade, segurança agronômica.
- Convenção: **OBSERVADO** = lido no código com `arquivo:linha`; **INFERIDO** = deduzido, marcado.
- Referências lidas: `docs/audit/launch-coverage-2026-07-14.md`;
  `docs/fable5/rumo-pragas/research-raw/recovered-2026-07-18/a1-verdade-terreno-fluxo-s8.md`;
  `CLAUDE.md` (estado operacional 17/07).

## Sumário executivo (≤10 linhas)

O pipeline de diagnóstico é robusto em **segurança de transporte** (magic-byte, idempotência com
lease, rate-limit durável, consentimento por versão, fail-closed de imagem inválida) e em
**segurança agronômica** (filtro multilíngue anti-prescrição, disclaimers CREA/AGROFIT). Porém a
**qualidade/observabilidade da IA tem lacunas P0/P1**: (1) a confiança do Agrio é exibida como
porcentagem inteira crua, sem calibração nem rótulo qualitativo (viola missão §8); (2) **nenhum
diagnóstico registra o provider/modelo/versão de prompt/versão do AGRIO_LABEL_MAP** — drift é
indetectável e irreproduzível; (3) o **feedback "incorreto" é write-only** — não há superfície de
leitura, métrica nem human-in-the-loop, o loop não fecha; (4) **telemetria de crédito Agrio está
desligada por default** → risco de repetir a queda total de 06/07 (créditos a zero) sem alerta;
(5) o **Agrio recebe a foto crua mas não é declarado** como subprocessador em Data Safety/privacidade.
Não há teste do adaptador Agrio nem do limiar `invalid_image`. Recomendações priorizadas na tabela final.

---

## 1. Pipeline de inferência (captura → Agrio → enrichment)

Fluxo OBSERVADO, ponta a ponta:

1. **Captura/compressão** — `expo-app/app/diagnosis/camera.tsx:46-55` reencoda via
   `expo-image-manipulator` (`manipulateAsync`, `SaveFormat.JPEG`, `base64:true`). O reencode
   descarta EXIF (inclui GPS) como efeito colateral — **INFERIDO** (ImageManipulator não preserva EXIF;
   sem teste que asseje ausência de EXIF).
2. **Guarda de tamanho no device** — `expo-app/services/diagnosis.ts:14,86-93`, cap 5 MB antes de sair.
3. **Transporte** — `diagnosis.ts:195-211`: POST `…/functions/v1/diagnose-pragas` com headers
   `Idempotency-Key` (UUID), `X-Pragas-AI-Consent-Version/-Purpose`; body `image_base64 + crop_type +
   latitude/longitude` (já minimizadas/consentidas).
4. **Validação servidor** — `supabase/functions/diagnose-pragas/index.ts`: auth+getUser (301-317),
   access-state (318-332), idempotência UUID (334-347), consentimento (349-384), rate-limit (386-449),
   corpo bounded 15 MB (454), `image_base64` string (484), base64 limpo ≤10M chars≈7.5 MB (582),
   **magic-byte** (593-605), regex base64 (608).
5. **Chamada Agrio** — `diagnose-pragas/agrio.ts:73-117`: multipart `file=<blob>` (+ `payload={crop}`
   opcional), `?key=…`, timeout 45 s (81). Sucesso só se `message==="success!"` (113).
6. **Normalização** — `agrio.ts:240-319 adaptAgrio`: ordena `idArray` por confiança (251-255),
   detecta `Healthy` (260-275), traduz label genérico via **`AGRIO_LABEL_MAP`** (174-217) que só cobre
   `rust`/`fallarmyworm` para Coffee/Soybean/Wheat/Corn. O `scientific_name` é a chave que o catálogo
   MIP casa (`useMipKnowledge`); labels genéricos com `scientificName:null` **fora do mapa** ficam sem
   ponte → laudo fraco/vazio (agrio.ts:283-291).
7. **Sanitização + limiar** — `index.ts:958` `sanitizeDiagnosisOutput`; `975` `invalid_image` se
   `pest_id==="invalid_image"` OU `confidence<0.5`; disclaimer legal anexado (987-997).
8. **Persistência** — `index.ts:1032-1045`: insere em `pragas_diagnoses` (`notes` JSON com predictions
   e enrichment). Sem `image_url` (imagem NÃO retida — ver §6).
9. **Enrichment local** — cliente resolve laudo do catálogo MIP empacotado (`expo-app/data/mip/*`) por
   `pest_name`+`scientific_name`+`crop` (`agrio.ts:12-16` header; a1 doc `result.tsx:250-258`).

**Pontos de perda/risco (OBSERVADO):**
- Diagnóstico **mono-imagem, sem órgão/parte da planta** (a1 itens 2,5; `contexts/DiagnosisContext.tsx`
  `imageUri/imageBase64` singulares; `diagnosis.ts:204` um `image_base64`). Limita acurácia real.
- Cobertura do `AGRIO_LABEL_MAP` é mínima (4 pares) — dependência forte do `scientificName` do Agrio
  para todo o resto; falha silenciosa vira laudo pobre, sinalizado só por `captureMessage` info (§5).
- Caminho `claude` (legado) usa `SYSTEM_PROMPT` com `invalid_image` explícito (index.ts:196); o caminho
  **Agrio não tem esse contrato** — a rejeição OOD do Agrio depende só do limiar `<0.5` e do
  `Healthy`, sem "não é planta" nativo (risco de FP quando Agrio força um top-1 confiante numa não-planta).

## 2. Calibração e apresentação de confiança

- **Fonte da confiança**: valor cru do Agrio (`idArray[].confidence`, `agrio.ts:305`) ou do Claude
  (`confidence` do JSON). **Não há camada de calibração** contra ground-truth do app — **OBSERVADO**
  (nenhum arquivo de calibração; o score do provider é repassado verbatim).
- **Limiares aplicados ao score cru**: `<0.5 → invalid_image` (index.ts:975); `<0.7 → banner de baixa
  confiança` (index.ts:996 `low_confidence_warning`; cliente `result.tsx:112,864`). Como o score não é
  calibrado, esses cortes são heurísticos sobre um número do fornecedor.
- **Apresentação na UI (risco missão §8 — "porcentagens enganosamente precisas")**: o hero mostra
  **porcentagem inteira crua** `{displayConfidence}%` (`result.tsx:854`, `displayConfidence =
  Math.round(confidence*100)`, linha 200), **sem rótulo qualitativo** ("alta/média/baixa"). As
  alternativas mostram `Math.round(alt.confidence*100)%` (`result.tsx:920`). Tons qualitativos existem
  só no componente `TopAlternatives.tsx:41-45` (a1 item 10). Resultado: 0,87 vira "87%", sugerindo
  precisão que o modelo não tem. **PARCIAL** — o banner `<70%` mitiga em parte, mas o número exato ainda
  domina o hero.

## 3. OOD / imagem inválida (fail-closed)

- **Servidor**: `index.ts:975-985` força `invalid_image` (confidence 0, sem pest, sem predictions,
  `severity:none`) quando `pest_id==="invalid_image"` ou `confidence<0.5`; persiste com confidence 0
  (1039). `SYSTEM_PROMPT` (196) instrui retorno `invalid_image` para não-planta / qualidade insuficiente
  — **mas só no caminho `claude`**.
- **Cliente**: `result.tsx:110,714-748` renderiza estado "imagem não clara" + "Tentar Novamente"
  (reinicia câmera, a1 item 7,13); empty state 751-773.
- **Cobertura de testes — LACUNA (OBSERVADO)**: em `supabase/functions/_tests/` **não há** teste do
  adaptador Agrio (`adaptAgrio`), do limiar `invalid_image`, nem do caminho OOD do `diagnose-pragas`.
  `ai-boundary-security.test.ts` cobre consentimento, idempotência, `normalizePragasCoordinates` e
  classificação de acesso — não a qualidade do diagnóstico. Fail-closed existe no código, mas **não é
  travado por teste**.

## 4. Falso positivo/negativo — o loop de feedback

- **Escrita**: `report-diagnosis-feedback/index.ts:116-134` faz upsert em `pragas_diagnosis_feedback`
  (`verdict` ∈ correct/incorrect/unsure, `selected_alternative`, `notes`), com validação de posse do
  diagnóstico (100-114), rate-limit 20/dia (18) e idempotência. Contrato sólido.
- **Loop NÃO fecha (OBSERVADO)**: o **único** acesso a `pragas_diagnosis_feedback` em todo o código é
  essa escrita (`grep` → 1 hit não-teste, o `.from()` de linha 122). Não há superfície de **leitura**,
  agregação/métrica nem export do feedback. O endpoint admin (`admin-ai-content-reports/index.ts`) só
  modera `pragas_ai_content_reports` (reports de conteúdo do **chat**), nunca o feedback de diagnóstico.
- **Sem human-in-the-loop (OBSERVADO)**: não existe canal "falar com agrônomo" nem retorno humano ao
  usuário; o estado incerto/incorreto termina em beco (a1 item 14). O feedback alimenta a tabela mas
  ninguém o consome → não vira sinal de retreino, de curadoria do `AGRIO_LABEL_MAP`, nem de QA.

## 5. Drift / versionamento

- **Nenhuma versão de modelo/prompt por diagnóstico (OBSERVADO)**: `pragas_diagnoses` não tem coluna de
  provider/modelo/versão de prompt/versão do label-map (`migrations/20260317123844_init_schema.sql:7-19`
  — colunas: crop, pest_id, pest_name, confidence, image_url, notes, location_*). O insert
  (`index.ts:1032-1045`) também não grava isso no `notes`. Consequência: impossível correlacionar um
  resultado ao `DIAGNOSE_PROVIDER` (agrio/claude), ao `CLAUDE_MODEL` (`index.ts:30`), ao
  `SYSTEM_PROMPT` ou à revisão do `AGRIO_LABEL_MAP`/MIP que o produziu → drift **indetectável e
  diagnóstico irreproduzível**.
- **Telemetria de label não-mapeado (OBSERVADO)**: `agrio.ts:295-300` emite `captureMessage` nível
  **info** `agrio_label_unmapped` — sem crop/pest (bom p/ privacidade), mas **sem alerta/dashboard**; é
  um sinal passivo que ninguém observa por default. Serve para "completar o mapa por tráfego" só se
  alguém garimpar o Sentry.
- **MIP sem versão de catálogo (OBSERVADO)**: cada entrada tem `referencias` com `source`+`url`+`ano`
  (`data/mip/soja.ts:18-55`), mas **não há versão/revisão do catálogo** como um todo (`grep version|
  revisao|atualizado` em `data/mip/*.ts` = 0). Não dá para saber "qual edição do MIP" respondeu.
- **Falta para detectar drift**: coluna `provider/model/prompt_version/labelmap_version` por linha;
  métrica de taxa `incorrect` do feedback (§4) por versão; alerta sobre `agrio_label_unmapped`;
  versão do catálogo MIP.

## 6. Privacidade

- **EXIF/geo minimizada**: coordenadas **duplamente** coarsadas a 2 casas (~1 km) — cliente
  `services/locationPrivacy.ts:11-24 minimizeCoordinates` e servidor
  `_shared/ai-idempotency.ts:207-210 normalizePragasCoordinates` (`toFixed(2)`), **consent-gated** no
  cliente (`diagnosis.ts:139-151`, fail-closed) e no servidor (`index.ts:558-577`, default sem consent →
  sem localização). EXIF da foto: removido pelo reencode JPEG (`camera.tsx:47-50`) — **INFERIDO**, sem
  teste que confirme ausência de EXIF/GPS no base64 enviado ao Agrio.
- **Retenção de imagem**: a foto **NÃO é persistida** (OBSERVADO) — o insert não grava `image_url`
  (`index.ts:1032-1045`); o base64 vai ao Agrio (`agrio.ts:96`) e é descartado; no device fica na fila
  de retry (a1 extra c). Coluna `image_url` existe (init_schema:15) mas nunca é escrita.
- **Agrio como subprocessador NÃO declarado (risco)**: o Agrio recebe a **foto crua** desde 06/07, mas
  Data Safety/privacidade declaram só Anthropic (confirmado em `CLAUDE.md` "Estado operacional 17/07" →
  "falta declarar o Agrio"). Gap de conformidade LGPD/loja.
- **PII em logs/Sentry**: `_shared/pragas-sentry.ts` é forte — `scrubValue` redige content/prompt/image/
  response (28-29), email (30), pseudonimiza user_id (57-65,72-74), redige coords/JWT/Bearer/UUID/base64
  longo (38-55), e `captureGenAiRequest` grava **só** model+tokens+latência (261-309, sem prompt/imagem).
  **Ressalva (OBSERVADO)**: `PII_HASH_SALT` é opcional (27); sem ele, `pseudonymizeIdentifier` retorna
  `"anon_redacted"` fixo (58) — protege PII, mas colapsa toda correlação por usuário no Sentry. Há teste
  de regressão do scrub (`_tests/privacy-cleanup-and-routing.test.ts:238`).
- **Consentimento**: ledger `pragas_ai_consents` + RPC `record_pragas_ai_consent`
  (`_shared/ai-consent.ts:25-39`), versão fixa `2026-07-14.1`, validada por header e purpose
  (10-21); fail-closed 428 se ausente/mismatch (`index.ts:349-384`).

## 7. Latência / custo

- **Timeouts (OBSERVADO)**: cliente diagnose 60 s (`diagnosis.ts:17`), REST 15 s (18); servidor Agrio
  45 s (`agrio.ts:81`), Claude 30 s (`index.ts:880`), Gemini 30 s (`ai-chat-pragas/index.ts:276`).
  Sentry envelope 1,5 s (`pragas-sentry.ts:155`). Coerentes — reviewer nunca fica em spinner infinito.
- **Tamanho de payload**: 5 MB cliente / 7,5 MB decodificado servidor (`index.ts:173,582`) / 15 MB
  fingerprint (386) / resposta bounded 1 MB cliente (`diagnosis.ts:19`) / 256 KB da resposta Agrio
  (`agrio.ts:109`). Bem contido.
- **Rate limit**: diagnose 10/hora/usuário durável (`index.ts:141`, `consumeDurableRateLimit` sobre
  `pragas_api_rate_limit_counters`); chat 20/min (`ai-chat-pragas:129`). Circuit breaker de abuso, não
  paywall.
- **Custo Agrio (RISCO, OBSERVADO)**: ~1 crédito/diagnóstico, conta pré-paga (~985 créditos, `agrio.ts`
  header). App é grátis e público → **sem teto de orçamento global** (só o cap 10/h/usuário). Pior: a
  telemetria de saldo `maybeCaptureAgrioBalance` está **desligada por default** — só roda se
  `AGRIO_CREDIT_TELEMETRY_ENABLED==="true"` (`agrio.ts:123`). Foi exatamente crédito a zero que derrubou
  100% dos diagnósticos em 06/07 (`agrio.ts` header, RUMO-PRAGAS-10). Sem esse alerta ligado, a queda se
  repete silenciosamente.

## 8. Observabilidade

- **Instrumentado (OBSERVADO)**: todas as fns têm Sentry (`withSentry`/`captureException`); rotas de IA
  emitem `captureGenAiRequest` (spans gen_ai com tokens/latência) — `index.ts:926-934`,
  `ai-chat-pragas:885-893`. Erros upstream de Agrio/Claude/Gemini capturados (`index.ts:832,898`;
  `ai-chat-pragas:865`). Catch top-level instrumentado (`ai-chat-pragas:905`).
- **Cego (OBSERVADO/known)**:
  - `pragas_chat_messages` = 0 por design; nada escreve nela e em FREE_MODE `increment_chat_usage` é
    pulado (`CLAUDE.md` PR-10, ZERO-V) → "0 linhas" ≠ chat quebrado; adoção do chat só nos logs da fn.
  - Telemetria de crédito Agrio OFF por default (§7).
  - `agrio_label_unmapped` só info, sem alerta (§5).
  - **Sem tag de provider/modelo por diagnóstico** no dado persistido (§5) — o gen_ai span tem modelo,
    mas não liga à linha `pragas_diagnoses`.
  - DSN Sentry compartilhado no jxcn polui/é poluído entre apps; mitigado por tag `app` (`SENTRY_APP`,
    `pragas-sentry.ts:123`) e, em andamento, DSN dedicado (`CLAUDE.md` PR-08).
  - Feedback de diagnóstico não vira métrica (§4).

## 9. Segurança agronômica (missão §7)

- **Anti-prescrição forte (OBSERVADO)**: `SYSTEM_PROMPT` regras 5-6 (`index.ts:198-199` e
  `ai-chat-pragas:138`) proíbem produto/dose/formulação/cronograma/classe toxicológica e encaminham a
  profissional habilitado + AGROFIT (Lei 14.785/2023, Confea 1.149/2025).
  `_shared/agronomic-safety.ts` faz varredura determinística: `PROHIBITED_PATTERNS` (13-48) em PT/EN/ES
  + versão compacta anti-obfuscação/leet/homoglyph (50-56,104-124); `sanitizeDiagnosisOutput`
  (195-252) filtra frase-a-frase e **fail-closed** se um fragmento escapar (165-167); chat idem via
  `sanitizeAgronomicChatText` (254-260, refuta+disclaimer). Disclaimer legal sempre anexado
  (`AGRONOMIC_LEGAL_NOTICE`, index.ts:987).
- **Onde poderia parecer prescrição**: o laudo rico vem do **catálogo MIP local** renderizado no
  cliente — `mip.biologico` cita agentes biológicos e `cultural_treatment`/`prevention` citam práticas.
  `data/mip/types.ts:9-14` e `MIP_CREA_DISCLAIMER` (`data/mip/index.ts`) avisam que referência a agente
  biológico **não equivale a indicação de produto** e exigem validação no AGROFIT. Como esse texto é
  curado (não gerado por IA) e não traz produto/dose, o risco é baixo — porém **não passa pelo mesmo
  filtro `containsProhibitedPrescription`** (é conteúdo local confiável) — INFERIDO: aceitável, mas
  qualquer edição futura do MIP precisa de revisão manual.
- **Catálogo MIP — origem/versão (OBSERVADO)**: procedência por entrada via `referencias`
  (EMBRAPA/MAPA/IRAC/FRAC/CESB/AGROFIT com `url`+`ano`, `data/mip/soja.ts:18-55`). **Falta**: versão/data
  de revisão do catálogo como todo (§5) e reconciliação automatizada com o AGROFIT (a ponte é só
  citação textual, sem integração viva).

---

## Tabela de riscos (P0–P3)

| # | Prio | Risco | Evidência | Recomendação (1 linha) |
|---|------|-------|-----------|------------------------|
| R1 | **P0** | Diagnóstico não registra provider/modelo/versão de prompt/label-map → drift indetectável e resultado irreproduzível | `init_schema.sql:7-19`; `index.ts:1032-1045` (sem coluna/campo) | Adicionar coluna `ai_provider/ai_model/prompt_version/labelmap_version` (ou bloco no `notes`) gravada em cada insert. |
| R2 | **P0** | Telemetria de saldo Agrio OFF por default → repetir a queda total de 06/07 (créditos a zero) sem alerta, app grátis sem teto global de custo | `agrio.ts:119-156` (`AGRIO_CREDIT_TELEMETRY_ENABLED` default false); §7 | Ligar `AGRIO_CREDIT_TELEMETRY_ENABLED=true` + alerta Sentry de saldo baixo/zero (gate de deploy). |
| R3 | **P0** | Agrio recebe foto crua mas não declarado como subprocessador em Data Safety/privacidade | `agrio.ts:96`; `CLAUDE.md` estado 17/07 ("falta declarar o Agrio") | Declarar Agrio (Saillog) em Data Safety/loja e política de privacidade (gate CEO). |
| R4 | **P1** | Loop de feedback aberto: `pragas_diagnosis_feedback` é write-only, sem leitura/métrica/human-in-the-loop | único acesso = escrita `report-diagnosis-feedback/index.ts:122`; admin fn cobre só `pragas_ai_content_reports` | Criar métrica de taxa `incorrect` por versão + superfície de curadoria; ligar feedback à revisão do label-map. |
| R5 | **P1** | Confiança do Agrio exibida como % inteira crua, sem calibração nem rótulo qualitativo (missão §8) | `result.tsx:200,854,920`; sem camada de calibração | Bucketizar em faixas ("alta/média/baixa") no hero e/ou arredondar a passos de 10%; documentar que é score do fornecedor. |
| R6 | **P1** | OOD/`invalid_image` e adaptador Agrio sem cobertura de teste; caminho Agrio sem contrato "não é planta" nativo | `_tests/` (nenhum teste de `adaptAgrio`/limiar); `SYSTEM_PROMPT` OOD só no path claude (`index.ts:196`) | Adicionar testes Deno de `adaptAgrio` (healthy/unmapped/OOD/limiar<0.5) e fixture de não-planta. |
| R7 | **P2** | `agrio_label_unmapped` só emite `captureMessage` info, sem alerta → cobertura do MIP não melhora sozinha | `agrio.ts:295-300` | Dashboard/alerta de volume de labels não-mapeados; revisão periódica do `AGRIO_LABEL_MAP`. |
| R8 | **P2** | Catálogo MIP sem versão/revisão e sem reconciliação viva com AGROFIT | `data/mip/*.ts` (só `ano` por referência); `data/mip/index.ts` | Carimbar versão/data do catálogo e processo de revisão contra AGROFIT. |
| R9 | **P2** | EXIF/GPS na foto enviada ao Agrio removido só por efeito colateral do reencode, sem teste | `camera.tsx:47-50` (INFERIDO) | Teste que assegure ausência de EXIF/GPS no base64 de saída. |
| R10 | **P3** | `PII_HASH_SALT` opcional → sem ele, correlação por usuário no Sentry colapsa em `anon_redacted` | `pragas-sentry.ts:27,57-58` | Exigir `SENTRY_PII_HASH_SALT` setado em prod (fail-fast no boot). |

**Contagem:** P0=3 · P1=3 · P2=3 · P3=1 (total 10).
