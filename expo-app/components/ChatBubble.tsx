import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors, Gradients, FontSize, FontFamily } from '../constants/theme';

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatBubbleProps {
  message: ChatMessageData;
  onReport?: (message: ChatMessageData) => void;
}

function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export const ChatBubble = React.memo(function ChatBubble({ message, onReport }: ChatBubbleProps) {
  const isDark = useColorScheme() === 'dark';
  const { t } = useTranslation();
  const isUser = message.role === 'user';

  return (
    <View
      style={[styles.row, isUser && styles.rowUser]}
      accessible={isUser}
      accessibilityLabel={`${isUser ? t('chat.youLabel') : t('chat.aiAssistantLabel')}: ${message.content}`}
      accessibilityRole="text"
    >
      {!isUser && (
        <LinearGradient
          colors={Gradients.tech as [string, string]}
          style={styles.avatar}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          accessibilityElementsHidden
        >
          <Ionicons name="sparkles" size={14} color={Colors.white} />
        </LinearGradient>
      )}

      <View style={[styles.bubbleWrapper, isUser ? styles.wrapperUser : styles.wrapperAI]}>
        {isUser ? (
          <LinearGradient
            colors={Gradients.hero as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.bubble, styles.bubbleUser]}
          >
            <Text selectable style={styles.userText}>
              {message.content}
            </Text>
          </LinearGradient>
        ) : (
          <View
            style={[
              styles.bubble,
              styles.bubbleAI,
              { backgroundColor: isDark ? '#2C2C2E' : Colors.systemGray6 },
            ]}
          >
            <Text selectable style={[styles.aiText, isDark && { color: Colors.textDark }]}>
              {message.content}
            </Text>
          </View>
        )}

        <View style={styles.metaRow}>
          <Text style={styles.timestamp}>{formatTime(message.timestamp)}</Text>
          {!isUser && onReport ? (
            <TouchableOpacity
              testID={`ai-message-report-${message.id}`}
              style={styles.reportButton}
              onPress={() => onReport(message)}
              accessibilityRole="button"
              accessibilityLabel={t('aiReport.action')}
              accessibilityHint={t('aiReport.actionHint')}
            >
              <Ionicons name="flag-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.reportText}>{t('aiReport.action')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
});

export function TypingIndicator() {
  const { t } = useTranslation();
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={t('chat.typingA11y')}
      accessibilityRole="text"
    >
      <LinearGradient
        colors={Gradients.tech as [string, string]}
        style={styles.avatar}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        accessibilityElementsHidden
      >
        <Ionicons name="sparkles" size={14} color={Colors.white} />
      </LinearGradient>

      <View
        style={[styles.bubble, styles.bubbleAI, styles.typingBubble]}
        accessibilityElementsHidden
      >
        <View style={styles.dotsRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, { opacity: 0.4 + i * 0.2 }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 2,
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  bubbleWrapper: {
    maxWidth: '75%',
    gap: 4,
  },
  wrapperUser: {
    alignItems: 'flex-end',
  },
  wrapperAI: {
    alignItems: 'flex-start',
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    borderTopLeftRadius: 4,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    backgroundColor: Colors.systemGray6,
  },
  userText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    color: Colors.white,
    lineHeight: 20,
  },
  aiText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.subheadline,
    color: Colors.text,
    lineHeight: 20,
  },
  timestamp: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption2,
    color: Colors.textTertiary,
    paddingHorizontal: 4,
  },
  metaRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  reportButton: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  reportText: {
    color: Colors.textSecondary,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.caption2,
  },
  typingBubble: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.accent,
  },
});
