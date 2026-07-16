# Bloqueio pré-deploy — exclusão da conta AgroRumo

Estado em 16/07/2026: **BLOQUEADO PARA SUBMISSÃO ÀS LOJAS**.

Em produção, a página pública e o backend ainda oferecem somente a exclusão de dados específicos
do Rumo Pragas. O candidato local implementa uma solicitação coordenada da conta global, mas o
**candidato global ainda não está publicado**. Não declarar como operacional aquilo que existe
somente no worktree.

O Rumo Pragas permite criar conta dentro do app. As políticas atuais das lojas exigem exclusão da
conta e dos dados associados, e a Apple esclarece que somente desativar ou excluir uma parte do
registro não basta:

- Apple: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Google Play: https://support.google.com/googleplay/android-developer/answer/13327111?hl=en

Em 16/07/2026 foi implementado no candidato local um fluxo de solicitação da conta global, com
confirmação explícita, AMR posterior ao desafio, suspensão imediata do Pragas, fila sem PII bruta,
recibo opaco e processamento coordenado em até 15 dias. Este arquivo continua bloqueando a
submissão porque implementação local não é evidência de operação.

Para contas ligadas ao Entrar com Apple, a Edge Function reserva o pedido antes do efeito externo,
mantém qualquer refresh token somente no Supabase Vault e exige as credenciais dedicadas ao Sign in
with Apple `APPLE_SIGN_IN_KEY_ID=S7F5NF2BN7` e `APPLE_SIGN_IN_PRIVATE_KEY`, associadas à configuração
`3Z742CU97U / 5YW9UY5LXP.com.agrorumo.rumopragas`. As chaves `ASC_API_*` e as chaves SIWA de outros
apps não são válidas e nunca podem ser usadas como substitutas. A chave dedicada foi criada e
validada localmente, mas sua configuração e prova em produção continuam pendentes.

Antes de remover este arquivo, é obrigatório aplicar a migration e a Edge Function autorizadas,
configurar a chave Apple correta, publicar a página, concluir um teste ponta a ponta com conta QA
descartável, ensaiar os responsáveis de todos os domínios e obter revisão jurídica das retenções e
do prazo.

Remover este arquivo, isoladamente, nunca representa resolução. O mesmo commit candidato deve
incluir `store-assets/ACCOUNT_DELETION_RESOLUTION.json`, como arquivo regular rastreado no Git, com
o escopo exato `full-shared-agrorumo-account-deletion`, revisor, referência da decisão legal, data,
URL pública canônica e SHA-256 da evidência de integração. O pipeline rejeita ausência, adulteração,
campos extras e arquivo não rastreado. A matriz, as políticas, os testes e o fluxo real de exclusão
também precisam ser atualizados no mesmo candidato; enquanto isso não ocorrer, este blocker deve
permanecer versionado.

Enquanto este arquivo existir, o campo de exclusão de conta deve permanecer vazio no CSV do Google
Play. A URL de exclusão de **dados** pode continuar documentando o controle app-scoped atual. Após
a remoção comprovada do blocker, o gate inverte e passa a exigir a URL canônica também no campo de
conta.
