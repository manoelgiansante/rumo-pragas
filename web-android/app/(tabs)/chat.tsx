import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppTheme } from '../../src/utils/theme';
import { useAuth } from '../../src/contexts/AuthContext';
import { AIChatService } from '../../src/services/aiChatService';
import { ChatMessage } from '../../src/types';

/* ────────────────────────────────────────────────────────────────────────────
 * Suggested questions (same 6 from iOS)
 * ──────────────────────────────────────────────────────────────────────────── */

const ALL_SUGGESTIONS = [
  'Como identificar ferrugem asiática na soja?',
  'Quais pragas atacam milho no verão?',
  'Manejo biológico da broca-do-café',
  'Controle de cigarrinha na cana',
  'Quando aplicar defensivo no algodão?',
  'Como prevenir percevejos na soja?',
];

function pickRandom(arr: string[], n: number): string[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Typing indicator (animated dots)
 * ──────────────────────────────────────────────────────────────────────────── */

function TypingIndicator() {
  const anims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    const animate = (idx: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anims[idx], { toValue: -4, duration: 300, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(anims[idx], { toValue: 0, duration: 300, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ]),
      ).start();
    };
    anims.forEach((_, i) => setTimeout(() => animate(i), i * 150));
  }, []);

  return (
    <View style={s.typingRow}>
      {/* avatar */}
      <View style={s.assistantAvatar}>
        <MaterialCommunityIcons name="creation" size={13} color="#fff" />
      </View>
      <View style={s.typingBubble}>
        {anims.map((a, i) => (
          <Animated.View
            key={i}
            style={[
              s.typingDot,
              { transform: [{ translateY: a }] },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Chat Screen
 * ──────────────────────────────────────────────────────────────────────────── */

export default function ChatScreen() {
  const { accessToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState(() => pickRandom(ALL_SUGGESTIONS, 3));
  const scrollRef = useRef<FlatList>(null);

  const refreshSuggestions = () => setSuggestions(pickRandom(ALL_SUGGESTIONS, 3));

  const canSend = inputText.trim().length > 0 && !isSending;

  const scrollToEnd = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const sendMessage = async (text?: string) => {
    const content = (text || inputText).trim();
    if (!content || isSending) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);
    setErrorMessage(null);
    scrollToEnd();

    try {
      const allMsgs = [...messages, userMsg];
      const recentMsgs = allMsgs.slice(-20).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await AIChatService.sendMessage(recentMsgs, accessToken || undefined);

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setErrorMessage('Não foi possível obter resposta. Tente novamente.');
    }

    setIsSending(false);
    scrollToEnd();
  };

  const clearChat = () => {
    setMessages([]);
    setErrorMessage(null);
    refreshSuggestions();
  };

  const formatTime = (d: Date) => {
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  /* Empty state */
  const renderEmptyState = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
      <View style={s.emptyContainer}>
        <View style={{ height: 40 }} />
        {/* Gradient circle */}
        <View style={s.emptyGlow}>
          <View style={s.emptyCircle}>
            <MaterialCommunityIcons name="creation" size={34} color="#fff" />
          </View>
        </View>

        <Text style={s.emptyTitle}>Agro IA</Text>
        <Text style={s.emptySubtitle}>
          {'Seu assistente especializado em pragas\ne manejo integrado de pragas (MIP)'}
        </Text>

        <View style={s.suggestionsWrap}>
          <Text style={s.suggestionsLabel}>PERGUNTE SOBRE:</Text>
          {suggestions.map((sg) => (
            <TouchableOpacity
              key={sg}
              style={s.suggestionCard}
              onPress={() => sendMessage(sg)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="leaf" size={14} color={AppTheme.accent} />
              <Text style={s.suggestionText} numberOfLines={2}>{sg}</Text>
              <MaterialCommunityIcons name="arrow-top-right" size={10} color={AppTheme.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );

  /* Messages list */
  const renderMessagesList = () => (
    <FlatList
      ref={scrollRef}
      data={messages}
      keyExtractor={(m) => m.id}
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12 }}
      onContentSizeChange={scrollToEnd}
      renderItem={({ item }) => {
        const isUser = item.role === 'user';
        return (
          <View style={[s.msgRow, isUser && { justifyContent: 'flex-end' }]}>
            {!isUser && (
              <View style={[s.assistantAvatar, { marginTop: 4 }]}>
                <MaterialCommunityIcons name="creation" size={13} color="#fff" />
              </View>
            )}
            <View style={{ maxWidth: '75%' }}>
              <View
                style={[
                  s.bubble,
                  isUser ? s.userBubble : s.assistantBubble,
                ]}
              >
                <Text
                  style={[s.bubbleText, isUser && { color: '#fff' }]}
                  selectable
                >
                  {item.content}
                </Text>
              </View>
              <Text
                style={[
                  s.timeText,
                  { textAlign: isUser ? 'right' : 'left' },
                ]}
              >
                {formatTime(item.timestamp)}
              </Text>
            </View>
          </View>
        );
      }}
      ListFooterComponent={
        <>
          {isSending && <TypingIndicator />}
          {errorMessage && (
            <View style={s.errorBubble}>
              <MaterialCommunityIcons name="alert" size={14} color={AppTheme.warmAmber} />
              <Text style={s.errorText}>{errorMessage}</Text>
            </View>
          )}
        </>
      }
    />
  );

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.headerIcon}>
            <MaterialCommunityIcons name="creation" size={13} color="#fff" />
          </View>
          <Text style={s.headerTitle}>Agro IA</Text>
        </View>
        {messages.length > 0 && (
          <TouchableOpacity onPress={clearChat}>
            <MaterialCommunityIcons name="restart" size={20} color={AppTheme.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {messages.length === 0 ? renderEmptyState() : renderMessagesList()}

      {/* Input bar */}
      <View style={s.inputBarOuter}>
        <View style={s.inputDivider} />
        <View style={s.inputBar}>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              placeholder="Pergunte sobre pragas..."
              placeholderTextColor={AppTheme.textTertiary}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={2000}
            />
          </View>
          <TouchableOpacity
            onPress={() => sendMessage()}
            disabled={!canSend}
            style={[
              s.sendBtn,
              { backgroundColor: canSend ? AppTheme.accent : AppTheme.surfaceCard },
            ]}
          >
            <MaterialCommunityIcons
              name="arrow-up"
              size={18}
              color={canSend ? '#fff' : AppTheme.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Styles
 * ──────────────────────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppTheme.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 10,
    backgroundColor: AppTheme.cardBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppTheme.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AppTheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: AppTheme.text },

  // Empty state
  emptyContainer: { alignItems: 'center', paddingHorizontal: 20 },
  emptyGlow: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: AppTheme.accent + '1F',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: AppTheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: AppTheme.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  emptyTitle: { fontSize: 24, fontWeight: 'bold', color: AppTheme.text },
  emptySubtitle: {
    fontSize: 14,
    color: AppTheme.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 28,
  },
  suggestionsWrap: { width: '100%' },
  suggestionsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: AppTheme.textTertiary,
    letterSpacing: 0.5,
    marginBottom: 10,
    textAlign: 'center',
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    gap: 12,
  },
  suggestionText: { fontSize: 14, color: AppTheme.text, flex: 1 },

  // Messages
  msgRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4, gap: 8 },
  assistantAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: AppTheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  userBubble: {
    backgroundColor: AppTheme.accent,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: AppTheme.cardBackground,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  bubbleText: { fontSize: 14, color: AppTheme.text, lineHeight: 20 },
  timeText: { fontSize: 10, color: AppTheme.textTertiary, marginTop: 2, paddingHorizontal: 4 },

  // Typing
  typingRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4, gap: 8 },
  typingBubble: {
    flexDirection: 'row',
    backgroundColor: AppTheme.cardBackground,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 5,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: AppTheme.accent + '99',
  },

  // Error
  errorBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppTheme.warmAmber + '14',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 4,
    gap: 8,
  },
  errorText: { fontSize: 12, color: AppTheme.textSecondary, flex: 1 },

  // Input bar
  inputBarOuter: { backgroundColor: AppTheme.cardBackground },
  inputDivider: { height: StyleSheet.hairlineWidth, backgroundColor: AppTheme.border },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  inputWrap: {
    flex: 1,
    backgroundColor: AppTheme.surfaceCard,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 120,
  },
  input: { fontSize: 15, color: AppTheme.text, lineHeight: 20 },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
