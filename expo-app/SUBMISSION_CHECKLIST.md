# Store submission checklist — Rumo Pragas 1.0.11

## Shared preflight

- [ ] Build was generated separately; no `--auto-submit` or build hook initiated submission.
- [ ] Candidate commit frozen and CI green on Node 22.22.3.
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
- Signed build: not pre-classified as external; local Apple/Android signing material exists and the release builds must be attempted first.
- Upload: authenticated App Store Connect and Play Console access.
- Reviewer access: dedicated QA account stored in the approved secret manager.
- Data Safety Shared answers: evidence that provider contracts meet Google service-provider definitions.
- Account deletion: portfolio-wide authorization/implementation or formal acceptance for the
  shared AgroRumo identity; the current app-data-only flow is insufficient to clear this gate.
- Publication: explicit store release action after internal validation.
- Screenshots: zero real candidate screenshots are currently in the submission paths; archived
  images are prohibited and `scripts/submit.sh` fails closed until at least five real images exist
  for the selected platform.

No credential value belongs in this file.

After every checkbox is evidenced and an authorized operator approves the exact artifact, use
`./scripts/submit.sh` with one platform, the real immutable build ID or signed artifact path, and
`--confirm-authorized-submission`. The script does not accept `--latest`.

The confirmation marker records operator intent in the command; it does not grant authorization,
publish automatically or replace App Store Connect/Play Console review.
