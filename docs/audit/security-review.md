# Revisão de segurança, privacidade e backend — Rumo Pragas

- Data de corte: 14 de julho de 2026
- Projeto Supabase confirmado: `jxcnfyeemdltdfqtgbcl`
Escopo: backend dedicado do Rumo Pragas, banco, Storage, MCP, IA, LGPD e gates de CI.

## Resultado executivo

Os controles implementáveis em repositório estão implementados e cobertos por testes locais. Nenhuma migration, função ou dado foi alterado em produção nesta execução. Um inventário remoto sanitizado foi usado para fechar os datasets legados da exportação, mas a história de migrations remota ainda diverge da história local e a definição/hash do hook compartilhado não foi comprovada com autoridade suficiente para mutação. Aplicar `supabase db push` nesse estado é proibido.

## Implementado e testado

- Identidade e autorização: vínculo completo exige marcador explícito ativo em `pragas_app_links`, perfil Pragas, assinatura gratuita ativa com `app = 'rumo-pragas'` e ausência de exclusão pendente. Nenhum acesso é inferido ou preenchido retroativamente apenas por identidade, perfil ou assinatura histórica. RLS restritiva cobre tabelas dedicadas e compartilhadas usadas pelo app. O RPC de vínculo deriva a identidade de `auth.uid()` e é idempotente.
- Hook compartilhado: a migration nova faz zero mutação em triggers de `auth.users`. O hook só poderá ser alterado após conferência de nome e hash da definição remota; o teste preserva simultaneamente o trigger histórico e um trigger irmão.
- IA: consentimento explícito por finalidade, revogação, idempotência durável vinculada ao hash canônico da requisição, lease por worker e marcador de início no provedor. Lease vencido só é retomado antes do provedor; depois disso, queda ou timeout gera `unknown_outcome` terminal sem reenvio automático. Respostas em cache são apagadas no prazo sem apagar a lápide anti-replay. Limites, corpos, respostas, timeouts, erros e telemetria também são controlados.
- Segurança agronômica: filtro determinístico PT-BR, inglês e espanhol bloqueia orientação prescritiva, unidades/doses, produtos, ingrediente ativo, carência, intervalos, imperativos e tentativas por pontuação, zero-width, leetspeak e caracteres confundíveis. O aviso legal do próprio app não se auto-bloqueia.
- Diagnóstico: localização persistida apenas com consentimento, faixa válida e precisão máxima de duas casas para novos registros; resposta ao cliente e cache não retornam identificador interno nem coordenadas.
- Rate limit: contador Postgres serializado por usuário/escopo; chave UUID vinculada a SHA-256 canônico. Mesmo replay conta nova execução e mesma chave com outro corpo é conflito, eliminando bypass por retry ou colisão deliberada.
- Telemetria: o scrubber de conteúdo, PII, UUID, token e coordenada foi isolado em `_shared/pragas-sentry.ts`; o helper Sentry compartilhado do portfólio e seus consumidores genéricos permanecem byte-for-byte inalterados.
- Exclusão LGPD: limpeza é limitada ao app, pagina Storage recursivamente com limites, remove apenas avatar legado comprovadamente pertencente ao usuário e nunca exclui `auth.users` sem decisão global. Bucket dedicado ausente é tratado como já vazio somente para o erro exato de bucket inexistente; outros erros continuam fechados.
- Exportação LGPD: contrato versionado `v2`, colunas explícitas para todos os datasets locais e legados comprovados pelo inventário sanitizado, limites por conjunto e total e manifesto de completude. Relação opcional ausente só é tolerada pelos códigos exatos de relation-not-found; coluna ausente ou qualquer outro erro falha fechado.
- Push: autenticação de serviço em tempo constante, lote limitado, elegibilidade por vínculo e consentimento ativo, claim/lease com token do worker e marcador de início no Expo. Timeout, 5xx ou resposta ambígua depois desse marcador geram `unknown_outcome` terminal; não existe reenvio automático inseguro. O mesmo advisory lock protege transferência e limpeza de ownership do token.
- Fila de exclusão: lease com expiração, reclaim seguro, token de lease obrigatório na conclusão/retry e lock consultivo comum a vínculo, exclusão, limpeza e reativação.
- Estado operacional da fila: `text` com `CHECK` nomeado contendo `requested`, `processing`, `retry`, `blocked_global_decision` e `reactivated`. Isso evita o erro PostgreSQL 17 `unsafe use of new value` quando um enum parcial pré-existente é ampliado e usado na mesma transação.
- Avatares: bucket `pragas-avatars` privado, limite de 2 MiB, JPEG/PNG/WebP e políticas por prefixo do titular vinculado.
- Analytics: lote limitado, UUID por evento, deduplicação estrita e mutação somente por RPC de serviço.
- MCP: Streamable HTTP MCP `2025-11-25` e JSON-RPC 2.0, lifecycle `initialize`/`notifications/initialized`, `POST` JSON e `GET 405` intencional, header de protocolo, allowlist de Origin, envelopes padrão de tools e teste de interoperabilidade list/call com o SDK oficial. JWT Supabase e RLS preservam autorização por usuário; respostas omitem `user_id`, URL de foto e coordenada exata.
- Produto gratuito: endpoints dedicados de checkout/portal retornam `410`; webhooks dedicados aposentados são body-blind e retornam sucesso determinístico para interromper retentativas. Endpoints genéricos Stripe/RevenueCat e funções compartilhadas permaneceram fora do escopo.
- CI: os workflows de push e PR executam a interoperabilidade MCP com SDK oficial, `deno task gate` e o teste PostgreSQL 17 de migration, replay parcial, RLS, concorrência, limpeza e rollback.

## Evidência de banco e rollback

O teste `supabase/tests/pragas-backend-security-integration.sh` executa em `postgres:17-alpine` e cobre:

- migration candidata aplicada duas vezes, sem editar migrations históricas já aplicadas;
- schema legado com colunas/tabelas remotas conhecidas;
- enum parcial e fila parcialmente criada;
- conversão do estado para `text + CHECK` dentro da transação;
- preservação do enum que já existia antes da migration;
- preservação de feedback, tokens push, bucket privado e objetos no rollback;
- consentimento, rate limit com hash/replay/conflito, crash de IA, RLS, vínculo explícito, corrida de ownership push, analytics, limpeza, leases e reativação;
- rollback transacional que remove somente superfícies executáveis candidatas e preserva tabelas, tipos, consentimentos, relatórios, auditoria, ledgers, outcomes push, vínculos e dados de Storage.

As migrations históricas aplicadas
`20260522003425_pragas_subscriptions_deprecated_2026_05_21.sql` e
`20260628120000_subscriptions_per_app_isolation.sql` permanecem byte-for-byte imutáveis. A fixture
PostgreSQL 17 cria apenas a compatibilidade temporária necessária para reproduzir o histórico e a
remove imediatamente; nenhuma correção histórica será reaplicada no banco remoto.

## Segurança de segredos

A varredura do candidato rastreado não encontrou novo segredo útil. Achados históricos/ignorados incluem artefatos de configuração já conhecidos; nenhum valor é reproduzido neste relatório. A credencial histórica de conta revisora continua exigindo rotação externa antes da submissão. Chave anônima Supabase e DSN público de ingestão não são tratados como segredos, mas não autorizam acesso de serviço.

## Não aplicável ou bloqueado externamente

- Cobrança, assinatura paga, trial, cupom e restauração de compra: não aplicáveis ao lançamento gratuito; rotas dedicadas foram aposentadas e testadas.
- Exclusão global da identidade compartilhada: **BLOQUEADO EXTERNAMENTE (P1 de lojas)**. A limpeza
  do Pragas é concluída e honesta, mas Apple e Google exigem exclusão da conta criada no app e dos
  dados associados. Excluir `auth.users` agora afetaria outros aplicativos e dados reais; requer
  decisão de portfólio, implementação coordenada e teste, ou aceitação formal registrada das lojas
  e jurídica para o modelo app-scoped.
- Mutação automática de trigger compartilhado por substring: não aplicável por ser insegura; a migration executa zero mutação até revisão por hash.
- Migration local não rastreada `20260713120000_paid_photo_quota.sql`: excluída integralmente desta execução e dos resets por incompatibilidade com o produto gratuito.

## Bloqueios externos exatos

1. Decidir e autorizar o contrato de exclusão da identidade AgroRumo compartilhada e dos dados
   cross-app, ou registrar aceitação formal das lojas e jurídica para o modelo app-scoped atual.
2. Fornecer `SUPABASE_DB_PASSWORD` do projeto `jxcnfyeemdltdfqtgbcl` ou uma exportação privilegiada e sanitizada das definições de políticas, funções e triggers. O inventário de tabelas/colunas já fechou a exportação LGPD, mas ainda é necessário comprovar nome, owner e hash integral do hook compartilhado antes de qualquer mutação nele.
3. Reconciliar cirurgicamente `supabase_migrations.schema_migrations` com o histórico local. A divergência impede `db push`; nenhuma migration deve ser aplicada remotamente em lote.
4. Aprovar a alteração direta de produção para aplicar apenas o DDL reconciliado e publicar as funções dedicadas, seguida de smoke e monitoramento. Esta execução não recebeu autorização para mutar produção.
5. Rotacionar a credencial histórica da conta revisora e atualizar o cofre/console correspondente sem registrar o valor no Git.
6. Confirmar no painel os schedules, backup/restauração e alertas do projeto; essas provas não são inferíveis apenas pelo repositório.

## Comandos de verificação

```bash
cd supabase/functions && deno task gate
bash supabase/tests/pragas-backend-security-integration.sh
git diff --check
```

O reset Supabase limpo deve ser executado em projeto temporário, excluindo explicitamente a migration paga não rastreada. O reset local prova replay do repositório, mas não substitui a reconciliação remota descrita acima.
