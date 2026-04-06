import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Gradients, FontSize, Spacing, BorderRadius } from '../constants/theme';

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatBubbleProps {
  message: ChatMessageData;
}

function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export const ChatBubble = React.memo(function ChatBubble({ message }: ChatBubbleProps) {
  const isDark = useColorScheme() === 'dark';
  const isUser = message.role === 'user';

  return (
    <View
      style={[styles.row, isUser && styles.rowUser]}
      accessible
      accessibilityLabel={`${isUser ? 'Voce' : 'Assistente IA'}: ${message.content}`}
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
              { backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7' },
            ]}
          >
            <Text selectable style={[styles.aiText, isDark && { color: Colors.textDark }]}>
              {message.content}
            </Text>
          </View>
        )}

        <Text style={styles.timestamp}>{formatTime(message.timestamp)}</Text>
      </View>
    </View>
  );
});

export function TypingIndicator() {
  return (
    <View style={styles.row} accessible accessibilityLabel="Assistente IA esta digitando" accessibilityRole="text">
      <LinearGradient
        colors={Gradients.tech as [string, string]}
        style={styles.avatar}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        accessibilityElementsHidden
      >
        <Ionicons name="sparkles" size={14} color={Colors.white} />
      </LinearGradient>

      <View style={[styles.bubble, styles.bubbleAI, styles.typingBubble]} accessibilityElementsHidden>
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
    backgroundColor: '#F2F2F7',
  },
  userText: {
    fontSize: FontSize.subheadline,
    color: Colors.white,
    lineHeight: 20,
  },
  aiText: {
    fontSize: FontSize.subheadline,
    color: Colors.text,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: FontSize.caption2,
    color: Colors.textTertiary,
    paddingHorizontal: 4,
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
