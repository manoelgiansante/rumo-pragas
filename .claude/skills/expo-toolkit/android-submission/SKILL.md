---
name: android-submission
description: Prepare and validate Rumo Pragas for Google Play using a locally built signed AAB, canonical store assets, Data Safety evidence, guarded separate submission, testing tracks, and rollout gates. Use for Play Console preparation, Android release review, internal testing, store metadata, or Android submission in this repository.
---

# Rumo Pragas Google Play submission

## Permanent local-build rule

- Build the Android artifact locally only.
- Never start an Expo/EAS cloud build through CLI, MCP, dashboard, workflow, automation, or fallback.
- Never combine build and submission.
- If the local build is blocked, stop and report the blocker.

Repository `AGENTS.md` and the executable guards are authoritative.

## Prepare the candidate

Run from `expo-app/` after the required code and store gates pass:

```bash
./scripts/launch.sh --profile production --platform android --local
```

Inspect the resulting signed `.aab`, verify its embedded production environment, record its SHA-256,
and bind screenshots and the independent review to that exact artifact. Never substitute a remote
build identifier or a latest-build alias.

Use these versioned sources of truth:

- `BUILD_CHECKLIST.md`
- `SUBMISSION_CHECKLIST.md`
- `store-assets/SCREENSHOT_CHECKLIST.md`
- `store-assets/android/DATA_SAFETY.md`
- `store-assets/android/pragas-datasafety-filled.csv`
- `store-assets/ACCOUNT_DELETION_BLOCKER.md`

Do not represent fixture, archived, mock, or historical screenshots as release evidence.

## Play Console gates

Before any upload or rollout, verify:

- package, version, target SDK, signing identity, and Play App Signing compatibility;
- canonical descriptions, icon, feature graphic, screenshots, privacy policy, and support URL;
- Data Safety, permissions, content rating, target audience, ads, and account-deletion declarations;
- reviewer access and real-device smoke evidence;
- absence of unresolved global blockers in the versioned store-status gate.

Treat authenticated console changes, tester invitations, uploads, review submission, and rollout as
external actions requiring the applicable authorization. Never expose service-account JSON or
keystore secrets.

## Separate submission

After the exact local AAB is reviewed and submission is explicitly authorized, use only the guarded
repository command:

```bash
./scripts/submit.sh \
  --platform android \
  --artifact /absolute/path/to/reviewed-candidate.aab \
  --confirm-authorized-submission
```

The command must validate the same private artifact snapshot it submits. Do not use an automatic
submission option, a build hook, or a remote-build selector. A first manual Play Console upload, if
required, must also use the reviewed local AAB and explicit authorization.

## Release progression

Prefer internal testing, then the authorized closed/open track, then a staged production rollout.
Do not promote publicly without the store gate, real-device QA, monitoring, rollback plan, and
explicit publication authority.

Monitor Android vitals, crash-free sessions, authentication, diagnosis, deletion, and push delivery.
Halt a rollout on material regression or privacy/security inconsistency.
