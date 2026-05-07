import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, FontSize, FontWeight, Gradients } from '../../constants/theme';
import { ChatBubble } from '../../components/ChatBubble';
import { sendChatMessage } from '../../services/ai-chat';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../../hooks/useResponsive';
import { AppBar, IconButton, Input, Chip } from '../../components/ui';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const CHAT_HISTORY_KEY = '@rumo_pragas_chat_history';
const MAX_STORED_MESSAGES = 50;

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

  // Persist messages to AsyncStorage after each change
  useEffect(() => {
    if (!hasLoadedHistory.current) return;
    saveChatHistory(messages);
  }, [messages]);

  const send = useCallback(
    async (text?: string) => {
      const msg = (text || input).trim();
      if (!msg || sending) return;
      const userMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: msg,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setSending(true);

      try {
        const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
        const response = await sendChatMessage(history);
        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMsg]);
      } catch (err: unknown) {
        // If chat limit reached, show upgrade prompt
        const errCode =
          err instanceof Object && 'code' in err ? (err as { code: string }).code : undefined;
        if (errCode === 'CHAT_LIMIT_REACHED') {
          Alert.alert(t('chat.limitReachedTitle'), t('chat.limitReachedMessage'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('chat.upgradePlan'), onPress: () => router.push('/paywall') },
          ]);
        }
        const errMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content:
            errCode === 'CHAT_LIMIT_REACHED'
              ? t('chat.limitReachedMessage')
              : t('chat.errorMessage'),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errMsg]);
      }
      setSending(false);
    },
    [input, sending, messages, t],
  );

  const handleSuggestionPress = useCallback(
    (suggestion: string) => {
      send(suggestion);
    },
    [send],
  );

  const clearChat = useCallback(() => {
    Alert.alert(t('chat.clearChat'), t('chat.clearChatConfirm'), [
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

  const canSend = !!input.trim() && !sending;

  return (
    <KeyboardAvoidingView
      style={[styles.container, isDark && styles.containerDark]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <AppBar
        title={t('chat.title')}
        trailing={
          <IconButton
            iconName="ellipsis-horizontal"
            accessibilityLabel={t('chat.clearChat')}
            onPress={clearChat}
          />
        }
      />

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
          <View style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={36} color={Colors.accent} />
          </View>
          <Text style={[styles.aiTitle, isDark && styles.textDark]}>{t('chat.title')}</Text>
          <Text style={styles.aiSubtitle}>{t('chat.subtitle')}</Text>
          <Text style={styles.suggestLabel}>{t('chat.askAbout')}</Text>
          <View style={styles.suggestionWrap}>
            {SUGGESTIONS.map((s, i) => (
              <Chip
                key={i}
                onPress={() => handleSuggestionPress(s)}
                accessibilityLabel={`${t('chat.suggestionA11y')}: ${s}`}
              >
                {s}
              </Chip>
            ))}
          </View>
        </View>
      ) : (
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
                  <Text style={styles.typingDots}>{'• • •'}</Text>
                </View>
              </View>
            ) : null
          }
        />
      )}

      <View
        style={[
          styles.inputBar,
          isDark && styles.inputBarDark,
          isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' },
        ]}
      >
        <Input
          containerStyle={styles.inputFlex}
          placeholder={t('chat.placeholder')}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={2000}
          accessibilityLabel={t('chat.inputA11y')}
          accessibilityHint={t('chat.inputHint')}
        />
        <IconButton
          iconName="arrow-up"
          tone="onHero"
          accessibilityLabel={t('chat.sendA11y')}
          onPress={() => send()}
          disabled={!canSend}
          style={styles.sendBtn}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  containerDark: { backgroundColor: Colors.backgroundDark },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: FontSize.subheadline, color: Colors.textSecondary },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  aiAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.accent + '14',
  },
  aiTitle: {
    fontSize: FontSize.title2,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginTop: 16,
    letterSpacing: -0.33,
  },
  aiSubtitle: {
    fontSize: FontSize.subheadline,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  suggestLabel: {
    fontSize: FontSize.caption2,
    fontWeight: FontWeight.bold,
    color: Colors.textTertiary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 12,
    alignSelf: 'flex-start',
    paddingLeft: 4,
  },
  suggestionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignSelf: 'stretch',
  },
  typingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  typingAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typingBubble: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  typingDots: { fontSize: 16, color: Colors.accent },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: Colors.separator,
    backgroundColor: Colors.card,
  },
  inputBarDark: { backgroundColor: '#1C1C1E', borderTopColor: Colors.separatorDark },
  inputFlex: {
    flex: 1,
  },
  sendBtn: {
    backgroundColor: Colors.accent,
  },
  textDark: { color: Colors.textDark },
});
