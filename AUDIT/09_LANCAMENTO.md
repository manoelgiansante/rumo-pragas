# Lançamento — estado reconciliado em 14/07/2026

Este arquivo é um índice de bloqueios, não um plano futuro. A evidência executável está em
`docs/launch-runbook.md` e `docs/audit/launch-coverage-2026-07-14.md`.

## Implementado e testado no candidato

- metadata iOS/Android sem velocidade, acurácia, inferência offline, equivalência profissional ou
  prescrição;
- app gratuito sem SDK ou caminho ativo de compra;
- textos LGPD, exclusão por aplicativo, exportação e consentimentos;
- feature graphic Android opaca e validada;
- validador fail-closed para screenshots e submissão;
- landing estática com consentimento de medição, páginas legais, suporte e 404;
- Android `assetlinks.json` com fingerprints comprovados de Play App Signing e EAS;
- AASA removido porque entitlement e roteamento Universal Links não estavam comprovados;
- CI com versão, config Expo, claims, metadata, lint, typecheck, testes, export e gate Deno.

## Estado público observado

- iOS em produção: versão 1.0.9; último build válido observado 1.0.10 (63);
- Android em produção: versão 1.0.9 (49); draft 1.0.8 (54);
- as descrições públicas das duas lojas ainda exibem claims proibidos da versão anterior;
- a landing pública ainda não recebeu o candidato local.

## Bloqueios externos

| Gate | Evidência necessária |
| --- | --- |
| Backend | aplicar e validar a migration candidata no projeto Supabase compartilhado |
| Lojas | substituir descrição pública antiga; gerar candidato iOS com build maior que 63 e Android com versionCode maior que 54 |
| Screenshots | capturas reais de iPhone, iPad, telefone e tablet Android passando no validador |
| Universal Links | permanece não aplicável até existir entitlement assinado e roteamento HTTPS testado |
| Produção web | autorização de deploy, smoke e rollback |
| Publicação | autorização humana nas lojas |

Enquanto qualquer gate acima estiver aberto, o status é **NÃO PRONTO PARA PUBLICAÇÃO**.
