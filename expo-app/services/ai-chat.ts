import { Config } from '../constants/config';
import { supabase } from './supabase';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendChatMessage(
  messages: { role: string; content: string }[],
): Promise<string> {
  // Get current session token
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error('Voce precisa estar logado para usar o chat IA');
  }

  const url = `${Config.SUPABASE_URL}/functions/v1/ai-chat`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      messages: messages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    // Parse error body for structured error codes
    let errorBody: { error?: string; code?: string; limit?: number } = {};
    try {
      errorBody = await response.json();
    } catch {
      // ignore parse errors
    }

    // Sanitize error messages - never expose raw API responses to users
    let errorMessage: string;
    switch (true) {
      case response.status === 401:
        errorMessage = 'Sessao expirada. Faca login novamente.';
        break;
      case response.status === 403 && errorBody.code === 'CHAT_LIMIT_REACHED':
        errorMessage =
          errorBody.error || 'Limite de mensagens atingido. Faca upgrade para continuar.';
        break;
      case response.status === 403:
        errorMessage = 'Voce nao tem permissao para usar o chat IA. Verifique sua assinatura.';
        break;
      case response.status === 429:
        errorMessage = 'Muitas mensagens enviadas. Aguarde um momento e tente novamente.';
        break;
      case response.status >= 500:
        errorMessage =
          'O servico de IA esta temporariamente indisponivel. Tente novamente em alguns minutos.';
        break;
      default:
        errorMessage = 'Ocorreu um erro ao processar sua mensagem. Tente novamente.';
    }

    const error = new Error(errorMessage) as Error & { code?: string };
    if (errorBody.code) error.code = errorBody.code;
    throw error;
  }

  const data = await response.json();

  if (data.response) {
    return data.response;
  }

  throw new Error('Resposta vazia da IA');
}
