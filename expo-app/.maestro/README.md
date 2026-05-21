# Maestro E2E Tests — Rumo Pragas

End-to-end flows for the Rumo Pragas mobile app.

## Apps under test

- iOS bundle: `com.agrorumo.rumopragas`
- Android package: `com.agrorumo.rumopragas`

## Running

```bash
# All flows
maestro test .maestro/

# Single flow
maestro test .maestro/smoke-test.yaml

# With specific device
maestro --device iPhone_15 test .maestro/smoke-test.yaml

# Validate yaml syntax without running
maestro test --include-tags=smoke .maestro/
```

## Flows (12 critical paths, post 2026-05-20 QA audit)

| File                          | Purpose                                                                     | Requires auth     |
| ----------------------------- | --------------------------------------------------------------------------- | ----------------- |
| `smoke-test.yaml`             | Launch app, verify ANY landing screen renders                               | No                |
| `onboarding-flow.yaml`        | Walks through all 4 onboarding pages + cold-start gate (Apple 2.1.0)        | No                |
| `auth-flow.yaml`              | Login with test credentials (via testIDs). Used as sub-flow by others.      | No (it does auth) |
| `signup-flow.yaml`            | Switches to signup tab, fills form, checks UI doesn't lock up               | No                |
| `apple-signin-flow.yaml`      | Sign in with Apple button reachable (iOS only)                              | No                |
| `sign-out-flow.yaml`          | Settings → Sign out → Confirm → land on login                               | Yes               |
| `diagnosis-flow.yaml`         | Full diagnosis flow: Home → Camera → Gallery → Crop → Loading → Results     | Yes               |
| `whatsapp-share-flow.yaml`    | Diagnosis result → tap WhatsApp share → graceful fallback (wa.me)           | Yes               |
| `history-flow.yaml`           | Navigate to History tab, exercise search/empty-state                        | Yes               |
| `library-flow.yaml`           | Pest library: crop chips + search                                           | Yes               |
| `ai-chat-flow.yaml`           | AI chat tab: type + send a message                                          | Yes               |
| `paywall-flow.yaml`           | Settings → Upgrade → paywall plans + restore + legal links                  | Yes               |
| `restore-purchases-flow.yaml` | Apple Guideline 3.1.1: restore reachable from Settings + Paywall            | Yes               |
| `delete-account-flow.yaml`    | Apple Guideline 5.1.1(v): delete reachable + confirmation (does NOT delete) | Yes               |
| `edit-profile-flow.yaml`      | Settings → Edit Profile → fill → Save                                       | Yes               |
| `settings-flow.yaml`          | Settings tab: assert all rows render + toggle push switch                   | Yes               |
| `aso-screenshots.yaml`        | Capture ASO screenshots for App Store + Play Store                          | No                |

## Credentials

Test user: `test_diag_full@mailinator.com` / `Validator-2026-Rumo!`

## Selector strategy

**As of 2026-05-20 QA audit: 85+ `testID` props injected across all interactive elements.**

Conventions:

- `<screen>-<element>` (e.g. `paywall-cta-subscribe`, `diagnosis-camera-capture`)
- `<screen>-<element>-<id>` for dynamic items (e.g. `cropselect-crop-soja`, `paywall-plan-pro`, `edit-profile-state-SP`)
- Tab bar: `tab-home`, `tab-history`, `tab-library`, `tab-ai-chat`, `tab-settings`

Prefer `id:` selectors in Maestro — they're language-agnostic and survive copy changes.

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
- `home-trial-remaining`, `home-trial-exhausted`
- `home-retry-load-data`, `home-retry-load-weather`

### Diagnosis

- `diagnosis-camera-close`, `diagnosis-camera-capture`, `diagnosis-camera-gallery`
- `cropselect-back`, `cropselect-search-input`, `cropselect-crop-<id>`, `cropselect-start-diagnosis`
- `diagnosis-result-close`, `diagnosis-result-share-header`
- `diagnosis-result-share-whatsapp`, `diagnosis-result-export-pdf`
- `diagnosis-result-try-again`, `diagnosis-result-new`, `diagnosis-result-back-home`

### Paywall

- `paywall-close`, `paywall-plan-free`, `paywall-plan-pro`, `paywall-plan-enterprise`
- `paywall-cta-subscribe`, `paywall-restore-purchases`
- `paywall-legal-privacy`, `paywall-legal-terms`

### Settings

- `settings-edit-profile`, `settings-row-current-plan`, `settings-row-monthly-usage`
- `settings-upgrade-plan`, `settings-restore-purchases`, `settings-manage-subscription`
- `settings-row-dark-mode`, `settings-row-language`, `settings-row-notifications`
- `settings-switch-push`
- `settings-row-privacy`, `settings-row-terms`, `settings-row-check-updates`
- `settings-row-version`, `settings-row-contact-support`
- `settings-signout`, `settings-delete-account`
- `settings-sub-retry`

### Edit Profile

- `edit-profile-back`, `edit-profile-save`
- `edit-profile-input-fullname`, `edit-profile-input-city`
- `edit-profile-state-<XX>` (27 Brazilian states)
- `edit-profile-crop-<id>`

### Library / History / AI Chat / Consent

- `library-chip-all`, `library-chip-<id>`, `library-search-input`, `library-clear-filter`
- `history-search-input`, `history-retry`, `history-empty-cta-start`, `history-item-<id>`
- `aichat-input`, `aichat-send`, `aichat-clear`, `aichat-suggestion-<i>`
- `consent-location-accept`, `consent-location-decline`
