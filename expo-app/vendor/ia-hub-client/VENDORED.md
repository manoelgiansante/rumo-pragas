# @agrorumo/ia-hub-client — vendored copy

This is a **vendored snapshot** of the universal Rumo IA Hub SDK. The canonical
source lives in `agrorumo-monorepo/packages/ia-hub-client/` (referenced via the
internal IA Hub initiative IA-3). It is vendored here because:

1. The Pragas repo is standalone (separate Git remote from the monorepo).
2. The `@agrorumo/ia-hub-client` package is `private: true` and has not been
   published to a registry, so `npm install` cannot resolve it from the wire.
3. CI (`npm ci` in `expo-app/`) needs a deterministic local resolution.

## How it is referenced

`expo-app/package.json` has:

```json
{
  "dependencies": {
    "@agrorumo/ia-hub-client": "file:./vendor/ia-hub-client"
  }
}
```

## How to refresh

When the canonical SDK ships a new version (e.g. streaming improvements,
auth changes, new endpoints), rebuild dist and copy back:

```bash
# in the monorepo
cd packages/ia-hub-client
pnpm build

# in pragas repo
rm -rf expo-app/vendor/ia-hub-client/{dist,src}
cp -r ../agrorumo-monorepo/packages/ia-hub-client/dist expo-app/vendor/ia-hub-client/
cp -r ../agrorumo-monorepo/packages/ia-hub-client/src  expo-app/vendor/ia-hub-client/
# bump version in vendor/ia-hub-client/package.json to match canonical
```

Then bump `expo-app` EAS build number (`buildNumber` iOS, `versionCode` Android)
and ship a new mobile build per ZERO-P.

## Why not workspaces / git submodules / npm pack?

- **Workspaces:** Pragas repo is not part of the monorepo. Adding it would
  require moving the whole project — out of scope.
- **Submodules:** Brittle in CI, easy to leave out of sync, Expo + EAS Build
  do not auto-init submodules.
- **`npm pack` tarball:** Possible upgrade path; vendored dir is simpler for
  the first integration.

## License

UNLICENSED — internal AgroRumo only. Do not extract.
