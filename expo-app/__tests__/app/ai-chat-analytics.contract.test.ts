/**
 * Contract test — PR-27 (18/jul/2026).
 *
 * Locks the analytics adoption instrumentation for the chat screen. The
 * `trackChatMessage()` helper existed since analytics.ts:221 but had no
 * caller — 100 % adoption blindness on prod. This test asserts that the
 * chat handler imports and calls it in the successful-send path.
 *
 * A DOM/Testing-Library render of `app/(tabs)/ai-chat.tsx` would require
 * mocking the entire Supabase client, consent + history services, i18n,
 * safe-area, gradient, expo-router — for a single-line assertion. This
 * lightweight source-level contract is what the rest of the repo does
 * for pure JS (`__tests__/lib/*`) and catches accidental deletion of the
 * telemetry call in code review / CI.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AI_CHAT_SOURCE = readFileSync(
  join(__dirname, '..', '..', 'app', '(tabs)', 'ai-chat.tsx'),
  'utf8',
);

describe('ai-chat.tsx — analytics adoption instrumentation (PR-27)', () => {
  it('imports trackChatMessage from services/analytics', () => {
    // Match the exact import shape so a rename here forces this test to update.
    expect(AI_CHAT_SOURCE).toMatch(
      /import\s*\{\s*trackChatMessage\s*\}\s*from\s*'\.\.\/\.\.\/services\/analytics'/,
    );
  });

  it('calls trackChatMessage() inside the send handler', () => {
    // The success path lives inside `const send = useCallback(async ...)`.
    // Anchor to the whole `send` closure so a stray call elsewhere would
    // not satisfy the intent. Non-greedy to the closing `);` of useCallback.
    const sendStart = AI_CHAT_SOURCE.indexOf('const send = useCallback');
    expect(sendStart).toBeGreaterThan(-1);
    // `acceptChatConsent` is defined just after `send` — bound the search
    // there so we do NOT count a hypothetical call in another handler.
    const nextHandler = AI_CHAT_SOURCE.indexOf('const acceptChatConsent', sendStart);
    expect(nextHandler).toBeGreaterThan(sendStart);
    const sendBlock = AI_CHAT_SOURCE.slice(sendStart, nextHandler);
    expect(sendBlock).toContain('trackChatMessage()');
  });

  it('places trackChatMessage() AFTER the assistant reply is appended', () => {
    // The intent is "adoption = user got an AI reply", not "user pressed send".
    // If the call moves above the `setMessages((prev) => [...prev, aiMsg])`
    // line it would count broken sends as adoption — regression to catch.
    const appendIdx = AI_CHAT_SOURCE.indexOf('setMessages((prev) => [...prev, aiMsg])');
    const trackIdx = AI_CHAT_SOURCE.indexOf('trackChatMessage()');
    expect(appendIdx).toBeGreaterThan(0);
    expect(trackIdx).toBeGreaterThan(appendIdx);
  });
});
