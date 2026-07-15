# Motor de IA — estado reconciliado em 14/07/2026

Este documento substitui integralmente a auditoria antiga. Métricas de acurácia, velocidade,
treinamento em lavouras brasileiras e equivalência profissional que constavam na versão anterior não
possuíam protocolo verificável e foram removidas do candidato.

## Contrato atual

- análise por imagem: Agrio/Saillog por padrão; Anthropic Claude pode ser selecionado pela
  configuração segura do servidor;
- assistente: Google Gemini por padrão; Anthropic Claude pode ser selecionado pela configuração
  segura do servidor;
- saída visual: hipótese probabilística, confiança e possíveis alternativas;
- entrada: uma imagem, cultura selecionada e localização aproximada somente quando autorizada;
- conectividade: inferência online; falha de envio pode entrar em fila local para reenvio;
- consentimento separado para imagem e chat antes do primeiro envio;
- nenhum secret de provedor é embarcado no cliente.

## Segurança agronômica

O candidato não transforma a resposta em receituário e remove conteúdo químico prescritivo de
resultado, ficha e MIP. A interface orienta avaliação de campo, profissional habilitado e consulta
ao AGROFIT. O marco atual é a Lei nº 14.785/2023 e a Resolução Confea nº 1.149/2025.

## Segurança operacional

Validação de entrada, timeout, limite durável, idempotência do provedor, resultado estruturado,
tratamento de imagem inválida, feedback e denúncia de conteúdo foram implementados. Erros externos
não expõem secrets ou stack trace.

## Privacidade

O provedor ativo e o conteúdo necessário são divulgados. O repositório não afirma retenção zero,
processamento somente no Brasil ou ausência de treinamento sem garantia contratual verificável.

## Estados terminais

| Item | Estado |
| --- | --- |
| Claims quantitativos antigos | **IMPLEMENTADO E TESTADO:** removidos de app, metadata candidata e marketing; scanner CI impede retorno |
| Produto/dose/aplicação | **IMPLEMENTADO E TESTADO:** bloqueados nas superfícies do candidato |
| Consentimento e contestação | **IMPLEMENTADO E TESTADO:** fluxos, testes unitários e área administrativa |
| Contratos de retenção/região dos provedores | **BLOQUEADO EXTERNAMENTE:** validação contratual pelo controlador/DPO |
| Smoke real de cada provedor no ambiente de release | **BLOQUEADO EXTERNAMENTE:** secrets e rollout do backend candidato |

Evidência detalhada: `docs/audit/launch-coverage-2026-07-14.md` e
`docs/audit/competitive-matrix-2026-07-14.md`.
