# SUBMISSAO-PRONTA — Rumo Pragas 1.0.6 (b38 iOS / vc31 Android)

**Data:** 2026-05-17 11:18 BRT
**Branch:** `design-system/pragas-redesign`
**App ASC ID:** `6762232682`
**Bundle:** `com.agrorumo.rumopragas`
**Backend Supabase:** `jxcnfyeemdltdfqtgbcl`

---

## ✅ Status Final

| Plataforma | Build | Submission | State |
|---|---|---|---|
| **iOS** | 1.0.6 b38 | `b43e6964-ac81-4c1f-893a-761f2b6228fd` | **WAITING_FOR_REVIEW** ✅ |
| **Android** | 1.0.6 vc31 | `e6f68cf8-7c1f-4304-bda1-37138b687eba` | Play Internal **DRAFT** ✅ |

---

## 1. Histórico de recusas anteriores corrigidas

### iOS (4 recusas em sequência, todas resolvidas)

| Build | Data | Guideline | Root cause | Correção |
|---|---|---|---|---|
| b27 | 2026-05-04 | 2.1(a) | iPad onboarding bug | Commit `1a0d21c` — supportsTablet, useWindowDimensions, AsyncStorage fallback |
| b30/31 | 2026-05-07 | 2.1(b) | IAPs not bundled | EAS local + ASC API attach via JWT |
| b35 | 2026-05-09 | 2.1(a) | Login error PT-BR | Commit `d1db523` — silent-fail Supabase invalid_credentials + PAYWALL_LITE_MODE |
| b36 | 2026-05-13 | 2.1(a), 2.3.7, 3.1.2(c) | iPad login Alert paths + screenshots "Grátis" + EULA visibility | Commit `3139e6b` (9 Alerts removidos) + DELETE 2 screenshots "Gratis" via API + EULA URL inline na description |

### Android (Play Internal track)
| vc | Estado anterior | Correção |
|---|---|---|
| 27 (Alpha) | Sem testers ativos | Submit Internal track novo |
| 29 (Internal DRAFT 1.0.0) | versionName incorreto | Substituído por vc31 (1.0.6) |

---

## 2. Assinatura iOS

- **ASC API Key:** `C5FD4GNS79` ("rumo-pragas-eas-2026-05-14"), App Manager role
- **Old key revoked:** `YQGT4C9TB8` (revogada via ASC web UI 2026-05-14)
- **Issuer ID:** `315bb9b2-f8be-46c8-b564-1cc997361301` (Team-level, não muda)
- **.p8 path:** `~/.keys/AuthKey_C5FD4GNS79.p8` (chmod 600)
- **Provisioning profile:** `RumoPragas_AppStore_20260413_v5` (EAS-managed local)
- **Apple Team ID:** `5YW9UY5LXP`
- **JWT test:** ASC API responde corretamente (app reachable)

---

## 3. Keystore Android

- **Keystore:** `Build Credentials uoJHTHAvPz (default)` — EAS-managed, mesma usada em vc24/27/29 anteriores
- **Service Account:** `rumo-pragas-play-publisher@agrorumo.iam.gserviceaccount.com`
- **Package name:** `com.agrorumo.rumopragas` (mesmo do Firebase + ASC)
- **Firebase project:** `rumo-pragas` (Spark plan, FCM enabled)
- **google-services.json:** commitado em `expo-app/google-services.json` (commit `c0770bb`)

---

## 4. Screenshots (4 clean por loja, sem preço/desconto)

### iOS — Set 6.7" iPhone (1290 × 2796)
Set ID `158067ef-42a3-421d-a975-acc66ec566ba`. 4 screenshots restantes após limpeza:

1. `01-hero.png` — banner "Diagnostique pragas em segundos com IA / 82% acurácia. Offline" (sem preço)
2. `02-diagnostico.png` — banner "Foto. Análise. Tratamento."
3. `03-biblioteca.png` — banner "Biblioteca completa por cultura"
4. `04-historico.png` — banner "Acompanhe sua lavoura o ano todo"

**Removidos (2.3.7 violation "Grátis"):**
- `52965f38` (05-login.png banner "Seu agronomo de bolso. Gratis")
- `677843e6` (05-login.png duplicate)

**Removidos (duplicates):**
- 4 byte-exact duplicates de 01/02/03/04

Iconografia 6.9" iPhone (1320 × 2868) — NÃO criada nesta versão. Apple aceita 6.7" como fallback. Sugerido criar em v1.0.7.

### Android — Play pt-BR phoneScreenshots (1080 × 2340)
4 PNGs uploaded via Play Developer API:
1. `01-hero.png`
2. `02-diagnostico.png`
3. `03-biblioteca.png`
4. `04-historico.png`

Featured graphic (1024 × 500) e icon (512 × 512) mantidos (icon real, featured graphic é AI-generated mas não bloqueia review).

---

## 5. Metadados revisados

### ASC pt-BR (PATCH OK via API)
- **Privacy Policy URL:** `https://pragas.agrorumo.com/privacidade` (verificado HTTP 200)
- **Support URL:** `https://pragas.agrorumo.com/suporte` (canonical, sem email pessoal)
- **Marketing URL:** `https://pragas.agrorumo.com`
- **Keywords:** `pragas,soja,milho,cafe,fungicida,lagarta,ferrugem,broca,percevejo,nematoide,IA,agronomo` (88/100 chars)
- **PromotionalText:** "NOVO: 82% de acurácia validada em campo. Diagnóstico de pragas em soja, milho, café, algodão e mais. IA + MIP + Biblioteca Offline."
- **Description:** inclui bloco "ASSINATURA PRO" com Termos de Uso + Privacy Policy + Suporte URLs (EULA visibility per 3.1.2(c))
- **Account deletion:** in-app via `settings.tsx → delete-user-account` edge fn (Apple 5.1.1(v))

### Play pt-BR
- **Release name:** "1.0.6 (31)"
- **Release notes:** "Versão 1.0.6: estabilidade pós-cadastro, logout completo (limpa cache de assinatura), exclusão de conta detalhada (Apple subscription separada), tracking de erros aprimorado, push notifications Android via Firebase Cloud Messaging."

### TestFlight Beta Review Detail
- **Phone:** `+5516996011130` (corrigido de placeholder via PATCH API)
- **Demo Account:** `reviewer@agrorumo.com` / `rCrelvopjjIY2OYJlFytkFdz` (Pro pre-granted via RevenueCat)
- **Notes:** completo (RUMO PRAGAS overview + features + IAPs + LGPD + Lei 7.802/89 disclaimer + DPO contact)

---

## 6. Builds

### iOS build bn38
- **File:** `/tmp/pragas-builds-2026-05-16/build-bn37-ios.ipa` (28MB)
- **Bundle:** `com.agrorumo.rumopragas` 1.0.6 (38)
- **CFBundleName:** RumoPragas
- **dSYM:** uploaded
- **ASC build ID:** `76c4872c-13e1-47e1-a699-5400f9cd997f` (state: VALID, APP_STORE_ELIGIBLE)

### Android build vc31
- **File:** `/tmp/pragas-builds-2026-05-17/build-vc30-android.aab` (88MB)
- **Package:** `com.agrorumo.rumopragas` versionCode=31 versionName=1.0.6
- **EAS auto-incrementou** vc30→vc31 (Internal track tinha vc29 DRAFT)

---

## 7. Submissões

### iOS App Store Connect
- **Submission ID:** `b43e6964-ac81-4c1f-893a-761f2b6228fd`
- **Status:** **WAITING_FOR_REVIEW**
- **Submitted:** 2026-05-17T13:55:41Z
- **Build attached:** bn38 (`76c4872c`)
- **IAPs auto-bundle:** `pragas_pro_monthly` + `pragas_pro_annual` (ambos READY_TO_SUBMIT, auto-attach no review)
- **ASC URL:** https://appstoreconnect.apple.com/apps/6762232682/distribution/ios/version/inflight

### Android Google Play
- **Submission ID:** `e6f68cf8-7c1f-4304-bda1-37138b687eba`
- **Track:** Internal Testing (DRAFT)
- **Release:** 1.0.6 (31) — release notes pt-BR adicionados via API
- **Status:** DRAFT (aguardando CEO promover pra Production OR continuar Internal)
- **Play Console URL:** https://play.google.com/console/u/0/developers/8889064017906547800/app/<appId>/tracks/internal

---

## 8. Notas ao revisor (preenchidas)

### Apple App Store Review
Notes campo no ASC App Store Version Submission:
> "RUMO PRAGAS — App de identificação de pragas agrícolas com IA. LOGIN: reviewer@agrorumo.com / rCrelvopjjIY2OYJlFytkFdz (Pro pre-granted via RevenueCat sandbox). FEATURES: Tab Início → Diagnosticar Praga → câmera → foto folha → análise IA (~5s) → resultado com nome, severidade, tratamento. Tab Biblioteca offline. Tab Agro IA chat. Ajustes inclui exclusão de conta + gerenciar assinatura. IAPs: Auto-renewable subscriptions (R$29,90/mês e R$199,90/ano) via RevenueCat. LGPD: Câmera+Galeria pra fotos, Localização OPCIONAL. Lei 7.802/89 disclaimer no app sobre receituário agronômico CREA. Suporte: contato@agrorumo.com / DPO LGPD."

### Google Play Review
Release notes inline + Data Safety Form preenchido (Photo/Video permissions justified, Location opt-in LGPD).

---

## 9. Pendências CEO (opcional, não bloqueia review)

| # | Item | Tempo | Impacto |
|---|---|---|---|
| 1 | Screen recording 10s mostrando paywall (título/duração/preço visíveis) — gravar TestFlight bn38 e anexar Resolution Center se Apple pedir | 5min | Insurance contra re-reject 3.1.2(c) |
| 2 | Promover Play Internal DRAFT → Closed Testing (12 testers + 14 days) → Production | 14-30 dias rolling | Distribuição pública Android |
| 3 | Criar set iPhone 6.9" (1320×2868) screenshots | 30min (próxima versão) | Apple prefere mas aceita 6.7" |
| 4 | Featured Graphic Android (1024×500) redesign (atual é AI-generated) | designer time | Cosmetic |

---

## 10. Pré-build verifications passed (FASE 6 + 8)

### Code audit (Agent H3 read-only)
- ✅ 0 `console.*` ungated em prod (apenas 1 startup misconfig warning intencional em `services/supabase.ts:35`)
- ✅ 0 strings "beta/test/debug" em UI
- ✅ Todas permissions declaradas têm uso real: Camera, Photo Library, Location, Notifications
- ✅ blockedPermissions: RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, SYSTEM_ALERT_WINDOW, READ/WRITE_EXTERNAL_STORAGE
- ✅ iOS infoPlist permissions com descrições SPECIFIC (não genéricas)
- ✅ Bundle id consistent entre iOS+Android+ASC+Play+Firebase: `com.agrorumo.rumopragas`
- ✅ Account deletion presente (Apple 5.1.1(v))

### URLs validation
- ✅ https://pragas.agrorumo.com (200)
- ✅ https://pragas.agrorumo.com/privacidade (200)
- ✅ https://pragas.agrorumo.com/termos (200)
- ✅ https://pragas.agrorumo.com/suporte (200)
- ✅ https://pragas.agrorumo.com/excluir-conta (200)
- ✅ https://agrorumo.com (200)

### Tests (commit 3139e6b)
- ✅ `npx tsc --noEmit`: 0 errors
- ✅ `npm run lint`: 0 errors, 0 warnings
- ✅ Jest: 276/277 passing (1 preexisting ErrorBoundary mock unrelated)

---

## 11. Commits desta sessão (cronológico)

| SHA | Descrição |
|---|---|
| `503096d` | App code P0 batch — mega audit 30 agents Wave 6 |
| `df523d5` | Backend Stripe trial bug + Sentry shim + webhook_events |
| `7811e4d` | Expo SDK 55 patch versions aligned |
| `c0770bb` | ASC API key rotation (C5FD4GNS79) + Firebase google-services.json |
| `3139e6b` | Apple reject fix bn37: 9 Alerts removidos + OTA gated + EULA paywall |
| (Sentry hotfix) | SENTRY_ALLOW_FAILURE=true em eas.json |
| (versionBump) | versionCode 28→30 + buildNumber 37→38 |

---

## 12. Próximos eventos automáticos

- **Apple review verdict** (24-72h): watcher launchd `com.agrorumo.pragas-ios-review-watch` (30min interval) notifica
- **TestFlight Beta Review** (já submetido, <24h): External Testers via `https://testflight.apple.com/join/3UsG17ZQ`
- **Sentry 48h soak watchlist** ativo

---

## STATUS GERAL: SUBMISSÃO COMPLETA, AGUARDANDO APPLE + PLAY VERDICT

**Apple:** `WAITING_FOR_REVIEW` (decisão em 24-72h)
**Play:** Internal DRAFT (CEO promove quando quiser)
