import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import i18n from '../../i18n';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('../../constants/theme', () => ({
  Colors: {
    accent: '#1A966B',
    white: '#FFFFFF',
    background: '#F2F2F7',
    text: '#000000',
    textSecondary: '#8E8E93',
    coral: '#F06652',
    systemGray6: '#F2F2F7',
  },
  Spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 },
  BorderRadius: { sm: 8, md: 12, lg: 16, full: 9999 },
  FontSize: { caption: 12, subheadline: 15, body: 17, title2: 22 },
  FontWeight: { regular: '400', semibold: '600', bold: '700' },
}));

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Test error message');
  return <Text>Child content</Text>;
}

const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});
afterAll(() => {
  console.error = originalConsoleError;
});

const errorTitle = i18n.t('errorBoundary.title');
const retryText = i18n.t('errorBoundary.retry');

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(getByText('Child content')).toBeTruthy();
  });

  it('shows error UI when child throws', () => {
    const { getByText, queryByText } = render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(getByText(errorTitle)).toBeTruthy();
    expect(getByText(retryText)).toBeTruthy();
    expect(queryByText('Child content')).toBeNull();
  });

  it('resets error state when retry is pressed', () => {
    let shouldThrow = true;
    function ToggleChild() {
      if (shouldThrow) throw new Error('Recoverable error');
      return <Text>Recovered content</Text>;
    }

    const { getByText } = render(
      <ErrorBoundary>
        <ToggleChild />
      </ErrorBoundary>,
    );

    expect(getByText(errorTitle)).toBeTruthy();
    shouldThrow = false;
    fireEvent.press(getByText(retryText));
    expect(getByText('Recovered content')).toBeTruthy();
  });

  it('renders custom fallback when provided', () => {
    const fallback = <Text>Custom fallback</Text>;
    const { getByText, queryByText } = render(
      <ErrorBoundary fallback={fallback}>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(getByText('Custom fallback')).toBeTruthy();
    expect(queryByText(errorTitle)).toBeNull();
  });
});
