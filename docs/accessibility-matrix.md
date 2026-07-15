# Matriz de acessibilidade para lançamento

- **Aplicativo:** Rumo Pragas
- **Plataformas avaliadas:** iPhone e iPad
- **Última revisão:** 14 de julho de 2026
**Referência:** [Accessibility Nutrition Labels — App Store Connect Help](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/overview-of-accessibility-nutrition-labels/)

## Regra de declaração

A Apple exige que cada recurso declarado funcione em todas as tarefas comuns do aplicativo e permite respostas diferentes por tipo de dispositivo. Evidência estática no código, testes unitários e uma inspeção visual ajudam a preparar a declaração, mas não substituem um percurso manual completo em build candidata no dispositivo.

Por isso, esta matriz usa três estados:

- **Comprovado:** percurso completo executado no dispositivo, sem bloqueio relevante.
- **Parcial:** existe implementação ou teste automatizado, mas falta comprovação integral no dispositivo.
- **Não aplicável:** o aplicativo não contém o tipo de conteúdo ao qual o recurso se destina.

Somente itens **Comprovados** podem ser marcados como suportados no App Store Connect. Na ausência dessa evidência, a resposta de lançamento deve permanecer como não suportada, sem inferir suporte a partir do React Native ou do sistema operacional.

## Resultado por recurso

| Recurso da Apple | iPhone | iPad | Evidência disponível | Decisão atual no App Store Connect |
| --- | --- | --- | --- | --- |
| VoiceOver | Parcial | Parcial | Rótulos, papéis, estados, cabeçalhos, regiões vivas e descrições foram adicionados aos principais componentes e fluxos | **Não declarar ainda**; falta percurso completo na build candidata em cada dispositivo |
| Voice Control | Parcial | Parcial | Ações principais usam controles nativos e nomes acessíveis explícitos | **Não declarar ainda**; falta confirmar ativação por nome e ausência de controles inalcançáveis em cada dispositivo |
| Larger Text | Parcial | Parcial | O app usa `Text`, mas há estilos e layouts que ainda não possuem evidência de teste em todos os tamanhos de texto | **Não declarar** |
| Dark Interface | Parcial | Parcial | Há suporte pontual a tema escuro em componentes, sem evidência de cobertura integral das tarefas comuns | **Não declarar** |
| Differentiate Without Color Alone | Parcial | Parcial | Severidade, confiança, seleção e erro também usam texto, ícone, estado ou descrição acessível nos fluxos revisados | **Não declarar ainda**; falta inspeção integral de todas as tarefas comuns |
| Sufficient Contrast | Parcial | Parcial | Tokens e telas principais foram revisados no código, sem medição completa de todos os estados da build nativa | **Não declarar ainda**; falta auditoria visual e de contraste por dispositivo |
| Reduced Motion | Parcial | Parcial | Não há prova de que todas as animações e transições respeitem a preferência do sistema | **Não declarar** |
| Captions | Não aplicável | Não aplicável | O produto não usa vídeo ou áudio pré-gravado como tarefa comum | Não marcar como recurso suportado |
| Audio Descriptions | Não aplicável | Não aplicável | O produto não usa vídeo como tarefa comum | Não marcar como recurso suportado |

## Cobertura obrigatória das tarefas comuns

Cada linha abaixo deve ser concluída com VoiceOver e Voice Control ativos e também inspecionada sem depender somente de cor. O teste precisa incluir sucesso, carregamento, vazio, erro, permissão negada e recuperação quando esses estados existirem.

| Tarefa comum | Evidência estática/automatizada | iPhone | iPad |
| --- | --- | --- | --- |
| Primeiro acesso, onboarding e navegação inicial | Navegação e textos localizados existentes | Pendente em build candidata | Pendente em build candidata |
| Criar conta, entrar, recuperar e atualizar senha | Controles nativos, rótulos e estados de carregamento revisados | Pendente em build candidata | Pendente em build candidata |
| Aceitar ou recusar consentimento de IA e localização | Modal acessível, links legais, estados ocupados e ações separadas | Pendente em build candidata | Pendente em build candidata |
| Conceder e negar câmera, fotos, localização e notificações | Fluxos e recuperação documentados nos testes Maestro | Pendente em build candidata | Pendente em build candidata |
| Fotografar ou escolher imagem, selecionar cultura e iniciar diagnóstico | Rótulos, dicas, estado selecionado, progresso e ações acessíveis | Pendente em build candidata | Pendente em build candidata |
| Ler resultado, confiança, alternativas, manejo integrado e aviso legal | Texto além de cor, barras com valor acessível e cabeçalhos revisados | Pendente em build candidata | Pendente em build candidata |
| Enviar feedback, denunciar conteúdo, compartilhar e exportar | Ações possuem nomes e dicas acessíveis nos fluxos revisados | Pendente em build candidata | Pendente em build candidata |
| Consultar, pesquisar e abrir histórico e biblioteca | Cartões e busca possuem papéis e descrições acessíveis | Pendente em build candidata | Pendente em build candidata |
| Conversar com a IA, limpar conversa e denunciar resposta | Mensagens, digitação, envio e denúncia possuem rótulos e estados | Pendente em build candidata | Pendente em build candidata |
| Editar perfil e preferências | Cabeçalhos, seleção e salvamento possuem estados acessíveis | Pendente em build candidata | Pendente em build candidata |
| Abrir termos e privacidade, exportar dados e excluir ou reativar conta | Cabeçalhos, links, alertas e ações foram revisados no código | Pendente em build candidata | Pendente em build candidata |
| Sair e retornar ao aplicativo após erro ou perda de conexão | Banner, mensagens e repetição possuem regiões e nomes acessíveis | Pendente em build candidata | Pendente em build candidata |

## Evidência técnica principal

- `expo-app/app/diagnosis/camera.tsx`: câmera, galeria, progresso e recuperação.
- `expo-app/app/diagnosis/result.tsx`: confiança, alternativas, feedback, compartilhamento e aviso legal.
- `expo-app/components/AIConsentModal.tsx`: modal, cabeçalhos, links legais e estado ocupado.
- `expo-app/components/ConfidenceBar.tsx`: valor numérico exposto à tecnologia assistiva.
- `expo-app/components/DiagnosisCard.tsx`: nome, cultura, confiança, severidade e data em uma descrição textual.
- `expo-app/components/OfflineBanner.tsx`: anúncio de conectividade como alerta.
- `expo-app/app/(tabs)/ai-chat.tsx` e `expo-app/components/ChatBubble.tsx`: mensagens, entrada, envio, digitação e denúncia.
- `expo-app/app/edit-profile.tsx`, `expo-app/app/privacy.tsx` e `expo-app/app/terms.tsx`: cabeçalhos, seleção e ações nomeadas.
- `expo-app/.maestro/permissions-flow.yaml`, `expo-app/.maestro/ai-consent-flow.yaml` e `expo-app/.maestro/offline-recovery-flow.yaml`: roteiros de estados críticos; não constituem, por si só, prova de tecnologia assistiva.

## Critério para liberar uma declaração

1. Gerar uma build candidata assinada, posterior aos baselines conhecidos das lojas.
2. Executar todas as tarefas da matriz em um iPhone e em um iPad suportados, separadamente.
3. Registrar dispositivo, versão do sistema, número da build, data, resultado e evidência de cada tarefa.
4. Corrigir qualquer ação sem nome, foco incorreto, leitura duplicada, bloqueio por teclado, dependência exclusiva de cor ou contraste insuficiente.
5. Repetir o percurso completo após a correção.
6. Declarar no App Store Connect somente os recursos cujo estado mudou para **Comprovado** naquele tipo de dispositivo.

**Bloqueio externo atual:** a declaração final depende da build candidata assinada e de execução manual com VoiceOver e Voice Control em iPhone e iPad. Nenhum recurso desta matriz deve ser publicado como suportado antes dessa comprovação.
