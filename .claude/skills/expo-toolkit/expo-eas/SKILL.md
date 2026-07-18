---
name: expo-eas
description: Configure, validate, troubleshoot, and release the Rumo Pragas Expo app with its pinned EAS CLI, mandatory local iOS/Android builds, separate authorized submission, credentials, versioning, and environment gates. Use for EAS configuration, mobile build preparation, signing, submission planning, or EAS-related failures in this repository.
---

# Rumo Pragas Expo/EAS

## Permanent local-build rule

- Compile every iOS and Android artifact locally.
- Never start an Expo/EAS cloud build through CLI, MCP, dashboard, workflow, automation, or fallback.
- Never combine build and submission.
- Use one platform per invocation: `ios` or `android`.
- If local execution is blocked, stop and report the blocker. Do not switch to a remote builder.

Repository `AGENTS.md` and the guards in `expo-app/scripts/eas-pinned.sh` are authoritative.

## Build workflow

Run from `expo-app/` only after the requested validation gates pass:

```bash
./scripts/launch.sh --profile production --platform ios --local
./scripts/launch.sh --profile production --platform android --local
```

Use the same launcher for internal profiles:

```bash
./scripts/launch.sh --profile preview --platform android --local
./scripts/launch.sh --profile storeQa --platform ios --local
```

The launcher delegates production to `scripts/eas-local-production-build.sh`. The pinned executor
must reject a missing local flag, a missing or combined platform, automatic submission, and every
remote EAS Workflow command before invoking the CLI.

Do not run a build merely to inspect configuration. Prefer static validation and read-only status
commands through `./scripts/eas-pinned.sh` when they are necessary and authorized.

## Environment and versioning

Validate production names without printing values:

```bash
./scripts/validate-prod-env.sh production
```

This command defaults to the project-pinned executor. Its system-CLI mode is reserved exclusively
for isolated fixtures and is forbidden for release work.

Keep `eas.json` aligned with the repository validators. Treat remote version-registry reads as
metadata operations, not permission to create a remote build. Never expose credentials, serialized
jobs, environment values, or raw EAS output.

## Credentials

- Keep Apple and Android signing material outside Git.
- Never rotate, replace, upload, or revoke credentials without explicit authorization.
- Preserve the versioned Apple signing blocker until the required external rotation evidence exists.
- Never borrow credentials from another AgroRumo app.

## Submission

Build first, inspect the exact local `.ipa` or `.aab`, and freeze its SHA-256. Submit only as a
separate, explicitly authorized operation through the guarded repository script:

```bash
./scripts/submit.sh \
  --platform android \
  --artifact /absolute/path/to/reviewed-candidate.aab \
  --confirm-authorized-submission
```

Use the equivalent `.ipa` flow for iOS. Never use a remote build identifier, a latest-build alias,
an automatic-submit option, or a build hook. Store publication remains a separate external gate.

## Troubleshooting

1. Reproduce with static checks or fixture tests before any real release command.
2. Run `bash -n` and ShellCheck on changed shell scripts.
3. Run `npm run test:eas-redactor` under Node 22.22.3.
4. Inspect only sanitized local status output.
5. Stop on missing signing material, environment configuration, authorization, or local toolchain.

Never diagnose a local failure by retrying in the cloud.
