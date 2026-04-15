# iOS App Store Connect — Rumo Pragas (pt-BR)

**App ID:** 6762232682
**Bundle ID:** com.agrorumo.rumopragas
**Version:** 1.0.0 (build 1)
**Primary Locale:** pt-BR

## Campos

| Campo | Arquivo | Limite | Atual |
|---|---|---|---|
| App Name | `pt-BR/name.txt` | 30 | 11 |
| Subtitle | `pt-BR/subtitle.txt` | 30 | 25 |
| Keywords | `pt-BR/keywords.txt` | 100 | 96 |
| Promotional Text | `pt-BR/promotional_text.txt` | 170 | 159 |
| Description | `pt-BR/description.txt` | 4000 | ~3780 |
| What's New | `pt-BR/whats_new.txt` | 4000 | ~585 |

## Categorias

- Primary: Utilities
- Secondary: Productivity
- Age Rating: 4+

## Screenshots (1290x2796 = 6.7" iPhone)

Ordem no ASC:

1. `../../ios/6.7/01-hero.png` — Diagnostique pragas em segundos com IA
2. `../../ios/6.7/02-diagnostico.png` — Foto. Analise. Tratamento.
3. `../../ios/6.7/03-biblioteca.png` — Biblioteca completa por cultura
4. `../../ios/6.7/04-historico.png` — Acompanhe sua lavoura o ano todo
5. `../../ios/6.7/05-login.png` — Seu agronomo de bolso. Gratis.

Também disponíveis em 6.5" (1242x2688) em `../../ios/6.5/`.

## URLs

- Privacy: https://rumo-pragas-landing.vercel.app/privacy
- Terms: https://rumo-pragas-landing.vercel.app/terms
- Support: https://rumo-pragas-landing.vercel.app/
- Marketing: https://rumo-pragas-landing.vercel.app/
- Delete Account: https://rumo-pragas-landing.vercel.app/delete-account

## Upload via ASC MCP

```
mcp__app-store-connect__list_apps
# -> find app 6762232682
mcp__app-store-connect__list_app_store_version_localizations
mcp__app-store-connect__update_app_store_version_localization
  --id <localization_id>
  --description "<content of description.txt>"
  --keywords "<content of keywords.txt>"
  --promotional-text "<content of promotional_text.txt>"
  --whats-new "<content of whats_new.txt>"
```
