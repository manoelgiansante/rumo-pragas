import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '../../services/dialog';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import {
  Colors,
  Spacing,
  BorderRadius,
  FontSize,
  Gradients,
  FontFamily,
} from '../../constants/theme';
import { ChatBubble } from '../../components/ChatBubble';
import { sendChatMessage } from '../../services/ai-chat';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuthContext } from '../../contexts/AuthContext';
import { AIConsentModal } from '../../components/AIConsentModal';
import { AIReportModal } from '../../components/AIReportModal';
import { grantAIConsent, hasAIConsent } from '../../services/aiConsent';
import { AIContentReportReason, reportAIContent } from '../../services/aiContentReports';
import { clearChatHistory, loadChatHistory, saveChatHistory } from '../../services/chatHistory';
import { buildChatRequestHistory } from '../../services/chatRequestHistory';
import { trackChatMessage } from '../../services/analytics';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

function nextMessageId(): string {
  return Crypto.randomUUID();
}

export default function AIChatScreen() {
  const { t } = useTranslation();

  const SUGGESTIONS = useMemo(
    () => [
      t('chat.suggestion1'),
      t('chat.suggestion2'),
      t('chat.suggestion3'),
      t('chat.suggestion4'),
    ],
    [t],
  );

  const isDark = useColorScheme() === 'dark';
  const { isTablet, contentMaxWidth } = useResponsive();
  // Auth session token forwarded to the chat edge fn. On web the Supabase
  // client's storage adapter is a no-op, so `supabase.auth.getSession()` inside
  // the service returns null even for a logged-in user; the reliable source is
  // the auth context (populated by onAuthStateChange). Held in a ref so `send`'s
  // dependency array stays stable (avoids recreating the memoised suggestions on
  // every token refresh). Mirrors services/diagnosis.ts' loading.tsx caller.
  const { session, user } = useAuthContext();
  const sessionRef = useRef(session);
  const userRef = useRef(user);
  useEffect(() => {
    sessionRef.current = session;
    userRef.current = user;
  }, [session, user]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  // Prefill vindo da Home ("Sem foto? Descreva os sintomas") — o param `ts`
  // muda a cada toque, então repetir o fluxo re-preenche; nunca auto-envia.
  const { prefill, ts: prefillTs } = useLocalSearchParams<{ prefill?: string; ts?: string }>();
  const inputRef = useRef<TextInput>(null);
  const lastPrefillTs = useRef<string | null>(null);
  const [sending, setSending] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const hasLoadedHistory = useRef(false);
  // Mirror of `messages` so `send` can read the latest history without listing
  // `messages` as a dependency (which would recreate `send` — and the memoised
  // `handleSuggestionPress` — on every message, re-rendering all suggestions).
  const messagesRef = useRef<Message[]>([]);
  const pendingConsentMessageRef = useRef<string | null>(null);
  const failedMessageRef = useRef<Message | null>(null);
  const loadedHistoryUserRef = useRef<string | null>(null);
  const [consentVisible, setConsentVisible] = useState(false);
  const [messageToReport, setMessageToReport] = useState<Message | null>(null);
  const reportOperationRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (prefill === 'symptoms' && prefillTs && prefillTs !== lastPrefillTs.current) {
      lastPrefillTs.current = prefillTs;
      // Nunca sobrescrever rascunho do usuário: a aba fica montada no tab
      // navigator e `input` persiste entre trocas de aba (e em remount Android
      // os params persistem no estado de navegação — o guard do ref zera).
      let didPrefill = false;
      setInput((cur) => {
        if (cur.trim()) return cur;
        didPrefill = true;
        return t('chat.symptomsPrefill');
      });
      // pequeno delay: deixa a troca de aba montar antes de focar o teclado.
      // Só foca quando realmente prefilou — remount restaurado não rouba foco.
      const timer = setTimeout(() => {
        if (didPrefill) inputRef.current?.focus();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [prefill, prefillTs, t]);

  // Reload from isolated storage on every account change. Reset state first so
  // a slow previous-user read cannot flash private messages to the new user.
  useEffect(() => {
    let mounted = true;
    const userId = user?.id;
    hasLoadedHistory.current = false;
    loadedHistoryUserRef.current = null;
    messagesRef.current = [];
    failedMessageRef.current = null;
    setMessages([]);
    setInput('');
    setIsLoadingHistory(!!userId);
    if (!userId) {
      return () => {
        mounted = false;
      };
    }

    loadChatHistory(userId).then((history) => {
      if (!mounted) return;
      setMessages(
        history.map((message) => ({ ...message, timestamp: new Date(message.timestamp) })),
      );
      loadedHistoryUserRef.current = userId;
      hasLoadedHistory.current = true;
      setIsLoadingHistory(false);
    });
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  // Persist messages to AsyncStorage after each change + keep the ref in sync.
  useEffect(() => {
    messagesRef.current = messages;
    const userId = user?.id;
    if (!hasLoadedHistory.current || !userId || loadedHistoryUserRef.current !== userId) return;
    void saveChatHistory(
      userId,
      messages.map((message) => ({
        ...message,
        timestamp: message.timestamp.toISOString(),
      })),
    );
  }, [messages, user?.id]);

  const send = useCallback(
    async (text?: string) => {
      const msg = (text || input).trim();
      if (!msg || sending) return;
      const userId = userRef.current?.id;
      if (!userId) {
        showAlert(t('common.error'), t('aiChat.loginRequired'));
        return;
      }
      if (!(await hasAIConsent(userId, 'chat'))) {
        pendingConsentMessageRef.current = msg;
        setConsentVisible(true);
        return;
      }
      const retryMessage =
        failedMessageRef.current?.content === msg ? failedMessageRef.current : null;
      const userMsg: Message = retryMessage ?? {
        id: nextMessageId(),
        role: 'user',
        content: msg,
        timestamp: new Date(),
      };
      if (!retryMessage) setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setSending(true);

      try {
        const history = buildChatRequestHistory(messagesRef.current, userMsg);
        const response = await sendChatMessage(
          history,
          sessionRef.current?.access_token,
          userId,
          userMsg.id,
        );
        failedMessageRef.current = null;
        const aiMsg: Message = {
          id: nextMessageId(),
          role: 'assistant',
          content: response,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMsg]);
        // Product telemetry: adoption of the chat. Event name is fixed
        // (`chat_message_sent`); no message content, user or PII travels — the
        // analytics service enforces that (services/analytics.ts sanitizer).
        trackChatMessage();
      } catch (err: unknown) {
        const errCode =
          err instanceof Object && 'code' in err ? (err as { code: string }).code : undefined;
        // FREE BUILD (Apple Guideline 3.1.1): the app is 100% free. Should the
        // backend ever still signal a chat limit, we surface an informational
        // message ONLY — no plans, no buy button and no CTA anywhere in the app.
        if (errCode === 'CHAT_LIMIT_REACHED') {
          showAlert(t('chat.limitReachedTitle'), t('chat.limitReachedMessage'), [
            { text: t('common.ok'), style: 'cancel' },
          ]);
          return;
        }
        if (errCode === 'AI_CONSENT_REQUIRED') {
          pendingConsentMessageRef.current = msg;
          setConsentVisible(true);
          return;
        }
        // Restore the draft and preserve the same UUID for explicit retry. If
        // the first response was lost, the backend can replay its idempotency
        // ledger without a second provider call.
        failedMessageRef.current = userMsg;
        setInput(msg);
        showAlert(t('common.error'), t('chat.errorMessage'));
      } finally {
        setSending(false);
      }
    },
    [input, sending, t],
  );

  const acceptChatConsent = useCallback(async () => {
    const userId = userRef.current?.id;
    if (!userId) return;
    try {
      await grantAIConsent(userId, 'chat');
      setConsentVisible(false);
      const pending = pendingConsentMessageRef.current;
      pendingConsentMessageRef.current = null;
      if (pending) await send(pending);
    } catch {
      showAlert(t('common.error'), t('aiConsent.saveError'));
    }
  }, [send, t]);

  const submitAIReport = useCallback(
    async (reason: AIContentReportReason, details?: string) => {
      if (!messageToReport || !sessionRef.current?.access_token) {
        showAlert(t('common.error'), t('aiReport.error'));
        return;
      }
      try {
        const input: Parameters<typeof reportAIContent>[0] = {
          messageId: messageToReport.id,
          content: messageToReport.content,
          reason,
        };
        if (details) input.details = details;
        const fingerprint = JSON.stringify(input);
        if (reportOperationRef.current?.fingerprint !== fingerprint) {
          reportOperationRef.current = { fingerprint, key: Crypto.randomUUID() };
        }
        await reportAIContent(
          input,
          sessionRef.current.access_token,
          reportOperationRef.current.key,
        );
        reportOperationRef.current = null;
        setMessageToReport(null);
        showAlert(t('aiReport.successTitle'), t('aiReport.success'));
      } catch {
        showAlert(t('common.error'), t('aiReport.error'));
      }
    },
    [messageToReport, t],
  );

  const handleSuggestionPress = useCallback(
    (suggestion: string) => {
      send(suggestion);
    },
    [send],
  );

  const clearChat = useCallback(() => {
    showAlert(t('chat.clearChat'), t('chat.clearChatConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('chat.clearChat'),
        style: 'destructive',
        onPress: () => {
          const userId = userRef.current?.id;
          setMessages([]);
          failedMessageRef.current = null;
          if (!userId) return;
          clearChatHistory(userId).catch((err: unknown) => {
            if (__DEV__) console.error('[Chat] Failed to clear history:', err);
          });
        },
      },
    ]);
  }, [t]);

  return (
    <SafeAreaView edges={['top']} style={[styles.container, isDark && styles.containerDark]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {isLoadingHistory ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={[styles.loadingText, isDark && styles.textDark]}>
              {t('aiChat.loadingConversation')}
            </Text>
          </View>
        ) : messages.length === 0 ? (
          <ScrollView
            style={styles.emptyStateScroll}
            contentContainerStyle={[
              styles.emptyState,
              isTablet && {
                maxWidth: contentMaxWidth,
                alignSelf: 'center' as const,
                width: '100%',
              },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <LinearGradient colors={Gradients.tech} style={styles.aiAvatar}>
              <Ionicons name="sparkles" size={34} color="#FFF" />
            </LinearGradient>
            <Text style={[styles.aiTitle, isDark && styles.textDark]}>{t('chat.title')}</Text>
            <Text style={styles.aiSubtitle}>{t('chat.subtitle')}</Text>
            <Text style={styles.suggestLabel}>{t('chat.askAbout')}:</Text>
            {SUGGESTIONS.map((s, i) => (
              <TouchableOpacity
                key={i}
                testID={`aichat-suggestion-${i}`}
                style={[styles.suggestion, isDark && styles.suggestionDark]}
                onPress={() => handleSuggestionPress(s)}
                accessibilityLabel={`${t('chat.suggestionA11y')}: ${s}`}
                accessibilityRole="button"
              >
                <Ionicons name="leaf" size={14} color={Colors.accent} />
                <Text style={[styles.suggestionText, isDark && styles.textDark]} numberOfLines={2}>
                  {s}
                </Text>
                <Ionicons name="arrow-up-outline" size={12} color={Colors.systemGray3} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <>
            <View style={styles.chatHeader}>
              <Text style={[styles.chatHeaderTitle, isDark && styles.textDark]}>
                {t('chat.title')}
              </Text>
              <TouchableOpacity
                testID="aichat-clear"
                onPress={clearChat}
                style={styles.clearChatBtn}
                accessibilityLabel={t('chat.clearChat')}
                accessibilityRole="button"
              >
                <Ionicons name="trash-outline" size={18} color={Colors.coral} />
              </TouchableOpacity>
            </View>
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[
                { padding: Spacing.md, paddingBottom: 20 },
                isTablet && {
                  maxWidth: contentMaxWidth,
                  alignSelf: 'center' as const,
                  width: '100%',
                },
              ]}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              renderItem={({ item }) =>
                item.role === 'assistant' ? (
                  <ChatBubble message={item} onReport={setMessageToReport} />
                ) : (
                  <ChatBubble message={item} />
                )
              }
              ListFooterComponent={
                sending ? (
                  <View style={styles.typingRow}>
                    <LinearGradient colors={Gradients.tech} style={styles.typingAvatar}>
                      <Ionicons name="sparkles" size={13} color="#FFF" />
                    </LinearGradient>
                    <View style={styles.typingBubble}>
                      <Text style={styles.typingDots}>{'\u2022 \u2022 \u2022'}</Text>
                    </View>
                  </View>
                ) : null
              }
            />
          </>
        )}

        <View
          style={[
            styles.inputBar,
            isDark && styles.inputBarDark,
            isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' },
          ]}
        >
          <TextInput
            ref={inputRef}
            testID="aichat-input"
            style={[styles.textInput, isDark && styles.textInputDark]}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={Colors.textSecondary}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            accessibilityLabel={t('chat.inputA11y')}
            accessibilityRole="text"
            accessibilityHint={t('chat.inputHint')}
          />
          <TouchableOpacity
            testID="aichat-send"
            onPress={() => send()}
            disabled={!input.trim() || sending}
            style={[styles.sendBtn, input.trim() && !sending ? styles.sendBtnActive : null]}
            accessibilityLabel={t('chat.sendA11y')}
            accessibilityRole="button"
            accessibilityState={{ disabled: !input.trim() || sending, busy: sending }}
          >
            <Ionicons
              name="arrow-up"
              size={18}
              color={input.trim() && !sending ? '#FFF' : Colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      <AIConsentModal
        visible={consentVisible}
        purpose="chat"
        onAccept={acceptChatConsent}
        onCancel={() => {
          pendingConsentMessageRef.current = null;
          setConsentVisible(false);
        }}
      />
      <AIReportModal
        visible={messageToReport !== null}
        onClose={() => setMessageToReport(null)}
        onSubmit={submitAIReport}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerDark: { backgroundColor: Colors.backgroundDark },
  flex: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    color: Colors.textSecondary,
  },
  emptyStateScroll: { flex: 1 },
  emptyState: {
    flexGrow: 1,
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  aiAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiTitle: {
    fontSize: FontSize.title,
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    marginTop: 16,
  },
  aiSubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  suggestLabel: {
    fontSize: FontSize.caption2,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    marginTop: 28,
    marginBottom: 12,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    padding: 14,
    backgroundColor: Colors.systemGray6,
    borderRadius: BorderRadius.md,
    marginBottom: 8,
  },
  suggestionDark: { backgroundColor: '#1C1C1E' },
  suggestionText: { fontFamily: FontFamily.regular, flex: 1, fontSize: FontSize.subheadline },
  typingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  typingAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typingBubble: {
    backgroundColor: Colors.systemGray6,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  typingDots: { fontSize: 16, color: Colors.accent },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.separator,
  },
  chatHeaderTitle: {
    fontSize: FontSize.subheadline,
    fontFamily: FontFamily.semibold,
    fontWeight: '600',
  },
  clearChatBtn: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: Colors.separator,
    backgroundColor: Colors.card,
  },
  inputBarDark: { backgroundColor: '#1C1C1E', borderTopColor: Colors.separatorDark },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: Colors.systemGray6,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    marginRight: 8,
  },
  textInputDark: { backgroundColor: '#2C2C2E', color: '#FFF' },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.systemGray5,
  },
  sendBtnActive: { backgroundColor: Colors.accent },
  textDark: { color: Colors.textDark },
});
