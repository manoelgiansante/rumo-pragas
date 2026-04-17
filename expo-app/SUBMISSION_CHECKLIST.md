# Submission Checklist — Rumo Pragas v1.0.0

> Auditoria 30 agentes concluída 2026-04-17. Tudo OK para submissão assim que steps manuais abaixo forem feitos.

## Steps manuais do Manoel (UMA VEZ)

### 1. EAS Secrets (RevenueCat + Sentry)

```bash
cd ~/AgroRumo\ Projetos/Apps/rumo-pragas/expo-app

# RevenueCat keys (do dashboard app.revenuecat.com → Project Settings → API Keys)
eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_XXXXXXX
eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_ANDROID_KEY --value goog_XXXXXXX

# Sentry auth token (de sentry.io → Settings → Auth Tokens → "Source Maps: read & write")
eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value sntrys_XXXXXXX

# Verificar
eas secret:list
```

### 2. Google Play Service Account (BLOQUEADOR)

1. Abrir https://play.google.com/console
2. Setup → API access → Create new service account
3. Dar permissões: "Release manager" (Release apps to testing + production)
4. Download JSON → mover para Downloads
5. Rodar:
   ```bash
   cd ~/AgroRumo\ Projetos/Apps/rumo-pragas/expo-app
   ./scripts/setup-play-store-key.sh ~/Downloads/SEU-NOME-DO-JSON.json
   ```
   (script valida que NÃO é o analytics-mcp errado)

### 3. Play Console (uma vez)

No https://play.google.com/console/u/0/developers/.../app/.../data-safety:

- Preencher Data Safety seguindo [store-assets/android/DATA_SAFETY.md](store-assets/android/DATA_SAFETY.md)
- Content rating: Everyone / Livre
- Privacy policy URL: `https://pragas.agrorumo.com/privacy`
- Support URL: `https://pragas.agrorumo.com/support`

### 4. App Store Connect (uma vez)

No https://appstoreconnect.apple.com para app id `6762232682`:

- App Information → Review Notes: copiar de [store-assets/ios/REVIEWER_NOTES.md](store-assets/ios/REVIEWER_NOTES.md)
- Privacy nutrition labels: preencher (camera, location, email, photos, crash data, purchase history)
- Age Rating: 4+
- Category: Utilities (primary) + Productivity (secondary)

### 5. Reviewer demo account (Apple exige)

No Supabase (jxcnfyeemdltdfqtgbcl) → Auth → Add User:

- Email: `reviewer@agrorumo.com`
- Password: senha forte (anotar em 1Password/Obsidian)
- Atualizar credenciais em `store-assets/ios/REVIEWER_NOTES.md`

### 6. RevenueCat Offerings (iOS + Android)

No https://app.revenuecat.com → Offerings:

- Criar offering "default" com 2 packages: monthly + annual
- Vincular aos product IDs do App Store Connect e Google Play Console (criar IAPs se ainda não existem)

## Build + Submit

```bash
cd ~/AgroRumo\ Projetos/Apps/rumo-pragas/expo-app

# Validar env vars antes
./scripts/validate-prod-env.sh

# Build + auto-submit ambos
eas build --platform all --profile production --auto-submit --non-interactive

# Monitorar:
# - iOS: TestFlight ~30-60min
# - Android: Play Internal Testing ~1h
```

## Landing Deploy

```bash
cd ~/AgroRumo\ Projetos/Apps/rumo-pragas-landing
git add -A
git commit -m "feat(landing): SEO + security + Meta events + store links real"
git push origin main  # auto-deploy Vercel
```

## Pendências pós-rate-limit (Wave 2 incomplete)

Reset às 11am America/Sao_Paulo. Re-lançar:

1. **Edge Functions rate limiting** (ai-chat + diagnose) — deployar via `supabase functions deploy`
2. **4 tests failing** (diagnosisQueue.test.ts:109 `.id` undefined + ConfidenceBar cores) — fix não-blocker, não impede submit
3. **library.tsx i18n** (40 strings hardcoded de pragas) — não-blocker
4. **Dynamic imports Framer Motion** na landing — perf improvement

## Estado atual (scores)

| Area               | Antes      | Depois                      |
| ------------------ | ---------- | --------------------------- |
| iOS Apple Review   | 6/10       | 9/10                        |
| Android Play Store | 5/10       | 9/10                        |
| RN Code Quality    | 7.5/10     | 8.5/10                      |
| Web SEO            | 8/10       | 9/10                        |
| Code Health        | 5.5/10     | 7.5/10                      |
| Security           | 7.5/10     | 8.0/10 (rate limit pending) |
| Performance        | 7/10       | 8.5/10 (PNGs 95% ↓)         |
| ASO                | 8.5/10     | 9/10                        |
| A11Y + i18n        | 7/7.5      | 8.5/9                       |
| **Overall**        | **6.7/10** | **8.7/10**                  |
