# Release build checklist — Rumo Pragas

Candidate version: 1.0.11

Node baseline: 22.22.3
NPM baseline: 10.9.8

iOS bundle ID: com.agrorumo.rumopragas
Android package: com.agrorumo.rumopragas

The read-only EAS inventory on 2026-07-14 observed iOS build 63 and Android version code 54 as
the latest remote values. They are evidence, not candidate numbers: query EAS again immediately
before building and let the production profile's remote `autoIncrement` reserve the next values.
The legacy local `app.json` build number is not release authority.

## Reproducible local validation

Run from expo-app:

1. npm ci
2. npx --yes expo-doctor@1.20.0
3. npm run lint
4. npm run typecheck
5. npm test -- --coverage --ci
6. npx expo export --platform web --output-dir dist

Every command is blocking. Do not weaken warnings, skip suites or convert failures into non-blocking status.

## Native configuration audit

- Confirm app version and record the actual remotely reserved iOS build number and Android version
  code from the immutable EAS artifacts.
- Confirm Android target and compile SDK 36 and minimum SDK 24.
- Confirm iOS deployment target and the current App Store Xcode/SDK requirement on build day.
- Confirm camera, approximate location and notification purpose strings.
- Confirm precise location, broad media access and microphone remain blocked for this release.
- Confirm PrivacyInfo.xcprivacy, entitlements, universal/app links, icons and splash assets are embedded.
- Confirm release Sentry DSN without exposing credentials. For native EAS Build, verify the official
  Expo/Sentry plugin's automatic source-map upload in build logs and then prove symbolication with a
  controlled non-PII test event. Do not run the retired custom finalization hook.
- Confirm the app contains no active purchase SDK path or store product.

## Secrets and signing

The repository must contain only secret names and setup instructions. Values belong in the approved secret manager or store/build service.

Signing material was detected locally for both native projects. Before classifying a credential blocker,
attempt the iOS archive and Android release bundle without printing aliases, passwords, certificate names
or profile contents.

Release operations may still require:

- Apple distribution and App Store Connect authorization.
- Android upload keystore and Play service-account authorization.
- Expo/EAS authorization if cloud build is selected.
- Sentry authorization for release symbol upload.
- Runtime Supabase and provider configuration for the release environment.

Only a missing or expired value proven by the build attempt is a precise external blocker. Never substitute a credential from another AgroRumo app.

## Build sequence

1. Tag the exact candidate commit in the release record.
2. Run `./scripts/validate-prod-env.sh production`; it uses the current EAS Environment command,
   checks names only and never prints values.
3. Run the reproducible validation suite.
4. Generate iOS and Android release artifacts with `./scripts/launch.sh --profile production`.
   This command is build-only and contains no submit path.
5. Inspect the signed IPA and AAB for identifiers, permissions, SDKs and versions.
6. Install through TestFlight/Internal testing, not by direct production promotion.
7. Execute smoke tests: fresh install, login, social login, permissions denied, capture, picker, online result, queued retry, history, PDF sharing, assistant, settings and deletion.
8. Verify the actual remote build numbers, Sentry release mapping, native symbolication and absence
   of personal data in logs.
9. Retain checksums and build URLs in the private release record.

## Rollback

- Web: redeploy the last known-good immutable deployment.
- Android staged rollout: halt the rollout and prepare a higher-version corrective artifact.
- iOS: stop phased release where available and submit a higher-build corrective version.
- Database: use only tested forward or reversible migrations; never change real data as part of a build rollback.

Local signed builds must be attempted with the detected material. Uploading and store publication remain separate authenticated actions.

Supported build-only examples:

```bash
# Cloud release builds; validates production first and never submits.
./scripts/launch.sh --profile production --platform all

# Local signed artifacts, one platform per invocation.
./scripts/launch.sh --profile production --platform ios --local
./scripts/launch.sh --profile production --platform android --local

# Internal preview build; production-secret validation is not applicable.
./scripts/launch.sh --profile preview --platform android
```

Missing real screenshots block submission, not artifact generation. No flag bypasses environment
validation, and unknown options fail before EAS is called.

## OTA source maps

EAS Update is a separately authorized production change. After an operator publishes and reviews
an exact update, upload the already generated `dist/` maps with a separate, explicit command:

```bash
./scripts/upload-sentry-ota.sh \
  --environment production \
  --confirm-sourcemap-upload
```

The upload command does not publish an OTA update and fails if the environment, confirmation,
dependencies, `dist/` directory or source maps are missing. Treat a failed upload or failed
symbolication smoke as an incomplete OTA release. This follows the current official
[Expo Sentry guide](https://docs.expo.dev/guides/using-sentry/) and
[EAS environment-variable guidance](https://docs.expo.dev/eas/environment-variables/usage/).
