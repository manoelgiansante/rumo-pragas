# Google Play Data Safety — Rumo Pragas 1.0.11

Package: com.agrorumo.rumopragas

Business model: free, no ads and no in-app purchases

Privacy policy: https://pragas.agrorumo.com/privacidade
Rumo Pragas app-data deletion information: https://pragas.agrorumo.com/delete-account

Do not use that URL in Play's account-deletion field while
`../ACCOUNT_DELETION_BLOCKER.md` remains present. The current flow retains the shared AgroRumo
authentication account and therefore is not evidence of full app-account deletion.

This document is the release declaration worksheet. The signed AAB and the Play Console answers remain authoritative and must be compared before submission.

## Binary permission baseline

The current app configuration declares:

- Camera.
- Approximate location.
- Notifications.

It blocks precise location, broad photo and video storage access, microphone, legacy external storage and background media playback. Photo selection uses the Android system picker.

## Data declarations

| Play data type                            | Collected | Shared | Processing and purpose                                                                                                                                         | Required                                            |
| ----------------------------------------- | --------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Email address                             | Yes       | Yes    | App functionality and Supabase account management                                                                                                              | Account required                                    |
| Name                                      | Yes       | Yes    | App functionality and optional profile/account management                                                                                                      | Optional                                            |
| User ID                                   | Yes       | Yes    | App functionality, account isolation and product analytics                                                                                                     | Account required                                    |
| Address (city and state only)             | Yes       | Yes    | Optional profile, app functionality and account management                                                                                                     | Optional                                            |
| Phone number                              | Yes       | Yes    | Optional profile, app functionality and account management                                                                                                     | Optional                                            |
| Other in-app messages                     | Yes       | Yes    | User-requested assistant chat; message and necessary context go to the active AI provider after consent                                                        | Optional feature                                    |
| Photos                                    | Yes       | Yes    | Optional private Supabase profile photo for account management; diagnosis photo goes to the configured provider and history omits `image_url`                  | Required for image analysis; profile photo optional |
| Approximate location                      | Yes       | Yes    | Optional consented context and Open-Meteo weather request; new stored coordinates are rounded to two decimal places                                            | Optional                                            |
| Other user-generated content              | Yes       | Yes    | Crop/diagnosis content for app functionality; verdicts, alternatives and notes for quality analytics; AI reports for human review, safety and abuse prevention | Required when the corresponding feature runs        |
| App interactions                          | Yes       | Yes    | App functionality and product analytics/quality events                                                                                                         | Automatic                                           |
| Crash logs                                | Yes       | Yes    | App reliability and analytics through Sentry when configured                                                                                                   | Automatic                                           |
| Performance diagnostics                   | Yes       | Yes    | Performance analytics through Sentry when configured                                                                                                           | Automatic                                           |
| Device or other IDs                       | Yes       | Yes    | App functionality, opted-in push delivery, diagnostics and analytics                                                                                           | Conservatively marked required                      |
| Financial information or purchase history | No        | No     | No billing or purchase flow is active                                                                                                                          | Not applicable                                      |
| Audio recordings                          | No        | No     | Voice is disabled and microphone permissions are blocked                                                                                                       | Not applicable                                      |
| Precise location                          | No        | No     | Permission is blocked                                                                                                                                          | Not applicable                                      |
| Contacts, health and browsing history     | No        | No     | Not used by the app                                                                                                                                            | Not applicable                                      |

## Service providers and transfers

Data is not sold and is not used for cross-app advertising. Current processors are:

| Provider          | Data                                                                                                                       | Purpose                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Supabase          | Account, private profile photo, profile, preferences, feedback, AI reports, structured results, analytics and push records | Authentication, storage, database and edge backend |
| Agrio             | User-selected crop image and crop context, after versioned AI consent                                                      | Default visual identification request              |
| Google Gemini     | Chat prompt and necessary conversation context, after versioned AI consent                                                 | Default educational assistant                      |
| Anthropic Claude  | Diagnostic image/context or chat context, after versioned AI consent, only when the corresponding server route is selected | Configurable alternative for diagnosis or chat     |
| Open-Meteo        | Optional approximate coordinates                                                                                           | Weather                                            |
| Sentry            | Crash, performance and technical diagnostics when configured                                                               | Reliability                                        |
| Expo Push Service | Push token and notification payload after opt-in                                                                           | Notifications                                      |

The worksheet conservatively marks every transfer to an external processor, including Supabase, as Shared because no current contractual exception evidence is versioned in this repository. Google Play may exclude a transfer to a contracted service provider when the provider processes data solely on the developer's behalf, but an authorized operator may reduce a Shared answer only after verifying the current contract and Google Play definition. This contractual verification is an external launch gate; do not guess. Shared does not mean sold: the app has no advertising flow and data is not sold or rented.

## Security and user control answers

- Data encrypted in transit: Yes. App traffic uses HTTPS.
- App-specific data deletion mechanism: Yes, in Settings and at the public deletion URL.
- App-account deletion: blocked pending the shared AgroRumo identity decision documented in
  `store-assets/ACCOUNT_DELETION_BLOCKER.md`; do not claim support in Play Console yet.
- Account creation: Yes.
- Independent security review badge: No, unless a current qualifying assessment is completed.
- Families policy: the app is not directed to children.
- Ads: No.
- In-app purchases: No.

Do not claim a specific at-rest cipher, perfect LGPD compliance or anonymous processing unless there is current evidence for the shipped environment.

Official references used for this worksheet:

- [Google Play Data safety form requirements](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Google Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)

## Submission checklist

- [ ] Generate the signed release AAB from the exact candidate commit.
- [ ] Inspect merged permissions and SDK declarations from that AAB.
- [ ] Confirm voice feature flag is disabled.
- [ ] Verify the signed candidate persists new optional coordinates at two decimal places; do not
      represent the four historical production rows as already remediated.
- [ ] Confirm diagnosis provider is Agrio.
- [ ] Confirm chat provider is Gemini or update this worksheet if the server configuration changed.
- [ ] Confirm third-party contracts support the selected Shared answers.
- [ ] Resolve the shared-account deletion blocker before filling Play's account-deletion field.
- [ ] Confirm Privacy, Terms, Support and app-data deletion URLs return HTTP 200 and disclose the retained shared identity.
- [ ] Deploy the reviewed landing policy, then run `npm run validate:data-safety:public`; this gate must validate the exact public canonical HTML before the app CI or submission can pass.
- [ ] Exercise deletion with a dedicated QA account and retain non-sensitive evidence.
- [ ] Copy the final answers into Play Console and perform a second-person review.
- [ ] Do not declare financial data, billing, subscriptions, RevenueCat or Google Play Billing while the release remains free.
