interface IdentifiedChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Builds the transport history without appending the same logical user
 * message twice on a response-lost retry. This keeps both the request body and
 * the Idempotency-Key identical across attempts.
 */
export function buildChatRequestHistory(
  persisted: IdentifiedChatMessage[],
  pending: IdentifiedChatMessage,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const source = persisted.some((message) => message.id === pending.id)
    ? persisted
    : [...persisted, pending];
  return source.map(({ role, content }) => ({ role, content }));
}
