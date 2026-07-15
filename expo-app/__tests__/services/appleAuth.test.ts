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

// Sentry shim: no-op breadcrumbs/captures in tests.
jest.mock('../../services/sentry-shim', () => ({
  addBreadcrumb: jest.fn(),
}));

const mockSignInWithIdToken = jest.fn();
const mockUpdateUser = jest.fn();

// 32 zero bytes → 64 zero hex chars; matches getRandomBytes mock above.
const EXPECTED_RAW_NONCE = '0'.repeat(64);

jest.mock('../../services/supabase', () => ({
  supabase: {
    auth: {
      signInWithIdToken: (...args: unknown[]) => mockSignInWithIdToken(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
  },
}));

// Default: iOS platform
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import { isAppleSignInAvailable, signInWithApple } from '../../services/appleAuth';
import {
  __internal as metadataGate,
  waitForPendingAuthMetadata,
} from '../../services/authMetadataGate';
import { waitFor } from '@testing-library/react-native';

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
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

  it('persists Apple-provided name in auth metadata before releasing the link gate', async () => {
    mockSignInAsync.mockResolvedValueOnce({
      identityToken: 'apple-id-token',
      fullName: { givenName: 'Maria', familyName: 'Silva' },
    });

    const mockUser = { id: 'u1' };
    mockSignInWithIdToken.mockResolvedValueOnce({
      data: { user: mockUser, session: {} },
      error: null,
    });

    let releaseUpdate!: (value: unknown) => void;
    mockUpdateUser.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseUpdate = resolve;
        }),
    );

    const signInPromise = signInWithApple();
    await waitFor(() =>
      expect(mockUpdateUser).toHaveBeenCalledWith({ data: { full_name: 'Maria Silva' } }),
    );
    expect(metadataGate.pendingCount()).toBe(1);
    let gateFinished = false;
    const gatePromise = waitForPendingAuthMetadata().then(() => {
      gateFinished = true;
    });
    await Promise.resolve();
    expect(gateFinished).toBe(false);

    releaseUpdate({ data: { user: mockUser }, error: null });
    await signInPromise;
    await gatePromise;
    expect(gateFinished).toBe(true);
    expect(metadataGate.pendingCount()).toBe(0);
  });

  it('fails closed when the one-time Apple name cannot be persisted', async () => {
    mockSignInAsync.mockResolvedValueOnce({
      identityToken: 'apple-id-token',
      fullName: { givenName: 'Maria', familyName: 'Silva' },
    });
    mockSignInWithIdToken.mockResolvedValueOnce({
      data: { user: { id: 'u1' }, session: {} },
      error: null,
    });
    mockUpdateUser.mockResolvedValueOnce({ data: { user: null }, error: { code: 'network' } });

    await expect(signInWithApple()).rejects.toThrow('Erro ao entrar com Apple. Tente novamente.');
    expect(metadataGate.pendingCount()).toBe(0);
  });

  it('throws when no identity token is received', async () => {
    mockSignInAsync.mockResolvedValueOnce({
      identityToken: null,
      fullName: null,
    });

    await expect(signInWithApple()).rejects.toThrow('Erro ao entrar com Apple. Tente novamente.');
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

    await expect(signInWithApple()).rejects.toThrow('Erro ao entrar com Apple. Tente novamente.');
  });

  it('re-throws non-cancel errors from Apple Auth', async () => {
    mockSignInAsync.mockRejectedValueOnce(new Error('Unknown Apple error'));

    await expect(signInWithApple()).rejects.toThrow('Erro ao entrar com Apple. Tente novamente.');
  });
});
