# Pagamentos — estado reconciliado em 14/07/2026

O Rumo Pragas candidato é gratuito. A auditoria antiga de tiers, checkout, assinatura, trial e
webhooks não representa o produto e foi substituída por este registro.

## Implementado

- SDKs e serviços de RevenueCat, StoreKit, Google Billing e Stripe não fazem parte do runtime;
- rota, tela e remanescentes do paywall legado foram removidos do candidato;
- não há rota ativa de compra, restauração, checkout, cupom, upgrade ou downgrade;
- metadata candidata declara ausência de assinatura, compra interna e período de teste;
- marketing não usa preço, trial ou evento de checkout;
- scanner de release impede o retorno de oferta antiga conhecida.

## Evidência externa sanitizada

- Google Play retornou zero assinaturas em consulta somente leitura;
- o endpoint legado de produtos gerenciados retornou acesso negado, portanto não é usado como prova
  de catálogo vazio;
- a ausência de monetização no candidato é provada pelo código e pela configuração local, não por
  uma afirmação abrangente sobre todo histórico dos consoles.

## Estado terminal

| Item | Estado |
| --- | --- |
| Pagamento no candidato | **NÃO APLICÁVEL POR DECISÃO COMERCIAL COMPROVADA:** aplicativo gratuito |
| Assinatura, trial e restauração | **NÃO APLICÁVEL:** nenhum caminho ou SDK ativo |
| Verificação final de produtos legados nos consoles | **BLOQUEADO EXTERNAMENTE:** acesso humano ao App Store Connect e ao catálogo legado do Play antes da submissão |

Nenhum gasto, produto ou plano foi criado.
