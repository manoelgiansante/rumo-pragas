# Google Play Console — Rumo Pragas (pt-BR)

> ⛔ **DEPRECATED (2026-07-02) — SEÇÕES DE IAP/PREÇO OBSOLETAS. NÃO PUBLICAR SKUs.**
> O Rumo Pragas é **100% GRÁTIS** (decisão CEO 01/jul, pós-rejeição Apple 2.3.2/2.1b). As 3 subscriptions
> do ASC foram DELETADAS em 02/jul e NENHUM SKU de IAP deve ser publicado na Play (Monetization > Products).
> As menções antigas a "IAP: Yes (R$ 49,90/mês)" neste doc foram corrigidas abaixo e NÃO devem voltar.
> **Fonte canônica do metadata de loja (grátis):** `expo-app/store-assets/metadata/` (iOS + Android, pt-BR).

**Package name:** com.agrorumo.rumopragas
**Track target:** Internal → Closed → Production
**Primary Locale:** pt-BR
**Updated:** 2026-06-15
**App version:** 1.0.7 — Android `versionCode` 33 (see `expo-app/app.json`); iOS `buildNumber` 46

> ⚠️ **Live Play Console track status NOT verified from this branch.** The
> release-tracks table below is reconstructed from the in-repo `app.json`
> (`versionCode: 33`), not from a live Play Console read. Before relying on it
> for a Play submission, confirm the actual track/rollout state in
> Play Console → Rumo Pragas → Release → Track overview (CEO / authenticated
> session). Do NOT assume "Production live" from this doc alone.

---

## 1. App Details

| Campo                      | Valor                                                                        | Chars      |
| -------------------------- | ---------------------------------------------------------------------------- | ---------- |
| Title                      | `Rumo Pragas: Diagnostico IA`                                                | 28/30      |
| Short description          | `IA que identifica praga por foto em 5s. Tratamento pra soja, milho e cafe.` | 74/80      |
| Full description           | ver `expo-app/store-assets/metadata/android/pt-BR/full_description.txt`      | ~3800/4000 |
| What's New (release notes) | ver `expo-app/store-assets/metadata/android/pt-BR/whats_new.txt`             | ~343/500   |

### Category & tags

- Category: **Tools**
- Tags: Agriculture, Utilities, Education
- Content Rating: Everyone (IARC)
- Target Audience: 18+
- Contains Ads: No
- In-app purchases: **No** (app 100% grátis — subscriptions deletadas 02/jul; NÃO publicar SKUs)

---

## 2. Graphic Assets

| Tipo              | Path                                                | Dimensões           |
| ----------------- | --------------------------------------------------- | ------------------- |
| Feature Graphic   | `expo-app/store-assets/android/feature-graphic.png` | 1024x500            |
| Phone Screenshots | `expo-app/store-assets/android/phone/*.png`         | 1080x2340           |
| App Icon          | `expo-app/assets/images/icon.png`                   | 512x512 (verificar) |

### Screenshots (ordem recomendada)

1. `01-hero.png` — Diagnostique pragas em segundos com IA
2. `02-diagnostico.png` — Foto. Analise. Tratamento.
3. `03-biblioteca.png` — Biblioteca completa por cultura
4. `04-historico.png` — Acompanhe sua lavoura o ano todo
5. `05-login.png` — Seu agronomo de bolso. Gratis.

### Tablet screenshots (opcional, ainda não gerados)

> **Pendente:** Capturar em 7" e 10" tablet simulator. Play aceita lançar só com phone; tablet recomendado para ranking global. Gerar numa sessão futura com simulator Pixel Tablet (1600x2560) — reaproveitar mesmo script `aso_compose.py`.

---

## 3. Store Listing Contact

| Campo          | Valor                                   |
| -------------- | --------------------------------------- |
| Website        | https://pragas.agrorumo.com             |
| Email          | contato@agrorumo.com                    |
| Phone          | (opcional)                              |
| Privacy Policy | https://pragas.agrorumo.com/privacidade |

---

## 4. Data Safety

### Dados coletados

| Tipo                 | Dado             | Finalidade              | Compartilhado                 | Obrigatório                |
| -------------------- | ---------------- | ----------------------- | ----------------------------- | -------------------------- |
| Informações pessoais | Email            | Contas, comunicação     | Não                           | Sim                        |
| Informações pessoais | Nome             | Contas                  | Não                           | Opcional                   |
| Fotos/Vídeos         | Fotos            | Funcionalidade          | Não (processado, não vendido) | Obrigatório p/ diagnóstico |
| Localização          | Local aproximado | Funcionalidade          | Não                           | Opcional                   |
| ID do app            | User ID          | Análise, funcionalidade | Não                           | Sim                        |
| Atividade do app     | Interações       | Análise                 | Não                           | Sim                        |
| Diagnóstico          | Travamentos      | Análise (Sentry)        | Não                           | Sim                        |
| Diagnóstico          | Performance      | Análise                 | Não                           | Sim                        |

### Práticas de segurança

- [x] Dados criptografados em trânsito (HTTPS/TLS)
- [x] Usuário pode solicitar exclusão (`/delete-account`)
- [x] Conforme LGPD

---

## 5. Content Rating (IARC)

- Violence: None
- Sexual Content: None
- Language: None
- Controlled Substances: None (defensivos agrícolas NÃO classificam aqui)
- Gambling: None
- **Resultado:** Everyone / Livre (Brasil)

---

## 6. Upload — passos manuais (Play Console)

1. Acessar `https://play.google.com/console/u/0/developers/<dev_id>/app/<app_id>/main-store-listing`
2. Preencher campos do item 1 com os arquivos em `expo-app/store-assets/metadata/android/pt-BR/`
3. Upload feature graphic (1024x500) e 5 screenshots de phone
4. **Data Safety:** App content → Data safety → preencher tabela do item 4
5. **Content Rating:** App content → Content ratings → responder questionário (resultado Everyone)
6. **Pricing & distribution:** Free + selecionar países (Brasil + Américas agro)
7. Salvar e enviar rascunho para revisão

### Upload via API (opcional)

> Sem credencial Play Developer API (`google-play-api-key.json`) atualmente configurada no ambiente. Para automatizar uploads futuros:
>
> 1. Service account: `Play Console → Setup → API access → create service account`
> 2. Conceder roles: `Release Manager`
> 3. Download JSON key → salvar em `~/.keys/play-publisher.json`
> 4. Usar `fastlane supply` ou `@expo/google-play-api`

---

## 7. Release tracks

> Version codes below reflect the current in-repo `app.json` (`versionCode: 33`).
> The **Status** column must be re-confirmed live in Play Console — it is not
> readable from this branch (see warning at top of this doc).

| Track          | Status (verify live)        | Version Code  | Action                        |
| -------------- | --------------------------- | ------------- | ----------------------------- |
| Internal       | _verificar no Play Console_ | 33 (app.json) | QA interno                    |
| Closed (Alpha) | _verificar no Play Console_ | 33 (app.json) | Promover após QA              |
| Production     | _verificar no Play Console_ | 33 (app.json) | Promover após Closed aprovado |

---

## 8. Pré-release checklist

- [x] AAB signed com upload key
- [x] Target SDK 34 (Android 14)
- [ ] Feature graphic 1024x500 subido
- [ ] 5 screenshots phone subidos
- [ ] Short + full description revisados em Play Console
- [ ] Data Safety form completo
- [ ] Content rating questionnaire completo
- [ ] Privacy policy URL validada (200 OK)
- [ ] Contains ads? marcado como No
- [x] ~~IAP SKUs publicados em Monetization > Products~~ — N/A: app 100% grátis, **NÃO publicar SKUs** (subscriptions deletadas 02/jul)
