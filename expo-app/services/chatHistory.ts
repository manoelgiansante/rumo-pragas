import AsyncStorage from '@react-native-async-storage/async-storage';

const LEGACY_CHAT_HISTORY_KEY = '@rumo_pragas_chat_history';
const CHAT_HISTORY_KEY_PREFIX = '@rumo_pragas_chat_history:';
const MAX_STORED_MESSAGES = 50;
const MAX_CONTENT_LENGTH = 8_000;
let chatOperationTail: Promise<void> = Promise.resolve();

function serializeChatOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = chatOperationTail.catch(() => undefined).then(operation);
  chatOperationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export interface StoredChatHistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export function chatHistoryKey(userId: string): string {
  const safeUserId = userId
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 128);
  if (!safeUserId) throw new Error('Chat history requires a user');
  return `${CHAT_HISTORY_KEY_PREFIX}${safeUserId}`;
}

function isStoredMessage(value: unknown): value is StoredChatHistoryMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredChatHistoryMessage>;
  return (
    typeof candidate.id === 'string' &&
    (candidate.role === 'user' || candidate.role === 'assistant') &&
    typeof candidate.content === 'string' &&
    candidate.content.length <= MAX_CONTENT_LENGTH &&
    typeof candidate.timestamp === 'string' &&
    Number.isFinite(Date.parse(candidate.timestamp))
  );
}

export async function loadChatHistory(userId: string): Promise<StoredChatHistoryMessage[]> {
  try {
    return await serializeChatOperation(async () => {
      // The legacy key is handled only by the durable local-owner claim. A
      // render-time read must never race that one-shot decision and erase a
      // legitimate upgrade user's history.
      const raw = await AsyncStorage.getItem(chatHistoryKey(userId));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed) || !parsed.every(isStoredMessage)) return [];
      return parsed.slice(-MAX_STORED_MESSAGES);
    });
  } catch {
    // Fail closed: unavailable/corrupt storage never exposes another account.
    return [];
  }
}

export async function saveChatHistory(
  userId: string,
  messages: StoredChatHistoryMessage[],
): Promise<void> {
  const safe = messages.filter(isStoredMessage).slice(-MAX_STORED_MESSAGES);
  await serializeChatOperation(() =>
    AsyncStorage.setItem(chatHistoryKey(userId), JSON.stringify(safe)),
  );
}

export async function clearChatHistory(userId: string): Promise<void> {
  await serializeChatOperation(() => AsyncStorage.removeItem(chatHistoryKey(userId)));
}

/**
 * Resolve the unscoped pre-owner chat key while the persisted local-owner lock
 * is held. Only a persisted cold-boot session explicitly authorized by the
 * caller may adopt valid messages; interactive/later/switch claims remove the
 * legacy value without transferring it.
 * The scoped write precedes deletion so any storage failure blocks session
 * admission and leaves a retryable source of truth.
 */
export async function prepareChatHistoryForOwnerClaim(
  userId: string,
  options: { claimOwnerlessLegacy: boolean },
): Promise<void> {
  const ownerKey = chatHistoryKey(userId);
  await serializeChatOperation(async () => {
    const legacyRaw = await AsyncStorage.getItem(LEGACY_CHAT_HISTORY_KEY);
    if (legacyRaw === null) return;

    if (!options.claimOwnerlessLegacy) {
      await AsyncStorage.removeItem(LEGACY_CHAT_HISTORY_KEY);
      return;
    }

    let safe: StoredChatHistoryMessage[] = [];
    try {
      const parsed = JSON.parse(legacyRaw) as unknown;
      if (Array.isArray(parsed)) {
        safe = parsed.filter(isStoredMessage).slice(-MAX_STORED_MESSAGES);
      }
    } catch {
      // Malformed ownerless history is never exposed. Removing the source is
      // still awaited below so a storage failure blocks owner admission.
    }

    await AsyncStorage.setItem(ownerKey, JSON.stringify(safe));
    await AsyncStorage.removeItem(LEGACY_CHAT_HISTORY_KEY);
  });
}

export const CHAT_HISTORY_STORAGE_PREFIX = CHAT_HISTORY_KEY_PREFIX;
