/**
 * Tests for services/googleAuth.ts
 *
 * Covers the GoogleSignInOutcome contract and the configured / not-configured
 * branches. The browser flow itself is exercised through Google.useIdTokenAuthRequest
 * which we stub end-to-end — what matters is that the hook hands a Google
 * id_token to Supabase with the matching raw nonce.
 */

// --- Mocks --------------------------------------------------------------

const mockPromptAsync = jest.fn();
const mockUseIdTokenAuthRequest = jest.fn();

jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: (config: unknown) => mockUseIdTokenAuthRequest(config),
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: (opts: unknown) => `mock-redirect://${JSON.stringify(opts)}`,
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn().mockResolvedValue('hashed-nonce'),
  getRandomBytes: jest.fn(() => new Uint8Array(32).fill(7)),
}));

// Loosen the generic so .mockResolvedValueOnce accepts the inline Supabase shapes
// without us having to import @supabase/supabase-js types.
const mockSignInWithIdToken: jest.Mock<Promise<unknown>, unknown[]> = jest.fn();
const mockProfileEq = jest.fn().mockResolvedValue({ error: null });
const mockProfileUpdate = jest.fn(() => ({ eq: mockProfileEq }));
const mockFrom = jest.fn(() => ({ update: mockProfileUpdate }));

jest.mock('../../services/supabase', () => ({
  supabase: {
    auth: {
      signInWithIdToken: (arg: unknown) => mockSignInWithIdToken(arg),
    },
    from: (..._args: unknown[]) => mockFrom(),
  },
}));

// Default: client ID is wired.
jest.mock('../../constants/config', () => ({
  Config: { GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com' },
}));

// Helper to render the hook synchronously via React testing utilities.
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useGoogleSignIn } from '../../services/googleAuth';

// Default response: a request object and a stubbed promptAsync.
function armRequest(extra?: Record<string, unknown>) {
  mockUseIdTokenAuthRequest.mockReturnValue([{ type: 'request', ...extra }, null, mockPromptAsync]);
}

beforeEach(() => {
  jest.clearAllMocks();
  armRequest();
});

describe('useGoogleSignIn — configured branch', () => {
  it('reports ready=true once the nonce is hashed and the request is armed', async () => {
    const { result } = renderHook(() => useGoogleSignIn());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.configured).toBe(true);
  });

  it('returns success and calls Supabase.signInWithIdToken with provider=google + raw nonce', async () => {
    mockPromptAsync.mockResolvedValueOnce({
      type: 'success',
      params: { id_token: 'fake.google.id.token' },
    });
    mockSignInWithIdToken.mockResolvedValueOnce({
      data: {
        user: {
          id: 'user-123',
          email: 'demo@example.com',
          user_metadata: { full_name: 'Demo User' },
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useGoogleSignIn());
    await waitFor(() => expect(result.current.ready).toBe(true));

    let outcome: Awaited<ReturnType<typeof result.current.signIn>> | undefined;
    await act(async () => {
      outcome = await result.current.signIn();
    });

    expect(outcome).toEqual({
      kind: 'success',
      userId: 'user-123',
      email: 'demo@example.com',
    });
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'fake.google.id.token',
      // raw nonce is hex from getRandomBytes mock (32x 0x07 = '07' * 32)
      nonce: '0707070707070707070707070707070707070707070707070707070707070707',
    });
    // Profile backfill is best-effort but should have fired with the
    // user_metadata.full_name value.
    expect(mockProfileUpdate).toHaveBeenCalledWith({ full_name: 'Demo User' });
  });

  it('returns cancelled when the user dismisses the browser', async () => {
    mockPromptAsync.mockResolvedValueOnce({ type: 'cancel' });
    const { result } = renderHook(() => useGoogleSignIn());
    await waitFor(() => expect(result.current.ready).toBe(true));

    let outcome: Awaited<ReturnType<typeof result.current.signIn>> | undefined;
    await act(async () => {
      outcome = await result.current.signIn();
    });
    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('returns error when Google returns success but no id_token (defense in depth)', async () => {
    mockPromptAsync.mockResolvedValueOnce({ type: 'success', params: {} });
    const { result } = renderHook(() => useGoogleSignIn());
    await waitFor(() => expect(result.current.ready).toBe(true));

    let outcome: Awaited<ReturnType<typeof result.current.signIn>> | undefined;
    await act(async () => {
      outcome = await result.current.signIn();
    });
    expect(outcome?.kind).toBe('error');
    if (outcome?.kind === 'error') {
      expect(outcome.error.message).toMatch(/No identity token/);
    }
  });

  it('returns error when Supabase rejects the token', async () => {
    mockPromptAsync.mockResolvedValueOnce({
      type: 'success',
      params: { id_token: 'bad.token' },
    });
    mockSignInWithIdToken.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid nonce' },
    });
    const { result } = renderHook(() => useGoogleSignIn());
    await waitFor(() => expect(result.current.ready).toBe(true));

    let outcome: Awaited<ReturnType<typeof result.current.signIn>> | undefined;
    await act(async () => {
      outcome = await result.current.signIn();
    });
    expect(outcome?.kind).toBe('error');
    if (outcome?.kind === 'error') {
      expect(outcome.error.message).toBe('Invalid nonce');
    }
  });
});

describe('useGoogleSignIn — not configured branch', () => {
  // We patch the Config object directly on the mocked module — jest.mock
  // returns a shared object reference so this affects subsequent imports
  // inside googleAuth.ts the next time the hook is rendered.
  const configMod = require('../../constants/config') as { Config: { GOOGLE_CLIENT_ID: string } };
  const originalId = configMod.Config.GOOGLE_CLIENT_ID;

  beforeEach(() => {
    configMod.Config.GOOGLE_CLIENT_ID = '';
  });
  afterEach(() => {
    configMod.Config.GOOGLE_CLIENT_ID = originalId;
  });

  it('reports configured=false and signIn returns a clear error', async () => {
    const { result } = renderHook(() => useGoogleSignIn());
    expect(result.current.configured).toBe(false);

    let outcome: Awaited<ReturnType<typeof result.current.signIn>> | undefined;
    await act(async () => {
      outcome = await result.current.signIn();
    });
    expect(outcome?.kind).toBe('error');
    if (outcome?.kind === 'error') {
      expect(outcome.error.message).toMatch(/not configured/);
    }
  });
});
