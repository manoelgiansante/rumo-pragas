> Recuperado do transcript da sessão 18-19/jul (retornos sobreviventes; sessão original morta por falso-positivo de Usage Policy 19/jul ~10h20). Conteúdo íntegro do agente.

**70/70 suítes, 734/734 testes passam**. Sem regressão.

═══════════════════════════════════════
RELATÓRIO VERIFY ADVERSARIAL — FASE C
═══════════════════════════════════════

**1. Lembrete `f554bbb` — APROVADO**
- (a) Trigger DATE confirmado (`services/notifications.ts:463-469` — `SchedulableTriggerInputTypes.DATE` com `date: new Date(Date.now() + days * 86_400_000)`, sem `seconds` cap 24h). Fireproof: helper novo dedicado (`scheduleReinspectionReminder`), não reusa `scheduleLocalClimateRiskAlert`.
- (b) Guard `!isHealthy && !isInvalidImage` confirmado em `app/diagnosis/result.tsx:1027`. Card só aparece em hipótese de praga real.
- (c) Permissão negada = `Alert` educacional + sem chamar API nativa de prompt (`isPushNotificationsEnabled()` gate na linha `result.tsx:611-615`). Sem crash.
- (d) i18n: **15 chaves** em `pt-BR.ts:761-782` / `en.ts:740-761` / `es.ts:751-772` (descrição do commit dizia 10; verifiquei 15 em todos — cobertura maior, não menor). Nenhuma chave crua vaza.
- (e) A11y: `accessibilityRole="button"`, `accessibilityLabel={t('reinspection.option{3,7}dA11y')}`, `accessibilityState={disabled, selected, busy}`. Perfeito.
- (f) `cancelAllScheduledNotificationsAsync` só chamado em `revokePushDelivery` (linha 77), não no boot. Notificação sobrevive a reinício.
- Testes `notifications.test.ts`: PASS.

**2. Card climático `34c2570` — APROVADO**
- (a) **Copy nos 3 idiomas AUDITADA linha a linha**: pt-BR/en/es NÃO contém "pulverize/aplique/melhor hora de aplicar/produto/dose/threshold numérico". Status = 3 labels genéricos ("Favorável/Atenção/Desfavorável"). Disclaimer FIXO em todos: pt-BR "Não é recomendação de aplicação — consulte o responsável técnico." / en "Not a recommendation to apply any product — consult your licensed agronomist." / es "no es recomendación de aplicación". Conforme CONAR/CDC + contrato §"não prescrição". Disclaimer renderizado em `FieldConditionsCard` via `t('fieldConditions.disclaimer')`.
- (b) Shadow paths: `parseOpenMeteoPayload` (weather.ts:170-190) DERRUBA `hourly` malformado retornando payload sem esse bloco (`delete root.hourly`). `classifyFieldConditions24h` retorna `null` para `undefined/null/[]/não-array` → Home condicional `{fieldConditions && ...}` esconde o card. Cache antigo sem `hourly24h` = card some, `WeatherCard` intacto.
- (c) URL Open-Meteo estendida com `&hourly=...&forecast_hours=24` — 5 testes novos de `weather.test.ts` cobrem inclusão da URL, cap 24, ausência de hourly, malformação, exposição hourly24h. Testes antigos passam.
- Testes `weather.test.ts` (37), `FieldConditionsCard.test.tsx` (7), `WeatherCard.test.tsx`, `alerts.test.ts`: PASS.
- (d) Posição na Home (`index.tsx:354`): card renderiza APÓS `WeatherCard` e ANTES do CTA `home-cta-diagnose`. Um card compacto de 3-4 linhas empurra o CTA para baixo por ~120px — aceitável (WeatherCard já é maior). Não sequestra a dobra.

**3. FCM `b32628e` — APROVADO COM NOTA**
- (a) Diff = 1 linha (`app.json:167`). `git ls-files expo-app/google-services.json` retorna vazio. `git check-ignore -v` = `expo-app/.gitignore:20`. Confirmado.
- (b) **RESPOSTA À PERGUNTA CENTRAL do PR-17**: com o binário buildado LOCALMENTE, o token FCM NÃO é registrado. Fluxo:
  - `app.config.js:60,70,75` deriva `googleServicesFile` EXCLUSIVAMENTE de `process.env.GOOGLE_SERVICES_JSON`. Se a env não está setada, `googleServicesFile = ''` → `androidConfigured = false`.
  - `services/notifications.ts:25-28,245-247` faz `isRemotePushBuildConfigured()` retornar `false` → `registerForPushNotificationsAsync` retorna `null` **fail-closed**. Sem token FCM salvo.
  - A adição no `app.json` (`b32628e`) faz o `expo prebuild` copiar o arquivo `google-services.json` pro Android nativo (habilita a capability FCM no APK), MAS não seta a flag `androidConfigured` do JS bundle. **Duas fontes desconectadas.**
  - **MENOR CAMINHO SEGURO**: exportar `GOOGLE_SERVICES_JSON=./google-services.json` no script de build local (`eas-local-production-build.sh` ou wrapper) ANTES do `eas build --local`. NÃO alterar `app.config.js` (o `validate-native-config.mjs:279-281` exige a string literal `'androidConfigured: Boolean(googleServicesFile)'` — mudança quebra o validator). Alternativa complementar (defense-in-depth, opcional): fazer `androidConfigured = Boolean(googleServicesFile) || (config?.android?.googleServicesFile ? true : false)` mas isso quebra o validador atual literal — precisaria atualizar a asserção JUNTO. Recomendação canônica: **setar a env no wrapper de build**.
- (c) `node scripts/validate-native-config.mjs` EXIT=1 com 3 falhas (buildNumber/versionCode estáticos + adaptive-icon canônico). Grep em `native-local-production-build.mjs` e `eas-local-production-build.sh` = **ZERO matches** para "validate-native-config" ou "validate:native-config". Script é standalone (só via `npm run validate:native-config`) e **NÃO bloqueia** o build local protegido. As 3 falhas são débito reportado pelo validator, não fail do build.

**4. Suíte de regressão — 70/70 suítes, 734/734 testes PASS** (21s, sem flakes).

**Fixes atômicos**: NENHUM feito. Nenhuma refutação levantou item pequeno.

**VEREDITO GERAL**: APROVADO. Branch pronta pra Fase D/E. **RECOMENDAÇÃO OPERACIONAL** (não bloqueante para verify, mas obrigatória para push remoto Android funcionar de ponta a ponta): antes do próximo build local Android que precisar de FCM, exportar `GOOGLE_SERVICES_JSON=./google-services.json` (relativo ao `expo-app/`) no wrapper de build — sem isso, o binário roda mas o registro de token remoto fica silenciosamente desligado. Documentar isso em `BUILD_CHECKLIST.md` (fora do escopo desta verify).

**Arquivos-chave**:
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/services/notifications.ts`
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/app/diagnosis/result.tsx`
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/services/weather.ts`
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/components/FieldConditionsCard.tsx`
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/app/(tabs)/index.tsx`
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/app.config.js`
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/scripts/validate-native-config.mjs`
- `/Users/manoelnascimento/AgroRumo Projetos/Apps/rumo-pragas/expo-app/i18n/locales/{pt-BR,en,es}.ts`
