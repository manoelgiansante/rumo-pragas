# Segurança de lançamento — Rumo Pragas

Atualizado em 2026-07-14. Este documento não contém valores, formatos realistas de chaves nem
credenciais de exemplo.

## Modelo de configuração

O cliente móvel recebe somente configuração pública com prefixo `EXPO_PUBLIC_`. Segredos de provedor,
chaves administrativas e tokens de automação pertencem ao ambiente de servidor ou ao cofre do serviço
de build; nunca ao bundle, ao Git, a logs, screenshots ou tickets.

### Cliente móvel

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID`
- `EXPO_PUBLIC_SENTRY_DSN`
- flags públicas documentadas em `expo-app/.env.example`

A chave anônima do Supabase e o DSN de ingestão do Sentry são identificadores públicos por desenho;
isso não os transforma em autorização administrativa. RLS, limites de ingestão e configuração do projeto
continuam obrigatórios.

### Supabase Edge Functions

- `SUPABASE_SERVICE_ROLE_KEY`
- `AGRIO_API_KEY` para análise de imagem
- `GEMINI_API_KEY` para o assistente padrão
- `CLAUDE_API_KEY` somente se o provedor Anthropic Claude for selecionado deliberadamente para
  diagnóstico ou chat
- `SENTRY_DSN` e `SENTRY_PII_HASH_SALT`
- `EXPO_ACCESS_TOKEN` quando exigido para push

Os nomes efetivos no backend são `AGRIO_API_KEY`, `GEMINI_API_KEY` e, quando selecionado,
`CLAUDE_API_KEY`.

Os handlers compartilhados de Stripe e RevenueCat permanecem fora do produto gratuito e fora da
mudança de lançamento. Seus segredos não devem ser copiados para o cliente nem rotacionados por este
repositório sem coordenação com os demais produtos proprietários.

## Configuração segura

1. Cadastre valores diretamente no Supabase Secrets, EAS, Sentry ou cofre aprovado.
2. Use somente o nome da variável em documentação e automação; não registre o valor na linha de comando
   compartilhada nem no histórico do shell.
3. Restrinja origem, escopo e permissão de cada credencial no provedor.
4. Valide ambiente e presença sem imprimir valores.
5. Em caso de exposição confirmada, revogue ou rotacione no provedor, atualize consumidores autorizados e
   preserve evidências do incidente sem copiar o segredo.

## Gates automatizados

- `npm audit --audit-level=low` bloqueia qualquer vulnerabilidade conhecida no CI do aplicativo. Achados
  sem superfície aplicável precisam de uma exceção revisada e documentada; o lock atual não exige exceção.
- O Deno gate executa formatação, lint, typecheck e testes de contratos/autorização das Edge Functions.
- Gitleaks deve ser executado localmente com saída redigida antes do commit e no histórico durante a
  preparação final. Uma ocorrência real nunca deve ser exibida no relatório compartilhado.
- `expo-doctor`, lint, TypeScript, Jest com cobertura e export web são bloqueantes.

O DSN público do Sentry configurado em `eas.json` pode ser sinalizado por heurística. Ele deve ser
triado como identificador público do cliente, com projeto e ingestão restritos, e não removido apenas para
silenciar o scanner. Exemplos em playbooks locais usam placeholders não realistas.

## Arquivos e artefatos proibidos no Git

- `.env` e variantes locais
- `google-services.json` e `GoogleService-Info.plist`
- keystores, certificados, perfis e chaves privadas
- credenciais EAS/Play, service accounts e exports de consoles
- contas ou senhas de revisão
- fotos reais, tokens, dumps, backups e relatórios contendo dados pessoais

Modelos seguros podem usar extensão `.example`, sem valores e sem formato que pareça uma credencial.

## Checklist de incidente

1. Interromper o uso da credencial afetada e preservar evidência redigida.
2. Rotacionar no provedor e revogar a versão anterior.
3. Identificar todos os consumidores e atualizar apenas os ambientes autorizados.
4. Verificar logs por acesso indevido, sem ampliar exposição de dados.
5. Avaliar obrigação de comunicação conforme LGPD e processo interno.
6. Executar novamente Gitleaks, testes de autorização e smoke do fluxo afetado.

Nenhuma reescrita destrutiva de histórico, rotação de produção ou alteração de dados reais é autorizada
por este documento.
