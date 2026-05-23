#!/usr/bin/env bash
#
# eas-post-build-sentry.sh — finalize Sentry native release after EAS build.
#
# WHY this exists (K11 / W17-4):
#   The @sentry/react-native Expo plugin uploads source maps + debug symbols
#   during the Hermes bundle step. It does NOT:
#     (a) call `sentry-cli releases set-commits --auto` (no commit -> issue link),
#     (b) call `sentry-cli releases finalize` (release stays "unreleased" forever),
#     (c) tag the build with a deterministic release name matching the slug used
#         by `services/sentry-release.ts` / `Sentry.init({ release })` at runtime.
#
#   Without finalize, Sentry UI shows "Release not finalized" forever and the
#   "first seen" / "last seen" / "regression detection" features stay disabled.
#   Without set-commits --auto, the issue page never links to the commit that
#   introduced the crash — wasting 5-15min of debugging per incident.
#
# RELEASE FORMAT:
#   ${SLUG}@${VERSION}+${BUILD_NUMBER}
#   e.g. rumo-pragas@1.4.2+87
#   Must match `Sentry.init({ release })` at runtime.
#   `services/sentry-release.ts` already resolves this (reads app.json/eas env).
#
# INVOCATION:
#   1. Locally (preferred — matches ZERO-D `eas build --local`):
#        npm run sentry:finalize
#      Wired in package.json:
#        "sentry:finalize": "bash scripts/eas-post-build-sentry.sh"
#
#   2. Cloud parity (EAS Build VM):
#      eas-build-on-success hook in package.json:
#        "eas-build-on-success": "bash scripts/eas-post-build-sentry.sh"
#      EAS Build automatically invokes this script in the build VM after a
#      successful build. SENTRY_AUTH_TOKEN must be present as an EAS secret.
#
# DEPENDENCIES:
#   - sentry-cli (auto-installed via npx if absent locally; baked into EAS VM)
#   - jq (BSD jq present on macOS by default; EAS Linux VM has it preinstalled)
#   - SENTRY_AUTH_TOKEN env var OR ~/.sentryclirc auth token
#   - SENTRY_ORG + SENTRY_PROJECT env vars (also read from eas.json env block)
#
# NON-FATAL BY DESIGN:
#   - Missing auth token -> warn + exit 0 (local dev should not block build)
#   - Set-commits failure -> warn + continue (finalize is more important)
#   - Finalize 4xx -> exit 1 (this is the whole point of the script)
#
# AUTHOR: K11 cross-app rollout 2026-05-23
# RELATED: W17-4 (helper), V8-01 (web sourcemaps), ZERO-O (observability)

set -euo pipefail

# ----------------------------------------------------------------------------
# Config — resolve slug + version + build number from app.json
# ----------------------------------------------------------------------------
APP_JSON="${APP_JSON:-app.json}"
if [ ! -f "$APP_JSON" ]; then
  echo "[eas-post-build-sentry] [skip] $APP_JSON not found — run from Expo project root."
  exit 0
fi

# expo.slug is the canonical name for Sentry releases.
# Fall back to expo.name if slug is missing.
SLUG="$(jq -r '.expo.slug // .expo.name // empty' "$APP_JSON")"
if [ -z "$SLUG" ]; then
  echo "[eas-post-build-sentry] ERROR: cannot resolve expo.slug or expo.name from $APP_JSON" >&2
  exit 1
fi

VERSION="$(jq -r '.expo.version // empty' "$APP_JSON")"
if [ -z "$VERSION" ]; then
  echo "[eas-post-build-sentry] ERROR: expo.version missing from $APP_JSON" >&2
  exit 1
fi

# Build number: iOS buildNumber preferred, fallback to Android versionCode, then "0".
BUILD_NUMBER="$(jq -r '.expo.ios.buildNumber // .expo.android.versionCode // "0"' "$APP_JSON")"

# Allow override via EAS env (production profile may set EAS_BUILD_RUN_ID).
RELEASE="${SENTRY_RELEASE_OVERRIDE:-${SLUG}@${VERSION}+${BUILD_NUMBER}}"

# ----------------------------------------------------------------------------
# Config — Sentry org/project (eas.json env block must export these)
# ----------------------------------------------------------------------------
ORG="${SENTRY_ORG:-}"
PROJECT="${SENTRY_PROJECT:-}"

if [ -z "$ORG" ] || [ -z "$PROJECT" ]; then
  echo "[eas-post-build-sentry] ERROR: SENTRY_ORG and SENTRY_PROJECT env vars required." >&2
  echo "[eas-post-build-sentry] Set them in eas.json build.production.env or shell env." >&2
  exit 1
fi

# ----------------------------------------------------------------------------
# Auth — token or ~/.sentryclirc
# ----------------------------------------------------------------------------
if [ -z "${SENTRY_AUTH_TOKEN:-}" ] && [ ! -f "$HOME/.sentryclirc" ]; then
  echo "[eas-post-build-sentry] [skip] SENTRY_AUTH_TOKEN unset and ~/.sentryclirc missing."
  echo "[eas-post-build-sentry]        Release ${RELEASE} will NOT be finalized."
  echo "[eas-post-build-sentry]        Local dev OK; in CI set SENTRY_AUTH_TOKEN secret."
  exit 0
fi

# ----------------------------------------------------------------------------
# Resolve sentry-cli — prefer local node_modules, fallback to npx, then global.
# ----------------------------------------------------------------------------
if [ -x "node_modules/.bin/sentry-cli" ]; then
  SENTRY_CLI="node_modules/.bin/sentry-cli"
elif command -v sentry-cli >/dev/null 2>&1; then
  SENTRY_CLI="$(command -v sentry-cli)"
else
  echo "[eas-post-build-sentry] sentry-cli not found locally — using npx (one-shot install)."
  SENTRY_CLI="npx --yes @sentry/cli@latest"
fi

# ----------------------------------------------------------------------------
# Finalize sequence — new -> set-commits --auto -> finalize
# ----------------------------------------------------------------------------
echo "[eas-post-build-sentry] Release: ${RELEASE}"
echo "[eas-post-build-sentry] Org:     ${ORG}"
echo "[eas-post-build-sentry] Project: ${PROJECT}"

export SENTRY_ORG="$ORG"
export SENTRY_PROJECT="$PROJECT"

# 1. Create release (idempotent — 409 if exists is treated as success).
if $SENTRY_CLI releases new "$RELEASE" 2>&1 | grep -qiE 'already exists|created release'; then
  echo "  [ok] release created/exists"
else
  # Re-run to surface error if the grep above missed; sentry-cli exits non-zero on real failure.
  $SENTRY_CLI releases new "$RELEASE"
  echo "  [ok] release created"
fi

# 2. Set commits (non-fatal — git history may be shallow on EAS VM).
if $SENTRY_CLI releases set-commits "$RELEASE" --auto --ignore-missing 2>/dev/null; then
  echo "  [ok] commits associated (--auto)"
else
  echo "  [warn] set-commits failed (shallow git? non-fatal) — continuing to finalize"
fi

# 3. Finalize (THIS IS THE POINT — must succeed).
$SENTRY_CLI releases finalize "$RELEASE"
echo "  [ok] release finalized"

# ----------------------------------------------------------------------------
# Optional: upload source maps if dist/ present (web export piggyback).
# Skipped for pure native builds — Sentry Expo plugin already uploaded those
# during the build step. This block only fires if a parallel web export ran.
# ----------------------------------------------------------------------------
if [ -d "dist/_expo/static/js" ]; then
  echo "[eas-post-build-sentry] dist/_expo detected — uploading web source maps too."
  if $SENTRY_CLI releases files "$RELEASE" upload-sourcemaps dist/_expo/static/js \
       --rewrite --ignore-missing --strip-prefix dist >/dev/null 2>&1; then
    echo "  [ok] web source maps uploaded"
  else
    echo "  [warn] web source maps upload failed (non-fatal)"
  fi
fi

echo "[eas-post-build-sentry] Done. View release:"
echo "  https://${ORG}.sentry.io/releases/${RELEASE}/?project=${PROJECT}"
