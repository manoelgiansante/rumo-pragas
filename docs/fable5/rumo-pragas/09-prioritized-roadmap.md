# 09 — Roadmap Priorizado Único · Rumo Pragas

> Missão `fable5/rumo-pragas-global-benchmark-2026-07-19`. Consolidação DEDUPLICADA de todos os
> achados: doc 05 (1 P0/5 P1/9 P2/7 P3), doc 06 (3 P0/3 P1/3 P2/1 P3), doc 07 (1 P0/3 P1/5 P2/
> 7 P3), gaps sobreviventes da refutação (`verdade-terreno-refutacao-gaps.md`), verdade-terreno A1
> e oportunidades do doc 01. Arquitetura de referência: `08-target-architecture.md`.
>
> **Legenda** — Esf: S (<½ dia) · M (½–2 dias) · L (>2 dias). Tipo: client · edge fn · migration ·
> config · teste · ops (secret/Sentry/deploy) · doc · gate CEO. Status: **FEITO** (na branch, com
> commit quando conhecido via 10-implementation-log) · **EM CURSO** (lote IMPL-1 rodando agora) ·
> **PLANEJADO** (lotes IMPL-2/IMPL-3) · **ABERTO** · **GATE CEO** (decisão/loja/deploy fora do
> alcance do agente) · **REFUTADO-adiado** (H2 ou nunca, com motivo).
>
> Dedupes principais: resize 1024² (05 P1-3 ≡ 07 #5 ≡ A1 extra d) → RD-10; EXIF teste (06 R9 ≡
> 07 #6) → RD-32; deep link lembrete (05 P0-1 ≡ A1 §16) → RD-01; rótulo de confiança (06 R5 ≡
> A1 §10 ≡ 03 rec.3) → RD-08; testes do adaptador Agrio saíram de 07 #12 e vivem em RD-13 (06 R6).

---

## P0 — bloqueia lançamento saudável (7)

| ID | Título | Origem | Esf | Tipo | Status |
|---|---|---|---|---|---|
| RD-01 | Deep link do lembrete de re-inspeção morto (`diagnosis-reinspection` fora do `ALLOWED_SCREENS`) | 05 P0-1 / A1 §16 | S | client | **EM CURSO (IMPL-1)** |
| RD-02 | Versionamento IA por diagnóstico (`ai_meta` no `notes`: provider/model/prompt_version/label_map_version) | 06 R1 / 03 rec.1 | S | edge fn | **PLANEJADO (IMPL-3)** — decisão sem-migration no 08 §3 |
| RD-03 | Telemetria de crédito Agrio ON + alerta Sentry de saldo (evitar repetir queda 06/07) | 06 R2 / 03 rec.2 | S | ops | **PLANEJADO (IMPL-3)** — secret runtime + alerta via REST (ZERO-T) |
| RD-04 | Declarar Agrio (Saillog) como subprocessador em Data Safety + política de privacidade | 06 R3 | S | gate CEO | **GATE CEO** |
| RD-05 | Runner de build: `npm ci` sem retry com cache vazio (2 falhas reais 18–19/jul) → retry bounded + cache-seed sha512 | 07 #1 | S | config | ABERTO — build 1.0.11 verde 19/jul, mitigação estrutural pendente (08 §7) |
| RD-06 | Rotação do certificado iOS (bloqueia TODO build/submit iOS) | sync-r2 §13 | — | gate CEO | **GATE CEO** (operador autorizado) |
| RD-07 | Screenshots de loja 1.0.9 mostram paywall/limite/dark-mode inexistentes (Guideline 2.3.3) — regravar iOS+Android | 04 / CLAUDE.md loja (a) | M | gate CEO | **GATE CEO** |

## P1 — alto impacto pré-23/jul (15)

| ID | Título | Origem | Esf | Tipo | Status |
|---|---|---|---|---|---|
| RD-08 | Rótulo qualitativo de confiança no hero (alta/média/baixa via `confidenceBucket()`) | 06 R5 / A1 §10 | S | client | **EM CURSO (IMPL-1)** |
| RD-09 | 6 alvos de toque <44pt sem hitSlop (crop-select, câmera, result ×2, fila, SearchInput) | 05 P1-5 / A1 extra a | S | client | **EM CURSO (IMPL-1)** |
| RD-10 | Resize forçado 1024×1024 distorce foto não-quadrada antes da IA (Android/galeria) — `{width:1024}` só | 05 P1-3 ≡ 07 #5 | S | client | **PLANEJADO (IMPL-2)** — verificar em device Android (D1) |
| RD-11 | Gate de qualidade de foto no device (luminância+blur, fail-open com "usar assim mesmo") | 01 op.2 / A1 buraco 1 | M | client | **PLANEJADO (IMPL-2)** — design no 08 §2 H1-1 |
| RD-12 | CTA "Diagnosticar agora" acima do clima na Home (hierarquia invertida) | 05 P1-1 | S | client | **PLANEJADO (IMPL-3)** |
| RD-13 | OOD do path Agrio (contrato "não é planta") + testes Deno de `adaptAgrio` (healthy/unmapped/limiar/não-planta) | 06 R6 / 03 rec.4 | M | edge fn+teste | ABERTO |
| RD-14 | Entitlement partido: `subscriptions` × `pragas_subscriptions` (GATE-B) — reconciliar ANTES de `FREE_MODE=false` | 07 #3 / CLAUDE.md | M | gate CEO | **GATE CEO** (latente sob FREE_MODE; irrelevante até 23/jul) |
| RD-15 | Trilho de build canônico: declarar runner único + assert que falhe alto (ou rebump vc≥55) | 07 #2 / sync-r2 §12 | S | config | ABERTO — decisão no 08 §7 |
| RD-16 | Paridade shared-slug × dedicado: teste-trava de contrato + plano de sunset | 07 #4 | M | teste | ABERTO |
| RD-17 | Fechar loop de feedback: métrica taxa `incorrect` por versão (queries de drift salvas) | 06 R4 / 03 rec.5 | M | ops | ABERTO — H1 mínimo no 08 §3; painel = H2 |
| RD-18 | Histórico truncado em 50 sem paginação (nº 51+ inalcançável) | 05 P1-6 | M | client | ABERTO |
| RD-19 | 5 toques + crop do OS até a foto (remover `allowsEditing`, preservando comportamento iOS) | 05 P1-2 | S | client | ABERTO — fazer junto com RD-10 (mesmo arquivo) |
| RD-20 | Lembrete de re-inspeção 3/7d pós-diagnóstico (client-only, sem cap 24h) | refutação #2 TOP-1 | S | client | **FEITO** `f554bbb` (13 chaves ×3, 41/41 testes) |
| RD-21 | Wire FCM Android (`googleServicesFile` + validação de policy) | sync-r2 §2 | S | config | **FEITO** `b32628e` |
| RD-22 | Review notes iOS com afirmação falsa ("grupos de assinatura vazios") + 2 subs `MISSING_METADATA` — completar ou deletar | CLAUDE.md loja (b) | S | gate CEO | **GATE CEO** |

## P2 — qualidade/percepção; entram se houver capacidade (27)

| ID | Título | Origem | Esf | Tipo | Status |
|---|---|---|---|---|---|
| RD-23 | Contraste AA falha em 3 superfícies medidas (accentLight 2.78:1, tone low 3.28:1, warmAmber 2.56:1) | 05 P2-1 | S | client | ABERTO |
| RD-24 | Cultura crua na UI ('soja' sem i18n no hero; 'Soybean' EN na fila) — helper único de cultura | 05 P2-2 | S | client | ABERTO |
| RD-25 | 4 culturas (sorgo/amendoim/girassol/cebola) fora de `crops.*` i18n e dos mapas do DiagnosisCard | 05 P2-3 | S | client | ABERTO |
| RD-26 | Biblioteca e nomes de cultura PT-only em en/es (traduzir OU declarar PT-BR-only no listing) | 05 P2-4 | M | client | ABERTO — declarar no listing = gate CEO de copy |
| RD-27 | Painel "Outras possibilidades" duplicado (legado + TopAlternatives, mesmo título/dados) | 05 P2-5 / A1 §9 | S | client | ABERTO |
| RD-28 | Excluir diagnóstico só por long-press invisível — ícone/hint | 05 P2-6 | S | client | ABERTO |
| RD-29 | Sem consentimento de localização, clima/alertas somem em silêncio — card/CTA de reversão | 05 P2-7 | S | client | ABERTO |
| RD-30 | Lembrete: ativar notificação inline em vez de mandar aos Ajustes | 05 P2-8 | S | client | ABERTO |
| RD-31 | A11y label com "itens." PT fixo + PDF com paleta antiga hardcoded | 05 P2-9 | S | client | ABERTO |
| RD-32 | Teste-trava de EXIF/GPS ausente no payload (hoje só INFERIDO do reencode) | 06 R9 ≡ 07 #6 | S | teste | ABERTO |
| RD-33 | Alerta/threshold sobre `agrio_label_unmapped` + revisão periódica do `AGRIO_LABEL_MAP` | 06 R7 | S | ops | ABERTO — série 3 do dashboard de drift (08 §3) |
| RD-34 | Versão/revisão do catálogo MIP (`MIP_CATALOG_VERSION`) + processo de revisão contra AGROFIT | 06 R8 | S | client | ABERTO — constante definida no 08 §3 |
| RD-35 | Jest não ignora `.artifacts/` — snapshot do runner duplica as 71 suítes | 07 #8 | S | config | **PLANEJADO (IMPL-2)** |
| RD-36 | `version-check` compartilhada sem dono local → `pragas-version-check` dedicada (ou contrato congelado+teste) | 07 #7 | M | edge fn | ABERTO (H2) |
| RD-37 | Setar `SENTRY_DSN_COMBO` no jxcn + redeploy fns do combo (fim da poluição de Sentry) | 07 #9 / CLAUDE.md PR-08 | S | ops | ABERTO — deploy fora deste repo (sessão principal) |
| RD-38 | Watch-list local: alertas climáticos vinculados à praga diagnosticada (client-only) | A1 §18 / 01 §5 | M | client | ABERTO — design no 08 §6 H1 |
| RD-39 | Escada de revisão humana H1: `pragas_review_requests` + fn + UI atrás de flag OFF | missão §8.14 / A1 §14 / 01 op.7 | M | migration+edge fn+client | ABERTO — design no 08 §4; painel/flag ON = H2 |
| RD-40 | Órgão da planta opcional no payload (chips na crop-select; `plant_organ` allowlist) | A1 §2 / 01 op.3 | M | client+edge fn | ABERTO — contrato no 08 §2 H1-2 |
| RD-41 | Verificar disparo real de push em device Android (infra existe; falta prova de campo) | 04 Android §3 | S | teste | ABERTO (D1) |
| RD-42 | `assetlinks.json` na landing (App Links Android) — arquivo criável já; SHA-256 do Play exige console | sync-r2 §4 | S | config | ABERTO — parcial gate CEO (console) |
| RD-43 | Copy honesta de lançamento: "biblioteca/MIP offline, diagnóstico exige internet" + biológico + AGROFIT | refutação TOP-2 | S | gate CEO | **GATE CEO** — propor strings; STORE_LISTING linha 73; landing ZERO-N |
| RD-44 | Exclusão de conta = hard delete da identidade jxcn compartilhada → soft-delete + janela de recuperação | CLAUDE.md GATE-C | M | gate CEO | **GATE CEO** (mitigado no client por aviso 2 passos `3758fe8`) |
| RD-45 | Card "Condições climáticas para manejo 24h" (hourly Open-Meteo, copy não-prescritiva) | refutação #7 | M | client | **FEITO** `34c2570` (26/26 testes) |
| RD-46 | Telemetria de adoção do chat (`trackChatMessageSent` no send) | sync-r2 §9 (PR-27) | S | client | **FEITO** `806c8f4` |
| RD-47 | Smoke re-executável do chat IA em prod (`scripts/smoke-ai-chat.sh`) | sync-r2 §8 (PR-26) | S | teste | **FEITO** (selado 5/5; CLAUDE.md PR-26) |
| RD-48 | Reconciliação migrations repo ↔ histórico prod jxcn (15 capturas VERBATIM c/ md5) | sync-r2 §3 (PR-18) | S | doc | **FEITO** `adaeb47` |
| RD-49 | ESLint ignore de `.artifacts/` | 07 §7 | S | config | **FEITO** `f1856f6` |

## P3 — polimento/higiene (15)

| ID | Título | Origem | Esf | Tipo | Status |
|---|---|---|---|---|---|
| RD-50 | Styles mortos `scanRow/…` na Home | 05 P3-1 | S | client | ABERTO |
| RD-51 | Dead code dark-mode (~20 arquivos `isDark` + `DarkColors` com light travado) — remover OU planejar dark real | 05 P3-2 | M | client | ABERTO (decisão) |
| RD-52 | Chips de filtro da biblioteca ~33pt | 05 P3-3 | S | client | ABERTO |
| RD-53 | Card "MIP" estático/sem explicação na Home → link p/ biblioteca | 05 P3-4 | S | client | ABERTO |
| RD-54 | Chaves `onboarding.page2*` órfãs + naming defasado | 05 P3-5 | S | client | ABERTO |
| RD-55 | Busca da biblioteca ignora nome científico + chips rainbow no edit-profile | 05 P3-6 | S | client | ABERTO |
| RD-56 | fontScale sem teto em containers fixos (tab bar, startBtn) | 05 P3-7 | S | client | ABERTO |
| RD-57 | `PII_HASH_SALT` opcional — exigir em prod (fail-fast) senão correlação Sentry colapsa | 06 R10 | S | ops | ABERTO |
| RD-58 | Higiene DB: `image_url`/`severity` órfãs + `idx_diagnoses_severity` pagando escrita | 07 #10 | S | migration | ABERTO (H2; jxcn — não destrutivo) |
| RD-59 | DLQ sem aging — foto local retida indefinidamente (expirar OU documentar como decisão) | 07 #11 | S | client | ABERTO |
| RD-60 | Suítes faltantes: `passwordRecovery`, `authMetadataGate`, `useAppUpdateCheck` (agrio → RD-13) | 07 #12 | M | teste | ABERTO |
| RD-61 | `renderItem` inline não-memoizada no history | 07 #13 | S | client | ABERTO |
| RD-62 | Evidência do gate `npm audit --audit-level=high` no próximo CI com rede sã | 07 #14 | S | ops | ABERTO |
| RD-63 | Docs de deploy defasados (coverage §prod-compat + runbook §candidate descrevem 15/jul) | 07 #15 | S | doc | ABERTO |
| RD-64 | Migration untracked `20260713120000_paid_photo_quota.sql` no working tree (re-monetização) — trackear em proposals OU remover | 07 #16 | S | config | ABERTO (decisão; pós-23/jul) |

## REFUTADO-adiado — não fazer agora, com motivo (10)

| ID | Item | Origem | Veredito |
|---|---|---|---|
| RD-65 | Push regional de risco (targeting geográfico servidor) | refutação #1 / 01 op.1 | **ADIADO H2** — metade local já entregue; migration+cron+custo recorrente (08 §6 H2, gate CEO de custo) |
| RD-66 | Múltiplas imagens por diagnóstico | A1 §5 / 01 op.3 | **ADIADO H2** — contrato v2 preparado (08 §2); custo n× crédito exige teto global antes |
| RD-67 | Integração CampoVivo/talhão (associação de ocorrência) | A1 §17 / missão §9 | **ADIADO H2** — opção B recomendada no 08 §5; geo de talhão = gate CEO de privacidade |
| RD-68 | Escada taxonômica / degradar p/ categoria ampla + abióticos como classe | 01 op.4 / 03 §2 | **ADIADO H2** — depende de contrato do provider; mitigação H1 = RD-08 + RD-13 |
| RD-69 | Fotos de referência das candidatas + severidade quantificada | 01 op.8 | **ADIADO H2** — exige acervo visual licenciado |
| RD-70 | Comunidade/Q&A | refutação #8 | **REFUTADO** — STORE_LISTING:15 + Apple 1.2 (moderação recorrente) |
| RD-71 | Scouting/talhão georreferenciado próprio | refutação #9 | **REFUTADO** — contradiz privacidade por design (geo ~1,1 km); caminho é RD-67 |
| RD-72 | Calculadora de fertilizante / contagem de armadilha | refutação #10 | **REFUTADO** — fora de escopo / zona de prescrição |
| RD-73 | Inferência offline on-device | 03 §7 | **REFUTADO-adiado** — contrato do produto "requer internet"; claim honesto já é a biblioteca offline |
| RD-74 | App de diagnóstico na web | 04 §3 | **REFUTADO** — categoria não faz; web = landing (ZERO-N) |

---

## Lotes de implementação (estado 19/jul ~15h)

- **IMPL-1 — EM CURSO:** RD-01 (P0 deep link lembrete) · RD-08 (rótulo confiança) · RD-09
  (touch targets). Client-only, S, zero servidor.
- **IMPL-2 — PLANEJADO:** RD-10 (distorção câmera) · RD-11 (gate de foto) · RD-35 (jest ignore
  `.artifacts`). Carona recomendada: RD-19 (mesmo arquivo `camera.tsx` de RD-10).
- **IMPL-3 — PLANEJADO:** RD-02 (versionamento IA) · RD-03 (telemetria crédito Agrio) · RD-12
  (CTA Home). Obs.: RD-02 exige espelho no slug legado `diagnose` (paridade RD-16) e o deploy
  das fns fica para a esteira allowlisted (D10) — o lote entrega código+testes na branch.

## Ordem de execução recomendada para ≤23/jul

1. **IMPL-1 → IMPL-2 → IMPL-3** (sequência acima; fecha os 2 P0 de código + 5 P1).
2. **RD-05** (retry do `npm ci`) antes do PRÓXIMO build Android — 1 falha de rede a menos na
   janela de lançamento.
3. **Lote client S de P2 num único passe de revisão:** RD-23/24/25/27/28/29/30/31 (i18n,
   contraste, duplicação, affordances) — mesmo ritual de gates, ~1 dia.
4. **RD-13 + RD-32** (testes adaptAgrio/OOD + EXIF) — travam qualidade antes do tráfego de
   lançamento; RD-17 (queries de drift) logo após RD-02 existir.
5. **Gates CEO em paralelo (não bloqueiam código):** RD-06 (cert iOS — destrava o trilho iOS
   inteiro) → RD-07 (screenshots) → RD-04 (Data Safety Agrio) → RD-22 (review notes/subs) →
   RD-43 (copy honesta). RD-37 na primeira sessão principal com jxcn.
6. **Se sobrar capacidade pré-23/jul:** RD-38 (watch-list praga→alerta, M, client-only) —
   maior ganho de percepção "o app acompanha a lavoura" sem risco de contrato.
7. **Pós-lançamento (H2):** RD-14 (antes de qualquer `FREE_MODE=false`), RD-16, RD-18, RD-36,
   RD-39/40 (escada humana + órgão), RD-26, P3 em lotes de higiene, e os ADIADOS RD-65..69.

## Contagem final

| Prioridade | Total | FEITO | EM CURSO | PLANEJADO | ABERTO | GATE CEO |
|---|---|---|---|---|---|---|
| P0 | 7 | 0 | 1 | 2 | 1 | 3 |
| P1 | 15 | 2 | 2 | 3 | 6 | 2 |
| P2 | 27 | 5 | 0 | 1 | 19 | 2* |
| P3 | 15 | 0 | 0 | 0 | 15 | 0 |
| REFUTADO-adiado | 10 | — | — | — | — | — |
| **Total** | **74** | **7** | **3** | **6** | **41** | **7*** |

\* RD-42 conta como ABERTO (gate só parcial). Gates CEO nominais: RD-04, RD-06, RD-07 (P0);
RD-14, RD-22 (P1); RD-43, RD-44 (P2) + decisões embutidas em itens ABERTOS (RD-26 listing,
RD-42 SHA console, RD-65 custo push, RD-67 privacidade talhão).
