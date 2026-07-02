/**
 * Tests for services/auth.ts
 */

// --- Mocks ---
const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();
const mockSignOut = jest.fn();
const mockResetPasswordForEmail = jest.fn();
const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();

jest.mock('../../services/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
      refreshSession: (...args: unknown[]) => mockRefreshSession(...args),
    },
  },
}));

jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
}));

// expo-linking's createURL needs the native constants manifest, which is
// unavailable under Jest. Mock it so resetPassword can resolve its lazy
// PASSWORD_RECOVERY_REDIRECT deep link without a native runtime.
jest.mock('expo-linking', () => ({
  createURL: jest.fn((path: string) => `rumopragas://${path.replace(/^\//, '')}`),
}));

import {
  signIn,
  signUp,
  signOut,
  resetPassword,
  getSession,
  refreshSession,
} from '../../services/auth';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('signIn', () => {
  it('calls supabase.auth.signInWithPassword with email and password', async () => {
    const mockData = { user: { id: 'u1' }, session: { access_token: 'tok' } };
    mockSignInWithPassword.mockResolvedValueOnce({ data: mockData, error: null });

    const result = await signIn('test@example.com', 'password123');

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result).toEqual(mockData);
  });

  it('throws when supabase returns an error', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: null,
      error: new Error('Invalid login credentials'),
    });

    await expect(signIn('bad@email.com', 'wrong')).rejects.toThrow('Invalid login credentials');
  });
});

describe('signUp', () => {
  it('calls supabase.auth.signUp with email, password, and fullName in data', async () => {
    const mockData = { user: { id: 'u2' }, session: null };
    mockSignUp.mockResolvedValueOnce({ data: mockData, error: null });

    const result = await signUp('new@example.com', 'pass123', 'John Doe');

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'pass123',
      options: { data: { full_name: 'John Doe' } },
    });
    expect(result).toEqual(mockData);
  });

  // QW-3 (W16-1, 2026-05-22): fullName is optional on signup.
  it('omits options.data.full_name when fullName is undefined', async () => {
    const mockData = { user: { id: 'u3' }, session: null };
    mockSignUp.mockResolvedValueOnce({ data: mockData, error: null });

    const result = await signUp('anon@example.com', 'pass123');

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'anon@example.com',
      password: 'pass123',
    });
    expect(result).toEqual(mockData);
  });

  it('omits options.data.full_name when fullName is empty/whitespace', async () => {
    const mockData = { user: { id: 'u4' }, session: null };
    mockSignUp.mockResolvedValueOnce({ data: mockData, error: null });

    await signUp('anon2@example.com', 'pass123', '   ');

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'anon2@example.com',
      password: 'pass123',
    });
  });

  it('trims fullName before sending to supabase', async () => {
    const mockData = { user: { id: 'u5' }, session: null };
    mockSignUp.mockResolvedValueOnce({ data: mockData, error: null });

    await signUp('p@example.com', 'pass123', '  Padded Name  ');

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'p@example.com',
      password: 'pass123',
      options: { data: { full_name: 'Padded Name' } },
    });
  });

  it('throws on signup error', async () => {
    mockSignUp.mockResolvedValueOnce({
      data: null,
      error: new Error('User already registered'),
    });

    await expect(signUp('existing@email.com', 'pass', 'Name')).rejects.toThrow(
      'User already registered',
    );
  });
});

describe('signOut', () => {
  it('calls supabase.auth.signOut', async () => {
    mockSignOut.mockResolvedValueOnce({ error: null });

    await signOut();

    expect(mockSignOut).toHaveBeenCalled();
  });

  it('throws on signout error', async () => {
    mockSignOut.mockResolvedValueOnce({ error: new Error('Session not found') });

    await expect(signOut()).rejects.toThrow('Session not found');
  });
});

describe('resetPassword', () => {
  it('calls supabase.auth.resetPasswordForEmail', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });

    await resetPassword('user@example.com');

    // Now sends the email with the recovery deep link as redirectTo.
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
      redirectTo: expect.stringContaining('update-password'),
    });
  });

  it('throws on error', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({
      error: new Error('Rate limit exceeded'),
    });

    await expect(resetPassword('user@example.com')).rejects.toThrow('Rate limit exceeded');
  });
});

describe('getSession', () => {
  it('returns current session', async () => {
    const session = { access_token: 'tok', user: { id: 'u1' } };
    mockGetSession.mockResolvedValueOnce({ data: { session }, error: null });

    const result = await getSession();

    expect(result).toEqual(session);
  });

  it('returns null when no active session', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    const result = await getSession();

    expect(result).toBeNull();
  });

  it('throws on error', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: null },
      error: new Error('Auth error'),
    });

    await expect(getSession()).rejects.toThrow('Auth error');
  });
});

describe('refreshSession', () => {
  it('returns refreshed session', async () => {
    const session = { access_token: 'new-tok', user: { id: 'u1' } };
    mockRefreshSession.mockResolvedValueOnce({ data: { session }, error: null });

    const result = await refreshSession();

    expect(result).toEqual(session);
  });

  it('throws on error', async () => {
    mockRefreshSession.mockResolvedValueOnce({
      data: { session: null },
      error: new Error('Refresh token expired'),
    });

    await expect(refreshSession()).rejects.toThrow('Refresh token expired');
  });
});
