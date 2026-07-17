# App Review Notes — Rumo Pragas 1.0.11

## Sign-in

The app requires an account to persist results and currently provides in-app deletion of Rumo
Pragas data. The shared AgroRumo sign-in identity is retained, as disclosed before confirmation
and in the Privacy Policy. This candidate must not be submitted until the full-account deletion
blocker in `store-assets/ACCOUNT_DELETION_BLOCKER.md` is resolved.

Reviewer credentials are intentionally not stored in this repository. Put the dedicated review account only in App Store Connect, under App Review Information, or in the equivalent secure Google Play app-access field. Retrieve the password from the approved secret manager. Never paste it into source control, tickets, screenshots, build logs, or these notes.

If the secure review account has not been created or its password has expired, submission is blocked until an authorized operator updates the store console.

## Review path

1. Sign in with the review account supplied in the secure store field.
2. On Home, choose the action to identify a pest.
3. Select a crop and take a photo, or use the operating-system photo picker.
4. Keep the device online. After versioned AI consent, the app sends the image to its backend. Agrio is the default visual provider; Anthropic Claude can be selected by secure server configuration.
5. The result is a probabilistic identification hypothesis with a confidence value and, when available, alternatives. It is not a definitive diagnosis or prescription.
6. Open History to view the structured result. The current backend record does not write an image URL to diagnosis history.
7. Open the AI assistant. After versioned AI consent, Google Gemini is the default chat provider; Anthropic Claude can be selected by secure server configuration.
8. Open Settings to review Privacy, Terms, Support, location consent and in-app deletion of Rumo Pragas data.

## Connectivity

Image analysis requires an internet connection. When an upload fails because connectivity is unavailable, the request can remain in a local queue and retry after the network returns. The model does not run offline.

## Permissions

- Camera: used only when the reviewer chooses to capture a crop image.
- Photo library: selection uses the operating-system picker; broad photo-library access is not requested on Android.
- Approximate location: optional and used for local weather and optional context only after consent.
- Notifications: optional.
- Microphone, precise location and background media access are not required by the release configuration.

The app remains usable if optional location and notification permissions are denied.

## Business model

The app is free. There is no active subscription, paid tier, trial, paywall, StoreKit purchase, Google Play Billing purchase, RevenueCat purchase flow or restoration flow in this release.

## Safety and legal scope

AI output can be wrong. The app does not issue a receituário agronômico and does not replace a field inspection or a legally qualified professional. Product acquisition and application must follow Lei nº 14.785/2023, Resolução Confea nº 1.149/2025 and the official AGROFIT registry.

## Privacy

After versioned AI consent, the image is sent through the backend to the configured visual provider (Agrio by default, Anthropic Claude when selected). Account and structured result data use Supabase. Optional coordinates may be sent to Open-Meteo for weather; the candidate minimizes future persisted coordinates to two decimal places. Crash diagnostics use Sentry when configured. Chat requests use Gemini by default or Anthropic Claude when selected by secure server configuration.

Deletion of Rumo Pragas app data is available in Settings. It retains the shared AgroRumo identity, shared unscoped historical records and the minimum unlink marker described in the Privacy Policy. Public instructions are available at:

- https://pragas.agrorumo.com/delete-account
- https://pragas.agrorumo.com/privacidade
- https://pragas.agrorumo.com/suporte

Those controls are not represented as deletion of the entire shared account. Store submission is
blocked until a coordinated global deletion contract or formal store/legal acceptance is recorded.
