# 11 — Relatório Final · Rumo Pragas (missão `fable5/rumo-pragas-global-benchmark-2026-07-19`)

> Fecha a missão de benchmark global + auditoria + implementação do Rumo Pragas. Consolida os 10
> documentos anteriores (01–10), a pesquisa F1 (34 dossiês + 4 índices) e a esteira de código
> (9 commits IMPL-1/2/3, todos confirmados por refutação adversarial D3). Data: 2026-07-19.
> Modelo: claude-fable-5 (sessão principal; subagentes `general-purpose` herdam a sessão).
> Branch: `fable5/rumo-pragas-global-benchmark-2026-07-19`. Convenção: OBSERVADO = lido em
> código/fonte pública; ALEGADO = número de marketing não auditável.

---

## 1. Diagnóstico executivo

**Saúde:** o Rumo Pragas está estruturalmente à frente da categoria naquilo que importa para o
lançamento gratuito no BR, e a rodada de hoje fechou os 2 P0 de código e 5 P1 sem introduzir
regressão. A engenharia (idempotência com lease, rate-limit durável, RLS + SECDEF `search_path=''`,
fila offline com DLQ, runner de build hermético) está muito acima da média do portfólio; a
privacidade de dado (foto não persistida, EXIF descartado, geo arredondada ~1,1 km, scrub de PII no
Sentry) está acima do padrão da categoria consumer.

**O fosso confirmado em código:** foto-diagnóstico agro **grátis-sem-paywall + PT-BR nativo + app
iOS real no BR + diagnóstico estruturado (top-k) + manejo MIP curado Brasil-first + ponte AGROFIT**.
Dos 40 produtos mapeados, apenas 4 fazem foto-diagnóstico agro de consumo, e cada um tem uma
fraqueza que o Rumo Pragas explora (Plantix sem iOS legítimo no BR; xarvio morto; Plant.id sem app
consumer; Agrio grátis sufocado por ads e sem botão de discordar — que nós temos).

**Onde ainda estamos atrás da fronteira:** explicabilidade do caso concreto, gate de qualidade de
foto no device (agora mitigado — ver §5), múltiplas imagens/órgão da planta, escalonamento para
humano e apresentação honesta de confiança (idem mitigado). Nenhuma dessas é lacuna de
posicionamento — são de acabamento de IA, e o roadmap (doc 09) as sequencia por valor/esforço.

**Bloqueios reais:** (a) trilho iOS bloqueado por rotação de certificado (gate de operador); (b) uma
divergência de compliance entre o prompt do slug legado (usado pelo binário público 1.0.9) e o
dedicado; (c) um conjunto de gates de decisão do CEO (loja, subprocessador Agrio, entitlement de
combo, hard-delete de conta) — nenhum bloqueia o código de hoje, todos consolidados na §10.

---

## 2. Concorrentes mais importantes

Ranqueados por ameaça real ao Rumo Pragas no BR (doc 01 §4):

1. **Climate FieldView (Bayer)** — *ameaça #1*. Mesmo mercado, mesmo idioma (PT-BR), mesma
   plataforma, distribuição gigante (25M+ ha ALEGADO), marca Bayer. Hoje o scouting é **manual**
   (tira foto e anota, não diz "isto é ferrugem"); se a Bayer adicionar ID automático por foto, a
   vantagem encolhe. Vigiar.
2. **Plantix** — líder de foto-diagnóstico BR Android (Play BR 4,6★ · ~110k avaliações · 10M+
   downloads, OBSERVADO), com comunidade + alertas regionais + tratamento. Vulnerabilidade
   explorável: **Android-only, sem iOS legítimo no BR** (o "Plantix" da App Store BR é clone de
   terceiro, verificado por iTunes lookup).
3. **Agrio (Saillog)** — concorrente direto (foto + humano + alerta regional + forecast, iOS BR
   4,87★) **e simultaneamente nosso provider de IA de visão desde 06/07**. Dualidade estratégica
   única: dependência a gerenciar (manter o path `claude` vivo como rollback; declarar Agrio como
   subprocessador). Grátis com ads agressivos — reclamação dominante que nós não temos.
4. **Plant.id / Kindwise** — motor de IA B2B (não app consumer), a **régua técnica** da categoria
   (top-3 93% / top-1 85% ALEGADO; 548 classes incl. desordens abióticas e sósias benignos). Não é
   concorrente de produtor, é o padrão de honestidade de IA a perseguir.
5. **Reativação de dormentes BR + setor público** — Agrosmart (FAPESP MIP+IA) e Cromai (IA visual
   proprietária BR, aporte TOTVS) têm capital e visão; Embrapa/IDR-PR/SENAR (manejo.app,
   MonitoraOeste, Doutor Milho) empurram MIP grátis fragmentado que comprime a disposição a pagar.
   Não competem hoje, mas são fonte de autoridade capturável.

**Régua de fricção-zero a superar (não é concorrente de nicho, é baseline):** Google Lens, já no
bolso do usuário BR — dá o nome, mas é "preliminar", sem diagnóstico estruturado nem manejo. Nós
vencemos entregando AÇÃO (MIP + AGROFIT), não só o nome.

---

## 3. Padrões internacionais encontrados (o que TODO líder faz)

Extraídos dos 40 dossiês (doc 01 §2, doc 03):

1. **Câmera → resultado em segundos, sem cadastro pesado** (Lens/Seek/Picture Insect).
2. **Top-k com confiança explícita + honestidade na incerteza** — "escada taxonômica" (Seek) ou
   degradar para categoria ampla `disease_level=general` em vez de cravar (Kindwise).
3. **Coaching de qualidade de foto antes/durante a captura** — só o Seek faz bem; Picture
   Insect/Pl@ntNet aceitam foto ruim e erram (= oportunidade barata, agora endereçada).
4. **Contexto leve antes do diagnóstico** (órgão/cultura — Pl@ntNet) e **múltiplas fotos do mesmo
   caso (1–5)** — comprovadamente sobem acurácia (Nuru: CBSD 21% em folha única → 93% com ~6 folhas).
5. **Resposta = diagnóstico + AÇÃO + severidade + imagem de referência**, não só o nome.
6. **Modelar desordens abióticas e sósias benignos como classes** (Kindwise; Rice Doctor cobre
   nutricional) — reduz falso-positivo de "está doente".
7. **Alerta regional de risco por push** — o gap mais repetido (Plantix, xarvio, Agrio,
   MonitoraOeste, Tumaini).
8. **Camada preditiva por clima/grau-dia** antes do sintoma — demonstrada **sem hardware** por Pest
   Prophet e FuturCrop.
9. **Escalonamento para humano** como 2º nível de confiança (FarmRise, DeHaat, Agrio, MyPestGuide,
   CABI).
10. **Retenção por hábito** — lembretes/diário, alerta preditivo recorrente, hub multi-serviço,
    offline on-device.
11. **App vencedor em mercado emergente é HUB, não recurso único** (diagnóstico + clima + preço +
    conteúdo).

Ressalva de integridade transversal: **acurácia é quase sempre ALEGADA e inflada no marketing**
(Nuru "2× humano" mascara 21% em folha única; Tumaini ~90%; Cromai/Taranis "150M/500M pontos" — nada
auditável de fora). **Honestidade de acurácia é, ela própria, um gap de mercado** e diferencial de
confiança do Rumo Pragas (comunicar hipótese, não certeza).

---

## 4. Riscos atuais

Consolidados dos audits 05 (UX), 06 (IA), 07 (engenharia) — os de código foram mitigados hoje; os
de decisão/loja seguem para §10.

**De IA/qualidade (doc 06):** confiança exibida como % cru sem rótulo (mitigado — RD-08); nenhum
diagnóstico carimbava provider/modelo/versão de prompt → drift indetectável (mitigado — RD-02);
telemetria de saldo Agrio desligada por default → risco de repetir a queda total de 06/07
(mitigado — RD-03); OOD nativo só no path `claude` legado (aberto — RD-13); feedback "incorreto"
write-only, loop não fecha (aberto — RD-17); Agrio recebe foto crua e **não está declarado como
subprocessador** (gate CEO — RD-04).

**De engenharia (doc 07):** trilho de build Android quebrava por `npm ci` com cache vazio + rede
com ECONNRESET (build verde hoje; mitigação estrutural recomendada — RD-05); `android.versionCode
50 ≤ 54` conflita com baseline Play no trilho EAS clássico (RD-15); entitlement partido
`subscriptions` × `pragas_subscriptions`, latente sob `FREE_MODE` (gate CEO — RD-14); superfície
dupla shared-slug × dedicado sem teste de paridade (RD-16); resize da câmera distorcia foto
não-quadrada (mitigado — RD-10).

**De produto/jxcn compartilhado:** exclusão de conta = **hard delete imediato da identidade jxcn
compartilhada** (apaga o login AgroRumo de Vet/Finance/Operacional/CampoVivo) — mitigado no client
por aviso de 2 passos; soft-delete é gate CEO (RD-44). Sentry do Pragas ainda poluível pelo combo
até `SENTRY_DSN_COMBO` ser setado no jxcn (RD-37). Screenshots de loja 1.0.9 mostram
paywall/limite/dark-mode que não existem (Guideline 2.3.3) — gate CEO (RD-07).

**Divergência de compliance descoberta nesta rodada:** o prompt do slug legado `diagnose/` (o que o
binário **público** 1.0.9 chama) ainda pede campos prescritivos, enquanto o slug dedicado
`diagnose-pragas/` é não-prescritivo. Os dois têm versões de prompt distintas (o legado carimba
`2026-07-19.1-legacy`) e há teste-trava provando a divergência. **Re-unificação = decisão pendente**
(mexer no prompt que serve o binário público em produção não é reversível em 2s).

---

## 5. Mudanças implementadas (9 commits, IMPL-1/2/3 — todos D3-confirmados)

Todos na branch, sem PR (ZERO-AC), verificados por refutador adversarial read-only
(`research-raw/verify-adversarial-impl-1-2-3.md`: **9/9 CONFIRMADOS, zero refutações**).

| Commit | Escopo | Roadmap | Prioridade |
|---|---|---|---|
| `a174529` | Rotear deep link do lembrete de re-inspeção (`diagnosis-reinspection`) para o histórico — antes todo tap era `invalid_payload` | RD-01 | **P0** |
| `3e55d45` | Confiança qualitativa no hero (Alta/Média/Baixa via helper único `confidence.ts`, thresholds ≥0.7/≥0.4 idênticos aos históricos) | RD-08 | P1 |
| `a8b7c34` | `hitSlop` nos alvos de toque <44pt do fluxo de diagnóstico (8pt/lado, zero mudança visual) | RD-09 | P1 |
| `b2a8ddc` | Resize da foto preserva aspect ratio (era `{width:1024,height:1024}` forçado; passa só o lado maior) | RD-10 | P1 |
| `b3b7ca1` | Gate **SOFT** de qualidade de foto no device (luminância + blur, fail-open "usar assim mesmo") + telemetria de aviso/override | RD-11 | P1 |
| `f55f785` | Jest ignora `/.artifacts/` (snapshot do runner duplicava as 71 suítes) | RD-35 | P2 |
| `a42353d` | `ai_meta` versionado em todo diagnóstico persistido (provider/model/prompt_version/label_map_version) — **nos 2 slugs**; resposta ao cliente inalterada | RD-02 | **P0** |
| `ce99d70` | Telemetria de crédito Agrio **default-ON** + fail-safe triplo — **nos 2 slugs** (o legado não tinha nada; o apagão de 06/jul se repetiria mudo) | RD-03 | **P0** |
| `530294e` | CTA "Diagnosticar agora" na 1ª posição da Home, acima do clima (move puro do JSX; ZERO-N autorizado pela ordem da missão) | RD-12 | P1 |

**Base de 18/jul já paga na branch** (custo anterior): lembrete de re-inspeção 3/7d (`f554bbb`),
card de condições climáticas 24h (`34c2570`), wire FCM Android (`b32628e`), telemetria de chat
(`806c8f4`), smoke re-executável do chat IA (`scripts/smoke-ai-chat.sh`), reconciliação de migrations
repo↔prod (`adaeb47`).

---

## 6. Arquitetura adotada (doc 08 — 3 horizontes)

**Invariantes que nenhum horizonte muda sem gate CEO:** 100% grátis até 23/jul (`FREE_MODE`
permanece); diagnóstico = hipótese, nunca prescrição; jxcn compartilhado (objeto novo só `pragas_*`
com RLS + REVOKE na mesma migration); privacidade por design (geo ~1,1 km, foto não persistida, EXIF
descartado); STORE_LISTING sem community feed / mapas de usuários sem revisão legal; web = landing de
marketing apenas.

**Decisões arquiteturais centrais adotadas nesta rodada:**
- **Versionamento de IA sem migration:** bloco `ai_meta` dentro do JSON `notes` de `pragas_diagnoses`
  (em vez de colunas novas no jxcn compartilhado) — reversível, consultável via `notes->'ai_meta'`,
  gravado em todo insert dos dois slugs. Colunas dedicadas + índice ficam para H2 se a query de drift
  pesar. Versões vêm de constantes no código (`PROMPT_VERSION`, `AGRIO_LABEL_MAP_VERSION`,
  `MIP_CATALOG_VERSION`) — toda edição obriga bump, travado por teste.
- **Gate de qualidade de foto client-only, fail-open:** heurística pura JS O(1) (dims + luminância +
  proxy de blur), **nunca bloqueia** — só avisa com botão "usar assim mesmo". Fecha o buraco que só o
  Seek endereça na categoria, sem módulo nativo e sem criar promessa de acurácia.
- **Telemetria de crédito Agrio como secret de runtime** (edge fn lê sem redeploy), default `true`,
  com alerta de saldo previsto via REST (ZERO-T; MCP não cria alerta).
- **Trilho de build canônico = runner protegido** com versionCode derivado do timestamp do commit
  (≈206,6M), imune ao conflito `vc 50 ≤ 54`; EAS clássico deve falhar alto ou ser aposentado.
- **Escada de revisão humana e integração CampoVivo desenhadas para H2** atrás de flag OFF, com o
  princípio "a escada nunca inventa conteúdo agronômico" e "associação simbólica por id/rótulo, nunca
  por coordenada".

**Explicitamente NÃO adotado:** app de diagnóstico na web (categoria não faz; web = landing ZERO-N);
comunidade/Q&A; scouting georreferenciado próprio (contradiz privacidade); inferência offline
on-device (contrato "requer internet"); qualquer recomendação de produto/dose; monetização antes de
23/jul.

---

## 7. Arquivos alterados (`git diff --stat origin/main...HEAD`, resumido por área)

Total: **117 arquivos, +7.325 / −98** (inclui toda a branch desde `origin/main`: base de 18/jul + os
9 commits de hoje).

| Área | Arquivos-chave | Natureza |
|---|---|---|
| **Client — libs** | `lib/confidence.ts` (+30), `lib/imageResize.ts` (+64), `lib/photoQuality.ts` (+79) | Novos helpers: rótulo de confiança, resize aspect-safe, gate de foto |
| **Client — services** | `services/weather.ts` (+164), `services/notifications.ts` (+75), `services/analytics.ts` (+54) | Condições 24h, lembrete/deep link, eventos de telemetria |
| **Client — i18n** | `i18n/locales/{pt-BR,en,es}.ts` (+47 cada) | Chaves novas nas 3 línguas com paridade (confiança, gate de foto, clima, lembrete) |
| **Client — config** | `package.json` (+3, incl. jest ignore `.artifacts`) | Higiene de runner |
| **Edge fn — dedicado** | `diagnose-pragas/index.ts` (+52), `diagnose-pragas/agrio.ts` (+22) | `ai_meta` + telemetria de crédito |
| **Edge fn — legado** | `diagnose/index.ts` (+45), `diagnose/agrio.ts` (+73) | Espelho de `ai_meta` + telemetria (o legado não tinha nada) |
| **Edge fn — testes** | `_tests/ai-versioning-meta.test.ts` (+78), `_tests/agrio-credit-telemetry.test.ts` (+124) | Travas de contrato Deno |
| **Migrations** | ~30 arquivos (renames + capturas VERBATIM com md5 do `adaeb47`) | Reconciliação repo↔histórico prod jxcn; sem migration nova aplicada |
| **Store/scripts** | `store-assets/assetlinks.template.json` (+10), `store-assets/ASSETLINKS_README.md` (+6), `scripts/smoke-ai-chat.sh` (+180) | App Links Android (parcial), smoke re-executável |

---

## 8. Testes e builds

**Bateria de gates (todos verdes, re-executados na verificação D3):**

| Gate | Resultado |
|---|---|
| Jest (expo-app, `.artifacts` ignorado) | **75 suítes / 784 testes** passed |
| Deno (edge, suítes novas) | **15/15** passed (56 base) |
| `tsc --noEmit` | **0 erros** |
| ESLint | **0 erros** |
| `expo-doctor@1.20.0` | **19/19** |
| `npm audit --audit-level=high` | **0 vulnerabilidades high** |
| `expo export --platform web` | **OK** |

**Builds Android 1.0.11 (runner protegido):**
- **Artefato de VALIDAÇÃO — 14:50:** `RumoPragasIA-production-android-20260719T163208Z.aab`, 70,6 MB,
  commit atestado `2d50f13`, buildVersion 206641763, sha256 `49b38e22…`. Confirmou que as 2 falhas
  anteriores eram rede transitória (build inteiro passou sem mudança de código).
- **Build FINAL do HEAD (com os 9 commits) — disparado 15:34:** **em curso** ao fechar este
  relatório.

**Edge fns deployadas em prod jxcn — 18:44 UTC:** `diagnose` v72 e `diagnose-pragas` v2 (`ai_meta` +
telemetria de crédito). **Resposta ao cliente inalterada — verificado** (o override de `notes` na
resposta vem depois do spread de `saved`, então `ai_meta` fica no banco e não vaza para o binário
1.0.9).

**Causa raiz das 2 falhas silenciosas de build** (18/jul 21:52 e 19/jul 07:23, ambas `BUILD_EXIT=1`
mascaradas por "exit 0" do wrapper de background): `npm ci` isolado pelo lockfile com **cache npm
nascendo vazio a cada build × rede transitória** (ECONNRESET nos runtimes Node do dia). Mitigação
estrutural recomendada no doc 07 §9 / RD-05 (retry bounded 2–3× + cache-seed sha512-verificado +
emitir a CLASSE do erro no log redigido) — sem enfraquecer o isolamento de supply chain.

---

## 9. Resultados antes e depois

| Item | Antes | Depois |
|---|---|---|
| Deep link do lembrete de re-inspeção | Todo tap = `invalid_payload` (tela fora do `ALLOWED_SCREENS`) | Roteia para o histórico; payloads maliciosos ainda rejeitados (igualdade exata) |
| Confiança no hero | `87%` cru, sem rótulo | **Alta/Média/Baixa** + % arredondado a passo de 5 + microcopy "estimativa do modelo"; banner <70% preservado |
| Resize da foto | `{width:1024,height:1024}` **distorcia** toda foto não-quadrada antes da IA | Passa só o lado maior → aspect ratio preservado; iOS (crop quadrado) inalterado |
| Qualidade de foto no device | Só `invalid_image` **após** upload + ~60s | Aviso local pré-envio (escura/desfocada) com "usar assim mesmo" — fail-open, zero latência de I/O |
| Alvos de toque <44pt | 4 alvos sem `hitSlop` (difíceis no campo) | +8pt/lado, sem mudança visual |
| Versionamento de IA | Nenhum diagnóstico registrava provider/modelo/versão → drift indetectável | `ai_meta` em todo insert dos 2 slugs; drift mensurável, resultado reproduzível |
| Telemetria de crédito Agrio | **OFF por default** nos 2 slugs → apagão de 06/jul se repetiria mudo | **ON por default** + fail-safe triplo + alerta de saldo previsto |
| CTA de diagnóstico na Home | Abaixo do card de clima (hierarquia invertida) | 1ª posição, acima do clima |
| Jest coletava `.artifacts/` | Snapshot do runner duplicava as 71 suítes | Ignorado; coleta limpa |
| iOS na App Store BR | (pré-lançamento) | **1.0.11 READY_FOR_SALE — público** (submetido por outra frente, aprovado hoje) |

---

## 10. Limitações e riscos restantes

**Trail-lock do versionCode derivado (≈206M) — nota operacional dura.** O runner protegido deriva o
buildVersion do timestamp do commit (`epoch − 1577836800`), gerando ≈206,6M para o 1.0.11 de hoje.
Consequência: **todo upload futuro precisa EXCEDER esse número**. O runner garante monotonicidade
(timestamp do commit sempre cresce), mas o **trilho EAS clássico morre** — `app.json` pina
`android.versionCode 50`, que é ≤ 54 do baseline Play E infinitamente abaixo de 206M; qualquer build
por EAS clássico com `appVersionSource: local` seria recusado. Decisão embutida: declarar o runner
como trilho único e fazer o EAS clássico falhar alto (RD-15).

**Estado das plataformas (verificado via ASC API hoje 13:10):**
- **iOS 1.0.11 = READY_FOR_SALE / READY_FOR_DISTRIBUTION**, `downloadable:true`, `releaseType
  AFTER_APPROVAL`, versão criada 18/jul — **já está PÚBLICO na App Store** (submetido por outra
  frente, aprovado hoje). **Os 9 commits de hoje NÃO estão nesse binário iOS** — entram no próximo
  (1.0.12+), que segue **bloqueado localmente pela rotação de certificado** (gate de operador,
  `APPLE_SIGNING_ROTATION_BLOCKER.md`).
- **Android público segue 1.0.9 / vc49.** O AAB 1.0.11 de hoje (com os 9 commits) **fecha a paridade
  de número de versão** com o iOS, mas carrega **conteúdo mais novo que o iOS 1.0.11** — assimetria
  intencional a documentar (o binário Android que subir terá os 9 fixes; o iOS público ainda não).

**Gates do CEO consolidados (nenhum bloqueia o código de hoje):**

| ID | Gate | Tipo |
|---|---|---|
| RD-06 | Rotação do certificado iOS — destrava TODO build/submit iOS (1.0.12+) | operador autorizado |
| RD-07 | Screenshots de loja 1.0.9 mostram paywall/limite/dark-mode inexistentes (Guideline 2.3.3) — regravar iOS+Android | loja |
| RD-04 | Declarar Agrio (Saillog) como subprocessador em Data Safety + política de privacidade | legal/loja |
| RD-22 | Review notes iOS com afirmação falsa ("grupos de assinatura vazios") + 2 subs `MISSING_METADATA` (`pragas_pro_m2/y2`) — completar ou deletar | loja |
| RD-43 | Copy honesta de lançamento ("biblioteca/MIP offline, diagnóstico exige internet" + biológico + AGROFIT) — landing = ZERO-N | copy |
| RD-14 | Entitlement partido `subscriptions` × `pragas_subscriptions` — reconciliar **antes** de qualquer `FREE_MODE=false` | dinheiro/DB |
| RD-44 | Exclusão de conta = hard delete da identidade jxcn compartilhada → migrar para soft-delete + janela de recuperação | produto/DB |
| RD-37 | Setar `SENTRY_DSN_COMBO` no jxcn + redeploy das fns do combo (fim da poluição de Sentry) | ops (fora deste repo) |
| — | **Re-unificação do prompt legado `diagnose/` (prescritivo, serve o binário público 1.0.9) com o dedicado (não-prescritivo)** — versões distintas + teste-trava; mexer no prompt de produção não é reversível em 2s | compliance |

**Aberto de engenharia (não-gate, sequenciado no roadmap):** OOD nativo no path Agrio + testes
`adaptAgrio` (RD-13); fechar o loop de feedback com métrica de `incorrect` por versão (RD-17); teste
de paridade shared-slug × dedicado + plano de sunset (RD-16); mitigação estrutural do `npm ci`
(RD-05); histórico truncado em 50 sem paginação (RD-18); teste-trava de EXIF ausente no payload
(RD-32). Os itens ADIADOS-H2 (múltiplas imagens, órgão da planta, escada taxonômica, push regional,
integração CampoVivo) têm contrato preparado no doc 08 e dependem de teto de custo global e/ou
decisões de privacidade — pós-lançamento por decisão já refutada em D3.
