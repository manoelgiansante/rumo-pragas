import React from 'react';
import { render } from '@testing-library/react-native';
import { OfflineBanner } from '../../components/OfflineBanner';
import i18n from '../../i18n';

const mockNetworkStatus = {
  isConnected: true,
  isInternetReachable: true,
  connectionType: 'wifi',
};

jest.mock('../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mockNetworkStatus,
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (init: number) => ({ value: init }),
    useAnimatedStyle: (fn: () => object) => fn(),
    withTiming: (val: number) => val,
    runOnJS: (fn: (...args: unknown[]) => void) => fn,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('../../constants/theme', () => ({
  Colors: { warmAmber: '#FFD700', black: '#000000' },
  Spacing: { sm: 4 },
  FontSize: { footnote: 13 },
  FontWeight: { semibold: '600' },
}));

const offlineText = i18n.t('common.offline');

describe('OfflineBanner', () => {
  beforeEach(() => {
    mockNetworkStatus.isConnected = true;
    mockNetworkStatus.isInternetReachable = true;
  });

  it('does not render when connected', () => {
    const { queryByText } = render(<OfflineBanner />);
    expect(queryByText(offlineText)).toBeNull();
  });

  it('renders banner text when disconnected', () => {
    mockNetworkStatus.isConnected = false;
    mockNetworkStatus.isInternetReachable = false;

    const { getByText } = render(<OfflineBanner />);
    expect(getByText(offlineText)).toBeTruthy();
  });

  it('renders when internet is not reachable but isConnected is true', () => {
    mockNetworkStatus.isConnected = true;
    mockNetworkStatus.isInternetReachable = false;

    const { getByText } = render(<OfflineBanner />);
    expect(getByText(offlineText)).toBeTruthy();
  });
});
