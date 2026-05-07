/**
 * Tests for hooks/useNetworkStatus.ts
 */
import { renderHook, act } from '@testing-library/react-native';

const mockAddEventListener = jest.fn();
const mockUnsubscribe = jest.fn();

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: (...args: unknown[]) => {
      mockAddEventListener(...args);
      return mockUnsubscribe;
    },
  },
  addEventListener: (...args: unknown[]) => {
    mockAddEventListener(...args);
    return mockUnsubscribe;
  },
}));

import { useNetworkStatus } from '../../hooks/useNetworkStatus';

beforeEach(() => {
  jest.clearAllMocks();
});

function emit(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  type: string;
}) {
  // useEffect runs synchronously in jest renderHook, so the addEventListener
  // is registered immediately on mount.
  expect(mockAddEventListener).toHaveBeenCalled();
  const cb = mockAddEventListener.mock.calls[0][0];
  act(() => {
    cb(state);
  });
}

describe('useNetworkStatus', () => {
  it('defaults to online before NetInfo emits', () => {
    const { result } = renderHook(() => useNetworkStatus());
    // Initial state assumes online so UI is not blocked.
    expect(result.current.isConnected).toBe(true);
    expect(result.current.isInternetReachable).toBe(true);
  });

  it('returns isConnected from NetInfo once it emits', () => {
    const { result } = renderHook(() => useNetworkStatus());
    emit({ isConnected: true, isInternetReachable: true, type: 'wifi' });
    expect(result.current.isConnected).toBe(true);
  });

  it('returns isInternetReachable from NetInfo once it emits', () => {
    const { result } = renderHook(() => useNetworkStatus());
    emit({ isConnected: true, isInternetReachable: true, type: 'wifi' });
    expect(result.current.isInternetReachable).toBe(true);
  });

  it('returns connectionType from NetInfo once it emits', () => {
    const { result } = renderHook(() => useNetworkStatus());
    emit({ isConnected: true, isInternetReachable: true, type: 'wifi' });
    expect(result.current.connectionType).toBe('wifi');
  });

  it('reflects disconnected state after emission', () => {
    const { result } = renderHook(() => useNetworkStatus());
    emit({ isConnected: false, isInternetReachable: false, type: 'none' });
    expect(result.current.isConnected).toBe(false);
    expect(result.current.isInternetReachable).toBe(false);
    expect(result.current.connectionType).toBe('none');
  });

  it('handles null values from NetInfo', () => {
    const { result } = renderHook(() => useNetworkStatus());
    emit({ isConnected: null, isInternetReachable: null, type: 'unknown' });
    expect(result.current.isConnected).toBeNull();
    expect(result.current.isInternetReachable).toBeNull();
  });

  it('reports cellular connection type', () => {
    const { result } = renderHook(() => useNetworkStatus());
    emit({ isConnected: true, isInternetReachable: true, type: 'cellular' });
    expect(result.current.connectionType).toBe('cellular');
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useNetworkStatus());
    expect(mockAddEventListener).toHaveBeenCalled();
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
