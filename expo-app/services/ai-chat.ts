import { Config } from '../constants/config';
import { supabase } from './supabase';
import i18n from '../i18n';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// P0 (Vet-rejection class): bound the chat request so the AI screen never shows
// an eternal spinner on a slow/offline network.
const CHAT_TIMEOUT_MS = 20_000;

export async function sendChatMessage(
  messages: { role: string; content: string }[],
  token?: string,
): Promise<string> {
  // Resolve the access token (JWT) to forward to the edge fn.
  //
  // WEB BUG (fixed): the Supabase client's storage adapter is native-only
  // (SecureStore); on web `getItem` is a no-op returning null. With
  // persistSession:true, auth-js `getSession()` reads the session EXCLUSIVELY
  // from storage (no in-memory fallback since auth-js v2), so on web it returns
  // `session: null` even for a freshly-logged-in user — making the chat wrongly
  // reject a logged-in user with "loginRequired". The screens that work on web
  // (see services/diagnosis.ts) instead pass the token from `useAuthContext()`,
  // whose session comes from the in-memory `onAuthStateChange` event. So we
  // prefer the caller-supplied token and only fall back to getSession() (native
  // / back-compat). Identity is STILL verified server-side by the edge fn via
  // `supabase.auth.getUser(token)` (ZERO-X) — never trusting a body/header id.
  let accessToken = token?.trim() ?? '';
  if (!accessToken) {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (!sessionError && session?.access_token) {
      accessToken = session.access_token;
    }
  }

  if (!accessToken) {
    throw new Error(i18n.t('aiChat.loginRequired'));
  }

  const url = `${Config.SUPABASE_URL}/functions/v1/ai-chat`;

  // AbortController + hard timeout — on timeout/offline we throw a clear pt-BR
  // message; the chat screen surfaces it and re-enables the input so the user
  // can resend (retry). NEVER an infinite spinner.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Identify the calling app so the SHARED `ai-chat` slug (also used by
        // rumo-vet) can detect/serve the correct persona. See edge fn comments
        // on the shared-slug hazard. Durable fix = dedicated `ai-chat-pragas` slug.
        'X-Rumo-App': 'rumo-pragas',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messages: messages.map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        })),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(i18n.t('aiChat.requestTimeout'), { cause: err });
    }
    throw new Error(i18n.t('aiChat.networkError'), { cause: err });
  } finally {
    clearTimeout(timeoutId);
  }

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
