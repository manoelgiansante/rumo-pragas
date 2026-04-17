# Build Checklist — Rumo Pragas

Passo a passo pra build de production iOS + Android.

## 1. EAS Secrets (executar UMA vez, depois so revalidar)

```bash
# Sentry — source map upload (precisa ser sntrys_XXXX, Internal Integration token)
eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value sntrys_XXXX

# RevenueCat SDK keys (publicas, prefixo appl_/goog_)
eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_XXXX
eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_ANDROID_KEY --value goog_XXXX
```

Verificar:

```bash
./scripts/validate-prod-env.sh
```

## 2. Play Console Service Account

```bash
./scripts/setup-play-store-key.sh ~/Downloads/play-store-key-REAL.json
```

Esse script copia pra `./play-store-key.json` (path configurado em eas.json submit.production.android.serviceAccountKeyPath).

## 3. Apple Reviewer Account (App Review)

- Criar em Supabase (Auth > Users) um usuario demo: `reviewer@agrorumo.com` com senha forte
- Adicionar em App Store Connect > App Information > Sign-In Required:
  - Email: reviewer@agrorumo.com
  - Senha: <senha criada>
  - Notes: "Conta demo para revisao. Use o login email/senha."

## 4. Pre-build check

```bash
./scripts/validate-prod-env.sh
```

Se tudo verde, prosseguir. Se faltar algo, o script lista os comandos exatos pra corrigir.

## 5. Build + Submit (all platforms)

```bash
eas build --platform all --profile production --auto-submit
```

O `--auto-submit` usa a config em `eas.json > submit.production`. Requer:

- iOS: AuthKey `/Users/manoelnascimento/.keys/AuthKey_YQGT4C9TB8.p8` valido
- Android: `./play-store-key.json` valido + track=production

## 6. Monitorar pos-submit

- **iOS**: TestFlight processa em 30-60min. Verificar em https://appstoreconnect.apple.com
- **Android**: Internal Testing / Production track em ~1h. Verificar em https://play.google.com/console
- **Sentry**: Confirmar que source maps foram uploadados (release + dist batem com versao do binario)

## 7. Rollback (se necessario)

- **iOS**: Nao tem rollback direto. Novo build com hotfix + fast-track review
- **Android**: Play Console > App releases > Halted (para rollout) ou rollback pra versao anterior
- **Codigo**: `git revert HEAD && git push` nao afeta builds ja na store

## Troubleshooting

- `eas secret:list` deprecated — use `eas env:list` (funciona igual)
- EAS submit ERRORED mas binario chegou na ASC: nao re-submeter (gera DUPLICATE), rebuildar com `--auto-submit` pra bumpar buildNumber
- Sentry source maps nao aparecem: verificar `SENTRY_AUTH_TOKEN` tem scope `project:releases` + `project:write`
- Build falha com "Missing env var X": ver `validate-prod-env.sh` — provavelmente secret nao criado ou nao listado em eas.json production.env
