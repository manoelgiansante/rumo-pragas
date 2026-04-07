/**
 * Tests for hooks/useDiagnosisSync.ts
 */
import { renderHook, waitFor } from '@testing-library/react-native';

// Mock useNetworkStatus
const mockNetworkStatus = { isConnected: false, isInternetReachable: true, connectionType: 'wifi' };
jest.mock('../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mockNetworkStatus,
}));

// Mock useAuthContext
const mockSession = { access_token: 'test-token' };
jest.mock('../../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    session: mockSession,
    isAuthenticated: true,
    loading: false,
  }),
}));

// Mock diagnosis service
const mockSendDiagnosis = jest.fn();
jest.mock('../../services/diagnosis', () => ({
  sendDiagnosis: (...args: unknown[]) => mockSendDiagnosis(...args),
}));

// Mock diagnosisQueue
const mockGetQueue = jest.fn().mockResolvedValue([]);
const mockRemoveFromQueue = jest.fn().mockResolvedValue(undefined);
const mockIncrementRetry = jest.fn().mockResolvedValue(undefined);
const mockGetQueueCount = jest.fn().mockResolvedValue(0);

jest.mock('../../services/diagnosisQueue', () => ({
  getQueue: (...args: unknown[]) => mockGetQueue(...args),
  removeFromQueue: (...args: unknown[]) => mockRemoveFromQueue(...args),
  incrementRetry: (...args: unknown[]) => mockIncrementRetry(...args),
  getQueueCount: (...args: unknown[]) => mockGetQueueCount(...args),
}));

import { useDiagnosisSync } from '../../hooks/useDiagnosisSync';

beforeEach(() => {
  jest.clearAllMocks();
  mockNetworkStatus.isConnected = false;
  mockSession.access_token = 'test-token';
  mockGetQueue.mockResolvedValue([]);
  mockGetQueueCount.mockResolvedValue(0);
});

describe('useDiagnosisSync', () => {
  it('returns pendingCount, isSyncing, and refreshCount', () => {
    const { result } = renderHook(() => useDiagnosisSync());
    expect(result.current).toHaveProperty('pendingCount');
    expect(result.current).toHaveProperty('isSyncing');
    expect(result.current).toHaveProperty('refreshCount');
  });

  it('reports initial pendingCount from getQueueCount', async () => {
    mockGetQueueCount.mockResolvedValue(3);
    const { result } = renderHook(() => useDiagnosisSync());

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(3);
    });
  });

  it('syncs queued items when network becomes available', async () => {
    const queueItem = {
      id: 'q1',
      imageBase64: 'base64',
      cropType: 'soy',
      latitude: -23.0,
      longitude: -49.0,
      retryCount: 0,
    };

    mockGetQueue.mockResolvedValue([queueItem]);
    mockGetQueueCount.mockResolvedValue(1);
    mockSendDiagnosis.mockResolvedValue({ id: 'diag-1' });

    // Start offline
    mockNetworkStatus.isConnected = true;

    renderHook(() => useDiagnosisSync());

    await waitFor(() => {
      expect(mockSendDiagnosis).toHaveBeenCalledWith('base64', 'soy', -23.0, -49.0, 'test-token');
    });

    await waitFor(() => {
      expect(mockRemoveFromQueue).toHaveBeenCalledWith('q1');
    });
  });

  it('increments retry count on sync failure', async () => {
    const queueItem = {
      id: 'q2',
      imageBase64: 'base64',
      cropType: 'corn',
      latitude: -22.0,
      longitude: -48.0,
      retryCount: 0,
    };

    mockGetQueue.mockResolvedValue([queueItem]);
    mockGetQueueCount.mockResolvedValue(1);
    mockSendDiagnosis.mockRejectedValue(new Error('Network fail'));

    mockNetworkStatus.isConnected = true;

    renderHook(() => useDiagnosisSync());

    await waitFor(() => {
      expect(mockIncrementRetry).toHaveBeenCalledWith('q2');
    });
  });

  it('removes item from queue after MAX_RETRIES (3) failures', async () => {
    const queueItem = {
      id: 'q3',
      imageBase64: 'base64',
      cropType: 'wheat',
      latitude: -21.0,
      longitude: -47.0,
      retryCount: 2, // Already failed twice, this will be the 3rd failure
    };

    mockGetQueue.mockResolvedValue([queueItem]);
    mockGetQueueCount.mockResolvedValue(1);
    mockSendDiagnosis.mockRejectedValue(new Error('Fail'));

    mockNetworkStatus.isConnected = true;

    renderHook(() => useDiagnosisSync());

    await waitFor(() => {
      expect(mockRemoveFromQueue).toHaveBeenCalledWith('q3');
    });
    expect(mockIncrementRetry).not.toHaveBeenCalled();
  });

  it('does not sync when there is no session', async () => {
    mockNetworkStatus.isConnected = true;
    mockSession.access_token = '' as any;

    mockGetQueue.mockResolvedValue([
      { id: 'q4', imageBase64: 'b', cropType: 'c', latitude: 0, longitude: 0, retryCount: 0 },
    ]);

    renderHook(() => useDiagnosisSync());

    // Give time for potential async operations
    await new Promise((r) => setTimeout(r, 100));
    expect(mockSendDiagnosis).not.toHaveBeenCalled();
  });
});
