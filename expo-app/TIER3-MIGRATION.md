# TypeScript strictness — current contract

The application enforces all of these options in `tsconfig.json`:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true
}
```

The former error inventory is obsolete. It must not be used to justify disabling a flag, widening
a type without runtime evidence or accepting a release with compiler errors.

Run the blocking gate from `expo-app` after a clean install:

```bash
npm ci
npm run typecheck
```

The same gate runs in CI. A non-zero result blocks the candidate and must be fixed in source or in
an accurate local type declaration; suppressions that hide a reachable runtime error are not an
acceptable release path.
