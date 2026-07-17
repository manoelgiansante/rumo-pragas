# Bloqueio externo — rotação de assinatura Apple

Estado em 15/07/2026: **BLOQUEADO EXTERNAMENTE PARA BUILD E SUBMISSÃO iOS**.

Um build local com EAS CLI 21 expôs no erro serializado material de assinatura Apple e a senha
associada. O log conhecido foi sanitizado, mas isso não revoga credenciais potencialmente
comprometidas. Nenhum IPA, archive ou build gerado antes da rotação é elegível para TestFlight ou
App Store.

Antes de remover este arquivo, um operador autorizado deve concluir fora do repositório:

1. revogar/substituir o certificado Apple Distribution afetado;
2. substituir o provisioning profile dependente;
3. trocar a senha/segredo de assinatura no cofre aprovado e nas credenciais EAS;
4. confirmar que a configuração ativa referencia somente o novo material; e
5. registrar no release record privado os novos identificadores não secretos, data, operador e
   evidência de revogação do material anterior.

Valores de certificado, profile, senha, chave privada ou segredo não pertencem a este arquivo. A
remoção deste bloqueador exige a evidência externa acima e não autoriza publicação nas lojas.
