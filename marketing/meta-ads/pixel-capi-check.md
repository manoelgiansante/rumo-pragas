# Medição da landing — checklist

## Arquitetura candidata

A landing é estática. Meta Pixel e Google Analytics são opcionais e só podem carregar depois de uma
escolha positiva no banner. O endpoint CAPI legado foi removido e não há SDK de anúncios no
aplicativo.

## Verificação

- [ ] Antes do consentimento, nenhuma requisição de medição opcional é enviada.
- [ ] Ao recusar, os scripts continuam ausentes.
- [ ] Ao aceitar, somente IDs configurados por ambiente são usados.
- [ ] A escolha pode ser revista pelo rodapé.
- [ ] Não há e-mail, telefone, nome, coordenada, diagnóstico ou conteúdo de chat em evento.
- [ ] URLs e UTMs não contêm identificador pessoal.
- [ ] A Política de Privacidade descreve a medição opcional.
- [ ] O build falha ou mantém a medição desativada quando IDs não estão configurados.

## Eventos permitidos

Somente eventos agregados da landing, como visualização consentida e clique de saída para uma loja.
Não declarar instalação, cadastro ou diagnóstico como medidos sem integração real e disclosure
correspondente.

## CAPI

Não aplicável ao candidato. Reintroduzir CAPI exige desenho de consentimento servidor-cliente,
minimização, contrato de dados, testes de opt-out, segurança e atualização da política. Não há
fallback silencioso.
