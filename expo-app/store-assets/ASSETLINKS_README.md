# App Links — `assetlinks.json` (com.agrorumo.rumopragas)

- **SHA-256:** Play Console → Setup → App integrity → App signing → copiar "SHA-256 certificate fingerprint" (chave gerenciada pelo Play App Signing).
- **Onde publicar:** substituir `<PLAY_APP_SIGNING_SHA256>` no `assetlinks.template.json`, salvar como `assetlinks.json` e servir em `https://pragas.agrorumo.com/.well-known/assetlinks.json` (Content-Type `application/json`, HTTPS, sem redirect). Deploy da landing = gate CEO.
- **Validar:** `curl -sSI https://pragas.agrorumo.com/.well-known/assetlinks.json` (200 + application/json) e Statement List API `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https%3A%2F%2Fpragas.agrorumo.com&relation=delegate_permission%2Fcommon.handle_all_urls`.
- **JSON não aceita comentário** — por isso o template é limpo e este README explica o preenchimento.
