import { renderHook, waitFor, act } from '@testing-library/react-native';

const mockUser = { id: 'user-123' };
let mockAuthValue: { user: typeof mockUser | null } = { user: mockUser };

jest.mock('../../contexts/AuthContext', () => ({
  useAuthContext: () => mockAuthValue,
}));

const mockSubSelect = jest.fn();
const mockCountSelect = jest.fn();

jest.mock('../../services/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'subscriptions') return mockSubSelect();
      if (table === 'pragas_diagnoses') return mockCountSelect();
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

import { useMonthlyUsage } from '../../hooks/useMonthlyUsage';

function chainSubscription(data: { plan: string; status: string } | null) {
  const maybeSingle = jest.fn().mockResolvedValue({ data, error: null });
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  return { select };
}

function chainCount(count: number, error: Error | null = null) {
  const gte = jest.fn().mockResolvedValue({ count, error });
  const eq = jest.fn().mockReturnValue({ gte });
  const select = jest.fn().mockReturnValue({ eq });
  return { select };
}

describe('useMonthlyUsage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthValue = { user: mockUser };
  });

  it('returns free plan with 3-diagnosis limit and computed remainder', async () => {
    mockSubSelect.mockReturnValue(chainSubscription({ plan: 'free', status: 'active' }));
    mockCountSelect.mockReturnValue(chainCount(1));

    const { result } = renderHook(() => useMonthlyUsage());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plan).toBe('free');
    expect(result.current.limit).toBe(3);
    expect(result.current.used).toBe(1);
    expect(result.current.remaining).toBe(2);
    expect(result.current.error).toBe(false);
  });

  it('treats missing subscription row as free plan', async () => {
    mockSubSelect.mockReturnValue(chainSubscription(null));
    mockCountSelect.mockReturnValue(chainCount(0));

    const { result } = renderHook(() => useMonthlyUsage());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plan).toBe('free');
    expect(result.current.limit).toBe(3);
    expect(result.current.remaining).toBe(3);
  });

  it('honours an active Pro subscription with 30-diagnosis limit', async () => {
    mockSubSelect.mockReturnValue(chainSubscription({ plan: 'pro', status: 'active' }));
    mockCountSelect.mockReturnValue(chainCount(7));

    const { result } = renderHook(() => useMonthlyUsage());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plan).toBe('pro');
    expect(result.current.limit).toBe(30);
    expect(result.current.used).toBe(7);
    expect(result.current.remaining).toBe(23);
  });

  it('downgrades to free plan when Pro subscription is cancelled', async () => {
    mockSubSelect.mockReturnValue(chainSubscription({ plan: 'pro', status: 'canceled' }));
    mockCountSelect.mockReturnValue(chainCount(2));

    const { result } = renderHook(() => useMonthlyUsage());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plan).toBe('free');
    expect(result.current.limit).toBe(3);
  });

  it('returns unlimited (null) limit for enterprise plan', async () => {
    mockSubSelect.mockReturnValue(chainSubscription({ plan: 'enterprise', status: 'active' }));
    mockCountSelect.mockReturnValue(chainCount(42));

    const { result } = renderHook(() => useMonthlyUsage());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plan).toBe('enterprise');
    expect(result.current.limit).toBeNull();
    expect(result.current.remaining).toBeNull();
  });

  it('clamps remaining at zero when used >= limit (free plan exhausted)', async () => {
    mockSubSelect.mockReturnValue(chainSubscription({ plan: 'free', status: 'active' }));
    mockCountSelect.mockReturnValue(chainCount(5));

    const { result } = renderHook(() => useMonthlyUsage());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.used).toBe(5);
    expect(result.current.remaining).toBe(0);
  });

  it('resets to neutral state when user is signed out', async () => {
    mockAuthValue = { user: null };
    const { result } = renderHook(() => useMonthlyUsage());
    // No queries should fire — neutral free state, loading off.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.plan).toBe('free');
    expect(result.current.used).toBe(0);
    expect(mockSubSelect).not.toHaveBeenCalled();
    expect(mockCountSelect).not.toHaveBeenCalled();
  });

  it('refresh() re-queries supabase on demand', async () => {
    mockSubSelect.mockReturnValue(chainSubscription({ plan: 'free', status: 'active' }));
    mockCountSelect.mockReturnValue(chainCount(1));

    const { result } = renderHook(() => useMonthlyUsage());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockSubSelect).toHaveBeenCalledTimes(1);

    // Second call returns higher count to simulate post-diagnosis state.
    mockCountSelect.mockReturnValue(chainCount(2));
    await act(async () => {
      await result.current.refresh();
    });
    expect(mockSubSelect).toHaveBeenCalledTimes(2);
    expect(result.current.used).toBe(2);
    expect(result.current.remaining).toBe(1);
  });
});
