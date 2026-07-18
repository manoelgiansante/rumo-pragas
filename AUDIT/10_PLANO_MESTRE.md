# Ledger mestre — execução de 14/07/2026

O plano antigo foi encerrado. Este ledger mantém somente estados terminais; itens detalhados e
comandos de prova estão em `docs/audit/launch-coverage-2026-07-14.md`.

| Área | Estado |
| --- | --- |
| Claims e posicionamento | **IMPLEMENTADO E TESTADO:** hipótese probabilística; sem número, prazo fixo, prescrição ou equivalência profissional |
| IA e backend local | **IMPLEMENTADO E TESTADO:** consentimento, timeout, limite durável, idempotência, feedback, denúncia e falha segura |
| Banco e RLS | **IMPLEMENTADO E TESTADO LOCALMENTE:** migration e testes; rollout é gate externo |
| Exclusão LGPD | **IMPLEMENTADO E TESTADO:** dados do app, push, marker mínimo, retry e reativação explícita |
| Produto gratuito | **IMPLEMENTADO E TESTADO:** sem checkout, assinatura, IAP, trial ou anúncio |
| Web/landing | **IMPLEMENTADO E TESTADO LOCALMENTE:** build, claims, E2E e Lighthouse; deploy é gate externo |
| iOS/Android | **IMPLEMENTADO NO CÓDIGO:** config, permissões, privacidade e assets; build assinado candidato depende do gate de release |
| Store metadata | **IMPLEMENTADO LOCALMENTE:** descrições seguras; atualização pública é gate externo |
| Screenshots reais | **BLOQUEADO EXTERNAMENTE:** captura em dispositivos/build candidato |
| Publicação | **BLOQUEADO EXTERNAMENTE:** autorização humana |

Não há “fix proposto” neste arquivo. Uma ação implementável descoberta deve ser fechada no código e
nos testes; uma ação que dependa de credencial, produção, dados reais ou decisão comercial fica
explicitamente bloqueada no ledger canônico.
