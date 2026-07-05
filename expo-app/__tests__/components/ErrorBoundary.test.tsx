import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import i18n from '../../i18n';

const mockCaptureException = jest.fn();
const mockWithScope = jest.fn();

// ErrorBoundary uses the sentry-shim wrapper (services/sentry-shim) since
// commit 40df561 (iOS 26 TurboModule crash defense). The shim lazy-requires
// the real Sentry module on first call, so we mock the shim API directly.
// Mock factory must avoid out-of-scope identifiers — only `mock*`-prefixed
// vars are allowed by jest's hoist analysis.
jest.mock('../../services/sentry-shim', () => {
  const noop = () => {};
  return {
    captureException: (...args: unknown[]) => mockCaptureException(...args),
    withScope: (
      cb: (s: { setTag: typeof noop; setLevel: typeof noop; setContext: typeof noop }) => void,
    ) => {
      mockWithScope();
      cb({ setTag: noop, setLevel: noop, setContext: noop });
    },
    captureMessage: noop,
    addBreadcrumb: noop,
  };
});

// Keep the @sentry/react-native mock too in case anything else imports it.
jest.mock('@sentry/react-native', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
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

  it('reports error to Sentry via componentDidCatch', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    // ErrorBoundary uses withScope() to attach the React component stack as
    // context, then calls captureException(error) WITHOUT a second context
    // arg. So we assert (a) withScope ran, and (b) captureException was
    // invoked with the thrown Error.
    expect(mockWithScope).toHaveBeenCalled();
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error));
  });

  it('does not call Sentry when no error occurs', () => {
    mockCaptureException.mockClear();
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
