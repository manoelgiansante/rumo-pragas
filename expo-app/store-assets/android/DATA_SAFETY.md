# Data Safety — Google Play Console (Rumo Pragas)

Declaracao pronta pra copiar em:
**Play Console -> App content -> Data safety**

Package: `com.agrorumo.rumopragas`
URL privacidade: https://pragas.agrorumo.com/privacy

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

| Data type | Collected | Shared                                       | Purpose                                   | Optional? |
| --------- | --------- | -------------------------------------------- | ----------------------------------------- | --------- |
| Photos    | Yes       | Yes (Supabase para armazenar e IA processar) | App functionality (diagnostico de pragas) | Optional  |

### Location

| Data type            | Collected | Shared | Purpose                            | Optional? |
| -------------------- | --------- | ------ | ---------------------------------- | --------- |
| Approximate location | Yes       | No     | App functionality (clima regional) | Optional  |
| Precise location     | No        | -      | -                                  | -         |

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

---

## 3. Third parties compartilhados

Declarar no campo "Shared with third parties":

- **Supabase** (backend/database) — armazena conta, fotos, historico de diagnosticos
- **Sentry** (crash reports + diagnosticos) — erros e performance
- **RevenueCat** (billing) — gerencia assinaturas
- **Google Play Billing** (compras in-app) — processamento de pagamento
- **OneSignal** (push notifications) — opt-in, usado apenas se usuario aceitar

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

Ultima atualizacao: 2026-04-17
