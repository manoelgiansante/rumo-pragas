# Real screenshot checklist

All previous PNG sets were removed from the submission paths because they showed unsupported
features and claims. They remain only under `store-assets/archive/` and
`expo-app/store-assets/archive/`, each marked **ARQUIVO HISTÓRICO — NÃO USAR**.

The iOS and Android screenshot submission directories must remain empty until captures from the
exact 1.0.11 release candidate pass this checklist. Never promote an archived image back into a
submission directory.

## Capture matrix

| Scene            | Required evidence                                                  | Forbidden claim                                                |
| ---------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| Home             | Current navigation and primary image action                        | Speed, user-count or accuracy promise                          |
| Capture and crop | Real camera or system-picker flow                                  | Identification without internet                                |
| Result           | Real QA image, hypothesis, confidence, alternatives and AI warning | Measured severity, exactness or prescription                   |
| History          | Only fields actually persisted                                     | Stored photo, map or community reports                         |
| Library          | Current searchable educational content                             | Unsupported catalog size                                       |
| AI assistant     | Educational question and visible limitation                        | Agronomist equivalence, dose or product direction              |
| Settings         | Privacy, support and deletion of Rumo Pragas data                  | Paid plan, trial, restoration or global-identity purge promise |

## Privacy and quality gates

- Use a dedicated QA account and synthetic or licensed crop imagery.
- Remove personal email, coordinates, notification content and device identifiers.
- Capture directly from the release candidate on physical devices or official simulators.
- Do not edit the product UI into the screenshot.
- Any decorative frame or caption must use the approved store copy and remain visually distinguishable from the app UI.
- Verify contrast, clipping, safe areas, status bar and pt-BR locale. The app is intentionally
  locked to light appearance.
- Run `node scripts/validate-store-assets.mjs ios` and
  `node scripts/validate-store-assets.mjs android`. The gate rejects transparency, wrong paths,
  missing device sets, invalid dimensions, mixed dimensions within one set, duplicate content,
  unexpected nested directories, truncated/corrupt PNG chunks and invalid CRC/pixel streams.
- Reconfirm every requirement in the official
  [Apple screenshot specification](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
  and [Google Play preview-asset guide](https://support.google.com/googleplay/android-developer/answer/9866151)
  on upload day.
- Obtain an independent second comparison between screenshots and the exact release build. The
  capturer and reviewer must be different identities in the provenance manifest.

Publication is blocked until every row has real evidence and no forbidden claim.

## Required output paths

- iOS iPhone: five to ten opaque PNGs directly under `ios/iphone-6.9/`, using one current
  Apple-accepted 6.9-inch dimension consistently.
- iOS iPad: because the app runs on iPad, five to ten opaque PNGs directly under `ios/ipad-13/`,
  using one current Apple-accepted 13-inch dimension consistently.
- Android phone: five to eight opaque PNGs directly under `android/phone/`; each must be 320–3840
  px and no more than 2:1, with 1080×1920 portrait preferred.
- Android 10-inch tablet: at least four opaque PNGs under `android/tablet-10/`, 1080–7680 px at
  9:16 portrait or 16:9 landscape, with a maximum of eight captures and one consistent dimension
  for the complete set.
- Google Play feature graphic: `android/feature-graphic.png`, generated from
  `android/_src/feature-graphic.svg`, opaque and visually inspected at 1024×500. Its console alt
  text is in `android/feature-graphic-alt.txt`; the graphic contains no price/promotion claim.

Absence of real candidate screenshots is an explicit store-submission blocker, never permission to
use mockups or historical files.

## Machine-readable provenance

When any submission screenshot exists, `store-assets/screenshots-manifest.json` is mandatory. Do
not create an empty or provisional manifest while the screenshot directories are empty. The
manifest is evidence bound to file bytes; changing any image after review invalidates its hash.

```json
{
  "schemaVersion": 1,
  "appVersion": "1.0.11",
  "candidateCommit": "FULL_40_CHARACTER_LOWERCASE_GIT_SHA",
  "environment": "qa",
  "captureSource": "release-candidate",
  "capturedAt": "2026-07-15T12:00:00.000Z",
  "capturedBy": "IDENTIFIED_CAPTURE_OPERATOR",
  "platforms": {
    "ios": {
      "sets": {
        "iphone-6.9": [
          {
            "file": "ios/iphone-6.9/01-home.png",
            "scene": "home",
            "sha256": "LOWERCASE_SHA256_OF_THE_EXACT_FILE"
          }
        ],
        "ipad-13": []
      },
      "candidateArtifact": {
        "kind": "ipa",
        "appVersion": "1.0.11",
        "candidateCommit": "SAME_FULL_40_CHARACTER_LOWERCASE_GIT_SHA",
        "buildId": "EAS_BUILD_UUID_OR_NULL",
        "sha256": "SIGNED_IPA_SHA256_OR_NULL"
      },
      "secondReview": {
        "reviewer": "IDENTIFIED_INDEPENDENT_REVIEWER",
        "reviewedAt": "2026-07-15T13:00:00.000Z",
        "candidateCommit": "SAME_FULL_40_CHARACTER_LOWERCASE_GIT_SHA",
        "attestation": "screenshots-and-artifact-match-release-candidate",
        "verdict": "approved"
      }
    }
  }
}
```

Repeat the platform object with `android.sets.phone`, `android.sets.tablet-10` and
`android.featureGraphic` when Android screenshots exist. The feature object contains exactly
`{"file":"android/feature-graphic.png","sha256":"..."}` and is covered by the same independent
review. Android `candidateArtifact.kind` is `aab`; iOS uses `ipa`. Each candidate artifact repeats
the Git commit and declares at least one immutable identifier: a canonical EAS build UUID and/or
the SHA-256 of the exact signed local artifact. Its `appVersion` must equal the manifest,
`package.json` and `app.json` in both the validated checkout and `candidateCommit`; for a local
IPA/AAB, the gate also inspects `CFBundleShortVersionString`/`android:versionName` inside the exact
package. `scripts/submit.sh` copies a selected local artifact into a private read-only snapshot and
uses that same snapshot for both validation and EAS, so changing the original path cannot swap the
submitted bytes. Every PNG must
appear exactly once with its real SHA-256. `scene` must be one of
`home`, `capture-and-crop`, `result`, `history`, `library`, `ai-assistant` or `settings`.
The union of both device sets on each platform must prove all seven canonical scenes; a minimum
five-image set is not permission to omit checklist evidence.
`environment` accepts only `qa`, `staging` or `production`, and `captureSource` is exactly
`release-candidate`. Fixture, mock, historical and archive material cannot become eligible through
manifest declaration or by copying it into a submission directory. The gate decodes screenshots
to canonical RGBA pixels and compares their visual SHA-256 with all sets and PNGs under both
`/store-assets/archive` and `expo-app/store-assets/archive`, plus the known QA-source, fixture, mock
and historical roots. Recompression, filters and ancillary chunks therefore cannot promote
duplicate content. PNG file bytes, IHDR dimensions and pixel area are bounded before decompression,
validated chunk-by-chunk (including CRC, unique palette and palette indices) and must be
non-interlaced.

The manifest itself must be a unique regular file directly inside `store-assets` (no symbolic or
hard links, directories, FIFOs or external targets), may contain at most 256 KiB and may declare at
most 36 screenshot entries across the two platforms.

`candidateCommit` must resolve to a real commit that is the current HEAD or its ancestor. CI jobs
that validate non-empty screenshot sets must use a full checkout (`actions/checkout` with
`fetch-depth: 0`) or otherwise fetch that exact commit before the gate runs. A shallow checkout
that cannot prove the object fails closed; a syntactically valid SHA is not provenance evidence.
