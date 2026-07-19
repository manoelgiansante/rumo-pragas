> Recuperado do transcript da sessão 18-19/jul (retornos sobreviventes; sessão original morta por falso-positivo de Usage Policy 19/jul ~10h20). Conteúdo íntegro do agente.

3 commits atômicos, working tree limpo exceto os 2 arquivos proibidos-de-mexer (supabase/.temp/cli-latest artifact + untracked migration). Nenhum PR aberto (ZERO-AC respeitado). Nenhum `--no-verify` (gate ZERO-AE passou em todos os 3 commits).

---

## RELATÓRIO

### ITEM 1 — Lembrete de reinspeção pós-diagnóstico (commit `f554bbb`)

Card opt-in "Lembrar de reinspecionar" adicionado no `app/diagnosis/result.tsx` logo após o feedback (linha ~1026), com dois botões `3d` / `7d` e disclaimer "Lembrete educacional; não é recomendação de aplicação." Renderiza SÓ para pragas reais (`!isHealthy && !isInvalidImage`).

Nova função dedicada `scheduleReinspectionReminder` em `services/notifications.ts:435-489` usa `SchedulableTriggerInputTypes.DATE` (`date: Date`) — **NÃO** reutiliza `scheduleLocalClimateRiskAlert` (cujo cap de 24 h em `notifications.ts:418-420` inviabilizaria 3d/7d). Fail-closed em `isPushNotificationsEnabled()`; nunca dispara prompt nativo (opt-in vive em Settings). Retorna `null` sem `throw` quando o nativo falha. Canal Android `general` (não `climate-risk`).

Analytics `trackReinspectionReminderScheduled(days)` em `services/analytics.ts:246-253` — envia SÓ `{ days }` bucketizado (1..30), sem `pest_id` / `crop`.

**i18n**: 13 chaves × 3 idiomas (pt-BR `i18n/locales/pt-BR.ts:750-770`, en `en.ts:729-749`, es `es.ts:740-760`) — `cardTitle`, `cardDescription`, `option3d`, `option7d`, `option3dA11y`, `option7dA11y`, `scheduledTitle`, `scheduledMessage`, `permissionTitle`, `permissionMessage`, `scheduleError`, `notificationTitle`, `notificationBody`, `notificationBodyNoCrop`, `disclaimer`.

**Gates**: `npm run typecheck` → 0 erros. `npx eslint … --max-warnings 0` → limpo. `npx jest __tests__/services/notifications.test.ts` → **41/41** (10 novos em `scheduleReinspectionReminder`, incluindo shadow paths: push off, days inválidos, title/body vazios, DATE trigger em 3d + 7d **provando** ausência do cap 24 h, clamp 30d, canal `general`, degrade a `null`, truncamento 80/240 chars, propagação de `data`).

### ITEM 2 — Card "Condições climáticas para manejo" (commit `34c2570`)

Novo componente `components/FieldConditionsCard.tsx` renderizado em `app/(tabs)/index.tsx:346` logo abaixo do `WeatherCard`. 3 estados visuais: favorável / atenção / desfavorável — **sem** momento/produto/dose na UI. Disclaimer fixo: "Condições gerais de tempo. Não é recomendação de aplicação — consulte o responsável técnico." (+ en/es).

`services/weather.ts`: URL agora inclui `&hourly=wind_speed_10m,precipitation_probability,relative_humidity_2m&forecast_hours=24` (linha ~262); `OpenMeteoPayload.hourly` **opcional**; `parseOpenMeteoPayload` **derruba** hourly malformado (mantém current+daily); `WeatherData.hourly24h?: HourlySlice[]` (backward-compat: cache pré-existente sem hourly → card esconde). Classificador `classifyFieldConditions24h` (~linha 373) + `FIELD_CONDITIONS_THRESHOLDS` constantes NOMEADAS: `windStrongKmh=25`, `precipProbHighPct=60`, `windBorderlineKmh=15`, `precipProbBorderlinePct=30`. Retorna `null` quando hourly ausente (card some).

**i18n**: 10 chaves × 3 idiomas (`fieldConditions.*`).

**Gates**: `npm run typecheck` → 0 erros. `npx eslint …` → limpo. `npx jest __tests__/services/weather.test.ts __tests__/components/FieldConditionsCard.test.tsx` → **26/26** (5 fetch novos: URL contém hourly, cap 24, backward-compat sem hourly, hourly malformado ≠ quebra o fetch inteiro, exposição correta; 9 do classificador: null/vazio/não-array, favorable, wind_strong, precip_high, borderline wind só, borderline precip só, ambos fortes = unfavorable sem stack de borderlines, peak ignora NaN, janela cortada em 24; 4 do card: null=não renderiza + label/hint/disclaimer para cada status). Alerts + WeatherCard tests continuam verdes (`21/21` + `6/6`).

### ITEM 3 — Wire FCM Android (commit `b32628e`)

`expo-app/app.json` linha 167: `"googleServicesFile": "./google-services.json"` (dentro de `android`). Arquivo copiado de `~/.keys/pragas-google-services.json` para `expo-app/google-services.json`, **cobertoo pelo `.gitignore` linha 20** (`git check-ignore` retorna `expo-app/.gitignore:20:google-services.json`; `git status --short expo-app/google-services.json` vazio; `git ls-files` vazio). Nada de secret entrou no commit.

`scripts/native-signing-policy.mjs` **não precisou mudar** — `policy.firebase` (linhas 44-51) já tem `appId=1:599510455577:android:e80fa19b86b10e36cb6188`, `packageName=com.agrorumo.rumopragas`, `projectId=agrorumo`, `projectNumber=599510455577` — 1:1 com o snapshot copiado. Provado ao vivo: `node -e 'validateGoogleServicesConfiguration(...)'` retorna `{appId, configurationSha256: 74f588…, packageName, projectId, projectNumber}` sem `fail()`.

**Gates**: `node --test scripts/test-native-local-production-build.mjs` → **19/19**. `npm run typecheck` → 0 erros.

### Fora de escopo (não bloqueia)

- `remotePush.androidConfigured` continua derivado de `Boolean(process.env.GOOGLE_SERVICES_JSON)` em `app.config.js:75` — em build local **sem** env var, `isRemotePushBuildConfigured()` retorna `false` e o registro remoto Android segue no fail-closed. Fluxo correto para EAS/CI (canonical). Se quisermos habilitar remote push em build local só com o arquivo presente, seria mudança separada em `app.config.js` (afeta `validate-native-config.mjs:278-281` — validador locka a expressão exata) e é gate CEO.
- Pré-existentes NÃO tocados: `supabase/.temp/cli-latest` (artefato), `supabase/migrations/20260713120000_paid_photo_quota.sql` (untracked, proibido), 3 falhas antigas de `validate-native-config.mjs` (buildNumber/versionCode estáticos + adaptive-icon), `expo-app/store-assets/STORE_LISTING.md` (gate CEO).

**Arquivos relevantes:**
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/services/notifications.ts`
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/services/analytics.ts`
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/services/weather.ts`
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/app/diagnosis/result.tsx`
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/app/(tabs)/index.tsx`
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/components/FieldConditionsCard.tsx`
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/i18n/locales/{pt-BR,en,es}.ts`
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/app.json`
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/__tests__/services/{notifications,weather}.test.ts`
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/__tests__/components/FieldConditionsCard.test.tsx`
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/google-services.json` (local, git-ignored)
