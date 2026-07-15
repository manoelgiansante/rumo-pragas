# App Store Connect — Accessibility Nutrition Labels

Use a matriz canônica em `docs/accessibility-matrix.md`. Este arquivo é um gate operacional e não autoriza uma declaração baseada apenas em inspeção de código.

## Estado de lançamento em 14 de julho de 2026

- [x] Recursos e tarefas comuns mapeados separadamente para iPhone e iPad.
- [x] Evidência estática principal identificada.
- [ ] Build candidata assinada instalada em iPhone.
- [ ] Percurso completo com VoiceOver concluído no iPhone.
- [ ] Percurso completo com Voice Control concluído no iPhone.
- [ ] Inspeção de diferenciação sem depender somente de cor concluída no iPhone.
- [ ] Medição de contraste de todos os estados comuns concluída no iPhone.
- [ ] Build candidata assinada instalada em iPad.
- [ ] Percurso completo com VoiceOver concluído no iPad.
- [ ] Percurso completo com Voice Control concluído no iPad.
- [ ] Inspeção de diferenciação sem depender somente de cor concluída no iPad.
- [ ] Medição de contraste de todos os estados comuns concluída no iPad.

## Respostas permitidas agora

Até que os itens acima estejam concluídos, não marcar como suportados:

- VoiceOver;
- Voice Control;
- Larger Text;
- Dark Interface;
- Differentiate Without Color Alone;
- Sufficient Contrast;
- Reduced Motion.

Captions e Audio Descriptions não se aplicam ao conteúdo atual, mas também não devem ser apresentados como diferenciais suportados.

## Gate antes de salvar no App Store Connect

- [ ] O número da build e os dispositivos usados estão registrados.
- [ ] Todas as tarefas comuns passaram, inclusive erro e recuperação.
- [ ] Cada resposta foi preenchida separadamente para iPhone e iPad.
- [ ] A resposta coincide com o estado **Comprovado** da matriz canônica.
- [ ] Uma segunda pessoa revisou evidência e respostas.
- [ ] Captura das respostas finais foi anexada ao pacote interno de lançamento.

Se qualquer item falhar, manter o recurso como não suportado, corrigir a build e repetir todo o percurso daquele dispositivo.
