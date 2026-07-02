# RELATÓRIO FINAL — Mega-Audit de Lançamento · Rumo Pragas IA · 02/jul/2026

> Branch: `perfect/pragas-launch-2026-07-02` (2 commits ahead da main `b6e5716`).
> Cobertura: 10 dimensões auditadas (arquitetura, QA 23/23 telas, design, banco via MCP ao vivo, pagamentos/pivot grátis, motor IA, segurança/perf, lançamento com ASC ao vivo, web, legal/LGPD) + pesquisa de concorrentes + verify adversarial de todos os achados relevantes + 2 fixes aplicados e verificados.
> Gate de qualidade da branch: **typecheck ✅ · eslint --max-warnings 0 ✅ · jest 440/440 (48 suites) ✅ · zero referências quebradas**.

---

## NOTA GERAL: **7.3 / 10**

O produto é **maduro e lançável** — motor de IA blindado, segurança server-side no estado da arte do portfólio, pivot grátis 100% íntegro nas 4 pernas, 0 rotas quebradas, 0 CRITICAL de código no cliente. O que segura a nota são **dois fatos de infraestrutura/processo, não de produto**: (1) o **drift de schema em prod** que quebra silenciosamente perfil e push para todos os usuários (DB-C1/DB-A1) e (2) o **iOS 1.0.7 REJECTED** no ASC com Review Notes ainda descrevendo um app pago (L1/L2) — mais a landing legal de abril que contradiz o modelo grátis (4ª perna).

### Notas por categoria

| Categoria | Nota | Base |
|---|---|---|
| **Código** | **8.5** | TS strict total, 1 único `as any`, error handling exemplar, ZERO-X em tudo; dedução por 3 suítes de teste desligadas e código morto de paywall |
| **Design/UX** | **7.0** | Era 6.5; **subiu com o fix D1** (contraste WCAG AA corrigido — commit `701df06`). Resta: 2 famílias de verde, dark mode ad-hoc, 84 hex hardcoded, touch targets <44pt |
| **Banco** | **6.0** | RLS 20/20 ✅, ZERO-AD PASS ✅, secrets limpos ✅ — mas drift prod↔código quebra perfil (CRITICAL) e push (ALTO); repo não é fonte de verdade do schema |
| **Pagamentos (= integridade do grátis)** | **8.5** | Pivot íntegro nas 4 pernas: paywall no-op real, zero caminho de compra alcançável, servidor sem 403 pago (FREE_MODE), termos in-app coerentes. Resta badge "Enterprise" incoerente (MÉDIO) |
| **Motor IA** | **8.0** | Timeout 60s+cancelar, fail-closed, magic bytes, anti prompt-injection, sanitização, disclaimer Lei 7.802/89, LGPD duplo-travada. Resta: idempotência da fila, guard web, pastagem, decisão Haiku×Sonnet |
| **Segurança** | **8.0** | ZERO-X exemplar em todas as rotas de IA, rate limiting, secrets fora do bundle, fotos não persistidas (menor superfície LGPD). Resta: sessão web não persiste, sweep de device compartilhado |
| **Performance** | **8.0** | FlatLists corretas, compressão de imagem, cleanups verificados, splash watchdog. Resta: contexts sem memo, base64 retida, bundle web 7MB |
| **Prontidão Lançamento** | **5.5** | Android 1.0.7/vc44 em production ✅; **iOS REJECTED** + review notes pagas + landing legal contraditória + push morto. Metadata/AASA/contas demo saudáveis |
| Web (informativo) | 7.5 | Build 100% funcional nas 3 plataformas; deploy existe mas atrás de Vercel Auth (decisão pendente) |
| Legal/LGPD (informativo) | 6.5 | In-app forte (CNPJ real validado mod-11, DPO, consent GPS exemplar); web de 16/abr descreve outro produto |

---

## O QUE FOI CORRIGIDO NESTA RODADA (antes → depois)

| # | Achado | Antes | Depois | Commit |
|---|---|---|---|---|
| 1 | **D1 · WCAG AA — amarelo e cinza como texto** (defeito funcional de legibilidade no sol/campo) | `warmAmber #C89B3C` ~2.3:1 como texto em 6 sites; `textTertiary #8A8373` ~3.4:1 em 4 sites; 3 usos de `systemGray` como texto no login | Token novo `earthText: #8A6A1F` (~4.6:1) p/ ocre-texto; `textTertiary → #6B6455` (~4.6:1, token text-only — 4 call sites auto-corrigidos); 6 sites amber→earthText; 3 sites login→textTertiary. Ícones/bg/borda preservados em `warmAmber` (correto). Zero mudança de layout/comportamento; iOS+Android+Web idênticos; reversível com `git revert` | `701df06` |
| 2 | **L3 · 3 docs ASO "master" vendendo modelo PAGO** (drift perigoso: agente podia colar copy paga no console → 2.3.1 + reintrodução de cobrança) | `STORE_LISTING.md` ("Free com IAP", planos Pro/Enterprise, "IAP: Yes R$49,90", screenshot 5 = paywall, checklist de SKUs); `docs/aso-final.md` ("7 dias grátis", "R$49,90/mês"); `docs/aso/play-metadata.md` ("In-app purchases: Yes", checklist de publicar SKUs) | Banner ⛔ DEPRECATED nos 3 apontando a fonte canônica grátis (`expo-app/store-assets/metadata/`); todas as seções de plano/IAP corrigidas p/ "GRÁTIS, SEM IAP"; screenshot 5 → login; checklists de IAP neutralizados com proibição explícita de publicar SKUs. Grep pós-fix: únicas menções restantes estão dentro dos banners proibitivos | `ad46f8f` |

Adicionalmente (docs-only, working tree): nota de supersedência no §7 de `PESQUISA_CONCORRENTES_BRASIL.md` (C-07 — tabela de preços marcada SUPERADA pelo modelo grátis).

**Fixes aplicados e verificados: 2** (ambos passaram typecheck + lint + jest 440/440 + verificação de referências).

---

## O QUE RESTA (síntese — lista completa e ordenada em `10_PLANO_MESTRE.md`)

**🔴 2 CRÍTICOS (ambos gate CEO):**
1. **DB-C1** — drift `pragas_profiles`: salvar perfil falha SEMPRE, avatar nunca persiste, prefs revertem (100% dos usuários, 3 plataformas). Fix = migration aditiva jxcn + sweep client `id`→`user_id` na v1.0.8.
2. **L1** — iOS 1.0.7 **REJECTED** (02/jul); Review Notes no ASC ainda descrevem app pago. CEO: Resolution Center → notes grátis → resubmit (NÃO cancelar a submissão).

**🟠 4 ALTOS:** push remoto morto fim-a-fim (DB-A1, gate); web /termos+/privacidade contradizem o grátis e descrevem outro produto (L1-legal, ZERO-N gate); web deploy atrás de Vercel Auth — decidir superfície (W1, gate); `delete-user-account` prod rodando código de maio (L8/M1, gate).

**🟡 ~29 MÉDIOS:** safe-area (Q1/Q2), sessão web (SP-01), device compartilhado (SP-02), idempotência da fila (A1-IA), guard offline web (A2-IA), pastagem (A3), badge "Enterprise" (P-01), storage/triggers/higiene de banco, emendas legais in-app, time-to-value/push timing, universal links, FCM/ZERO-L, CSP, secrets órfãos Vercel, débito de design (D2–D5).

**🟢 ~30 BAIXOS** + cauda de 76 MEDIUM/LOW não verificados (backlog de higiene).

---

## CHECKLIST DE LANÇAMENTO

| Superfície | Status | Detalhe |
|---|---|---|
| **App Store (iOS)** | ❌ **BLOQUEADO** | 1.0.7 REJECTED (02/jul, UNRESOLVED_ISSUES). Destravar: Resolution Center (CEO) → review notes grátis → popular conta demo → resubmit. AASA ✅ · metadata live sem preço ✅ · contas demo existem ✅ |
| **Google Play (Android)** | ✅ | 1.0.7 / versionCode 44 em production (fila Google, Brasil). Pendências não-bloqueantes: confirmar FCM V1 (push), Data Safety coerente, subir copy nova via fastlane no próximo ciclo |
| **Vercel web (app)** | ⚠️ decisão | Build 100% funcional (exit 0, 3669 módulos, SPA + deep links OK); deploy Production `Ready` — mas atrás de Vercel Auth e sem domínio custom. **Não é superfície pública hoje** (W1 = decisão CEO). Se for publicar: tirar SSO + domínio + CSP + fix sessão (SP-01) |
| **LGPD** | ⚠️ | In-app ✅ forte (controlador MM CAMPO FORTE 57.169.838/0001-20 DV-válido, DPO, consent GPS fail-closed, exclusão in-app + cron). Pendente: **web legal de 16/abr contraditória** (gate ZERO-N), redeploy da fn de exclusão (v12→atual), emendas §3/§4/menores in-app, runbook da fila `deletion_requests` |
| ~~Stripe/Pix live~~ | N/A | **App é 100% grátis por decisão do CEO** — não há cobrança a verificar; integridade do pivot auditada = 8.5/10 ✅ |

---

## ROADMAP PÓS-LANÇAMENTO (recomendação do sintetizador)

**Fase 0 — destravar (esta semana):** L1/L2 resubmit iOS · pacote DB (DB-C1+DB-A1, migration→edge→binário) · redeploy delete-user-account · pacote legal web (1 autorização ZERO-N).

**Fase 1 — v1.0.8 (1–2 semanas):** sweep client `id`→`user_id` · safe-area (Q1/Q2) · sessão web + sweep de signOut (SP-01/02) · idempotência + guard web da fila (A1/A2-IA) · badge grátis (P-01) · emendas legais in-app · higiene paywall morto · ZERO-L/FCM pré-build.

**Fase 2 — crescimento (mês 1):** features #1 feedback do diagnóstico (constrói o moat + mede acurácia), #3 "posso pulverizar hoje?" (retenção diária), #2 share card WhatsApp (CAC zero). Depois #4 radar regional (usa o GPS coarse que já coletamos — ninguém no BR grátis tem).

**Fase 3 — consolidação (trimestre):** Onda 2 de design (tokens/dark mode/Poppins — mediante aprovação) · offline-first da biblioteca (#5) · export PDF do histórico (#6) · push sazonal (#7, depende do push vivo) · decisão Haiku×Sonnet com dados do feedback · monitorar manejo.app (out/2026).

**Re-monetização:** só por decisão explícita do CEO, com IDs de produto NOVOS (os antigos foram queimados), seguindo o apêndice do 05_PAGAMENTOS (RC dedicado ZERO-W, plaintext ZERO-L, FREE_MODE=false coordenado, 1ª assinatura na versão = UI-only).

---

## COMPARATIVO HONESTO VS CONCORRENTES (02/jul)

**Posição:** *o único app do mercado BR com identificação de praga por FOTO via IA + chat agronômico IA + 100% grátis + ilimitado + sem anúncios + PT-BR nativo.* Nenhum concorrente novo nesse eixo detectado; a janela segue aberta.

| Eixo | Nós | Melhor rival | Leitura honesta |
|---|---|---|---|
| IA por foto grátis | ✅ ilimitado, sem ads | Plantix (grátis COM ads + venda de insumo, rating 3.9, foco Índia) | **Vencemos no modelo**; Plantix vence em base instalada (34M) e comunidade |
| Chat IA agronômico | ✅ ilimitado | ninguém tem | Diferencial exclusivo hoje |
| Acurácia do modelo | Haiku 4.5 (82,5% em amostra de 10) | Plantix/Agrio com anos de dataset proprietário | **Ponto fraco honesto**: nosso dataset é zero; sem loop de feedback não construímos o moat — por isso a feature #1 é a mais estratégica |
| Offline | fila de diagnóstico ✅; biblioteca exige rede | Pragueiro/Farmbox offline-first | Perdemos no campo sem sinal (gap #5) |
| Utilidade diária (clima→decisão) | clima informativo | Plantix/Agrio/FieldView têm janela de pulverização | Gap #3 — barato de fechar |
| Radar regional de surtos | ❌ (temos a matéria-prima: GPS coarse) | Plantix/XARVIO (fora BR grátis) | Ninguém no BR grátis tem — oportunidade #4 |
| Gestão/talhões/satélite | ❌ deliberado | Aegro (R$500+/mês, em aceleração: meta R$42M/2026), Cropwise, InCeres | Não é nosso jogo — são plataformas pagas B2B; seguimos consumer grátis |
| Distribuição | orgânico + lojas | manejo.app (canal Senar: 100k produtores/6m) | **Risco a monitorar** trimestralmente — se lançarem IA de foto, o contraste "grátis sem ads" enfraquece |

**Conclusão competitiva:** pós-pivot grátis, a posição é a melhor do mercado BR no eixo core. Os gaps são de **crescimento/retenção** (viralidade, feedback, offline, utilidade diária), não de paridade mínima. O risco real não é um rival melhor — é (a) não destravar a loja iOS e (b) não consertar perfil/push antes que a base cresça.

---

*Relatórios-fonte: `AUDIT/00`–`09`, `11`, `13` · Plano de execução: `AUDIT/10_PLANO_MESTRE.md` · Skill canônica: `.claude/skills/rumo-pragas-launch-audit/SKILL.md` (atenção: estado iOS do skill está desatualizado — REJECTED, não WAITING_FOR_REVIEW).*
