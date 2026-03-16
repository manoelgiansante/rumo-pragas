import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppTheme } from '../../src/utils/theme';
import { useAuth } from '../../src/contexts/AuthContext';
import { AIChatService } from '../../src/services/aiChatService';
import { ChatMessage } from '../../src/types';

const ALL_SUGGESTIONS = [
  'Como identificar ferrugem-asiática na soja?',
  'Quais são as pragas mais comuns do milho safrinha?',
  'Como fazer o manejo integrado do bicudo do algodão?',
  'Qual o tratamento biológico para a broca-da-cana?',
  'Como prevenir a requeima na batata?',
  'Quais sintomas indicam greening nos citros?',
];

function getRandomSuggestions(count: number): string[] {
  const shuffled = [...ALL_SUGGESTIONS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export default function ChatScreen() {
  const { accessToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [suggestions] = useState(() => getRandomSuggestions(3));
  const flatListRef = useRef<FlatList>(null);

  // Typing dots animation
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isTyping) return;
    const createDotAnimation = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      );
    const anim1 = createDotAnimation(dot1, 0);
    const anim2 = createDotAnimation(dot2, 150);
    const anim3 = createDotAnimation(dot3, 300);
    anim1.start();
    anim2.start();
    anim3.start();
    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
      dot1.setValue(0);
      dot2.setValue(0);
      dot3.setValue(0);
    };
  }, [isTyping]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setErrorMessage(null);
    setInputText('');

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsTyping(true);

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      history.push({ role: 'user', content: trimmed });

      const response = await AIChatService.sendMessage(history, accessToken || undefined);

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao se comunicar com a IA.');
    } finally {
      setIsTyping(false);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, accessToken]);

  const handleClear = () => {
    setMessages([]);
    setErrorMessage(null);
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageBubbleRow, isUser ? styles.messageBubbleRowUser : styles.messageBubbleRowAssistant]}>
        {!isUser && (
          <View style={styles.avatarContainer}>
            <MaterialCommunityIcons name="robot-outline" size={18} color={AppTheme.accent} />
          </View>
        )}
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => {
    if (messages.length > 0) return null;
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <MaterialCommunityIcons name="creation" size={56} color={AppTheme.accent} />
        </View>
        <Text style={styles.emptyTitle}>Agro IA</Text>
        <Text style={styles.emptySubtitle}>
          Seu assistente especializado em pragas agrícolas e manejo integrado de pragas (MIP).
        </Text>
        <View style={styles.suggestionsContainer}>
          {suggestions.map((suggestion, index) => (
            <TouchableOpacity
              key={index}
              style={styles.suggestionButton}
              onPress={() => sendMessage(suggestion)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="lightbulb-outline" size={16} color={AppTheme.accent} />
              <Text style={styles.suggestionText} numberOfLines={2}>{suggestion}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderTypingIndicator = () => {
    if (!isTyping) return null;
    return (
      <View style={[styles.messageBubbleRow, styles.messageBubbleRowAssistant]}>
        <View style={styles.avatarContainer}>
          <MaterialCommunityIcons name="robot-outline" size={18} color={AppTheme.accent} />
        </View>
        <View style={[styles.messageBubble, styles.assistantBubble, styles.typingBubble]}>
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View
              key={i}
              style={[
                styles.typingDot,
                {
                  transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }],
                  opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
                },
              ]}
            />
          ))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconBg}>
            <MaterialCommunityIcons name="creation" size={20} color="#FFFFFF" />
          </View>
          <Text style={styles.headerTitle}>Agro IA</Text>
        </View>
        {messages.length > 0 && (
          <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
            <MaterialCommunityIcons name="broom" size={20} color={AppTheme.textSecondary} />
            <Text style={styles.clearButtonText}>Limpar</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Error bar */}
      {errorMessage && (
        <View style={styles.errorBar}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#FFFFFF" />
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity onPress={() => setErrorMessage(null)}>
            <MaterialCommunityIcons name="close" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.chatArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Messages or Empty */}
        {messages.length === 0 ? (
          renderEmptyState()
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={renderTypingIndicator}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Pergunte sobre pragas..."
            placeholderTextColor={AppTheme.textTertiary}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={2000}
            editable={!isTyping}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || isTyping) && styles.sendButtonDisabled]}
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim() || isTyping}
            activeOpacity={0.7}
          >
            {isTyping ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <MaterialCommunityIcons name="send" size={20} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppTheme.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: AppTheme.border,
    backgroundColor: AppTheme.cardBackground,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: AppTheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: AppTheme.text,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: AppTheme.background,
  },
  clearButtonText: {
    fontSize: 13,
    color: AppTheme.textSecondary,
    fontWeight: '500',
  },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: AppTheme.coral,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  chatArea: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 8,
  },
  messageBubbleRow: {
    flexDirection: 'row',
    marginBottom: 12,
    maxWidth: '85%',
  },
  messageBubbleRowUser: {
    alignSelf: 'flex-end',
  },
  messageBubbleRowAssistant: {
    alignSelf: 'flex-start',
  },
  avatarContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: AppTheme.accent + '18',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 4,
  },
  messageBubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
    flexShrink: 1,
  },
  userBubble: {
    backgroundColor: AppTheme.accent,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: AppTheme.cardBackground,
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: '#FFFFFF',
  },
  assistantText: {
    color: AppTheme.text,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AppTheme.accent,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: AppTheme.accent + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: AppTheme.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: AppTheme.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  suggestionsContainer: {
    width: '100%',
    gap: 10,
  },
  suggestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppTheme.cardBackground,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    color: AppTheme.text,
    lineHeight: 20,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 10 : 10,
    backgroundColor: AppTheme.cardBackground,
    borderTopWidth: 1,
    borderTopColor: AppTheme.border,
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: AppTheme.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: AppTheme.text,
    maxHeight: 120,
    minHeight: 40,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppTheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: AppTheme.textTertiary,
  },
});
