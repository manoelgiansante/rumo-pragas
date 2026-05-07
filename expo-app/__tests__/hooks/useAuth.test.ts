import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useAuth } from '../../hooks/useAuth';

// --- Mocks ---
const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockSignOut = jest.fn();
const mockResetPassword = jest.fn();

jest.mock('../../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
  },
}));

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

  it('signIn sets friendly translated error on Supabase invalid_credentials', async () => {
    // iPad iOS 26 reviewer fix (2026-05-06): raw English Supabase errors are
    // mapped to friendly localized strings via services/authErrors.ts.
    setupDefaultMocks(null);
    mockSignIn.mockRejectedValueOnce(new Error('Invalid login credentials'));
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

    expect(result.current.error).toBe(
      'Email ou senha incorretos. Tente novamente ou recupere sua senha.',
    );
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
    // Use a message that won't match any friendly mapper branch, so it falls
    // back to the generic auth.loginError translation.
    mockSignIn.mockRejectedValueOnce(new Error('Some unexpected failure'));
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

    act(() => {
      authChangeCallback!('SIGNED_IN', mockSession);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockSession.user);
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

  it('signUp sets friendly translated error on failure', async () => {
    // Unknown English message → falls back to translated auth.signUpError.
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

  it('resetPassword maps rate-limit error to friendly localized message', async () => {
    setupDefaultMocks(null);
    mockResetPassword.mockRejectedValueOnce(new Error('Rate limit exceeded'));
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

    expect(result.current.error).toBe('Muitas tentativas. Aguarde um instante e tente novamente.');
  });

  it('signOut sets error state on failure but does not throw', async () => {
    // signOut intentionally keeps raw err.message (only sign-out, no UX impact
    // for the iPad reviewer flow — the user is already signed in here).
    setupDefaultMocks(mockSession);
    mockSignOut.mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.error).toBe('Network error');
  });
});
