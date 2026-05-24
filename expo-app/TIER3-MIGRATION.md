# TypeScript Strict Tier 3 Migration — pragas

> **Status: DRAFT — flags enabled, errors NOT yet fixed.**

## What Changed

`tsconfig.json` adds two flags:

```json
"noUncheckedIndexedAccess": true,
"exactOptionalPropertyTypes": true
```

## Baseline (before flags)

`tsc --noEmit` reported **0 errors** on `main`.

## Tier 3 Impact (after flags)

`tsc --noEmit` now reports:

- **Total errors:** 81
- **In `__tests__/`:** 17
- **In source code:** 64

### Error category histogram

```
  17 error TS2769
  17 error TS2379
  14 error TS2532
  11 error TS18048
   9 error TS2375
   7 error TS2412
   5 error TS2345
   1 error TS2322
```

### Top files by error count

```
  11 app/
   8 scripts/validate-diagnose.ts
   6 vendor/ia-hub-client/src/client.ts
   5 vendor/ia-hub-client/src/errors.ts
   5 hooks/useMipKnowledge.ts
   5 __tests__/services/diagnosisQueue.test.ts
   4 services/diagnosis.ts
   3 __tests__/services/alerts.test.ts
   3 __tests__/components/DiagnosisCard.test.tsx
   2 vendor/ia-hub-client/src/diagnose.ts
   2 vendor/ia-hub-client/src/chat.ts
   2 services/weather.ts
   2 services/subscriptionSync.ts
   2 app/paywall.tsx
   2 app/diagnosis/result.tsx
```

## Why DRAFT

This PR enables Tier 3 strict flags to surface the inventory of latent
unsafe-index-access and exact-optional-property issues. Fixing 64
source-code errors safely (without regressions) is **out of scope for a
single autonomous PR** and requires:

1. Updating shared component prop interfaces (`Input`, `Row`, `Card`,
   etc.) to widen `exactOptionalPropertyTypes` (add `| undefined` to
   optional fields callers already pass undefined into).
2. Guarding array/index access in service & util layers (TS2532/TS18048).
3. Auditing third-party type stubs (vendor/ia-hub-client) for prop drift.

**Recommended follow-up:** split into 5-8 focused PRs, one per
high-error directory (services/, hooks/, app/(tabs)/, components/UI/...).

## How to verify

```bash
cd /tmp/wt-pragas-tier3/expo-app
npx tsc --noEmit  # expect ~81 errors
npm test          # tests still pass (unchanged behavior)
```

## Rollback

Revert this PR's tsconfig change — no runtime behavior was modified.

---

CEO_CODE_AUTH: cross-app-typescript-strict-tier-3-2026-05-24
Generated: 2026-05-24
