/**
 * Tests for services/appleAuth.ts
 *
 * Coverage:
 *   1. isAppleSignInAvailable() platform & probe paths
 *   2. signInWithApple() happy path (session + optional profile update)
 *   3. signInWithApple() user cancel returns null (no UI, no Sentry)
 *   4. signInWithApple() Apple benign codes throw BenignAppleSiwaError
 *      with friendly Portuguese message and NO captureException
 *      (RUMO-PRAGAS-C — Sentry noise filter for code 1000 et al)
 *   5. signInWithApple() novel codes DO captureException + tag the raw code
 *   6. signInWithApple() missing identityToken throws BenignAppleSiwaError
 *   7. APPLE_SIWA_*_CODES sets are a documented contract (lockstep guard)
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

const mockSignInWithIdToken = jest.fn();
const mockUpdateProfile = jest.fn();

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

const mockAddBreadcrumb = jest.fn();
const mockCaptureException = jest.fn();
jest.mock('../../services/sentry-shim', () => ({
  addBreadcrumb: (...args: unknown[]) => mockAddBreadcrumb(...args),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  captureMessage: jest.fn(),
  withScope: jest.fn(),
}));

// Default: iOS platform
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import {
  isAppleSignInAvailable,
  signInWithApple,
  BenignAppleSiwaError,
  isBenignAppleSiwaError,
  APPLE_SIWA_CANCEL_CODES,
  APPLE_SIWA_SILENT_NATIVE_CODES,
} from '../../services/appleAuth';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isAppleSignInAvailable', () => {
  it('returns true on iOS when Apple Auth is available', async () => {
    mockIsAvailableAsync.mockResolvedValueOnce(true);
    expect(await isAppleSignInAvailable()).toBe(true);
  });

  it('returns false when Apple Auth is not available', async () => {
    mockIsAvailableAsync.mockResolvedValueOnce(false);
    expect(await isAppleSignInAvailable()).toBe(false);
  });

  it('returns false when isAvailableAsync throws', async () => {
    mockIsAvailableAsync.mockRejectedValueOnce(new Error('not available'));
    expect(await isAppleSignInAvailable()).toBe(false);
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
    jest.doMock('../../services/sentry-shim', () => ({
      addBreadcrumb: jest.fn(),
      captureException: jest.fn(),
      captureMessage: jest.fn(),
      withScope: jest.fn(),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isAppleSignInAvailable: checkAndroid } = require('../../services/appleAuth');
    expect(await checkAndroid()).toBe(false);

    jest.resetModules();
  });
});

describe('signInWithApple — happy path', () => {
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
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-id-token',
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
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
});

describe('signInWithApple — benign-code filter (RUMO-PRAGAS-C)', () => {
  it.each(['ERR_REQUEST_CANCELED', 'ERR_CANCELED'])(
    'returns null + breadcrumbs only when user cancels (%s)',
    async (code) => {
      mockSignInAsync.mockRejectedValueOnce({ code });

      const result = await signInWithApple();

      expect(result).toBeNull();
      expect(mockCaptureException).not.toHaveBeenCalled();
      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'auth',
          message: 'apple.signin.cancelled',
          data: expect.objectContaining({ code }),
        }),
      );
    },
  );

  it.each([
    'ERR_REQUEST_UNKNOWN', // ASAuthorizationError.unknown = 1000
    'ERR_REQUEST_FAILED', // .failed = 1004
    'ERR_INVALID_RESPONSE', // .invalidResponse = 1002
  ])(
    'throws BenignAppleSiwaError without Sentry capture for native silent code %s',
    async (code) => {
      mockSignInAsync.mockRejectedValueOnce({ code });

      let caught: unknown;
      try {
        await signInWithApple();
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BenignAppleSiwaError);
      expect(isBenignAppleSiwaError(caught)).toBe(true);
      expect((caught as BenignAppleSiwaError).code).toBe(code);
      // Friendly Portuguese message — exact copy stays in lockstep with the
      // pattern shipped in Rumo Operacional PR #22.
      expect((caught as Error).message).toBe(
        'A Apple não conseguiu concluir o login. Verifique sua conexão e tente novamente.',
      );
      // The key invariant: NO captureException for benign codes.
      expect(mockCaptureException).not.toHaveBeenCalled();
      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'auth',
          message: 'apple.signin.silent_fail',
          level: 'warning',
          data: expect.objectContaining({ code, stage: 'siwa-native' }),
        }),
      );
    },
  );

  it('throws BenignAppleSiwaError without Sentry capture when identityToken is missing', async () => {
    mockSignInAsync.mockResolvedValueOnce({
      identityToken: null,
      fullName: null,
    });

    let caught: unknown;
    try {
      await signInWithApple();
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(BenignAppleSiwaError);
    expect((caught as BenignAppleSiwaError).code).toBe('ERR_NO_IDENTITY_TOKEN');
    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'auth',
        message: 'apple.signin.missing_token',
      }),
    );
  });
});

describe('signInWithApple — novel codes still capture', () => {
  it('captures with code tag for an unknown native error code', async () => {
    mockSignInAsync.mockRejectedValueOnce({ code: 'ERR_BRAND_NEW_FAILURE' });

    const rejected = await signInWithApple().catch((e: unknown) => e);

    expect(rejected).toMatchObject({ code: 'ERR_BRAND_NEW_FAILURE' });
    expect(isBenignAppleSiwaError(rejected)).toBe(false);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ERR_BRAND_NEW_FAILURE' }),
      expect.objectContaining({
        tags: expect.objectContaining({
          stage: 'siwa-native',
          code: 'ERR_BRAND_NEW_FAILURE',
        }),
      }),
    );
  });

  it('captures on Supabase auth error and re-throws', async () => {
    mockSignInAsync.mockResolvedValueOnce({
      identityToken: 'token',
      fullName: null,
    });
    const supabaseErr = new Error('Auth provider error');
    mockSignInWithIdToken.mockResolvedValueOnce({
      data: null,
      error: supabaseErr,
    });

    await expect(signInWithApple()).rejects.toThrow('Auth provider error');
    expect(mockCaptureException).toHaveBeenCalledWith(
      supabaseErr,
      expect.objectContaining({
        tags: expect.objectContaining({ stage: 'siwa-supabase' }),
      }),
    );
  });

  it('captures with unknown sentinel when the rejection has no code property', async () => {
    const novelErr = new Error('Unknown Apple error');
    mockSignInAsync.mockRejectedValueOnce(novelErr);

    await expect(signInWithApple()).rejects.toThrow('Unknown Apple error');
    expect(mockCaptureException).toHaveBeenCalledWith(
      novelErr,
      expect.objectContaining({
        tags: expect.objectContaining({ stage: 'siwa-native', code: 'unknown' }),
      }),
    );
  });
});

describe('APPLE_SIWA_*_CODES contract (lockstep guard)', () => {
  it('cancel set contains exactly the 2 documented codes', () => {
    expect(Array.from(APPLE_SIWA_CANCEL_CODES).sort()).toEqual([
      'ERR_CANCELED',
      'ERR_REQUEST_CANCELED',
    ]);
  });

  it('silent-native set contains exactly the 3 documented codes', () => {
    // If you add/remove a code, update the doc comment AT THE TOP of
    // services/appleAuth.ts AND the matching memory note.
    expect(Array.from(APPLE_SIWA_SILENT_NATIVE_CODES).sort()).toEqual([
      'ERR_INVALID_RESPONSE',
      'ERR_REQUEST_FAILED',
      'ERR_REQUEST_UNKNOWN',
    ]);
  });
});

describe('isBenignAppleSiwaError', () => {
  it('returns true for BenignAppleSiwaError instances', () => {
    expect(isBenignAppleSiwaError(new BenignAppleSiwaError('m', 'X'))).toBe(true);
  });

  it('returns true for duck-typed objects with benign === true', () => {
    expect(isBenignAppleSiwaError({ benign: true })).toBe(true);
  });

  it('returns false for plain errors', () => {
    expect(isBenignAppleSiwaError(new Error('something else'))).toBe(false);
  });

  it('returns false for null / undefined / primitives', () => {
    expect(isBenignAppleSiwaError(null)).toBe(false);
    expect(isBenignAppleSiwaError(undefined)).toBe(false);
    expect(isBenignAppleSiwaError('ERR_REQUEST_UNKNOWN')).toBe(false);
    expect(isBenignAppleSiwaError(1000)).toBe(false);
  });

  it('returns false for an object with benign !== true', () => {
    expect(isBenignAppleSiwaError({ benign: false })).toBe(false);
    expect(isBenignAppleSiwaError({ benign: 'true' })).toBe(false);
  });
});
