/**
 * Tests for hooks/useNetworkStatus.ts
 */
import { renderHook } from '@testing-library/react-native';

const mockUseNetInfo = jest.fn();
jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: () => mockUseNetInfo(),
}));

import { useNetworkStatus } from '../../hooks/useNetworkStatus';

beforeEach(() => {
  mockUseNetInfo.mockReturnValue({
    isConnected: true,
    isInternetReachable: true,
    type: 'wifi',
  });
});

describe('useNetworkStatus', () => {
  it('returns isConnected from NetInfo', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isConnected).toBe(true);
  });

  it('returns isInternetReachable from NetInfo', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isInternetReachable).toBe(true);
  });

  it('returns connectionType from NetInfo', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.connectionType).toBe('wifi');
  });

  it('reflects disconnected state', () => {
    mockUseNetInfo.mockReturnValue({
      isConnected: false,
      isInternetReachable: false,
      type: 'none',
    });

    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isConnected).toBe(false);
    expect(result.current.isInternetReachable).toBe(false);
    expect(result.current.connectionType).toBe('none');
  });

  it('handles null values from NetInfo', () => {
    mockUseNetInfo.mockReturnValue({
      isConnected: null,
      isInternetReachable: null,
      type: 'unknown',
    });

    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isConnected).toBeNull();
    expect(result.current.isInternetReachable).toBeNull();
  });

  it('reports cellular connection type', () => {
    mockUseNetInfo.mockReturnValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'cellular',
    });

    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.connectionType).toBe('cellular');
  });
});
