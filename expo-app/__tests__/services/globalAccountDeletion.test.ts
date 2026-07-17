import { supabase } from '../../services/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import {
  beginGlobalAccountDeletion,
  confirmGlobalAccountDeletion,
  GLOBAL_ACCOUNT_DELETION_CONFIRMATION,
  GLOBAL_ACCOUNT_DELETION_CONFIRMATION_VERSION,
  GlobalAccountDeletionError,
  isGlobalDeletionReceipt,
  loadPersistedGlobalDeletionState,
  persistGlobalDeletionState,
  resumeGlobalAccountDeletionAppleRevocation,
} from '../../services/globalAccountDeletion';

const mockSecureGet = jest.fn();
const mockSecureSet = jest.fn();
const mockSecureDelete = jest.fn();

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async () => 'f'.repeat(64)),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockSecureGet(...args),
  setItemAsync: (...args: unknown[]) => mockSecureSet(...args),
  deleteItemAsync: (...args: unknown[]) => mockSecureDelete(...args),
}));

jest.mock('../../services/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const invoke = supabase.functions.invoke as jest.Mock;
const session = { access_token: 'verified-session-token' } as never;

beforeEach(() => {
  invoke.mockReset();
  mockSecureGet.mockReset();
  mockSecureSet.mockReset().mockResolvedValue(undefined);
  mockSecureDelete.mockReset().mockResolvedValue(undefined);
});

describe('global account deletion service', () => {
  it('begins a server-bound reauthentication challenge', async () => {
    invoke.mockResolvedValue({
      error: null,
      data: {
        ok: true,
        code: 'REAUTHENTICATION_REQUIRED',
        challengeId: '11111111-1111-4111-8111-111111111111',
        challengeSecret: 'a'.repeat(64),
        reauthenticateAfter: '2026-07-16T15:00:01.000Z',
        expiresAt: '2026-07-16T15:10:00.000Z',
        confirmationVersion: GLOBAL_ACCOUNT_DELETION_CONFIRMATION_VERSION,
      },
    });
    await expect(beginGlobalAccountDeletion(session)).resolves.toEqual({
      kind: 'challenge',
      challengeId: '11111111-1111-4111-8111-111111111111',
      challengeSecret: 'a'.repeat(64),
      reauthenticateAfter: '2026-07-16T15:00:01.000Z',
      expiresAt: '2026-07-16T15:10:00.000Z',
    });
    expect(invoke).toHaveBeenCalledWith(
      'pragas-global-account-deletion',
      expect.objectContaining({
        body: { action: 'begin' },
        headers: { Authorization: 'Bearer verified-session-token' },
      }),
    );
  });

  it('accepts only a precise already-requested contract', async () => {
    invoke.mockResolvedValue({
      error: null,
      data: {
        ok: true,
        code: 'GLOBAL_ACCOUNT_DELETION_ALREADY_REQUESTED',
        receipt: 'AGR-DEL-22222222-2222-4222-8222-222222222222',
        status: 'requested_manual_review',
        requestedAt: '2026-07-16T15:00:00.000Z',
        dueAt: '2026-07-31T15:00:00.000Z',
        appCleanupState: 'queued',
        appleAuthorizationStatus: 'retry_pending',
        pragasAccessSuspended: true,
        manualGlobalProcessing: true,
        globalIdentityDeleted: false,
      },
    });
    await expect(beginGlobalAccountDeletion(session)).resolves.toMatchObject({
      kind: 'already_requested',
      receipt: 'AGR-DEL-22222222-2222-4222-8222-222222222222',
    });
  });

  it('sends the exact whole-account acknowledgement after fresh auth', async () => {
    invoke.mockResolvedValue({
      error: null,
      data: {
        ok: true,
        code: 'GLOBAL_ACCOUNT_DELETION_REQUESTED',
        receipt: 'AGR-DEL-22222222-2222-4222-8222-222222222222',
        status: 'requested_manual_review',
        requestedAt: '2026-07-16T15:00:00.000Z',
        dueAt: '2026-07-31T15:00:00.000Z',
        appCleanupState: 'queued',
        pragasAccessSuspended: true,
        pragasPushRevoked: true,
        appleAuthorizationStatus: 'not_required',
        manualGlobalProcessing: true,
        globalIdentityDeleted: false,
      },
    });
    const result = await confirmGlobalAccountDeletion(
      session,
      {
        kind: 'challenge',
        challengeId: '11111111-1111-4111-8111-111111111111',
        challengeSecret: 'a'.repeat(64),
        reauthenticateAfter: '2026-07-16T15:00:01.000Z',
        expiresAt: '2026-07-16T15:10:00.000Z',
      },
      '33333333-3333-4333-8333-333333333333',
    );
    expect(result.receipt).toBe('AGR-DEL-22222222-2222-4222-8222-222222222222');
    expect(invoke).toHaveBeenCalledWith(
      'pragas-global-account-deletion',
      expect.objectContaining({
        body: expect.objectContaining({
          confirmation: GLOBAL_ACCOUNT_DELETION_CONFIRMATION,
          confirmationVersion: GLOBAL_ACCOUNT_DELETION_CONFIRMATION_VERSION,
        }),
        headers: expect.objectContaining({
          Authorization: 'Bearer verified-session-token',
          'Idempotency-Key': '33333333-3333-4333-8333-333333333333',
        }),
      }),
    );
  });

  it('fails closed on a partial backend promise', async () => {
    invoke.mockResolvedValue({
      error: null,
      data: {
        ok: true,
        code: 'GLOBAL_ACCOUNT_DELETION_REQUESTED',
        receipt: 'AGR-DEL-22222222-2222-4222-8222-222222222222',
        status: 'requested_manual_review',
        requestedAt: '2026-07-16T15:00:00.000Z',
        dueAt: '2026-07-31T15:00:00.000Z',
        appCleanupState: 'queued',
        pragasAccessSuspended: false,
        pragasPushRevoked: true,
        appleAuthorizationStatus: 'not_required',
        manualGlobalProcessing: true,
        globalIdentityDeleted: false,
      },
    });
    await expect(
      confirmGlobalAccountDeletion(
        session,
        {
          kind: 'challenge',
          challengeId: '11111111-1111-4111-8111-111111111111',
          challengeSecret: 'a'.repeat(64),
          reauthenticateAfter: '2026-07-16T15:00:01.000Z',
          expiresAt: '2026-07-16T15:10:00.000Z',
        },
        '33333333-3333-4333-8333-333333333333',
      ),
    ).rejects.toEqual(new GlobalAccountDeletionError('REQUEST_NOT_SAVED'));
  });

  it('extracts structured codes from a real FunctionsHttpError response', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ error: 'fresh_reauthentication_required' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    });

    await expect(
      confirmGlobalAccountDeletion(
        session,
        {
          kind: 'challenge',
          challengeId: '11111111-1111-4111-8111-111111111111',
          challengeSecret: 'a'.repeat(64),
          reauthenticateAfter: '2026-07-16T15:00:01.000Z',
          expiresAt: '2026-07-16T15:10:00.000Z',
        },
        '33333333-3333-4333-8333-333333333333',
      ),
    ).rejects.toEqual(new GlobalAccountDeletionError('FRESH_REAUTHENTICATION_REQUIRED'));
    expect(invoke.mock.calls[0]![1].timeout).toBeGreaterThan(32_000);
  });

  it('resumes a persisted Apple revocation with an SDK-compatible timeout', async () => {
    const receipt = {
      receipt: 'AGR-DEL-22222222-2222-4222-8222-222222222222',
      status: 'requested_manual_review',
      requestedAt: '2026-07-16T15:00:00.000Z',
      dueAt: '2026-07-31T15:00:00.000Z',
      appCleanupState: 'queued',
      appleAuthorizationStatus: 'retry_pending' as const,
    };
    invoke.mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ error: 'apple_reauthentication_required' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    });
    await expect(
      resumeGlobalAccountDeletionAppleRevocation(
        session,
        receipt,
        '33333333-3333-4333-8333-333333333333',
      ),
    ).rejects.toEqual(new GlobalAccountDeletionError('APPLE_REAUTHENTICATION_REQUIRED'));

    invoke.mockResolvedValueOnce({
      error: null,
      data: {
        ok: true,
        code: 'GLOBAL_ACCOUNT_DELETION_ALREADY_REQUESTED',
        ...receipt,
        pragasAccessSuspended: true,
        pragasPushRevoked: true,
        appleAuthorizationStatus: 'revoked',
        manualGlobalProcessing: true,
        globalIdentityDeleted: false,
      },
    });
    await expect(
      resumeGlobalAccountDeletionAppleRevocation(
        session,
        receipt,
        '33333333-3333-4333-8333-333333333333',
        'fresh.apple.authorization.code',
      ),
    ).resolves.toMatchObject({ appleAuthorizationStatus: 'revoked' });
    expect(invoke).toHaveBeenLastCalledWith(
      'pragas-global-account-deletion',
      expect.objectContaining({
        body: {
          action: 'resume_apple_revocation',
          receipt: receipt.receipt,
          appleAuthorizationCode: 'fresh.apple.authorization.code',
        },
        headers: expect.objectContaining({
          'Idempotency-Key': '33333333-3333-4333-8333-333333333333',
        }),
        timeout: expect.any(Number),
      }),
    );
    expect(invoke.mock.calls[1]![1].timeout).toBeGreaterThan(32_000);
  });

  it('recognizes only opaque receipt syntax', () => {
    expect(isGlobalDeletionReceipt('AGR-DEL-22222222-2222-4222-8222-222222222222')).toBe(true);
    expect(isGlobalDeletionReceipt('producer@example.test')).toBe(false);
  });

  it('sends a bounded Apple authorization code only when supplied', async () => {
    invoke.mockResolvedValue({
      error: null,
      data: {
        ok: true,
        code: 'GLOBAL_ACCOUNT_DELETION_REQUESTED',
        receipt: 'AGR-DEL-22222222-2222-4222-8222-222222222222',
        status: 'requested_manual_review',
        requestedAt: '2026-07-16T15:00:00.000Z',
        dueAt: '2026-07-31T15:00:00.000Z',
        appCleanupState: 'queued',
        pragasAccessSuspended: true,
        pragasPushRevoked: true,
        appleAuthorizationStatus: 'revoked',
        manualGlobalProcessing: true,
        globalIdentityDeleted: false,
      },
    });

    await confirmGlobalAccountDeletion(
      session,
      {
        kind: 'challenge',
        challengeId: '11111111-1111-4111-8111-111111111111',
        challengeSecret: 'a'.repeat(64),
        reauthenticateAfter: '2026-07-16T15:00:01.000Z',
        expiresAt: '2026-07-16T15:10:00.000Z',
      },
      '33333333-3333-4333-8333-333333333333',
      'ephemeral.apple.authorization.code',
    );

    expect(invoke).toHaveBeenCalledWith(
      'pragas-global-account-deletion',
      expect.objectContaining({
        body: expect.objectContaining({
          appleAuthorizationCode: 'ephemeral.apple.authorization.code',
        }),
      }),
    );
  });

  it('persists a validated receipt under a pseudonymous owner key', async () => {
    const receipt = {
      receipt: 'AGR-DEL-22222222-2222-4222-8222-222222222222',
      status: 'requested_manual_review',
      requestedAt: '2026-07-16T15:00:00.000Z',
      dueAt: '2026-07-31T15:00:00.000Z',
      appCleanupState: 'queued',
      appleAuthorizationStatus: 'retry_pending' as const,
    };
    await persistGlobalDeletionState(
      '11111111-1111-4111-8111-111111111111',
      receipt,
      '33333333-3333-4333-8333-333333333333',
    );
    expect(mockSecureSet).toHaveBeenCalledTimes(1);
    expect(mockSecureSet.mock.calls[0]![0]).toBe(
      `rumopragas.global-deletion-receipt.v1.${'f'.repeat(64)}`,
    );
    expect(mockSecureSet.mock.calls[0]![0]).not.toContain('11111111-1111');

    mockSecureGet.mockResolvedValueOnce(mockSecureSet.mock.calls[0]![1]);
    await expect(
      loadPersistedGlobalDeletionState('11111111-1111-4111-8111-111111111111'),
    ).resolves.toEqual({
      version: 1,
      receipt,
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    });
  });

  it('deletes corrupt persisted receipt state instead of displaying it', async () => {
    mockSecureGet.mockResolvedValueOnce('{"version":1,"receipt":{"receipt":"email@test"}}');
    await expect(
      loadPersistedGlobalDeletionState('11111111-1111-4111-8111-111111111111'),
    ).resolves.toBeNull();
    expect(mockSecureDelete).toHaveBeenCalledTimes(1);
  });
});
