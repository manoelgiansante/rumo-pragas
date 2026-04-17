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
```

## Flows

| File                  | Purpose                                                                 | Requires auth     |
| --------------------- | ----------------------------------------------------------------------- | ----------------- |
| `smoke-test.yaml`     | Launch app, verify home screen loads                                    | No                |
| `auth-flow.yaml`      | Login with test credentials                                             | No (it does auth) |
| `diagnosis-flow.yaml` | Full diagnosis flow: Home → Camera → Gallery → Crop → Loading → Results | Yes               |
| `history-flow.yaml`   | Navigate to History tab and verify list                                 | Yes               |
| `paywall-flow.yaml`   | Trigger paywall by exceeding free tier limit                            | Yes               |

## Credentials

Test user: `test_diag_full@mailinator.com` / `Validator-2026-Rumo!`

## Selector strategy

No `testID` is set in the codebase yet. Flows rely on:

1. Visible Portuguese text from `i18n/locales/pt-BR.ts`
2. `accessibilityLabel` / `tabBarAccessibilityLabel` where defined

**TODO: add `testID` props** in key components for more robust selectors:

- `testID="login-email-input"` — `app/(auth)/login.tsx` email TextInput
- `testID="login-password-input"` — `app/(auth)/login.tsx` password TextInput
- `testID="login-submit-button"` — `app/(auth)/login.tsx` submit button
- `testID="home-diagnose-card"` — `app/(tabs)/index.tsx` "Diagnosticar Praga" TouchableOpacity
- `testID="camera-take-photo-button"` — `app/diagnosis/camera.tsx`
- `testID="camera-gallery-button"` — `app/diagnosis/camera.tsx`
- `testID="crop-start-diagnosis-button"` — `app/diagnosis/crop-select.tsx`
- `testID="tab-home"`, `testID="tab-history"`, `testID="tab-library"`, `testID="tab-ai-chat"`, `testID="tab-settings"` — `app/(tabs)/_layout.tsx`
- `testID="paywall-close"`, `testID="paywall-subscribe"` — `app/paywall.tsx`
