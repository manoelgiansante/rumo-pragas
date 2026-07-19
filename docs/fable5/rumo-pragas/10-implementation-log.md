# Implementation log — missão fable5/rumo-pragas-global-benchmark-2026-07-19

Modelo confirmado: claude-fable-5 (sessão principal; subagentes general-purpose herdam a sessão).
Branch: `fable5/rumo-pragas-global-benchmark-2026-07-19` (criada de `mega-trabalho/pragas-2026-07`, que já continha os 12 commits da rodada 18/jul).

## Base aproveitada (18/jul — custo já pago)
- 8 dossiês de concorrentes (Plantix, Cropwise Protector, xarvio, Agrobase, Agrio, FuturCrop, PictureThis, Embrapa/MAPA) + refutação D3.
- Smoke E2E prod 14/14 (diagnose Agrio real, chat, exclusão app-scoped, reativação) + `scripts/smoke-ai-chat.sh` selado 5/5.
- Features: lembrete de re-inspeção 3/7d (`f554bbb`), card condições climáticas 24h (`34c2570`), FCM wire (`b32628e`), telemetria de chat (`806c8f4`).
- Gates verdes: lint 0 · tsc 0 · jest 70 suítes/734 · deno 56/56 · expo-doctor 19/19 · audit 0.
- Auditoria canônica pré-existente: `docs/audit/launch-coverage-2026-07-14.md` (telas, endpoints, banco, integrações, 15 blockers terminais).

## Linha do tempo da missão
- 19/jul ~00h: branch criada; onda 1 lançada — R1 (acadêmicos globais: Nuru, CABI, Tumaini, Leaf Doctor, IPM Decisions, Plantum), R2 (scouting/previsão: Taranis, Trapview, Semios, FieldClimate, RIMpro, Pest Prophet, FieldView, OneSoil), R3 (LATAM/BR: SIMA, Auravant, Cromai, Tarvos, Agrosmart, Solinftec), A1 (verdade-terreno do fluxo §8, 18 itens).
- Build Android 1.0.11 (runner protegido) em andamento em paralelo, iniciado na rodada anterior.

## 19/jul ~10h20 — sessão original MORTA por falso-positivo de Usage Policy (2ª ocorrência da classe)
- Toda mensagem passou a ser bloqueada ("reverse engineering or duplicating model outputs"); retorno dos agentes da onda R1/R2/R3/A2 desta manhã PERDIDO (bloqueado na volta). Retry inútil (contexto re-enviado re-bloqueia).
- Missão RETOMADA ~12h30 em sessão Fable 5 nova (mesma máquina). Handoff: Obsidian `00 - Inbox/HANDOFF - Retomada Mega Pragas (sessao envenenada Usage Policy) 2026-07-19.md`.
- Recuperado do transcript morto (11 relatórios íntegros → `research-raw/recovered-2026-07-18/`): 2×dossiês (8 concorrentes BR-first), A1 verdade-terreno §8 (18 itens), refutação de gaps D3, sync backlog r2, 2×verify adversarial, fixes PR-26/27/18/19, features de lançamento, 2×smoke E2E prod.
- **Build Android 1.0.11: as 2 rodadas (18/jul 21:52 e 19/jul 07:23) FALHARAM silenciosamente (BUILD_EXIT=1)** — o "exit 0" era do wrapper de background. Diag direto 12:43 expôs a causa: **"npm ci isolado pelo lockfile falhou ou deixou descendentes"** (cache npm nasce VAZIO a cada build; máquina hoje com ECONNRESET intermitente em runtimes Node — ver memória `reference_js_runtime_supabase_connreset_2026_07_19`). Replicação com output visível em andamento (`/private/tmp/pragas-npmci-test/npmci.log`).
- Onda F1 global RELANÇADA com protocolo ARQUIVO-PRIMEIRO (dossiê gravado assim que pronto; retorno ≤10 linhas): R1 acadêmicos (4/6 já em disco), R2 scouting/previsão (6/8 em disco), R3 LATAM/BR, R4 adjacentes. Session-limit 13:20 atravessado com resume-por-mensagem dos 4 agentes.

(este log é atualizado a cada fase)
