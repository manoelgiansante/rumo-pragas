# Store submission checklist — Rumo Pragas 1.0.11

## Shared preflight

- [ ] Build was generated separately; no `--auto-submit` or build hook initiated submission.
- [ ] Candidate commit frozen and CI green on Node 22.22.3.
- [ ] CI checkout uses `fetch-depth: 0` (or fetches the exact manifest candidate commit) before
      validating non-empty screenshot sets; missing Git history fails closed.
- [ ] expo-doctor, lint, typecheck, tests and web export green.
- [ ] Signed IPA and AAB installed from TestFlight/Internal testing.
- [ ] Fresh install, upgrade and denied-permission paths pass.
- [ ] Diagnosis works online and queued retry works after reconnection.
- [ ] No copy says the identification model runs offline.
- [ ] AI uncertainty and professional-validation warnings are visible.
- [ ] `store-assets/ACCOUNT_DELETION_BLOCKER.md` is resolved through an approved and tested
      full-account flow or recorded formal store/legal acceptance; app-scoped deletion alone does not
      release submission.
- [ ] Privacy, Terms, Support and app-data deletion URLs return 200; deletion copy retains the shared AgroRumo identity.
- [ ] Dedicated deletion QA account is removed end to end.
- [ ] Sentry release and symbolication verified without sensitive log data.
- [ ] Store text matches expo-app/store-assets/metadata exactly.
- [ ] Unsafe live copy from the previous release has been replaced in both consoles and the public
      pt-BR pages no longer claim fixed speed, measured accuracy, offline inference or agronomist
      equivalence.
- [ ] Screenshots pass store-assets/SCREENSHOT_CHECKLIST.md.
- [ ] `store-assets/screenshots-manifest.json` maps the exact candidate version/commit, canonical
      scenes and SHA-256 of every screenshot, with an independent second review.
- [ ] No subscription, trial, paid tier, billing product or restoration claim appears.

## App Store Connect

- [ ] Reviewer account exists and credentials are entered only in App Review Information.
- [ ] Reviewer notes copied from store-assets/ios/REVIEWER_NOTES.md.
- [ ] Privacy labels reconciled with Agrio, Supabase, Gemini, optional Anthropic route, Open-Meteo, Sentry and Expo Push.
- [ ] iPhone and iPad captures are real and match the submitted build.
- [ ] Category, age rating, URLs and export-compliance answers reviewed.
- [ ] Build uses the current Apple-required Xcode and SDK.
- [ ] TestFlight smoke and account-deletion tests pass.

## Google Play Console

- [ ] AAB target SDK and permissions inspected.
- [ ] Data Safety copied only after the contractual sharing review in store-assets/android/DATA_SAFETY.md.
- [ ] App access contains the secure review account.
- [ ] Ads marked No and in-app products absent.
- [ ] Phone and supported-tablet captures match the AAB.
- [ ] Internal testing smoke passes before closed or production promotion.

## Gradual release

- [ ] Start with the smallest supported staged cohort.
- [ ] Define stop thresholds for crash-free sessions, login failures, diagnosis 5xx/429, queue failures and deletion errors.
- [ ] Assign an operator for the first 24 hours.
- [ ] Record rollback owner and last known-good versions.

## External blockers

- Live metadata correction: authenticated App Store Connect and Play Console changes are required;
  on 2026-07-14 both public listings still showed the prohibited prior-release claims even though
  the repository metadata had been corrected.
- Apple signing rotation: revoke/replace the exposed distribution certificate, provisioning
  profile and password, update EAS/the approved secret store and record non-secret evidence before
  removing `store-assets/APPLE_SIGNING_ROTATION_BLOCKER.md`. No pre-rotation IPA is eligible.
- Android signed build: not pre-classified as external; the release build must be attempted first.
- Upload: authenticated App Store Connect and Play Console access.
- Reviewer access: dedicated QA account stored in the approved secret manager.
- Data Safety Shared answers: evidence that provider contracts meet Google service-provider definitions.
- Account deletion: portfolio-wide authorization/implementation or formal acceptance for the
  shared AgroRumo identity; the current app-data-only flow is insufficient to clear this gate.
- Publication: explicit store release action after internal validation.
- Screenshots: zero real candidate screenshots are currently in the submission paths; archived
  images are prohibited and `scripts/submit.sh` fails closed until all four required device sets
  exist, both platform manifests cover all seven canonical scenes, and the feature graphic and
  selected local signed artifact matches its independently reviewed hash and provenance.

No credential value belongs in this file.

After every checkbox is evidenced and an authorized operator approves the exact artifact, use
`./scripts/submit.sh` with one platform, the local signed artifact path, and
`--confirm-authorized-submission`. Before inspecting credentials or invoking EAS, the script runs
the complete `scripts/store-submission-status.mjs` gate for both stores and shared blockers. It does
not accept remote build IDs or `--latest`, and selecting one platform cannot bypass a blocker on
the other platform or the shared-account deletion/Apple-signing blockers. Local paths must select
`.ipa` for iOS or `.aab` for Android; the chosen file SHA-256 must equal
`store-assets/screenshots-manifest.json`. Immediately before EAS submit, the script verifies the
production Supabase URL and the versioned public-key fingerprint inside that exact private
artifact snapshot.

The confirmation marker records operator intent in the command; it does not grant authorization,
publish automatically or replace App Store Connect/Play Console review.
