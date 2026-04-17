# TypeScript Configuration Notes

## Stack Overflow with `tsc --noEmit` (TS 5.9 + React 19)

TypeScript 5.9 with React 19 types has a known circular type resolution issue that causes
`Maximum call stack size exceeded` when running `tsc --noEmit` with default stack size.

**Workaround:** Run with increased Node.js stack:

```bash
node --stack-size=8192 ./node_modules/.bin/tsc --noEmit
```

This does NOT affect:

- Metro bundler (used by Expo)
- EAS builds
- ESLint type checking
- Runtime behavior

The issue is tracked in the TypeScript repo and expected to be fixed in TS 5.10+.

## skipLibCheck

Enabled in tsconfig.json to skip type-checking of `.d.ts` files from node_modules,
improving build performance without affecting type safety of our source code.
