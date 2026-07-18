# Operação — exclusão coordenada da conta AgroRumo

Este documento define o processo humano que completa as solicitações registradas por
`pragas-global-account-deletion`. O endpoint **não** apaga `auth.users` nem dados de outros
produtos automaticamente. Essa separação é deliberada: a identidade no projeto
`jxcnfyeemdltdfqtgbcl` é compartilhada e uma cascata genérica não prova exclusão correta.

## Garantias na entrada

- A solicitação exige confirmação explícita de toda a conta AgroRumo.
- O servidor cria um desafio vinculado à sessão atual e aceita a confirmação somente com outra
  sessão, criada depois do desafio, com evento AMR ocorrido depois do desafio por senha, OAuth,
  OTP, SSO ou MFA.
- Refresh de JWT não é reautenticação: o `iat` pode mudar, mas o timestamp AMR antigo não passa.
- A confirmação, novos vínculos, reativação de push e mutações de conteúdo usam o mesmo advisory
  lock por conta; uma transação concorrente nunca reabre acesso depois da solicitação.
- Conta ligada ao Entrar com Apple exige um authorization code nativo efêmero. O servidor grava
  primeiro o pedido e a reserva de revogação, depois troca o código e valida o `sub`. O refresh
  token é persistido somente criptografado no Supabase Vault antes da chamada de revogação. Uma
  queda pode repetir a revogação; indisponibilidade da Apple mantém o pedido aceito com
  `appleAuthorizationStatus=retry_pending`, nunca sem recibo.
- Somente `APPLE_SIGN_IN_KEY_ID=S7F5NF2BN7` e a chave privada dedicada associada à configuração
  `3Z742CU97U / 5YW9UY5LXP.com.agrorumo.rumopragas` são aceitos. Chaves `ASC_API_*` do App Store
  Connect e as chaves SIWA de outros apps são incompatíveis e proibidas.
- O vínculo do Rumo Pragas é desativado na mesma transação da fila.
- Push tokens do Pragas são revogados e notificações pendentes são removidas na mesma transação.
- A limpeza específica do Pragas entra na fila já existente; ela nunca apaga a identidade global.
- A fila global armazena HMAC do UUID, recibo aleatório e estados técnicos. Não armazena nome,
  e-mail, telefone ou UUID bruto do usuário.
- O prazo informado ao titular é de até 15 dias.
- Desafios expirados são removidos oportunisticamente e por rotina operacional indexada; consulta
  pública de recibo usa limite durável por rede, persistindo apenas HMAC e nunca o IP bruto.

## Triagem diária obrigatória

Um operador autorizado deve consultar diariamente solicitações em
`requested_manual_review`, `needs_user_action`, `in_review`, `processing` ou vencidas. O acesso
deve ocorrer somente via `list_agrorumo_account_deletion_queue`, usando uma credencial
administrativa auditada; nunca copie filas para planilhas, mensagens ou tickets com PII. As tabelas
não concedem DML direto nem para `service_role`; toda mudança passa pelos RPCs e pelo log append-only.

Antes da triagem, execute `purge_agrorumo_account_deletion_ephemera(500)`. A rotina remove desafios
expirados, rate limits sem uso por mais de 2 dias e tokens Apple do Vault após conclusão/revogação ou
30 dias. Ela é bounded, usa `SKIP LOCKED` e pode ser repetida. Não há cron novo no projeto
compartilhado: a execução diária deve constar no checklist operacional até existir uma agenda
formalmente aprovada.

1. Resolva o titular apenas durante a operação usando
   `resolve_agrorumo_account_deletion_subject(request_id)`.
2. Mude `requested_manual_review → in_review` com
   `transition_agrorumo_account_deletion_request` e um `detail_code` enumerado, sem texto livre.
3. Confirme os produtos associados e atribua um responsável por domínio.
4. Mude `in_review → processing` somente depois que todos os responsáveis aceitarem a tarefa.
5. Cada domínio deve excluir ou anonimizar seus dados e registrar evidência em armazenamento
   administrativo aprovado. Não grave conteúdo da evidência na fila; use somente um código.
6. Revogue integrações externas associadas (pagamentos, mensageria, arquivos e provedores) antes
   de apagar a identidade de autenticação.
   Para identidade Apple, confirme que `apple_authorization_revoked_at` está preenchido; um pedido
   Apple sem essa evidência é incidente e não pode avançar para conclusão.
7. Apague `auth.users` por último, depois que todas as relações restritivas e efeitos externos
   estiverem comprovadamente resolvidos.
8. Se houver retenção legal, registre somente um `legal_retention_code` aprovado, finalidade,
   responsável e data de descarte no sistema jurídico autorizado; nunca use retenção genérica.
9. O estado `completed` exige `app_cleanup_state=completed` e o código exato
   `coordinated_erasure_evidence_verified`. O RPC recusa conclusão sem esses dois sinais.
10. Envie a confirmação ao endereço resolvido durante a operação e inclua o recibo opaco. Não
    inclua UUID interno, detalhes de outros produtos ou dados retidos na mensagem.

## Estados permitidos

```text
requested_manual_review ──> in_review ──> processing ──> completed
          │                    │             │
          └─> needs_user_action <────────────┘
                                  └─> legal_retention_only ──> completed
```

Transições fora desse grafo falham. Eventos são append-only; UPDATE e DELETE são bloqueados por
trigger inclusive para `service_role`.

O estado público de Apple é restrito a `not_required`, `retry_pending` ou `revoked`. Internamente,
`reserved → exchange_in_progress → token_ready → revocation_in_progress → revoked` registra cada
fronteira de efeito externo. Qualquer falha converge para `retry_pending`; o token, quando já
obtido, permanece somente no Vault para nova tentativa.

## Retenção e purga

- desafio: 10 minutos; apagado após consumo ou na rotina diária;
- ator HMAC do rate limit: até 2 dias sem uso;
- authorization code: nunca armazenado em claro; apenas digest SHA-256 até o fim da operação;
- refresh token Apple: somente Supabase Vault, apagado ao revogar/concluir ou no máximo após 30 dias;
- pedido, recibo e eventos pseudônimos: não têm purga automática. São evidência de atendimento ao
  titular e só podem ser eliminados por uma política jurídica de retenção aprovada e migration
  dedicada, preservando as exceções dos arts. 15 e 16 da LGPD.

## Incidentes e prazo

- Solicitação próxima do prazo: prioridade máxima para o responsável do domínio pendente.
- Falha técnica: mantenha o estado, registre um código técnico sem PII e abra incidente interno.
- Dúvida de identidade: use `needs_user_action`; nunca restaure acesso ao Pragas automaticamente.
- Reversão do release: a migration de rollback recusa executar se existir qualquer solicitação.
- O recibo público expõe apenas estado e datas. Respostas desconhecidas são sempre 404 uniformes.

## Evidência para liberar as lojas

O blocker de submissão só pode ser resolvido depois de existir evidência simultânea de:

1. migration aplicada em `jxcnfyeemdltdfqtgbcl`;
2. Edge Function publicada com o SHA candidato;
3. teste real completo com conta QA descartável, incluindo sessão nova e recibo/status;
4. limpeza app-scoped concluída e acesso Pragas bloqueado;
5. ensaio manual coordenado dos demais domínios sem tocar em usuário real;
6. página pública ativa e consistente;
7. revisão jurídica do prazo, das retenções e da comunicação;
8. hash SHA-256 do pacote de evidências registrado no artefato de resolução.
9. segredo dedicado de Sign in with Apple configurado e revogação comprovada para uma conta QA
   Apple descartável, sem reutilizar credenciais do App Store Connect.

Até esses nove itens existirem, `store-assets/ACCOUNT_DELETION_BLOCKER.md` permanece válido e o
pipeline deve continuar bloqueando a submissão.
