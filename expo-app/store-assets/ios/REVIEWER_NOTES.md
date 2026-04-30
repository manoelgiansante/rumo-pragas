# Rumo Pragas — App Review Notes

Hello App Review Team,

Thank you for reviewing Rumo Pragas. This document provides a demo account and
testing instructions so you can fully evaluate the app.

---

## Demo Account

- **Email:** reviewer@agrorumo.com
- **Password:** `rCrelvopjjIY2OYJlFytkFdz`

> The demo account has an **active Pro subscription** (RevenueCat sandbox) so
> you can test all premium features (unlimited diagnoses, history, advanced
> recommendations).

---

## What the App Does

Rumo Pragas is an AI-powered agricultural pest and disease diagnosis tool for
farmers in Brazil. Users photograph affected plants and receive a diagnosis
with recommended treatments within seconds.

Target audience: farmers, agronomists, and agricultural consultants.

---

## How to Test the Main Flow

1. **Login** with the demo credentials above (or create a new account — signup
   takes <30 seconds and grants a 3-day free trial of Pro).
2. **Onboarding:** select a crop (e.g. "Soja" / soybean), accept location
   permission when prompted (used to enrich diagnoses with weather data —
   optional and can be denied).
3. **Diagnose:**
   - Tap the large green camera button on the home screen.
   - Either take a photo or pick one from the photo library. For your
     convenience there is a pre-loaded test image under
     `Biblioteca > Exemplos` (tap any pest example to auto-run a diagnosis).
   - Wait 5–15 seconds for the AI diagnosis to complete.
   - Review the result: pest/disease name, confidence score, symptoms,
     treatment recommendations, and prevention tips.
4. **History:** diagnoses are saved automatically and appear under the "Historico"
   tab.
5. **Library:** the "Biblioteca" tab contains a searchable catalog of common
   pests and diseases (works fully offline).

---

## Paywall / In-App Purchase Testing

- The paywall screen is reachable from `Configuracoes > Gerenciar Assinatura`
  or by attempting a 4th diagnosis on a free account.
- IAP is provided via **RevenueCat** (sandbox-configured for review builds).
- Products offered: Monthly Pro (R$ 19.90/mo) and Annual Pro (R$ 149.00/yr)
  with a 3-day free trial for new users.
- "Restore Purchases" is available on the paywall and in Settings.

If the paywall shows "Em breve" (coming soon), the RevenueCat API key is not
configured — please reach out to support before rejecting and we will
immediately provide an updated build.

---

## Data & Privacy

- All data is encrypted in transit (TLS) and at rest (Supabase + AES-256).
- We use Supabase (EU-West) as our backend.
- AI diagnosis is performed by Anthropic Claude via our server-side edge
  function — photos are not retained after the diagnosis completes.
- We do NOT track users across apps or websites. No IDFA requested.
- Account deletion is available in-app: `Configuracoes > Conta > Excluir Conta`.
- Privacy Policy: https://pragas.agrorumo.com/privacidade
- Terms of Service: https://pragas.agrorumo.com/termos
- Account deletion (web): https://pragas.agrorumo.com/delete-account

---

## Location Permission

Location is used only to fetch local weather conditions (temperature, humidity,
rainfall) which improve the accuracy of pest diagnoses. It is **optional** and
the app works fully without it.

---

## Camera & Photo Library Permissions

The camera is used to photograph affected plants for AI diagnosis. The photo
library is used as an alternative source for the same purpose. Photos are sent
to our server for analysis and are **not retained** after the diagnosis is
returned.

---

## Contact

If you encounter any issue during review:

- **Email:** support@agrorumo.com
- **Support web:** https://pragas.agrorumo.com/
- **Response time:** under 4 business hours (Brasilia time, UTC-3)
- **Developer:** Manoel Nascimento
- **Company:** AgroRumo

Thank you for your time and feedback!
