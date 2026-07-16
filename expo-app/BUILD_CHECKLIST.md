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
- Confirm release Sentry DSN without exposing credentials. The protected local build sets
  `SENTRY_DISABLE_AUTO_UPLOAD=true`; any separate native source-map upload requires its own
  authorization and gate. Then prove symbolication with a controlled non-PII test event. Do not run
  the retired custom finalization hook or migrate the build to cloud.
- Confirm the app contains no active purchase SDK path or store product.

## Secrets and signing

The repository must contain only secret names and setup instructions. Values belong in the approved secret manager or store/build service.

Signing material was detected locally for both native projects. Before classifying a credential blocker,
attempt the iOS archive and Android release bundle without printing aliases, passwords, certificate names
or profile contents.

Release operations may still require:

- Apple distribution and App Store Connect authorization.
- Android upload keystore and Play service-account authorization.
- Expo/EAS authorization used by the pinned local runner for environment names, versioning and credentials, without a cloud build.
- Sentry authorization for release symbol upload.
- Runtime Supabase and provider configuration for the release environment.

Only a missing or expired value proven by the build attempt is a precise external blocker. Never substitute a credential from another AgroRumo app.

## Build sequence

1. Tag the exact candidate commit in the release record.
2. Run `./scripts/validate-prod-env.sh production`; it defaults fail-closed to the project-pinned
   executor, checks EAS Environment names only and never prints values. The system-CLI mode is
   reserved for isolated test fixtures and must never be used for release work.
3. Run the reproducible validation suite.
4. Generate one local release artifact at a time with
   `./scripts/launch.sh --profile production --platform ios --local`, followed by
   `./scripts/launch.sh --profile production --platform android --local`.
   These commands are build-only and contain no submit path.
5. Inspect the signed IPA and AAB for identifiers, permissions, SDKs and versions.
6. Install through TestFlight/Internal testing, not by direct production promotion.
7. Execute smoke tests: fresh install, login, social login, permissions denied, capture, picker, online result, queued retry, history, PDF sharing, assistant, settings and deletion.
8. Read the actual values from the remote version registry without creating a build, then verify
   Sentry release mapping, native symbolication and absence of personal data in logs.
9. Retain artifact checksums and any later store-submission URLs in the private release record.

## Rollback

- Web: redeploy the last known-good immutable deployment.
- Android staged rollout: halt the rollout and prepare a higher-version corrective artifact.
- iOS: stop phased release where available and submit a higher-build corrective version.
- Database: use only tested forward or reversible migrations; never change real data as part of a build rollback.

Local signed builds must be attempted with the detected material. Uploading and store publication remain separate authenticated actions.

Supported build-only examples:

```bash
# Local signed artifacts only, one platform per invocation. Cloud has no supported path.
./scripts/launch.sh --profile production --platform ios --local
./scripts/launch.sh --profile production --platform android --local

# Internal preview build, still local; production-secret validation is not applicable.
./scripts/launch.sh --profile preview --platform android --local
```

Missing real screenshots block submission, not artifact generation. No flag bypasses environment
validation, `--platform all` is rejected, and unknown options fail before EAS is called. The
`--local` flag is accepted for command compatibility, but the launcher always adds it and never
falls back to EAS Build cloud.

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
