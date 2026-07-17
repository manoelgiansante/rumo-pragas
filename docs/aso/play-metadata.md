# Google Play metadata — Rumo Pragas

Package: com.agrorumo.rumopragas

Prepared version: 1.0.11

Locale: pt-BR
Business model: free, no ads, no in-app purchases

## Canonical files

| Play field | Repository source |
| --- | --- |
| App name | expo-app/store-assets/metadata/android/pt-BR/title.txt |
| Short description | expo-app/store-assets/metadata/android/pt-BR/short_description.txt |
| Full description | expo-app/store-assets/metadata/android/pt-BR/full_description.txt |
| Release notes | expo-app/store-assets/metadata/android/pt-BR/whats_new.txt |
| Data Safety worksheet | expo-app/store-assets/android/DATA_SAFETY.md |
| Screenshot acceptance | expo-app/store-assets/SCREENSHOT_CHECKLIST.md |

## Console answers

- Category: Tools.
- Contains ads: No.
- Target audience: adults working with or studying agriculture; not directed to children.
- In-app products: none.
- Approximate location: optional.
- Precise location: not used.
- Camera: used for user-initiated crop images.
- Broad media access: not requested; system picker is used.
- Microphone: not used in the release configuration.
- Rumo Pragas data deletion: available in app and at the public URL; shared identity remains disclosed.

## Release flow

1. Build the signed AAB from the candidate commit.
2. Inspect target SDK, merged permissions and embedded SDKs.
3. Reconcile the binary with the Data Safety worksheet.
4. Capture real phone and supported-tablet screenshots.
5. Upload first to Internal testing.
6. Complete smoke tests with new and existing accounts.
7. Promote gradually only after crash, login, diagnosis, queue, history and deletion checks.

Local Android signing material must be exercised before declaring a build blocker. Authenticated Play
Console access and any missing value proven by that build attempt are external gates. Production
promotion is a separate publication action.
