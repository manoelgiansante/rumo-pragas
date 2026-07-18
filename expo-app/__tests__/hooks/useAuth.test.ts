import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useAuth } from '../../hooks/useAuth';

// --- Mocks ---
const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockSignOut = jest.fn();
const mockResetPassword = jest.fn();
const mockLinkPragasAccount = jest.fn();
const mockReactivatePragasAccount = jest.fn();
const mockPurgePragasLocalUserData = jest.fn();
const mockClaimPragasLocalDataOwner = jest.fn();
const mockClearPragasLocalDataOwner = jest.fn();
const mockRevokePushDeliveryForSignOut = jest.fn();
const mockReleaseAutoRefresh = jest.fn();
const mockRetainAutoRefresh = jest.fn(() => mockReleaseAutoRefresh);
const mockWaitForPendingAuthMetadata = jest.fn();

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
}));

jest.mock('../../services/pragasAccount', () => ({
  linkPragasAccount: (...args: unknown[]) => mockLinkPragasAccount(...args),
  reactivatePragasAccount: (...args: unknown[]) => mockReactivatePragasAccount(...args),
}));

jest.mock('../../services/localDataPurge', () => ({
  purgePragasLocalUserData: (...args: unknown[]) => mockPurgePragasLocalUserData(...args),
  claimPragasLocalDataOwner: (...args: unknown[]) => mockClaimPragasLocalDataOwner(...args),
  clearPragasLocalDataOwner: (...args: unknown[]) => mockClearPragasLocalDataOwner(...args),
}));

jest.mock('../../services/authMetadataGate', () => ({
  waitForPendingAuthMetadata: (...args: unknown[]) => mockWaitForPendingAuthMetadata(...args),
}));

jest.mock('../../services/notifications', () => ({
  revokePushDeliveryForSignOut: (...args: unknown[]) => mockRevokePushDeliveryForSignOut(...args),
}));

jest.mock('../../services/userPreferences', () => ({
  flushPendingLocationConsent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/supabase', () => ({
  retainSupabaseAuthAutoRefresh: () => mockRetainAutoRefresh(),
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
  },
}));

jest.mock('../../services/analytics', () => ({ trackEvent: jest.fn() }));

jest.mock('../../services/auth', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signUp: (...args: unknown[]) => mockSignUp(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
  resetPassword: (...args: unknown[]) => mockResetPassword(...args),
}));

const mockSession = {
  user: { id: 'user-123', email: 'test@example.com' },
  access_token: 'token-abc',
};

const mockSubscription = { unsubscribe: jest.fn() };

function setupDefaultMocks(session: typeof mockSession | null = null) {
  mockGetSession.mockResolvedValue({ data: { session } });
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: mockSubscription },
  });
  mockLinkPragasAccount.mockResolvedValue({ linked: true });
  mockPurgePragasLocalUserData.mockResolvedValue(undefined);
  mockClaimPragasLocalDataOwner.mockResolvedValue(undefined);
  mockClearPragasLocalDataOwner.mockResolvedValue(undefined);
  mockWaitForPendingAuthMetadata.mockResolvedValue(undefined);
  mockRevokePushDeliveryForSignOut.mockResolvedValue(undefined);
}

describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks(null);
  });

  it('starts with loading true and not authenticated', async () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('sets authenticated state when session exists', async () => {
    setupDefaultMocks(mockSession);
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockSession.user);
  });

  it('signIn calls auth service with correct credentials', async () => {
    setupDefaultMocks(null);
    mockSignIn.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.signIn('test@example.com', 'password123');
    });

    expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
  });

  it('signIn sets error state on failure', async () => {
    setupDefaultMocks(null);
    mockSignIn.mockRejectedValueOnce(new Error('Invalid credentials'));
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      try {
        await result.current.signIn('bad@email.com', 'wrong');
      } catch {
        // Expected
      }
    });

    expect(result.current.error).toBe('Erro ao entrar. Tente novamente.');
    expect(result.current.error).not.toContain('Invalid credentials');
  });

  it('signOut calls auth service', async () => {
    setupDefaultMocks(mockSession);
    mockSignOut.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockSignOut).toHaveBeenCalled();
  });

  it('clearError resets the error state', async () => {
    setupDefaultMocks(null);
    mockSignIn.mockRejectedValueOnce(new Error('Fail'));
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      try {
        await result.current.signIn('x', 'y');
      } catch {
        // Expected
      }
    });

    expect(result.current.error).toBe('Erro ao entrar. Tente novamente.');

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('unsubscribes from auth listener on unmount', async () => {
    const { unmount } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(mockOnAuthStateChange).toHaveBeenCalled();
    });

    unmount();
    expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    expect(mockReleaseAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it('updates state when auth state changes', async () => {
    setupDefaultMocks(null);

    let authChangeCallback: (event: string, session: unknown) => void;
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      authChangeCallback = cb;
      return { data: { subscription: mockSubscription } };
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);

    await act(async () => {
      authChangeCallback!('SIGNED_IN', mockSession);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current.user).toEqual(mockSession.user);
    expect(mockClaimPragasLocalDataOwner).toHaveBeenCalledWith(mockSession.user.id, {
      claimOwnerlessLegacy: false,
    });
  });

  it('never adopts ownerless upgrade data when interactive auth wins the cold lookup race', async () => {
    setupDefaultMocks(null);
    let resolveSession!: (value: { data: { session: typeof mockSession } }) => void;
    mockGetSession.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    let authChangeCallback: (event: string, session: unknown) => void;
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      authChangeCallback = cb;
      return { data: { subscription: mockSubscription } };
    });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      authChangeCallback!('SIGNED_IN', mockSession);
      resolveSession({ data: { session: mockSession } });
    });

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(mockClaimPragasLocalDataOwner).toHaveBeenCalled();
    for (const call of mockClaimPragasLocalDataOwner.mock.calls) {
      expect(call[1]).toEqual({ claimOwnerlessLegacy: false });
    }
  });

  it('signUp calls auth service with correct params', async () => {
    setupDefaultMocks(null);
    mockSignUp.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.signUp('new@example.com', 'pass123', 'John Doe');
    });

    expect(mockSignUp).toHaveBeenCalledWith('new@example.com', 'pass123', 'John Doe');
  });

  it('signUp sets error state on failure', async () => {
    setupDefaultMocks(null);
    mockSignUp.mockRejectedValueOnce(new Error('User already exists'));
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      try {
        await result.current.signUp('existing@email.com', 'pass', 'Name');
      } catch {
        // Expected
      }
    });

    expect(result.current.error).toBe('Erro ao criar conta');
    expect(result.current.error).not.toContain('User already exists');
  });

  it('resetPassword calls auth service', async () => {
    setupDefaultMocks(null);
    mockResetPassword.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.resetPassword('user@example.com');
    });

    expect(mockResetPassword).toHaveBeenCalledWith('user@example.com');
  });

  it('resetPassword sets error state on failure', async () => {
    setupDefaultMocks(null);
    mockResetPassword.mockRejectedValueOnce(new Error('Rate limit'));
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      try {
        await result.current.resetPassword('user@example.com');
      } catch {
        // Expected
      }
    });

    expect(result.current.error).toBe('Erro ao enviar email');
    expect(result.current.error).not.toContain('Rate limit');
  });

  it('signOut sets error state on failure but does not throw', async () => {
    setupDefaultMocks(mockSession);
    mockSignOut.mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.error).toBe('Erro ao sair');
    expect(result.current.error).not.toContain('Network error');
  });

  it('waits for provider metadata before claiming owner or linking the app account', async () => {
    setupDefaultMocks(mockSession);
    let releaseMetadata!: () => void;
    mockWaitForPendingAuthMetadata.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        releaseMetadata = resolve;
      }),
    );
    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(mockWaitForPendingAuthMetadata).toHaveBeenCalled());
    expect(mockClaimPragasLocalDataOwner).not.toHaveBeenCalled();
    expect(mockLinkPragasAccount).not.toHaveBeenCalled();

    await act(async () => releaseMetadata());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(mockClaimPragasLocalDataOwner).toHaveBeenCalledWith(mockSession.user.id, {
      claimOwnerlessLegacy: true,
    });
    expect(mockClaimPragasLocalDataOwner.mock.invocationCallOrder[0]).toBeLessThan(
      mockLinkPragasAccount.mock.invocationCallOrder[0]!,
    );
  });

  it('blocks account linking when persisted-owner cleanup fails', async () => {
    setupDefaultMocks(mockSession);
    mockClaimPragasLocalDataOwner.mockRejectedValueOnce(new Error('locked photo'));
    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.appAccountError).toBe('local_data_purge_failed'));
    expect(result.current.isAuthenticated).toBe(false);
    expect(mockLinkPragasAccount).not.toHaveBeenCalled();
  });

  it('does not purge same-account offline data merely because auth emits a null session', async () => {
    setupDefaultMocks(mockSession);
    let authChangeCallback: (event: string, session: unknown) => void;
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      authChangeCallback = cb;
      return { data: { subscription: mockSubscription } };
    });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    act(() => authChangeCallback!('SIGNED_OUT', null));

    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(mockPurgePragasLocalUserData).not.toHaveBeenCalled();
    expect(mockClearPragasLocalDataOwner).not.toHaveBeenCalled();
  });

  it('purges and clears the persisted owner only during successful explicit sign-out', async () => {
    setupDefaultMocks(mockSession);
    mockSignOut.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockPurgePragasLocalUserData).toHaveBeenCalledWith(mockSession.user.id);
    expect(mockClearPragasLocalDataOwner).toHaveBeenCalledWith(mockSession.user.id);
    expect(mockSignOut.mock.invocationCallOrder[0]).toBeLessThan(
      mockClearPragasLocalDataOwner.mock.invocationCallOrder[0]!,
    );
  });

  it('still signs out Auth when local purge fails and preserves the owner marker for B', async () => {
    setupDefaultMocks(mockSession);
    mockPurgePragasLocalUserData.mockRejectedValueOnce(new Error('photo busy'));
    mockSignOut.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.signOut();
    });

    expect(succeeded).toBe(false);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockClearPragasLocalDataOwner).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.appAccountError).toBe('local_data_purge_failed');
  });

  it('cannot re-authenticate when an in-flight app link resolves after sign-out', async () => {
    setupDefaultMocks(mockSession);
    let releaseLink!: () => void;
    mockLinkPragasAccount.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseLink = () => resolve({ linked: true });
      }),
    );
    mockSignOut.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(mockLinkPragasAccount).toHaveBeenCalled());

    await act(async () => {
      await result.current.signOut();
    });
    await act(async () => releaseLink());

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.session).toBeNull();
  });

  it('does not start the link RPC when owner claim completes after sign-out invalidation', async () => {
    setupDefaultMocks(mockSession);
    let releaseClaim!: () => void;
    mockClaimPragasLocalDataOwner.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        releaseClaim = resolve;
      }),
    );
    mockSignOut.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(mockClaimPragasLocalDataOwner).toHaveBeenCalled());

    await act(async () => {
      await result.current.signOut();
    });
    await act(async () => releaseClaim());

    expect(mockLinkPragasAccount).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.session).toBeNull();
  });
});
