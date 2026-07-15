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

| Play data type                                  | Collected | Processing and purpose                                                                                                                 | Required                         |
| ----------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Email address                                   | Yes       | Supabase account creation, authentication and account management                                                                       | Account required                 |
| Name                                            | Yes       | Optional profile field in Supabase                                                                                                     | Optional                         |
| User ID                                         | Yes       | Account isolation, history and abuse controls                                                                                          | Account required                 |
| Photos                                          | Yes       | Sent through the backend to Agrio to perform the user-requested visual analysis; the current diagnosis insert does not write image_url | Required only for image analysis |
| Approximate location                            | Yes       | Optional consented context and Open-Meteo weather request; the candidate rounds future stored coordinates to two decimal places        | Optional                         |
| Other user content                              | Yes       | Crop selection, structured result, optional profile data and chat prompt                                                               | Feature-dependent                |
| App interactions                                | Yes       | First-party analytics events for product operation and quality                                                                         | Automatic                        |
| Crash logs and diagnostics                      | Yes       | Sentry release diagnostics when configured                                                                                             | Automatic                        |
| Device or other IDs                             | Yes       | Push token for opted-in notifications and technical identifiers in diagnostics                                                         | Feature-dependent                |
| Financial information or purchase history       | No        | No billing or purchase flow is active                                                                                                  | Not applicable                   |
| Audio recordings                                | No        | Voice is disabled and microphone permissions are blocked                                                                               | Not applicable                   |
| Precise location                                | No        | Permission is blocked                                                                                                                  | Not applicable                   |
| Contacts, health, messages and browsing history | No        | Not used by the app                                                                                                                    | Not applicable                   |

## Service providers and transfers

Data is not sold and is not used for cross-app advertising. Current processors are:

| Provider          | Data                                                                                                                       | Purpose                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Supabase          | Account, profile, preferences, structured results, analytics and push records                                              | Authentication, database and edge backend      |
| Agrio             | User-selected crop image and crop context, after versioned AI consent                                                      | Default visual identification request          |
| Google Gemini     | Chat prompt and necessary conversation context, after versioned AI consent                                                 | Default educational assistant                  |
| Anthropic Claude  | Diagnostic image/context or chat context, after versioned AI consent, only when the corresponding server route is selected | Configurable alternative for diagnosis or chat |
| Open-Meteo        | Optional approximate coordinates                                                                                           | Weather                                        |
| Sentry            | Crash, performance and technical diagnostics when configured                                                               | Reliability                                    |
| Expo Push Service | Push token and notification payload after opt-in                                                                           | Notifications                                  |

Google Play may exclude a transfer to a contracted service provider from the Shared answer when the provider processes data solely on the developer's behalf. Before submission, an authorized operator must verify the current contracts and Data Safety definitions. If that service-provider exception cannot be evidenced, mark the affected type as Shared. This contractual verification is an external launch gate; do not guess.

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
- [ ] Exercise deletion with a dedicated QA account and retain non-sensitive evidence.
- [ ] Copy the final answers into Play Console and perform a second-person review.
- [ ] Do not declare financial data, billing, subscriptions, RevenueCat or Google Play Billing while the release remains free.
