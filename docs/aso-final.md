# ASO release baseline — Rumo Pragas

Status: prepared for version 1.0.11 on 2026-07-14.

## Positioning

Rumo Pragas supports visual field triage. A user sends a crop image and receives a probabilistic identification hypothesis, a confidence value and possible alternatives. The correct conversion promise is better context for the next field decision, not certainty, prescription or replacement of a qualified professional.

## Search intent

Primary intent:

- Agricultural pest identification.
- Crop symptom image.
- Soy, corn, coffee and cotton field monitoring.
- Integrated pest management education.

The iOS keyword field is maintained at expo-app/store-assets/metadata/ios/pt-BR/keywords.txt. It avoids repeated words from the name and subtitle, purchase-intent chemical terms and professional-equivalence language.

## Store copy

The approved iOS and Android text is stored under expo-app/store-assets/metadata. Those files are canonical; copying legacy text from release notes, screenshots or press material is prohibited.

The copy explicitly states:

- Free app, no purchase or subscription.
- Agrio visual processing by default, with Anthropic Claude configurable on the server.
- Gemini chat by default, with Anthropic Claude configurable on the server.
- Network-required analysis with retry queue.
- Probabilistic output and human validation.
- Lei nº 14.785/2023, Resolução Confea nº 1.149/2025 and AGROFIT.

## Visual conversion sequence

Use real release-candidate captures in this order:

1. Home and primary image action.
2. Crop selection and capture.
3. Result with hypothesis, confidence and warning.
4. History with only persisted fields.
5. Library.
6. AI assistant with educational framing.
7. Privacy and deletion of Rumo Pragas app data, with the shared identity contract visible.

The acceptance matrix is expo-app/store-assets/SCREENSHOT_CHECKLIST.md. Existing composites are not approved by existence alone.

## Release validation

- Character limits pass.
- No prohibited claims in metadata or screenshots.
- Public URLs return 200.
- Data Safety and Apple privacy labels match the signed artifacts.
- Review account is supplied only through secure console fields.
- Screenshots match the candidate build.
- Second-person review completed in App Store Connect and Play Console.
