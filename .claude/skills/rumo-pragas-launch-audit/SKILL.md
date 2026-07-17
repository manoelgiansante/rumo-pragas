---
name: rumo-pragas-launch-audit
description: Contexto operacional atual do Rumo Pragas para auditoria, correções e preparação de lançamento.
---

# Rumo Pragas IA — contexto de auditoria (14/07/2026)

## Leia primeiro

1. `README.md`
2. `CLAUDE.md`
3. `SECURITY.md`
4. `docs/audit/launch-coverage-2026-07-14.md`
5. `docs/launch-runbook.md`

Relatórios em `AUDIT/`, `PLAN.md`, `AUDIT_REPORT.md` e pesquisas antigas são arquivos históricos.
Não extraia deles estado de produção, claims, preços, provedores ou checklist de loja.

## Fontes de verdade

- App atual: `expo-app/` — Expo SDK 55, React Native 0.83 e Expo Router.
- Backend: `supabase/` — projeto compartilhado com outros produtos AgroRumo.
- Loja: `expo-app/store-assets/`.
- Landing pública: implantação Vercel separada. O live coincide com a fonte Astro em
  `Landing Pages/rumo-pragas-landing`, mas dois repositórios concorrentes também declaram essa
  superfície; não escolha nem implante uma fonte sem decisão explícita do proprietário.
- `RumoPragas/` e `RumoPragas.xcodeproj`: protótipo SwiftUI legado, fora da esteira atual.

## Contrato atual

- Produto gratuito, sem anúncios, assinatura, compra ou paywall.
- Diagnóstico por imagem: Agrio por padrão; Anthropic Claude é configurável no servidor.
- Chat educacional: Gemini por padrão; Anthropic Claude é configurável no servidor.
- O resultado é hipótese probabilística com confiança e alternativas. Não publicar tempo fixo,
  acurácia, validação em campo, dosagem, prescrição ou equivalência a agrônomo.
- A inferência exige rede. A fila local só adia o envio; não existe inferência offline.
- Provedores recebem conteúdo somente após consentimento versionado de IA. Não prometa ausência de
  treino, retenção zero ou região sem evidência contratual.

## Dados e exclusão

- A exclusão é específica do Rumo Pragas: remove dados do app e tokens push.
- A identidade global AgroRumo e registros históricos compartilhados sem discriminador seguro de
  app são preservados.
- Um marcador técnico mínimo impede recriação silenciosa até reativação explícita ou exclusão da
  identidade global; reativar não restaura dados antigos.
- O candidato minimiza novas coordenadas para duas casas decimais. Quatro de 342 diagnósticos de
  produção têm coordenadas históricas anteriores à minimização verificada; qualquer correção é
  alteração de dados reais e gate externo.

## Regras de implementação

- Preserve isolamento por aplicativo, RLS, least privilege, idempotência e rollback testável no
  Supabase compartilhado.
- Não implante slugs compartilhados, funções remotas sem fonte local ou migrations em produção sem
  autorização específica.
- Não registre imagens, coordenadas, prompts, tokens, credenciais ou dados pessoais.
- Textos de UI devem existir em pt-BR, en e es; todo touch target crítico precisa de acessibilidade.
- O app é bloqueado em aparência clara. Use tokens de `expo-app/constants/theme.ts`.
- Não use screenshots arquivados. Capture somente o candidato real conforme
  `expo-app/store-assets/SCREENSHOT_CHECKLIST.md`.

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

Build assinado, store consoles, produção, dados reais e publicação continuam gates externos. Não
enfraqueça testes, não use `--no-verify` e não publique a partir de documentação histórica.
