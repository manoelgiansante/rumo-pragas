# Maestro E2E Tests — Rumo Pragas

End-to-end flows for the Rumo Pragas mobile app.

## Apps under test

- iOS bundle: `com.agrorumo.rumopragas`
- Android package: `com.agrorumo.rumopragas`

## Running

```bash
# Legacy authenticated flows receive parameters through Maestro's CLI (never committed)
maestro test -e TEST_EMAIL="$LOCAL_QA_EMAIL" -e TEST_PASSWORD="$LOCAL_QA_PASSWORD" .maestro/

# Single flow
maestro test .maestro/smoke-test.yaml

# With specific device
maestro test --device iPhone_15 .maestro/smoke-test.yaml

# Validate yaml syntax without running
maestro test --include-tags=smoke .maestro/
```

## Flows

| File                         | Purpose                                                                     | Requires auth     |
| ---------------------------- | --------------------------------------------------------------------------- | ----------------- |
| `smoke-test.yaml`            | Launch app, verify ANY landing screen renders                               | No                |
| `onboarding-flow.yaml`       | Walks through all 3 onboarding pages + cold-start gate (Apple 2.1.0)        | No                |
| `auth-flow.yaml`             | Login with test credentials (via testIDs). Used as sub-flow by others.      | No (it does auth) |
| `signup-flow.yaml`           | Switches to signup tab, fills form, checks UI doesn't lock up               | No                |
| `apple-signin-flow.yaml`     | Sign in with Apple button reachable (iOS only)                              | No                |
| `sign-out-flow.yaml`         | Settings → Sign out → Confirm → land on login                               | Yes               |
| `diagnosis-flow.yaml`        | Full diagnosis flow: Home → Camera → Gallery → Crop → Loading → Results     | Yes               |
| `whatsapp-share-flow.yaml`   | Diagnosis result → tap WhatsApp share → graceful fallback (wa.me)           | Yes               |
| `history-flow.yaml`          | Navigate to History tab, exercise search/empty-state                        | Yes               |
| `library-flow.yaml`          | Pest library: crop chips + search                                           | Yes               |
| `ai-chat-flow.yaml`          | AI chat tab: type + send a message                                          | Yes               |
| `free-app-route-flow.yaml`   | Legacy `/paywall` deep link explains the free app and returns safely        | Yes               |
| `ai-consent-flow.yaml`       | Third-party AI disclosure blocks chat transmission until accepted           | Yes               |
| `ai-report-flow.yaml`        | AI response report form and reasons                                         | Yes               |
| `offline-recovery-flow.yaml` | Failed diagnosis exposes retry and explicit discard                         | Yes               |
| `permissions-flow.yaml`      | Camera/gallery permission entry points                                      | Yes               |
| `delete-account-flow.yaml`   | Apple Guideline 5.1.1(v): delete reachable + confirmation (does NOT delete) | Yes               |
| `edit-profile-flow.yaml`     | Settings → Edit Profile → fill → Save                                       | Yes               |
| `settings-flow.yaml`         | Settings tab: assert all rows render + toggle push switch                   | Yes               |
| `aso-screenshots.yaml`       | Eight QA/DRAFT UI captures; synthetic result is never store proof           | Yes               |

## Credentials

Legacy authenticated flows expect `TEST_EMAIL` and `TEST_PASSWORD` through Maestro `-e` parameters
or the CI secret integration. The draft screenshot harness instead expects shell variables
`MAESTRO_TEST_EMAIL` and `MAESTRO_TEST_PASSWORD`; Maestro imports the `MAESTRO_` prefix without
putting credential values in command arguments. No test credential is versioned.

## Selector strategy

**As of 2026-05-20 QA audit: 85+ `testID` props injected across all interactive elements.**

Conventions:

- `<screen>-<element>` (e.g. `ai-consent-accept`, `diagnosis-camera-capture`)
- `<screen>-<element>-<id>` for dynamic items (e.g. `cropselect-crop-soja`, `failed-diagnosis-retry-<id>`)
- Tab bar: `tab-home`, `tab-history`, `tab-library`, `tab-ai-chat`, `tab-settings`

Prefer `id:` selectors in Maestro — they're language-agnostic and survive copy changes.

## Store screenshot QA harness (draft only)

`aso-screenshots.yaml` is an internal regression flow, not a store-submission generator. The
deterministic diagnosis is deliberately labeled `QA/DRAFT` inside the fixture and every capture name
starts with `qa-draft-`. Never copy those files into `store-assets/ios/` or
`store-assets/android/`, and never use them to satisfy `validate:store-assets` or
`status:store-submission`. A synthetic backend response cannot prove the product's real semantic
result.

The harness proxies only `auth/v1`, `rest/v1`, and `storage/v1` to a local Supabase stack. It
intercepts exactly `/functions/v1/diagnose-pragas`; every other Function route, including AI chat,
fails closed. The intercepted route verifies the Bearer token through local `/auth/v1/user`, then
upserts one deterministic row through local REST with the same token so RLS remains authoritative.
It rejects coordinates, unknown fields, stale consent headers, malformed images, and non-local
upstreams. Request targets are checked before URL normalization, so literal, encoded, and
double-encoded dot-segments cannot change the routed endpoint. No production URL is accepted.
Upstream redirects are refused instead of being forwarded to the device, so credentials cannot
leave the configured loopback origin through a redirect response.

The only permitted binary is the dedicated EAS profile `storeQa`. It is an internal development
client, has no update channel, and `app.config.js` turns native Expo Updates off for that profile.
The profile also compiles analytics off, keeps the public Sentry DSN empty, and disables Sentry
uploads. `preview`, `production`, release builds, and any `NODE_ENV` other than `development` are
rejected by the preflight. `app.config.js` repeats the same build-time boundary, including the exact
loopback HTTPS URL/port and matching local anon key, so calling EAS directly cannot bypass it.
Outside `storeQa`, `app.config.js` leaves the normal app configuration unchanged.

The diagnosis client requires HTTPS. Generate a local development certificate for
`127.0.0.1`/`localhost` and trust its local CA only on the disposable simulator or emulator. The
underlying Supabase stack may remain on local HTTP. Before building, run the fail-closed preflight
with the exact loopback URL and local anon key that will be compiled into the development client:

```bash
env -u SENTRY_AUTH_TOKEN \
  EAS_BUILD_PROFILE=storeQa \
  NODE_ENV=development \
  EXPO_PUBLIC_ENABLE_ANALYTICS=false \
  EXPO_PUBLIC_SENTRY_DSN= \
  SENTRY_DISABLE_AUTO_UPLOAD=true \
  EXPO_PUBLIC_SUPABASE_URL=https://127.0.0.1:54329 \
  EXPO_PUBLIC_SUPABASE_ANON_KEY="$LOCAL_SUPABASE_ANON_KEY" \
  STORE_QA_MODE=draft-screenshots \
  STORE_QA_UPSTREAM_URL=http://127.0.0.1:54321 \
  STORE_QA_ANON_KEY="$LOCAL_SUPABASE_ANON_KEY" \
  STORE_QA_LISTEN_PORT=54329 \
  STORE_QA_TLS_CERT_PATH="$LOCAL_QA_CERT_PATH" \
  STORE_QA_TLS_KEY_PATH="$LOCAL_QA_KEY_PATH" \
  npm run validate:store-screenshot-qa-profile
```

Build only with `npx eas build --local --profile storeQa --platform ios` or the same command with
`--platform android`, preserving the environment above. `expo-dev-client` is versioned with the app
so the profile produces a real debug/development runtime where `__DEV__` is true. This QA binary is
technically ineligible for store submission and is not the release candidate.

Start the loopback proxy with the same values. Its startup repeats the preflight before opening a
listener:

```bash
env -u SENTRY_AUTH_TOKEN \
  EAS_BUILD_PROFILE=storeQa \
  NODE_ENV=development \
  EXPO_PUBLIC_ENABLE_ANALYTICS=false \
  EXPO_PUBLIC_SENTRY_DSN= \
  SENTRY_DISABLE_AUTO_UPLOAD=true \
  EXPO_PUBLIC_SUPABASE_URL=https://127.0.0.1:54329 \
  EXPO_PUBLIC_SUPABASE_ANON_KEY="$LOCAL_SUPABASE_ANON_KEY" \
  STORE_QA_MODE=draft-screenshots \
  STORE_QA_UPSTREAM_URL=http://127.0.0.1:54321 \
  STORE_QA_ANON_KEY="$LOCAL_SUPABASE_ANON_KEY" \
  STORE_QA_LISTEN_PORT=54329 \
  STORE_QA_TLS_CERT_PATH="$LOCAL_QA_CERT_PATH" \
  STORE_QA_TLS_KEY_PATH="$LOCAL_QA_KEY_PATH" \
  npm run qa:store-screenshot-server
```

Trust must be established in the disposable device, not by weakening the app transport policy. An
iOS Simulator can receive the local root with `xcrun simctl keychain <UDID> add-root-cert
<rootCA.pem>`. Current Android release apps do not generally trust user-installed roots; use a
disposable non-Play emulator where the local CA is installed as a system trust anchor. If that
cannot be done, treat Android capture as blocked rather than adding a permissive network-security
configuration to the candidate.

Use a dedicated user created only in the local Auth stack. The flow injects
`store-assets/qa-source/soybean-leaf-synthetic-qa.png` with Maestro `addMedia`, then selects the first
item through the official platform-specific Android and iOS picker selectors. On Android, map the
device loopback to the host before launch with
`adb reverse tcp:54329 tcp:54329`. Then keep all generated images inside an ignored artifact
directory:

```bash
MAESTRO_TEST_EMAIL="$LOCAL_QA_EMAIL" MAESTRO_TEST_PASSWORD="$LOCAL_QA_PASSWORD" \
maestro test --device "$QA_DEVICE" \
  --test-output-dir .artifacts/qa-draft-store-screenshots \
  .maestro/aso-screenshots.yaml
```

The two `MAESTRO_` credential variables are mandatory and checked before the app launches. The flow
declines location, clears iOS Keychain state, uses app `testID` selectors, never opens a paywall, and
captures eight real UI states: Home, capture entry, crop selection, local synthetic result, local
History, Library, the initial AI Assistant, and Settings. The Assistant capture waits for the empty
state and does not tap a suggestion, type, or send, so it never calls the AI Edge Function. The
synthetic record uses a non-catalog title and IDs, cannot resolve to a real MIP entry, and stores
severity `none` so the History card cannot invent a `Média` severity from a missing value. Every
capture remains `qa-draft-*`; final App Store and Google Play screenshots still require a separately
evidenced real release candidate result and the unchanged checklist in
`store-assets/SCREENSHOT_CHECKLIST.md`.

## testID inventory (selected high-value)

### Auth

- `login-segment-login`, `login-segment-signup`
- `login-input-email`, `login-input-password`, `login-input-fullname`
- `login-toggle-password-visibility`
- `login-checkbox-terms`
- `login-submit`
- `login-forgot-password`
- `login-apple-signin` (iOS only)

### Onboarding

- `onboarding-skip`, `onboarding-next`, `onboarding-start`

### Home

- `home-cta-diagnose`
- `home-retry-load-data`, `home-retry-load-weather`

### Diagnosis

- `diagnosis-camera-close`, `diagnosis-camera-capture`, `diagnosis-camera-gallery`
- `cropselect-back`, `cropselect-search-input`, `cropselect-crop-<id>`, `cropselect-start-diagnosis`
- `diagnosis-result-close`, `diagnosis-result-share-header`
- `diagnosis-result-share-whatsapp`, `diagnosis-result-export-pdf`
- `diagnosis-result-try-again`, `diagnosis-result-new`, `diagnosis-result-back-home`

### Free-app compatibility route

- `free-app-screen`, `free-app-back`

### Settings

- `settings-edit-profile`
- `settings-row-dark-mode`, `settings-row-language`, `settings-row-notifications`
- `settings-switch-push`
- `settings-row-privacy-policy`, `settings-row-terms`
- `settings-row-share-app`, `settings-row-tutorials`
- `settings-sign-out`, `settings-delete-account`
- `settings-sub-retry`

### Edit Profile

- `edit-profile-back`, `edit-profile-save`
- `edit-profile-input-fullname`, `edit-profile-input-city`
- `edit-profile-state-<XX>` (27 Brazilian states)
- `edit-profile-crop-<id>`

### Library / History / AI Chat / Consent

- `library-chip-all`, `library-chip-<id>`, `library-search`, `library-clear-filter`
- `history-search`, `history-retry`, `history-empty-cta-start`, `history-item-<id>`
- `aichat-input`, `aichat-send`, `aichat-clear`, `aichat-suggestion-<i>`
- `consent-location-accept`, `consent-location-decline`
