# Rumo Pragas IA — contexto operacional para agentes

Este arquivo descreve o estado atual do repositório. As regras globais de `AGENTS.md` continuam
obrigatórias.

## Escopo canônico

- Aplicativo publicado: `expo-app/` (Expo SDK 55, React Native 0.83, Expo Router, TypeScript).
- Backend e dados: `supabase/`, em projeto compartilhado com outros apps AgroRumo.
- Materiais de loja: `expo-app/store-assets/`.
- Fonte canônica da landing: remote
  `https://github.com/manoelgiansante/rumo-pragas-landing-nextjs.git`, worktree sibling
  `../rumo-pragas-landing` e candidato atual no PR #3; a implantação Vercel de produção permanece
  separada.
- `RumoPragas/` e `RumoPragas.xcodeproj`: protótipo SwiftUI legado; não é o app das lojas.

Leia antes de alterar comportamento:

- `README.md`;
- `SECURITY.md`;
- `docs/audit/launch-coverage-2026-07-14.md`;
- `docs/launch-runbook.md`;
- `expo-app/BUILD_CHECKLIST.md`;
- `expo-app/SUBMISSION_CHECKLIST.md`.

## Contrato do produto

- O lançamento é gratuito, sem anúncios, assinatura, compra, paywall ou restauração de compra.
- O diagnóstico é uma hipótese assistida por IA, com confiança e alternativas; não é laudo,
  receituário nem substituto de profissional habilitado.
- Não publicar promessas de acurácia, tempo fixo, validação em campo, dosagem ou resultado
  garantido.
- A inferência exige internet. A fila local apenas adia o envio; não existe inferência offline.
- Fotos de diagnóstico seguem para Agrio por padrão, com Claude configurável no servidor. O chat
  envia texto ao Gemini por padrão, com Claude configurável. Não prometa retenção zero, ausência
  de treino ou região de processamento sem evidência contratual verificável.
- A exclusão no app é limitada aos dados do Rumo Pragas; não prometer remoção da identidade
  global compartilhada nem de registros operacionais compartilhados. O marcador mínimo de
  desvinculação continua até reativação explícita ou exclusão global e não restaura dados antigos.

## Restrições de segurança

- Nunca registrar ou imprimir secrets, tokens, imagens, mensagens do chat, localização ou dados
  pessoais.
- Nunca versionar `.env`, service accounts, arquivos de assinatura, keystores,
  `google-services.json` ou `GoogleService-Info.plist` reais.
- O Supabase é compartilhado: toda consulta e migration deve preservar isolamento por aplicativo,
  RLS, least privilege e rollback testável.
- Mudanças remotas, migrations de produção, exclusão de dados reais, publicação e alteração de
  credenciais exigem o gate correspondente.
- Não reativar funções remotas de cobrança ou diagnóstico que não tenham fonte local auditada.

## Gates

```bash
cd expo-app
npm ci
npm run lint
npm run typecheck
npm test -- --runInBand
npm run test:coverage -- --runInBand
npx expo-doctor@1.20.0
npx expo export --platform web
npm audit --audit-level=high
```

```bash
cd supabase/functions
deno task gate
```

Preserve os gates nos workflows. Não use `--no-verify`, não enfraqueça testes e não esconda
falhas. A versão de produto é definida em `expo-app/app.json`; a numeração efetiva de builds de
loja é remota no EAS e deve ser consultada antes de cada build e submissão. O inventário somente
leitura de 2026-07-14 observou iOS 63 e Android 54; são baselines mutáveis, não valores do candidato.
O build local protegido define `SENTRY_DISABLE_AUTO_UPLOAD=true`; qualquer upload nativo separado
exige autorização e gate próprios, sem migrar o build para a nuvem. OTA é uma ação separada; depois
do `eas update` autorizado, use o script explícito de upload de mapas.

## Cicatrizes importantes

- O splash tem watchdog para impedir congelamento durante o boot; inicializações novas não podem
  bloquear indefinidamente a primeira tela.
- Sentry deve permanecer sem PII e inicializado de forma compatível com o build nativo.
- O app usa tema claro e tokens de `expo-app/constants/theme.ts`; textos de interface precisam
  existir em pt-BR, en e es.
- O fluxo de autenticação e navegação já teve loops; alterações precisam de testes do cold start,
  sessão, consentimento e recuperação de senha.
- Conteúdo químico ou de manejo não deve ser apresentado como prescrição. Identificações incertas
  exigem confirmação explícita.

Relatórios em `AUDIT/` e arquivos antigos de pesquisa são apenas histórico. A cobertura vigente é
`docs/audit/launch-coverage-2026-07-14.md`.
