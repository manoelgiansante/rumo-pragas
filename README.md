# Rumo Pragas IA

Aplicativo móvel da AgroRumo para apoiar a identificação de pragas e doenças agrícolas por
imagem. O fluxo combina uma hipótese gerada por IA, nível de confiança, diagnósticos
alternativos, conteúdo de manejo integrado de pragas (MIP) e chat educacional. O resultado é
indicativo: não substitui vistoria, diagnóstico, orientação ou receituário emitido por
profissional legalmente habilitado.

O produto de lançamento é gratuito, sem anúncios, assinatura ou compra dentro do app. A
inferência exige internet. Diagnósticos iniciados sem conexão podem entrar em uma fila local para
envio posterior; isso não significa diagnóstico offline.

## Fontes de verdade

- `expo-app/`: aplicativo atual para iOS, Android e exportação web, em Expo SDK 55, React Native
  0.83 e Expo Router.
- `supabase/`: migrations, testes SQL e Edge Functions do Rumo Pragas no projeto Supabase
  compartilhado da AgroRumo.
- `expo-app/store-assets/`: metadata, declarações de privacidade e materiais canônicos de loja.
- `docs/audit/launch-coverage-2026-07-14.md`: inventário auditado de rotas, endpoints, dados,
  integrações, permissões e fluxos.
- `docs/launch-runbook.md`: build, validação, publicação gradual, monitoramento e rollback.
- `docs/audit/competitive-matrix-2026-07-14.md`: pesquisa competitiva atual, com fontes.

`RumoPragas/` e `RumoPragas.xcodeproj` são um protótipo SwiftUI legado e não geram o binário
atual das lojas. A landing pública em `pragas.agrorumo.com` é uma implantação Vercel separada:
o inventário autenticado do projeto Vercel `rumo-pragas-landing` confirma a integração GitHub
`manoelgiansante/rumo-pragas-landing`, branch de produção `main`. Esse repositório separado é a
fonte canônica; `rumo-pragas-landing-nextjs` e o diretório homônimo no monorepo são apenas fontes
divergentes e não devem ser implantados no domínio.

## Arquitetura do produto

```text
Expo app
  ├─ Supabase Auth e Postgres (dados do usuário, histórico e consentimentos)
  ├─ Edge Function diagnose-pragas → Agrio por padrão ou Claude por configuração
  │  (imagem) → hipótese e alternativas
  ├─ catálogo MIP embarcado → contexto educacional e manejo seguro
  ├─ Edge Function ai-chat-pragas → Gemini por padrão ou Claude por configuração (texto)
  ├─ Open-Meteo → contexto climático opcional por localização aproximada
  ├─ Expo Notifications → token e notificações, quando configurados
  └─ Sentry → falhas e desempenho, sem rastreamento publicitário
```

O Supabase é compartilhado com outros produtos AgroRumo. Migrations e rotinas de exclusão devem
manter isolamento por aplicativo. A exclusão oferecida pelo Rumo Pragas remove os dados
específicos do app e revoga seus tokens de push; a identidade global compartilhada e registros
operacionais compartilhados não são apagados por esse fluxo. Um marcador mínimo de desvinculação
impede recriação silenciosa até reativação explícita ou exclusão da identidade global.

O candidato arredonda novas coordenadas opcionais para duas casas decimais. A auditoria
read-only encontrou quatro diagnósticos históricos com coordenadas anteriores à minimização
verificada; alterar esses dados reais permanece um gate externo documentado no runbook.

## Desenvolvimento local

Pré-requisitos:

- Node.js 22.22.3;
- npm, usando o lockfile versionado;
- Deno 2.7.12 para validar as Edge Functions;
- Xcode ou Android Studio apenas para execução nativa local.

```bash
cd expo-app
npm ci
cp .env.example .env
npm start
```

Preencha o `.env` local somente com credenciais de desenvolvimento autorizadas. Nunca versione
segredos. Os nomes e a finalidade das variáveis estão documentados em `expo-app/.env.example`.

Atalhos de execução:

```bash
cd expo-app
npm run ios
npm run android
npm run web
```

## Gates obrigatórios

Aplicativo:

```bash
cd expo-app
npm run lint
npm run typecheck
npm test -- --runInBand
npm run test:coverage -- --runInBand
npx expo-doctor@1.20.0
npx expo export --platform web
npm audit --audit-level=low
```

Backend:

```bash
cd supabase/functions
deno task gate
```

Os workflows em `.github/workflows/` executam esses gates em pull requests e na branch principal.
Não desative testes, avisos ou verificações de segurança para obter resultado positivo.

## Configuração e release

- Identificador iOS e package Android: `com.agrorumo.rumopragas`.
- Scheme: `rumopragas`.
- Versão do aplicativo nesta revisão: `1.0.11`.
- Builds de loja usam numeração remota e incremento automático pelo EAS; confirme o número
  reservado no artefato antes de arquivar ou submeter. A consulta somente leitura de 2026-07-14
  encontrou iOS 63 e Android 54 como últimos valores; eles não são números fixos do candidato.
- O perfil Android de produção gera AAB. O perfil iOS usa credenciais locais autorizadas.
- Build ou preview não autoriza publicação. Submissão pública, mudança em produção, migrations
  remotas e alteração de dados reais continuam sendo gates externos.

Antes de qualquer entrega, siga `expo-app/BUILD_CHECKLIST.md`,
`expo-app/SUBMISSION_CHECKLIST.md` e `expo-app/store-assets/SCREENSHOT_CHECKLIST.md`. Screenshots
devem vir do candidato real, sem dados pessoais, paywall, promessa de precisão, tempo fixo,
dosagem ou funcionalidade inexistente.

`expo-app/scripts/launch.sh` executa somente validação e build. Ele nunca submete. A submissão usa
`expo-app/scripts/submit.sh`, exige autorização explícita para um artefato imutável e falha enquanto
as capturas reais do candidato estiverem ausentes.

No EAS Build, o plugin oficial Expo/Sentry envia os source maps nativos automaticamente; valide o
upload e a symbolication no artefato real. Um EAS Update é uma mudança separada e autorizada: depois
de publicar e revisar a atualização exata, use `expo-app/scripts/upload-sentry-ota.sh` para enviar
somente os mapas já gerados. O script não publica OTA.

## Segurança, privacidade e operação

- Política pública: `https://pragas.agrorumo.com/privacidade`.
- Termos: `https://pragas.agrorumo.com/termos`.
- Exclusão: `https://pragas.agrorumo.com/excluir-conta`.
- Suporte: `https://pragas.agrorumo.com/suporte` e `contato@agrorumo.com`.
- Processo de reporte de vulnerabilidade: `SECURITY.md`.

Não altere diretamente produção nem use funções remotas sem fonte local como se fossem parte do
release atual. O inventário de lançamento registra o drift remoto conhecido e os bloqueios
externos específicos. Para incidentes, backup, restauração, canário e rollback, use o runbook.

## Estado de lançamento

O estado verificável, evidências de teste e bloqueios externos estão em
`docs/audit/launch-coverage-2026-07-14.md`. Relatórios antigos na raiz e em `AUDIT/` são snapshots
históricos; não devem substituir esse inventário nem a implementação atual.
