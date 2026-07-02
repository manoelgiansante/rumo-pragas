import { renderHook, waitFor, act } from '@testing-library/react-native';

// -----------------------------------------------------------------------------
// FREE BUILD (2026-06-30) — fix/pragas-free-2026-06-30
//
// The app ships 100% FREE (Apple Guideline 2.3.2). AI pest diagnoses are
// UNLIMITED for everyone, so useMonthlyUsage no longer meters usage, reads the
// shared `subscriptions` table, or enforces any monthly cap. It unconditionally
// reports an unlimited plan (`limit: null`, `remaining: null`) regardless of
// the signed-in user or their subscription row.
//
// These tests lock in that contract: no 3-diagnosis free limit, no Pro 30-limit,
// no downgrade-on-cancel, and no Supabase queries.
// -----------------------------------------------------------------------------

const mockUser = { id: 'user-123' };
let mockAuthValue: { user: typeof mockUser | null } = { user: mockUser };

jest.mock('../../contexts/AuthContext', () => ({
  useAuthContext: () => mockAuthValue,
}));

// The hook must NOT touch Supabase in the free build — any access to these
// mocks would signal a regression back to metered usage.
const mockFrom = jest.fn((..._args: unknown[]) => {
  throw new Error('useMonthlyUsage must not query Supabase in the free build');
});

jest.mock('../../services/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import { useMonthlyUsage } from '../../hooks/useMonthlyUsage';

describe('useMonthlyUsage (free build — unlimited for everyone)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthValue = { user: mockUser };
  });

  it('reports an unlimited limit (null) with no metering', async () => {
    const { result } = renderHook(() => useMonthlyUsage());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.limit).toBeNull();
    expect(result.current.remaining).toBeNull();
    expect(result.current.used).toBe(0);
    expect(result.current.error).toBe(false);
  });

  it('stays unlimited even when a user is signed in', async () => {
    mockAuthValue = { user: mockUser };
    const { result } = renderHook(() => useMonthlyUsage());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.limit).toBeNull();
    expect(result.current.remaining).toBeNull();
  });

  it('stays unlimited when the user is signed out', async () => {
    mockAuthValue = { user: null };
    const { result } = renderHook(() => useMonthlyUsage());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.limit).toBeNull();
    expect(result.current.remaining).toBeNull();
    expect(result.current.used).toBe(0);
  });

  it('never queries the shared subscriptions/diagnoses tables', async () => {
    const { result } = renderHook(() => useMonthlyUsage());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('refresh() is a no-op that resolves without querying Supabase', async () => {
    const { result } = renderHook(() => useMonthlyUsage());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockFrom).not.toHaveBeenCalled();
    expect(result.current.limit).toBeNull();
    expect(result.current.remaining).toBeNull();
  });
});
