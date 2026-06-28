import { Config } from '../constants/config';
import { supabase } from './supabase';
import i18n from '../i18n';

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
    throw new Error(i18n.t('aiChat.loginRequired'));
  }

  const url = `${Config.SUPABASE_URL}/functions/v1/ai-chat`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Identify the calling app so the SHARED `ai-chat` slug (also used by
      // rumo-vet) can detect/serve the correct persona. See edge fn comments
      // on the shared-slug hazard. Durable fix = dedicated `ai-chat-pragas` slug.
      'X-Rumo-App': 'rumo-pragas',
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
        errorMessage = i18n.t('aiChat.sessionExpired');
        break;
      case response.status === 403 && errorBody.code === 'CHAT_LIMIT_REACHED':
        errorMessage = errorBody.error || i18n.t('aiChat.chatLimitReached');
        break;
      case response.status === 403:
        errorMessage = i18n.t('aiChat.noPermission');
        break;
      case response.status === 429:
        errorMessage = i18n.t('aiChat.tooManyMessages');
        break;
      case response.status >= 500:
        errorMessage = i18n.t('aiChat.serviceUnavailable');
        break;
      default:
        errorMessage = i18n.t('aiChat.genericError');
    }

    const error = new Error(errorMessage) as Error & { code?: string };
    if (errorBody.code) error.code = errorBody.code;
    throw error;
  }

  const data = await response.json();

  if (data.response) {
    return data.response;
  }

  throw new Error(i18n.t('aiChat.emptyResponse'));
}
