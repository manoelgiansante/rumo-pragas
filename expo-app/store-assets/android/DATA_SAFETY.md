# Data Safety — Google Play Console (Rumo Pragas)

Declaracao pronta pra copiar em:
**Play Console -> App content -> Data safety**

Package: `com.agrorumo.rumopragas`
URL privacidade: https://pragas.agrorumo.com/privacy

> **REGRA DE OURO:** a declaracao deve bater 1:1 com as permissoes do AAB
> (`app.json` -> `android.permissions`). Mismatch = REJEICAO.
> AAB atual declara: `CAMERA`, `ACCESS_FINE_LOCATION` (precisa),
> `ACCESS_COARSE_LOCATION` (aproximada), `READ_MEDIA_IMAGES`, `RECORD_AUDIO`,
> `MODIFY_AUDIO_SETTINGS`, `POST_NOTIFICATIONS`.
> Conferido contra o codigo em 2026-06-27 (branch `audit/golive-2026-06-27`).

---

## 1. Data collection and security

**Does your app collect or share any of the required user data types?**
-> Yes

**Is all of the user data collected by your app encrypted in transit?**
-> Yes (HTTPS/TLS 1.2+ obrigatorio em todas as APIs)

**Do you provide a way for users to request that their data be deleted?**
-> Yes

- In-app: Configuracoes -> Conta -> Excluir conta
- Via web: https://pragas.agrorumo.com/privacy (formulario de exclusao)

---

## 2. Data types collected

Para cada item abaixo marcar: **Collected** + finalidade + se e obrigatorio.

### Personal info

| Data type     | Collected | Shared | Purpose                               | Optional? |
| ------------- | --------- | ------ | ------------------------------------- | --------- |
| Email address | Yes       | No     | Account management, App functionality | Required  |
| Name          | Yes       | No     | Account management                    | Optional  |
| User IDs      | Yes       | No     | Account management, Analytics         | Required  |

### Photos and videos

| Data type | Collected | Shared                                            | Purpose                                   | Optional? |
| --------- | --------- | ------------------------------------------------- | ----------------------------------------- | --------- |
| Photos    | Yes       | Yes (backend Supabase `diagnose` -> IA Anthropic) | App functionality (diagnostico de pragas) | Required  |

Origem: `services/diagnosis.ts` envia `image_base64` ao edge `/functions/v1/diagnose`,
que repassa a imagem ao provedor de IA (Anthropic). Permissoes no AAB: `CAMERA` +
`READ_MEDIA_IMAGES`.

### Location

> **CORRIGIDO 2026-06-27:** o AAB declara `ACCESS_FINE_LOCATION` (precisa) +
> `ACCESS_COARSE_LOCATION` (aproximada), e a coordenada e ENVIADA a terceiros.
> Antes este doc dizia "Precise = No / Shared = No" — era MISMATCH e causaria rejeicao.

| Data type            | Collected | Shared                                             | Purpose                            | Optional? |
| -------------------- | --------- | -------------------------------------------------- | ---------------------------------- | --------- |
| Approximate location | Yes       | Yes (API de clima Open-Meteo + backend `diagnose`) | App functionality (clima regional) | Optional  |
| Precise location     | Yes       | Yes (API de clima Open-Meteo + backend `diagnose`) | App functionality (clima regional) | Optional  |

Origem: `hooks/useLocation.ts` captura a posicao; `services/weather.ts` envia
`latitude`/`longitude` para `api.open-meteo.com` (terceiro); `services/diagnosis.ts`
envia a coordenada (com consentimento, _fail-closed_) ao backend, que a usa no contexto
do diagnostico. Opcional: o app funciona sem localizacao (sem consentimento, nada e enviado).

### App activity

| Data type                    | Collected | Shared                                    | Purpose                      | Optional? |
| ---------------------------- | --------- | ----------------------------------------- | ---------------------------- | --------- |
| App interactions             | Yes       | Yes (Sentry crash reports, analytics)     | Analytics, App functionality | Required  |
| In-app search history        | No        | -                                         | -                            | -         |
| Other user-generated content | Yes       | Yes (Supabase, historico de diagnosticos) | App functionality            | Required  |

### App info and performance

| Data type   | Collected | Shared       | Purpose                      | Optional? |
| ----------- | --------- | ------------ | ---------------------------- | --------- |
| Crash logs  | Yes       | Yes (Sentry) | Analytics, App functionality | Required  |
| Diagnostics | Yes       | Yes (Sentry) | Analytics                    | Required  |

### Financial info

| Data type        | Collected | Shared                                | Purpose                         | Optional? |
| ---------------- | --------- | ------------------------------------- | ------------------------------- | --------- |
| Purchase history | Yes       | Yes (RevenueCat, Google Play Billing) | App functionality (assinaturas) | Optional  |

### Device or other IDs

| Data type           | Collected | Shared                                          | Purpose   | Optional? |
| ------------------- | --------- | ----------------------------------------------- | --------- | --------- |
| Device or other IDs | Yes       | Yes (Sentry para distinguir crashes por device) | Analytics | Required  |

### Audio / Voz — **NAO DECLARAR** no estado atual

- `EXPO_PUBLIC_VOICE_ENABLED=false` (default em `.env.example`; gate em `components/voiceFlag.ts`).
  Com a voz OFF, nenhum audio e gravado/transmitido -> **nao declarar "Voice or sound recordings".**
- ⚠️ **CONFLITO A RESOLVER ANTES DO UPLOAD:** o AAB ainda inclui `RECORD_AUDIO` +
  `MODIFY_AUDIO_SETTINGS` (`app.json`). Se a voz ficar OFF em producao, **remover essas
  permissoes do AAB** (ver item de microfone). Se a voz for ON, declarar aqui:
  **Voice or sound recordings — Collected SIM, Shared SIM** (audio vai ao servico de
  transcricao), Purpose `App functionality`, Optional SIM. Declaracao e permissao precisam casar 1:1.

---

## 3. Third parties compartilhados

Declarar no campo "Shared with third parties":

- **Supabase** (backend/database) — armazena conta, fotos, historico de diagnosticos
- **Anthropic (IA)** — recebe a foto + contexto (via edge `diagnose`) para analise da praga
- **Open-Meteo** (`api.open-meteo.com`) — recebe `latitude`/`longitude` para clima regional
- **Sentry** (crash reports + diagnosticos) — erros e performance
- **RevenueCat** (billing) — gerencia assinaturas (`react-native-purchases`)
- **Google Play Billing** (compras in-app) — processamento de pagamento
- **Expo / Expo Application Services** (push notifications via `expo-notifications`)
  — token de push opt-in, usado apenas se o usuario aceitar a permissao `POST_NOTIFICATIONS`

Nenhum dado e vendido a terceiros para publicidade.

---

## 4. Security practices

- [x] Data is encrypted in transit (HTTPS/TLS 1.2+)
- [x] You can request data deletion
- [x] Follows Families Policy: **No** (app nao e voltado pra criancas)

---

## 5. Copy-paste pro campo "Privacy policy URL"

```
https://pragas.agrorumo.com/privacy
```

---

## 6. Checklist antes de submeter

- [ ] Todos os dados listados acima marcados no Play Console
- [ ] Privacy policy URL respondendo 200 OK
- [ ] Formulario de exclusao de conta funcionando em-app
- [ ] Formulario de exclusao via web funcionando
- [ ] App testado sem conceder permissoes opcionais (localizacao/foto) — nao deve crashar
- [ ] Confirmar provedor de push: app usa **Expo push** (`expo-notifications`), NAO OneSignal
- [ ] Audio/voz: confirmar `EXPO_PUBLIC_VOICE_ENABLED=false` no AAB final ANTES de submeter
      (se OFF, NAO declarar "Voice or sound recordings" — ver item de microfone)

Ultima atualizacao: 2026-06-28 (branch audit/golive-2026-06-27 — alinhado 1:1 com permissoes do AAB)
