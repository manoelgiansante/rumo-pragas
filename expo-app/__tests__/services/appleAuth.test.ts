/**
 * Tests for services/appleAuth.ts
 */

// --- Mocks ---
const mockIsAvailableAsync = jest.fn();
const mockSignInAsync = jest.fn();

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: (...args: unknown[]) => mockIsAvailableAsync(...args),
  signInAsync: (...args: unknown[]) => mockSignInAsync(...args),
  AppleAuthenticationScope: {
    FULL_NAME: 0,
    EMAIL: 1,
  },
}));

// expo-crypto: deterministic nonce + hash so we can assert the raw nonce is
// forwarded to Supabase (the security-critical handoff).
jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn(() => new Uint8Array(32).fill(0)),
  digestStringAsync: jest.fn(async (_alg: unknown, value: string) => `sha256(${value})`),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

// Sentry: no-op breadcrumbs/captures in tests.
jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

const mockSignInWithIdToken = jest.fn();
const mockUpdateProfile = jest.fn();

// 32 zero bytes → 64 zero hex chars; matches getRandomBytes mock above.
const EXPECTED_RAW_NONCE = '0'.repeat(64);

jest.mock('../../services/supabase', () => ({
  supabase: {
    auth: {
      signInWithIdToken: (...args: unknown[]) => mockSignInWithIdToken(...args),
    },
    from: jest.fn(() => ({
      update: (...args: unknown[]) => {
        mockUpdateProfile(...args);
        return {
          eq: jest.fn().mockResolvedValue({ error: null }),
        };
      },
    })),
  },
}));

// Default: iOS platform
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import { isAppleSignInAvailable, signInWithApple } from '../../services/appleAuth';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isAppleSignInAvailable', () => {
  it('returns true on iOS when Apple Auth is available', async () => {
    mockIsAvailableAsync.mockResolvedValueOnce(true);

    const result = await isAppleSignInAvailable();

    expect(result).toBe(true);
  });

  it('returns false when Apple Auth is not available', async () => {
    mockIsAvailableAsync.mockResolvedValueOnce(false);

    const result = await isAppleSignInAvailable();

    expect(result).toBe(false);
  });

  it('returns false when isAvailableAsync throws', async () => {
    mockIsAvailableAsync.mockRejectedValueOnce(new Error('not available'));

    const result = await isAppleSignInAvailable();

    expect(result).toBe(false);
  });

  it('returns false on non-iOS platforms', async () => {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
    jest.doMock('expo-apple-authentication', () => ({
      isAvailableAsync: jest.fn(),
      signInAsync: jest.fn(),
      AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    }));
    jest.doMock('../../services/supabase', () => ({
      supabase: { auth: {}, from: jest.fn() },
    }));

    const { isAppleSignInAvailable: checkAndroid } = require('../../services/appleAuth');
    const result = await checkAndroid();
    expect(result).toBe(false);

    jest.resetModules();
  });
});

describe('signInWithApple', () => {
  it('returns session and user on successful sign in', async () => {
    mockSignInAsync.mockResolvedValueOnce({
      identityToken: 'apple-id-token',
      fullName: null,
    });

    const mockUser = { id: 'u1', email: 'user@icloud.com' };
    const mockSession = { access_token: 'tok' };
    mockSignInWithIdToken.mockResolvedValueOnce({
      data: { user: mockUser, session: mockSession },
      error: null,
    });

    const result = await signInWithApple();

    expect(result).toEqual({ session: mockSession, user: mockUser });
    // Security: the RAW nonce is forwarded to Supabase so it can validate the
    // id_token's hashed `nonce` claim (Apple was given SHA-256(raw)).
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-id-token',
      nonce: EXPECTED_RAW_NONCE,
    });
  });

  it('passes the SHA-256 of the raw nonce to Apple signInAsync', async () => {
    mockSignInAsync.mockResolvedValueOnce({ identityToken: 'apple-id-token', fullName: null });
    mockSignInWithIdToken.mockResolvedValueOnce({
      data: { user: { id: 'u1' }, session: {} },
      error: null,
    });

    await signInWithApple();

    expect(mockSignInAsync).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: `sha256(${EXPECTED_RAW_NONCE})` }),
    );
  });

  it('updates profile with Apple-provided name on first sign-in', async () => {
    mockSignInAsync.mockResolvedValueOnce({
      identityToken: 'apple-id-token',
      fullName: { givenName: 'Maria', familyName: 'Silva' },
    });

    const mockUser = { id: 'u1' };
    mockSignInWithIdToken.mockResolvedValueOnce({
      data: { user: mockUser, session: {} },
      error: null,
    });

    await signInWithApple();

    expect(mockUpdateProfile).toHaveBeenCalledWith({ full_name: 'Maria Silva' });
  });

  it('throws when no identity token is received', async () => {
    mockSignInAsync.mockResolvedValueOnce({
      identityToken: null,
      fullName: null,
    });

    await expect(signInWithApple()).rejects.toThrow('did not return an identity token');
  });

  it('returns null when user cancels (ERR_REQUEST_CANCELED)', async () => {
    const cancelError = { code: 'ERR_REQUEST_CANCELED' };
    mockSignInAsync.mockRejectedValueOnce(cancelError);

    const result = await signInWithApple();

    expect(result).toBeNull();
  });

  it('returns null (breadcrumb, not exception) for benign unknown code 1000', async () => {
    // ASAuthorizationError.unknown — Apple's catch-all for dismiss/timeout.
    const unknownError = { code: '1000' };
    mockSignInAsync.mockRejectedValueOnce(unknownError);

    const result = await signInWithApple();

    expect(result).toBeNull();
  });

  it('returns null for ERR_REQUEST_UNKNOWN', async () => {
    mockSignInAsync.mockRejectedValueOnce({ code: 'ERR_REQUEST_UNKNOWN' });

    const result = await signInWithApple();

    expect(result).toBeNull();
  });

  it('throws on Supabase auth error', async () => {
    mockSignInAsync.mockResolvedValueOnce({
      identityToken: 'token',
      fullName: null,
    });
    mockSignInWithIdToken.mockResolvedValueOnce({
      data: null,
      error: new Error('Auth provider error'),
    });

    await expect(signInWithApple()).rejects.toThrow('Auth provider error');
  });

  it('re-throws non-cancel errors from Apple Auth', async () => {
    mockSignInAsync.mockRejectedValueOnce(new Error('Unknown Apple error'));

    await expect(signInWithApple()).rejects.toThrow('Unknown Apple error');
  });
});
