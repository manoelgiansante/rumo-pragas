# Launch audit coverage — Rumo Pragas

- Snapshot: 2026-07-14
- Last evidence update: 2026-07-16
- App source: expo-app
- Backend and database source: supabase
- Website source: canonical remote
  `https://github.com/manoelgiansante/rumo-pragas-landing-nextjs.git`, sibling worktree
  `../rumo-pragas-landing`, branch `codex/rumo-pragas-landing-astro-launch-20260715` (PR #3)

Status vocabulary:

- Audited: source and configuration inspected.
- Corrected: an identified launch defect was changed in the responsible implementation stream.
- N/A: audited and no correction applies to the current launch scope.
- Tested: evidence from automated, static or manual verification is named.
- External: requires authenticated infrastructure, a signed artifact or a store action.

## System map

User → Expo Router mobile app → Supabase Auth → Edge Functions → Agrio for image identification or Gemini for educational chat → structured results in Postgres.

Optional branches:

- Optional location → Open-Meteo and consented diagnosis context. The candidate rounds future
  persisted coordinates to two decimal places; four historical production rows predate verified
  minimization and require an authorized real-data remediation.
- Release diagnostics → Sentry.
- Opt-in push → Expo Push Service.
- Legacy server switches → Anthropic chat or diagnosis path; not the default.
- Production inventory → remote-only `disease-risk` function from the former paid model; no source exists in this repository and the current free client does not depend on it.
- AI-content report → authenticated report endpoint → admin-only moderation route guarded by `app_metadata.pragas_admin`.

The app keeps a failed image request in a local retry queue. The model executes only after network connectivity is available.

## Screens and routes

| Route | Purpose | Audited | Corrected | Tested or evidence |
| --- | --- | --- | --- | --- |
| Root layout | Providers, session, navigation and Sentry | Yes | N/A in documentation stream | Typecheck and Jest release suite |
| /(auth)/login | Email and social authentication | Yes | N/A | Auth tests plus signed-build smoke required |
| /(tabs) | Primary tab shell | Yes | N/A | Navigation tests plus signed-build smoke required |
| /(tabs)/index | Home, weather and primary action | Yes | Product copy handled in mobile stream | Unit tests plus visual smoke required |
| /(tabs)/library | Educational pest library | Yes | N/A | Search and render tests; visual smoke required |
| /(tabs)/history | Structured result history | Yes | False photo-history claims removed from public copy | Service tests plus account smoke required |
| /(tabs)/ai-chat | Educational AI assistant | Yes | Provider and scope claims corrected | Edge tests plus live-provider smoke required |
| /(tabs)/settings | Preferences, legal, support and account controls | Yes | Free model and deletion documentation corrected | Unit tests plus deletion smoke required |
| /onboarding | First-run value and consent flow | Yes | Product claims handled in mobile stream | Unit tests plus fresh-install smoke required |
| /consent-location | Optional location consent | Yes | Candidate minimization and historical-data disclosure aligned | Preference tests plus deny/allow smoke required |
| /diagnosis/crop-select | Crop context | Yes | N/A | Component tests plus device smoke required |
| /diagnosis/camera | Capture, picker and crop image input | Yes | Broad Android media claim removed | Camera tests plus device permission smoke required |
| /diagnosis/loading | Online request and retry handoff | Yes | Offline wording corrected across release material | Queue and diagnosis service tests |
| /diagnosis/result | Hypothesis, confidence, alternatives, PDF and warnings | Yes | Definitive, speed, severity-measurement and treatment claims removed | Result tests plus real-provider smoke required |
| /diagnosis/pest/[id] | Educational pest detail | Yes | N/A | Route and registry tests |
| /edit-profile | User profile | Yes | N/A | Profile service tests plus account smoke required |
| /privacy | In-app privacy notice | Yes | Legal mobile changes handled in mobile stream | Link and render tests |
| /terms | In-app terms | Yes | Legal mobile changes handled in mobile stream | Link and render tests |
| /update-password | Password recovery completion | Yes | N/A | Auth tests plus deep-link smoke required |
| /paywall (retired) | Legacy paid route removed from the candidate | Yes | Route, screen and paid claims removed | Release-surface scanner plus signed-build navigation smoke must show no accessible paid UI |
| /admin/ai-reports | Admin-only review and status transition for AI-content reports | Yes | Implemented with metadata authorization and backend enforcement | Unit, Edge authorization and admin-account smoke required |
| /+not-found | Invalid route recovery | Yes | N/A | Router smoke required |

## Edge endpoints

| Endpoint | Authentication and purpose | Audited | Corrected | Tested or evidence |
| --- | --- | --- | --- | --- |
| /functions/v1/diagnose-pragas | Authenticated image analysis; Agrio default | Yes | Dedicated slug, timeout, validation, durable rate limit, provider lease and agronomic safety hardened | Deno gate, PostgreSQL crash-contract test and live Agrio smoke required |
| /functions/v1/ai-chat-pragas | Authenticated educational chat; Gemini default | Yes | Dedicated slug, request-hash idempotency and provider lease/unknown-outcome handling implemented | Deno gate, PostgreSQL crash-contract test and live Gemini smoke required |
| /functions/v1/pragas-analytics | Server-side first-party product events | Yes | Dedicated slug and durable rate limit implemented | Deno contract tests |
| /functions/v1/pragas-delete-user-account | Authenticated app-scoped deletion; global AgroRumo identity and shared unscoped records retained | Yes | Immediate cleanup, idempotency, durable rate limit and explicit partial/in-progress contract implemented | Deno and PostgreSQL tests plus dedicated QA account smoke |
| /functions/v1/pragas-process-deletions | Service-authorized retry worker for incomplete app-scoped cleanup | Yes | Global identity deletion explicitly excluded; transferred push-token ownership protected under a shared advisory lock | Deno and PostgreSQL race tests; live schedule evidence is production-only |
| /functions/v1/pragas-process-ai-idempotency | Service-authorized scrub worker for expired cached AI payloads and terminal ledgers | Yes | Response payload expiry preserves no-resend tombstones | Deno and PostgreSQL expiry tests; live schedule evidence is production-only |
| /functions/v1/pragas-reactivate-account | Authenticated restoration of the explicit Rumo Pragas app link and app-scoped profile | Yes | Dedicated, rate-limited reactivation contract implemented | Deno and PostgreSQL authorization tests |
| /functions/v1/pragas-send-push | Dedicated Pragas server-to-server push | Yes | Claim/lease token, provider-start marker and terminal unknown outcome prevent unsafe resend | Deno and PostgreSQL race tests; sandbox push required |
| /functions/v1/send-push | Historical shared-slug reference; must not deploy for Pragas | Yes | N/A, explicitly excluded | Static slug guard |
| /functions/v1/report-ai-content | Authenticated user report of unsafe or incorrect AI content | Yes | Implemented with validation, idempotency and rate limit | Deno contract and authorization tests |
| /functions/v1/report-diagnosis-feedback | Authenticated feedback tied to an owned diagnosis | Yes | Implemented with ownership validation and idempotency | Deno contract, RLS and authorization tests |
| /functions/v1/admin-ai-content-reports | Admin-only list and moderation transition | Yes | Implemented with `app_metadata.pragas_admin` and server enforcement | Deno negative/positive authorization tests |
| /functions/v1/pragas-export-user-data | Authenticated structured export of the user's Pragas data | Yes | Implemented for LGPD portability/access | Deno ownership and response-contract tests |
| /functions/v1/revenuecat-webhook | Shared legacy billing endpoint | Yes | N/A for current free launch; intentionally unchanged because ownership is shared | Excluded explicitly from the Pragas Deno gate |
| /functions/v1/stripe-webhook | Shared legacy billing endpoint | Yes | N/A for current free launch; intentionally unchanged because ownership is shared | Excluded explicitly from the Pragas Deno gate |
| Remote `/functions/v1/disease-risk` | Active production-only legacy Pro function | Yes, by read-only production inventory | A local deterministic retirement tombstone prevents accidental source resurrection; current free client has no dependency | Authorized production replacement/deactivation and captured rollback version required |
| Remote `/functions/v1/create-checkout-session-pragas` | Active production-only legacy Stripe checkout | Yes, by read-only production inventory | Local retirement tombstone implemented; no client reference found | Authorized production replacement/deactivation required |
| Remote `/functions/v1/stripe-webhook-pragas` | Active production-only legacy Stripe webhook | Yes, by read-only production inventory | Local retirement tombstone implemented; no provider subscription IDs found in `pragas_subscriptions` | Authorized production replacement/deactivation required |
| Remote `/functions/v1/stripe-customer-portal-pragas` | Active production-only legacy Stripe portal | Yes, by read-only production inventory | Local retirement tombstone implemented; no client reference found | Authorized production replacement/deactivation required |
| Remote `/functions/v1/asaas-checkout-pragas` | Active production-only legacy Asaas checkout | Yes, by read-only production inventory | Local retirement tombstone implemented; no Asaas IDs found in `pragas_subscriptions` | Authorized production replacement/deactivation required |
| Remote `/functions/v1/asaas-webhook-pragas` | Active production-only legacy Asaas webhook | Yes, by read-only production inventory | Local retirement tombstone implemented; no Asaas IDs found in `pragas_subscriptions` | Authorized production replacement/deactivation required |

## Database and storage inventory

| Object | Purpose and access | Audited | Corrected | Tested or evidence |
| --- | --- | --- | --- | --- |
| pragas_diagnoses | User-owned structured results with RLS; read-only production count is 342, including 4 rows with non-null coordinates | Yes | Candidate rounds future coordinates to two decimal places; the 4 historical rows are not mutated without authorization | Migration/RLS tests; historical coarsening is an external real-data gate |
| pragas_profiles | User-owned profile with RLS | Yes | N/A | Migration and RLS tests |
| pragas_app_links | Explicit app-membership marker required in addition to profile and active app-scoped subscription | Yes | Added without backfilling access from historical shared identity data; deletion deactivates and explicit reactivation restores it | PostgreSQL positive/negative authorization tests |
| user_preferences | User-owned location consent receipt | Yes | N/A | Migration and RLS tests |
| chat_usage | Service-controlled chat usage counter | Yes | RPC access hardened by tracked migrations | Migration and authorization tests |
| analytics_events | First-party event ingestion and user read policy | Yes | N/A | Contract and RLS tests |
| audit_log | User-related audit entries | Yes | N/A | Migration and RLS tests |
| webhook_events | Shared webhook idempotency ledger | Yes | N/A to current free client; intentionally unchanged | Migration tests |
| pragas_push_notifications | Push claim/lease, provider boundary and audit ledger | Yes | Request hash, lease ownership and terminal `unknown_outcome` prevent duplicate delivery after ambiguous provider execution | PostgreSQL crash/race tests and Deno contracts |
| pragas_ai_idempotency_records | Diagnosis/chat request-hash ledger with worker lease and bounded cached response | Yes | Pre-provider reclaim, provider-start terminal unknown outcome, stale-token rejection and payload scrubbing implemented | PostgreSQL concurrent/crash/expiry tests and Deno contracts |
| pragas_ai_content_reports | User reports and admin moderation state | Yes | RLS, status transitions and admin RPC added | Migration and authorization tests |
| pragas_diagnosis_feedback | User feedback tied to an owned diagnosis | Yes | Constraints, ownership trigger and RLS added | Migration and authorization tests |
| pragas_api_rate_limit_counters | Durable per-user/API limit counters | Yes | Added for abuse protection | Deno concurrency and migration tests |
| pragas_api_rate_limit_events | Idempotency and durable rate-limit events | Yes | Added for abuse protection | Deno concurrency and migration tests |
| pragas_deletion_jobs | Minimal unlink marker: global UUID, operational state, attempts, bounded technical codes and timestamps; no name, email, photo, content or token | Yes | Added with RLS, retry claims and a restrictive recreation guard; retained until explicit reactivation or global identity deletion | Deno deletion and migration tests |
| mcp_api_tokens | Hashed integration-token records | Yes | N/A | Migration and authorization tests |
| subscriptions | Shared legacy subscription table | Yes | N/A to current free client; intentionally unchanged because ownership is shared | No active client entitlement dependency found |
| pragas_subscriptions | Remote legacy subscription object: 82 aggregate rows, 81 marked active/trialing, but zero Stripe subscription IDs, Asaas IDs or product IDs | Yes, read-only production inventory without PII | Ambiguous legacy state retained; deleting or rewriting real rows was not authorized | Current free client has no paid entitlement dependency; production reconciliation is gated |
| pragas_diagnosis_usage | Remote legacy usage/quota object | Yes, read-only production inventory | N/A for current free flow pending schema reconciliation | No active client dependency found |
| pragas_outbreaks | Remote legacy user-reported outbreak/community object | Yes, read-only production inventory | N/A because the user-report/community module is absent; current UI derives weather-risk alerts locally and does not read this table | No active client dependency found |
| pragas_outbreak_confirmations | Remote legacy user-report confirmation object | Yes, read-only production inventory | N/A because the user-report/community module is absent; current UI derives weather-risk alerts locally and does not read this table | No active client dependency found |
| pragas_chat_messages | Remote legacy chat-history object | Yes, read-only production inventory | N/A because the current client does not expose persisted community chat history | No active client dependency found |
| pragas_community_posts | Remote legacy community object | Yes, read-only production inventory | N/A because community is absent from the current product UI | No active client dependency found |
| pragas_post_comments | Remote legacy community object | Yes, read-only production inventory | N/A because community is absent from the current product UI | No active client dependency found |
| pragas_post_replies | Remote legacy community object | Yes, read-only production inventory | N/A because community is absent from the current product UI | No active client dependency found |
| pragas_post_likes | Remote legacy community object | Yes, read-only production inventory | N/A because community is absent from the current product UI | No active client dependency found |
| pragas_community_likes | Remote legacy community object | Yes, read-only production inventory | N/A because community is absent from the current product UI | No active client dependency found |
| pragas_reply_likes | Remote legacy community object | Yes, read-only production inventory | N/A because community is absent from the current product UI | No active client dependency found |
| pragas_error_logs | Remote legacy technical-log object | Yes, read-only production inventory | N/A to the tracked Sentry path; reconcile before any schema mutation | No active client write found |
| pragas_notification_queue | Remote legacy notification queue | Yes, read-only production inventory | N/A to current Expo push flow | No active client dependency found |
| pragas_analytics | Remote legacy analytics object | Yes, read-only production inventory | N/A to current `analytics_events` ingestion | No active client dependency found |
| pragas_photo_reservations | Local untracked paid-photo migration object | Yes | N/A for the free launch; migration must not be applied as part of this release | Excluded from this audit stream and active free client |
| pragas_photo_topups | Local untracked paid-photo migration object | Yes | N/A for the free launch; migration must not be applied as part of this release | Excluded from this audit stream and active free client |
| pragas_photo_usage | Local untracked paid-photo migration object | Yes | N/A for the free launch; migration must not be applied as part of this release | Excluded from this audit stream and active free client |
| storage bucket avatars | User avatar objects with owner policies | Yes | N/A | Upload, read and deletion smoke required |
| handle_new_user | Profile and free-state provisioning trigger | Yes | N/A | Signup integration test |
| update_updated_at | Timestamp trigger | Yes | N/A | Migration test |
| user_preferences_touch_updated_at | Consent receipt timestamp trigger | Yes | N/A | Migration test |
| get_chat_usage_count | Service-side usage query | Yes | Grants hardened | Authorization test |
| increment_chat_usage | Atomic service-side counter | Yes | Grants hardened | Concurrency and authorization test |

The read-only production inventory contains legacy/community tables even though those modules are absent from the current UI. This is not evidence that the backend objects do not exist; it proves only that they are N/A to this free launch and must not be changed without a separately authorized production reconciliation.

No tracked migration installs the production schedule for `process-deletions`. The primary endpoint performs app-scoped cleanup synchronously; the worker only handles retry jobs. A dashboard or infrastructure-as-code record for that retry schedule remains production-only evidence.

## Integrations

| Integration | Data and role | Audited | Corrected | Tested or evidence |
| --- | --- | --- | --- | --- |
| Supabase Auth | Account and session | Yes | N/A | Auth suite and smoke |
| Supabase Postgres, Storage and Edge | Backend system of record | Yes | N/A | Integration and RLS suites |
| Agrio | Crop image analysis | Yes | Disclosed as current provider | Sandbox or production-safe QA image |
| Google Gemini | Default educational chat | Yes | Disclosed accurately | Live QA prompt |
| Anthropic | Legacy server-controlled fallback | Yes | No longer presented as default | Configuration-off test |
| Open-Meteo | Optional coordinates for weather | Yes | Candidate future-storage minimization and current historical exception disclosed | Consent deny/allow tests; authorized remediation of 4 historical rows remains external |
| Sentry | Release crash and performance diagnostics | Yes | Data Safety aligned | Symbolication smoke |
| Expo Push Service | Opt-in notifications | Yes | Data Safety aligned | Sandbox device push |
| Apple and Google authentication | Social sign-in | Yes | N/A | Physical-device login smoke |
| Native camera and system picker | User-initiated crop image | Yes | Broad-storage claim removed | Permission matrix smoke |
| Native print and share | PDF and system sharing | Yes | N/A | Device smoke |
| RevenueCat, Stripe and Asaas billing | No active client integration; shared local webhooks plus five active remote-only Pragas billing functions and ambiguous legacy rows still exist | Yes | Paid claims and client routes removed; shared handlers unchanged | Production tombstone/deactivation and real-data reconciliation require explicit authorization |

## Personas and permissions

| Persona or actor | Allowed scope | Audited | Corrected | Tested or evidence |
| --- | --- | --- | --- | --- |
| Public visitor | Landing, legal and support pages | Yes | Landing truth and security corrected | Build, link, accessibility and Lighthouse checks |
| Authenticated user | Own profile, preferences, results and app features | Yes | N/A | RLS, service and device smoke |
| Reviewer QA user | Same permissions as a normal user with synthetic data | Yes | Credential removed from repository | Store-console secure access test |
| Service role | Edge-only privileged database operations | Yes | Endpoint authorization owned by backend stream | Negative authorization tests |
| Support operator | Public support and privacy requests; no implicit database access | Yes | N/A | Support-channel smoke and operating procedure |
| Pragas administrator | AI-content moderation only when `app_metadata.pragas_admin=true` | Yes | Admin route and server-enforced report transitions implemented | Negative user test plus authorized admin smoke |

There is no multi-farm team, consultant hierarchy or public community permission model in the current app UI. Legacy community tables exist remotely, but the current client neither exposes nor claims that module.

## Critical flows

| Flow | Audited | Corrected | Tested or evidence |
| --- | --- | --- | --- |
| Install → onboarding → account | Yes | Launch copy corrected | Fresh-install signed-build smoke |
| Login and social login | Yes | N/A | Auth suite and physical-device smoke |
| Deny optional permissions | Yes | Disclosures corrected | Permission matrix smoke |
| Capture or pick → crop → online result | Yes | Uncertainty language corrected | Service tests and live-provider QA |
| Offline failure → queue → reconnect → result | Yes | No-inference-offline wording corrected | Queue tests and airplane-mode smoke |
| Low confidence or invalid image | Yes | Certainty claims removed | Result tests with controlled fixtures |
| Result → history → PDF share | Yes | Photo-history claim removed | Service and device share smoke |
| AI assistant | Yes | Educational scope and provider corrected | Edge test and live QA |
| Location consent → weather | Yes | Optional flow and two-decimal future minimization corrected; 4 historical rows documented | Consent and network smoke; historical coarsening requires production authorization |
| Notification opt-in and delivery | Yes | Privacy declaration aligned | Device push smoke |
| Password recovery | Yes | N/A | Deep-link smoke |
| AI processing consent | Yes | Purpose-specific local consent gates added for diagnosis and chat | Unit tests plus fresh-install device smoke |
| Report AI content → admin moderation | Yes | User report, server validation and admin status transition implemented | Unit, Deno and authorized admin smoke |
| Diagnosis feedback | Yes | Owned-diagnosis feedback flow implemented | Unit, Deno and RLS tests |
| Rumo Pragas app-data deletion | Yes | App-scoped cleanup, retained global identity and minimal unlink marker are implemented and disclosed accurately | Deno/PostgreSQL evidence; full store-account deletion remains an external P1 because it affects the shared AgroRumo identity |
| Upgrade from prior store version | Yes | Paid claims removed | TestFlight/Internal upgrade smoke |

## Platform configuration

| Platform | Audited configuration | Corrected | Tested or evidence |
| --- | --- | --- | --- |
| Web export | Expo web bundle and CI artifact | Blocking export added to CI | Production export |
| iOS | Expo bundle `com.agrorumo.rumopragas`, tablet support, deployment target, permission text, Apple auth and Sentry | Metadata, reviewer notes, screenshot process and conservative Accessibility Nutrition Labels matrix corrected; remote build baseline 63 observed read-only, with candidate number delegated to EAS `autoIncrement` | A real Release simulator app was built with Xcode 26.2 and the iOS 26.2 SDK and its embedded production environment passed the release gate. The App Store archive exposed compromised distribution material; the certificate/profile/password must be revoked and replaced before a new eligible IPA can be generated. Verify source-map upload, symbolication and accessibility separately on iPhone/iPad. |
| Android | Expo package `com.agrorumo.rumopragas`, min SDK 24, compile/target SDK 36, camera/coarse-location/notification only | Store metadata corrected; Data Safety is being reconciled against every optional profile field; remote version-code baseline 54 observed read-only, with candidate number delegated to EAS `autoIncrement` | Real signed production AAB built and its embedded production environment passed the release gate. Target SDK 36 meets the Google Play requirement effective 2026-08-31. Verify a separately authorized source-map upload, symbolication and final Data Safety answers. |
| Legacy native iOS | Root `RumoPragas.xcodeproj`, SwiftUI 1.0.0 (build 1), same bundle identifier | N/A: superseded by the published Expo client and excluded from current CI/store pipeline | Source and project inspected; do not archive or submit this target |
| Landing | Static Astro candidate with legal/support/404 pages, consent-gated analytics and official store links | False paid/provider/offline claims removed; React hydration, misleading assets and unproven Universal Links excluded; HTTPS app associations fail closed until native support exists; the audited Astro source was migrated into the canonical repository without carrying cache, deployment metadata or the former repository history | Canonical PR #3 at `764c7133004599e8bb2a942e49e01e0fb1382cac`: both Lighthouse CI and E2E are green, Playwright is 75/75, remote preview smoke is 15/15, and the preview returns the expected CSP/HSTS/noindex and route status contract. Preview: `https://rumo-pragas-landing-2wytz15q7-manoels-projects-849ab1fe.vercel.app`. Production merge/deployment remains an explicit external gate. |
| CI | Locked install, Expo Doctor, lint, typecheck, Jest coverage, web export and Deno Edge gate | Node 22.22.3, official GitHub actions v6, Deno 2.7.12 `fmt/lint/check/test`; false asynchronous EAS check removed | Workflow syntax plus local command parity |

## Production compatibility evidence

Read-only inventory of Supabase project `jxcnfyeemdltdfqtgbcl` on 2026-07-15 proved that the
repository candidate is ahead of production. The nine dedicated Edge slugs used by the candidate
are not deployed there, including diagnosis, chat, analytics, export, deletion/reactivation,
feedback and AI-content moderation. Production also lacks `pragas_app_links`, the candidate's
consent/rate-limit/idempotency/deletion/report/admin objects, the `pragas-avatars` bucket,
`pragas_profiles.avatar_path` and the new RPC contracts. Shipping the client before this backend
would leave critical authenticated flows returning 404 or failing on missing schema.

The production profile identity model is also materially different from the original broad local
migration assumption: all 82 inspected `pragas_profiles` rows have `id != user_id`. The legacy
state includes 82 `pragas_subscriptions` rows while the shared `subscriptions` table has no
Rumo Pragas rows. The broad migration was therefore replaced by additive, data-preserving
production-compatibility migrations and an exact-slug deployment gate. No remote write was made.
Those migrations must pass clean, legacy, partial-state, replay, rollback, RLS and cross-user
contracts before an authenticated backup and explicitly authorized database-to-Edge deployment.

The production build environment gate is independently pinned to the expected Supabase project
and public-key fingerprint. It inspects the semantic Hermes string table instead of accepting byte
prefixes, rejects competing hosts/ports/userinfo and privileged or prefix-lookalike keys, and has
passed both the real Android AAB and the real iOS Release simulator app without logging either
configured value.

## Terminal launch blockers

1. The candidate does not yet offer deletion of the complete shared AgroRumo account. Apple and
   Google require account deletion when account creation is offered in-app; resolving this safely
   requires a portfolio-wide real-data decision and coordinated implementation, or formal recorded
   store/legal acceptance of the app-scoped model. `expo-app/store-assets/ACCOUNT_DELETION_BLOCKER.md`
   prevents the current data-deletion URL from being represented as full account deletion.
2. Public App Store and Play listings still contain fixed-speed, accuracy, offline and
   professional-equivalence claims from the prior release. Authenticated console changes must copy
   the canonical repository metadata and be verified publicly before submission or promotion.
3. The production landing and legal pages still carry “Agrônomo IA”, broad account/data deletion
   and billing language that does not match the reviewed free app. The tested landing candidate
   requires an explicitly authorized production deployment and public verification.
4. Apple distribution material observed during the archive attempt is compromised and must be
   revoked/rotated externally. Any IPA produced before that rotation is ineligible; a new archive
   must be generated from the committed candidate with the replacement certificate/profile.
5. App Store Connect and Play Console declarations need authenticated final comparison with the
   candidate binaries. This includes Apple's age-rating questions required since 2026-01-31 and
   the final Google Data Safety answers.
6. The exposed reviewer password must be rotated externally, then supplied only through the
   stores' secure reviewer fields and exercised once against the release backend.
7. The `process-deletions` retry schedule needs live production evidence; synchronous app-scoped deletion does not depend on a global identity purge.
8. Data Safety shared-data answers need current service-provider contract evidence.
9. Real store screenshots must be captured from the signed candidate.
10. The active remote-only `disease-risk` function and five active remote-only Pragas billing functions require separately authorized production reconciliation; they must not be overwritten from absent source except by reviewed tombstones.
11. The 82 aggregated `pragas_subscriptions` rows are ambiguous legacy state; no real row may be deleted or rewritten without explicit authorization and a preserved audit record.
12. Production publication remains an explicit external action.
13. Four of 342 production diagnoses contain historical coordinates that may predate two-decimal
    minimization. Coarsening them changes real user data and requires an authorized, backed-up,
    auditable production migration; no repository-only task can close this gate.
14. Accessibility Nutrition Labels must remain undeclared until every common task in
    `docs/accessibility-matrix.md` passes on the signed candidate, separately on iPhone and iPad.
15. Production does not yet contain the schema/RPC/storage contracts or nine exact Edge slugs used
    by this candidate. Deployment is blocked on the completed compatibility gate, an authenticated
    pre-change backup/snapshot with restore evidence, and explicit authorization for the direct
    production change; deploying only the client or only the login shim is unsafe.

All other findings in this document are implemented and tested, N/A with evidence, or tied to a precise external verification.
