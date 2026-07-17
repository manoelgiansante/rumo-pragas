# Rumo Pragas — store listing master

Canonical release copy lives only in expo-app/store-assets/metadata. This document records constraints and publishing decisions for version 1.0.11.

## Product truth

- Free app with no active purchase, subscription, paid tier, trial or paywall.
- Image identification uses Agrio by default through the Supabase backend; Anthropic Claude can be
  selected by secure server configuration.
- The AI assistant uses Gemini by default; Anthropic Claude can be selected by secure server
  configuration.
- Image analysis requires internet. Connectivity failures can be kept in a local queue and retried later; there is no offline inference.
- Results are probabilistic hypotheses with confidence and possible alternatives.
- The current diagnosis insert stores the structured result, date and optional consented approximate coordinates. It does not write an image URL into history.
- The app does not provide a community feed, regional user map, measured infestation severity, definitive identification, exact treatment, product selection or dosage.
- Agricultural product decisions require a legally qualified professional and must use the official AGROFIT registry under Lei nº 14.785/2023 and Resolução Confea nº 1.149/2025.

## iOS

| Field            | Source                                               | Limit |
| ---------------- | ---------------------------------------------------- | ----: |
| Name             | store-assets/metadata/ios/pt-BR/name.txt             |    30 |
| Subtitle         | store-assets/metadata/ios/pt-BR/subtitle.txt         |    30 |
| Keywords         | store-assets/metadata/ios/pt-BR/keywords.txt         |   100 |
| Promotional text | store-assets/metadata/ios/pt-BR/promotional_text.txt |   170 |
| Description      | store-assets/metadata/ios/pt-BR/description.txt      | 4,000 |
| Release notes    | store-assets/metadata/ios/pt-BR/whats_new.txt        | 4,000 |

Category: Utilities. Secondary category: Productivity. Price: Free. In-app purchases: No.

## Android

| Field             | Source                                                    | Limit |
| ----------------- | --------------------------------------------------------- | ----: |
| Title             | store-assets/metadata/android/pt-BR/title.txt             |    30 |
| Short description | store-assets/metadata/android/pt-BR/short_description.txt |    80 |
| Full description  | store-assets/metadata/android/pt-BR/full_description.txt  | 4,000 |
| Release notes     | store-assets/metadata/android/pt-BR/whats_new.txt         |   500 |

Category: Tools. Contains ads: No. In-app products: None.

## Required URLs

| Purpose                                   | URL                                       |
| ----------------------------------------- | ----------------------------------------- |
| Marketing                                 | https://pragas.agrorumo.com               |
| Privacy                                   | https://pragas.agrorumo.com/privacidade   |
| Terms                                     | https://pragas.agrorumo.com/termos        |
| Support                                   | https://pragas.agrorumo.com/suporte       |
| Rumo Pragas app-data deletion information | https://pragas.agrorumo.com/excluir-conta |

The Play account-deletion field and App Store submission remain blocked by
`store-assets/ACCOUNT_DELETION_BLOCKER.md`. The URL above documents app-scoped data deletion; it
must not be represented as deletion of the shared AgroRumo account.

## Publishing gates

- Replace the unsafe live App Store and Google Play copy observed on 2026-07-14 with the canonical
  files in this repository. The public listings still carry fixed-speed, accuracy, offline and
  professional-equivalence claims; repository changes do not update either console.
- Validate UTF-8 character counts with the release script or equivalent.
- Compare Data Safety and Apple privacy labels with the signed binaries and live server providers.
- Put reviewer credentials only in the secure store-console fields.
- Use only screenshots captured from the exact release candidate and approved through store-assets/SCREENSHOT_CHECKLIST.md.
- Perform human review in both consoles before submission.
- Resolve and remove the reviewed account-deletion blocker only after the shared AgroRumo identity
  has an approved full-account deletion contract or formal store/legal acceptance of the current
  app-scoped model.
- Store upload and publication require authenticated external access and are not performed by documentation changes.

## Prohibited carry-over claims

Do not reintroduce speed or accuracy percentages, user-count claims, agronomist equivalence, offline analysis, measured severity, exact treatment, dosage, product recommendation, community reports, regional maps, photo history or paid-plan copy without current product evidence and legal review.
