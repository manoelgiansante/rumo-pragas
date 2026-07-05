import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}: ${JSON.stringify(opts)}`;
      return key;
    },
  }),
}));
jest.mock('../../constants/theme', () => ({
  FontFamily: {
    regular: 'Poppins_400Regular',
    medium: 'Poppins_500Medium',
    semibold: 'Poppins_600SemiBold',
    bold: 'Poppins_700Bold',
    italic: 'Poppins_400Regular_Italic',
  },
  Colors: {
    accent: '#1A966B',
    coral: '#F06652',
    warmAmber: '#EBB026',
    text: '#000',
    textDark: '#fff',
    textSecondary: '#8E8E93',
    card: '#fff',
    cardDark: '#333',
    background: '#F2F2F7',
    systemGray: '#8E8E93',
    systemGray3: '#C7C7CC',
    systemGray5: '#E5E5EA',
    systemGray6: '#F2F2F7',
    white: '#FFFFFF',
    teal: '#5AC8FA',
    divider: '#E5E5EA',
    dividerDark: '#3A3A3C',
  },
  Gradients: { primary: ['#1A966B', '#14785A'] },
  FontSize: {
    caption: 12,
    footnote: 13,
    subheadline: 15,
    body: 17,
    title3: 20,
    title2: 22,
    largeTitle: 34,
  },
  FontWeight: { regular: '400', medium: '500', semibold: '600', bold: '700' },
  Spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 },
  BorderRadius: { sm: 8, md: 12, lg: 16, full: 9999 },
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

import { ChatBubble, TypingIndicator } from '../../components/ChatBubble';
import type { ChatMessageData } from '../../components/ChatBubble';

function makeMessage(overrides: Partial<ChatMessageData> = {}): ChatMessageData {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'Hello, how are you?',
    timestamp: new Date('2026-04-09T14:30:00Z'),
    ...overrides,
  };
}

describe('ChatBubble', () => {
  it('renders user message content', () => {
    const { getByText } = render(<ChatBubble message={makeMessage()} />);
    expect(getByText('Hello, how are you?')).toBeTruthy();
  });

  it('renders assistant message content', () => {
    const msg = makeMessage({ role: 'assistant', content: 'I am an AI assistant.' });
    const { getByText } = render(<ChatBubble message={msg} />);
    expect(getByText('I am an AI assistant.')).toBeTruthy();
  });

  it('displays formatted time', () => {
    const { toJSON } = render(<ChatBubble message={makeMessage()} />);
    const tree = JSON.stringify(toJSON());
    // Time should be formatted as HH:MM
    expect(tree).toMatch(/\d{2}:\d{2}/);
  });
});

describe('TypingIndicator', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<TypingIndicator />);
    expect(toJSON()).toBeTruthy();
  });
});
