# Rumo Pragas: instruções permanentes

## Política de builds mobile

- Todo artefato iOS ou Android deste projeto deve ser compilado localmente.
- Nunca iniciar build em nuvem do Expo/EAS, inclusive por MCP, dashboard, workflow remoto ou `eas build` sem `--local`.
- Usar somente o executor fixado pelo projeto e o modo local, como `./scripts/eas-pinned.sh build --local ...`.
- Se o build local estiver bloqueado, interromper e informar Manoel. Nunca usar build remoto como fallback.
- Não executar nenhuma ação que possa gerar cobrança de build no Expo/EAS.
