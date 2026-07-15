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
  missing device sets and invalid dimensions.
- Reconfirm every requirement in the official
  [Apple screenshot specification](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
  and [Google Play preview-asset guide](https://support.google.com/googleplay/android-developer/answer/9866151)
  on upload day.
- Obtain a second-person comparison between screenshots and the release build.

Publication is blocked until every row has real evidence and no forbidden claim.

## Required output paths

- iOS iPhone: at least five opaque PNGs under `ios/iphone-6.9/`, using one current Apple-accepted
  6.9-inch dimension consistently.
- iOS iPad: because the app runs on iPad, at least five opaque PNGs under `ios/ipad-13/`, using one
  current Apple-accepted 13-inch dimension consistently.
- Android phone: at least five opaque PNGs under `android/phone/`; each must be 320–3840 px and no
  more than 2:1, with 1080×1920 portrait preferred.
- Android 10-inch tablet: at least four opaque PNGs under `android/tablet-10/`, 1080–7680 px at
  9:16 portrait or 16:9 landscape.
- Google Play feature graphic: `android/feature-graphic.png`, generated from
  `android/_src/feature-graphic.svg`, opaque and visually inspected at 1024×500. Its console alt
  text is in `android/feature-graphic-alt.txt`; the graphic contains no price/promotion claim.

Absence of real candidate screenshots is an explicit store-submission blocker, never permission to
use mockups or historical files.
