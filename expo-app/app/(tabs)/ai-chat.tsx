import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '../../services/dialog';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, BorderRadius, FontSize, Gradients } from '../../constants/theme';
import { ChatBubble } from '../../components/ChatBubble';
import { sendChatMessage } from '../../services/ai-chat';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../../hooks/useResponsive';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const CHAT_HISTORY_KEY = '@rumo_pragas_chat_history';
const MAX_STORED_MESSAGES = 50;

/**
 * Monotonic, collision-free message id generator.
 * `Date.now()` (and `Date.now() + 1`) collide when two messages are created
 * within the same handler / millisecond (e.g. user + AI reply on the error
 * path, or rapid suggestion taps), producing duplicate React keys.
 */
let messageIdCounter = 0;
function nextMessageId(): string {
  messageIdCounter += 1;
  return `${Date.now()}-${messageIdCounter}`;
}

/** Serializable version of Message (timestamp as string) */
interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

async function loadChatHistory(): Promise<Message[]> {
  try {
    const raw = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return [];
    const stored: StoredMessage[] = JSON.parse(raw);
    return stored.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {
    return [];
  }
}

async function saveChatHistory(messages: Message[]): Promise<void> {
  try {
    const toStore = messages.slice(-MAX_STORED_MESSAGES);
    const serializable: StoredMessage[] = toStore.map((m) => ({
      ...m,
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp),
    }));
    await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(serializable));
  } catch {
    // Best-effort persistence
  }
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const hasLoadedHistory = useRef(false);
  // Mirror of `messages` so `send` can read the latest history without listing
  // `messages` as a dependency (which would recreate `send` — and the memoised
  // `handleSuggestionPress` — on every message, re-rendering all suggestions).
  const messagesRef = useRef<Message[]>([]);

  // Load chat history from AsyncStorage on mount
  useEffect(() => {
    let mounted = true;
    setIsLoadingHistory(true);
    loadChatHistory().then((history) => {
      if (!mounted) return;
      if (history.length > 0) {
        setMessages(history);
      }
      hasLoadedHistory.current = true;
      setIsLoadingHistory(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Persist messages to AsyncStorage after each change + keep the ref in sync.
  useEffect(() => {
    messagesRef.current = messages;
    if (!hasLoadedHistory.current) return;
    saveChatHistory(messages);
  }, [messages]);

  const send = useCallback(
    async (text?: string) => {
      const msg = (text || input).trim();
      if (!msg || sending) return;
      const userMsg: Message = {
        id: nextMessageId(),
        role: 'user',
        content: msg,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setSending(true);

      try {
        const history = [...messagesRef.current, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));
        const response = await sendChatMessage(history);
        const aiMsg: Message = {
          id: nextMessageId(),
          role: 'assistant',
          content: response,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMsg]);
      } catch (err: unknown) {
        // If chat limit reached, show upgrade prompt
        const errCode =
          err instanceof Object && 'code' in err ? (err as { code: string }).code : undefined;
        const errSpecific = err instanceof Error && err.message ? err.message : undefined;
        if (errCode === 'CHAT_LIMIT_REACHED') {
          showAlert(t('chat.limitReachedTitle'), t('chat.limitReachedMessage'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('chat.upgradePlan'), onPress: () => router.push('/paywall') },
          ]);
        }
        // Surface the actionable message produced by the chat service
        // (login/session expired/too many messages/service unavailable/no permission)
        // instead of collapsing every failure into a generic string.
        const errMsg: Message = {
          id: nextMessageId(),
          role: 'assistant',
          content:
            errCode === 'CHAT_LIMIT_REACHED'
              ? t('chat.limitReachedMessage')
              : errSpecific || t('chat.errorMessage'),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setSending(false);
      }
    },
    [input, sending, t],
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
          setMessages([]);
          AsyncStorage.removeItem(CHAT_HISTORY_KEY).catch((err: unknown) => {
            if (__DEV__) console.error('[Chat] Failed to clear history:', err);
          });
        },
      },
    ]);
  }, [t]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, isDark && styles.containerDark]}
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
        <View
          style={[
            styles.emptyState,
            isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' },
          ]}
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
        </View>
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
            renderItem={({ item }) => <ChatBubble message={item} />}
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerDark: { backgroundColor: Colors.backgroundDark },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: FontSize.subheadline, color: Colors.textSecondary },
  emptyState: { flex: 1, alignItems: 'center', paddingTop: 50, paddingHorizontal: 20 },
  aiAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiTitle: { fontSize: FontSize.title, fontWeight: '700', marginTop: 16 },
  aiSubtitle: {
    fontSize: FontSize.subheadline,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  suggestLabel: {
    fontSize: FontSize.caption2,
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
  suggestionText: { flex: 1, fontSize: FontSize.subheadline },
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
  chatHeaderTitle: { fontSize: FontSize.subheadline, fontWeight: '600' },
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
