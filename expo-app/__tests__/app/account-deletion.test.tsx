import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const mockBegin = jest.fn();
const mockConfirm = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockAuthSignOut = jest.fn();
const mockPurge = jest.fn();
const mockSignOut = jest.fn();
const mockAppleReauthentication = jest.fn();
const mockLoadPersistedState = jest.fn();
const mockPersistState = jest.fn();
const mockEphemeralGetSession = jest.fn();
const mockResumeAppleRevocation = jest.fn();
const mockRandomUUID = jest.fn();

let mockCurrentUser = {
  id: USER_ID,
  email: 'reviewer@example.test',
  app_metadata: { provider: 'email', providers: ['email'] },
};

const oldSession = {
  access_token: 'old-access-token',
  user: { id: USER_ID },
};

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => mockRandomUUID() }));
jest.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
  notificationAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'pt-BR' },
  }),
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuthContext: () => ({
    user: mockCurrentUser,
    session: oldSession,
    signOut: (...args: unknown[]) => mockSignOut(...args),
  }),
}));
jest.mock('../../services/googleAuth', () => ({
  useGoogleSignIn: () => ({
    configured: false,
    ready: false,
    loading: false,
    signIn: jest.fn(),
  }),
}));
jest.mock('../../services/appleAuth', () => ({
  reauthenticateWithAppleForAccountDeletion: (...args: unknown[]) =>
    mockAppleReauthentication(...args),
}));
jest.mock('../../services/globalAccountDeletion', () => ({
  GlobalAccountDeletionError: class GlobalAccountDeletionError extends Error {
    readonly code: string;

    constructor(mockCode: string) {
      super(mockCode);
      this.code = mockCode;
    }
  },
  beginGlobalAccountDeletion: (...args: unknown[]) => mockBegin(...args),
  confirmGlobalAccountDeletion: (...args: unknown[]) => mockConfirm(...args),
  loadPersistedGlobalDeletionState: (...args: unknown[]) => mockLoadPersistedState(...args),
  persistGlobalDeletionState: (...args: unknown[]) => mockPersistState(...args),
  resumeGlobalAccountDeletionAppleRevocation: (...args: unknown[]) =>
    mockResumeAppleRevocation(...args),
}));
jest.mock('../../services/localDataPurge', () => ({
  purgePragasLocalUserData: (...args: unknown[]) => mockPurge(...args),
}));
jest.mock('../../services/sentry-shim', () => ({ captureMessage: jest.fn() }));
jest.mock('../../services/supabase', () => ({
  createEphemeralSupabaseClient: () => ({
    auth: {
      getSession: (...args: unknown[]) => mockEphemeralGetSession(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signOut: (...args: unknown[]) => mockAuthSignOut(...args),
    },
  }),
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: oldSession } }),
    },
  },
}));

import AccountDeletionScreen from '../../app/account-deletion';
import { GlobalAccountDeletionError } from '../../services/globalAccountDeletion';

describe('whole AgroRumo account deletion screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = {
      id: USER_ID,
      email: 'reviewer@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
    };
    mockRandomUUID.mockReset().mockReturnValue('44444444-4444-4444-8444-444444444444');
    mockBegin.mockResolvedValue({
      kind: 'challenge',
      challengeId: '22222222-2222-4222-8222-222222222222',
      challengeSecret: 'a'.repeat(64),
      reauthenticateAfter: '2026-07-16T15:00:00.000Z',
      expiresAt: '2026-07-16T15:10:00.000Z',
    });
    mockSignInWithPassword.mockResolvedValue({
      error: null,
      data: {
        session: { access_token: 'fresh-access-token', user: { id: USER_ID } },
      },
    });
    mockConfirm.mockResolvedValue({
      receipt: 'AGR-DEL-33333333-3333-4333-8333-333333333333',
      status: 'requested_manual_review',
      requestedAt: '2026-07-16T15:00:00.000Z',
      dueAt: '2026-07-31T15:00:00.000Z',
      appCleanupState: 'queued',
      appleAuthorizationStatus: 'not_required',
    });
    mockPurge.mockResolvedValue(undefined);
    mockAuthSignOut.mockResolvedValue({ error: null });
    mockEphemeralGetSession.mockResolvedValue({ data: { session: null } });
    mockLoadPersistedState.mockResolvedValue(null);
    mockPersistState.mockResolvedValue(undefined);
    mockResumeAppleRevocation.mockReset();
  });

  it('does nothing before explicit whole-account acknowledgement', () => {
    const { getByTestId } = render(<AccountDeletionScreen />);
    fireEvent.changeText(getByTestId('account-deletion-password'), 'correct horse');
    fireEvent.press(getByTestId('account-deletion-confirm-password'));
    expect(mockBegin).not.toHaveBeenCalled();
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('requires a new same-user session before committing and then purges local data', async () => {
    const { getByTestId, getByText } = render(<AccountDeletionScreen />);
    fireEvent(getByTestId('account-deletion-acknowledge'), 'valueChange', true);
    fireEvent.changeText(getByTestId('account-deletion-password'), 'correct horse');
    fireEvent.press(getByTestId('account-deletion-confirm-password'));

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
    expect(mockBegin).toHaveBeenCalledWith(oldSession);
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'reviewer@example.test',
      password: 'correct horse',
    });
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ access_token: 'fresh-access-token' }),
      expect.objectContaining({ kind: 'challenge' }),
      '44444444-4444-4444-8444-444444444444',
      undefined,
    );
    expect(mockPurge).toHaveBeenCalledWith(USER_ID);
    expect(mockPersistState).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        receipt: 'AGR-DEL-33333333-3333-4333-8333-333333333333',
      }),
      '44444444-4444-4444-8444-444444444444',
    );
    expect(getByText('AGR-DEL-33333333-3333-4333-8333-333333333333')).toBeTruthy();
  });

  it('fails closed when reauthentication switches to another account', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      error: null,
      data: {
        session: {
          access_token: 'other-user-token',
          user: { id: '99999999-9999-4999-8999-999999999999' },
        },
      },
    });
    const { getByTestId, getByText } = render(<AccountDeletionScreen />);
    fireEvent(getByTestId('account-deletion-acknowledge'), 'valueChange', true);
    fireEvent.changeText(getByTestId('account-deletion-password'), 'other password');
    fireEvent.press(getByTestId('account-deletion-confirm-password'));

    await waitFor(() => expect(getByText('accountDeletion.reauthenticationError')).toBeTruthy());
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockPurge).not.toHaveBeenCalled();
    expect(mockAuthSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('rotates the request idempotency key after a rejected freshness proof', async () => {
    mockRandomUUID
      .mockReset()
      .mockReturnValueOnce('44444444-4444-4444-8444-444444444444')
      .mockReturnValue('55555555-5555-4555-8555-555555555555');
    mockConfirm
      .mockRejectedValueOnce(new GlobalAccountDeletionError('FRESH_REAUTHENTICATION_REQUIRED'))
      .mockResolvedValueOnce({
        receipt: 'AGR-DEL-33333333-3333-4333-8333-333333333333',
        status: 'requested_manual_review',
        requestedAt: '2026-07-16T15:00:00.000Z',
        dueAt: '2026-07-31T15:00:00.000Z',
        appCleanupState: 'queued',
        appleAuthorizationStatus: 'not_required',
      });
    const { getByTestId } = render(<AccountDeletionScreen />);
    fireEvent(getByTestId('account-deletion-acknowledge'), 'valueChange', true);
    fireEvent.changeText(getByTestId('account-deletion-password'), 'correct horse');
    fireEvent.press(getByTestId('account-deletion-confirm-password'));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));

    fireEvent.changeText(getByTestId('account-deletion-password'), 'correct horse');
    fireEvent.press(getByTestId('account-deletion-confirm-password'));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(2));
    expect(mockConfirm.mock.calls[0]![2]).toBe('44444444-4444-4444-8444-444444444444');
    expect(mockConfirm.mock.calls[1]![2]).toBe('55555555-5555-4555-8555-555555555555');
  });

  it('requires Apple reauthentication and forwards its ephemeral code', async () => {
    mockCurrentUser = {
      id: USER_ID,
      email: 'private@privaterelay.appleid.com',
      app_metadata: { provider: 'apple', providers: ['apple', 'email'] },
    };
    mockAppleReauthentication.mockResolvedValueOnce({
      session: { access_token: 'fresh-apple-token', user: { id: USER_ID } },
      user: { id: USER_ID },
      authorizationCode: 'ephemeral.apple.authorization.code',
    });

    const { getByTestId, queryByTestId } = render(<AccountDeletionScreen />);
    expect(queryByTestId('account-deletion-password')).toBeNull();
    fireEvent(getByTestId('account-deletion-acknowledge'), 'valueChange', true);
    fireEvent.press(getByTestId('account-deletion-confirm-apple'));

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ access_token: 'fresh-apple-token' }),
      expect.objectContaining({ kind: 'challenge' }),
      '44444444-4444-4444-8444-444444444444',
      'ephemeral.apple.authorization.code',
    );
    expect(mockAppleReauthentication).toHaveBeenCalledWith(
      expect.objectContaining({ auth: expect.any(Object) }),
    );
  });

  it('restores the opaque receipt after the screen remounts', async () => {
    mockLoadPersistedState.mockResolvedValueOnce({
      version: 1,
      idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      receipt: {
        receipt: 'AGR-DEL-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        status: 'requested_manual_review',
        requestedAt: '2026-07-16T15:00:00.000Z',
        dueAt: '2026-07-31T15:00:00.000Z',
        appCleanupState: 'queued',
        appleAuthorizationStatus: 'retry_pending',
      },
    });
    const { getByText, getByTestId } = render(<AccountDeletionScreen />);
    await waitFor(() =>
      expect(getByText('AGR-DEL-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).toBeTruthy(),
    );
    expect(getByTestId('account-deletion-apple-revocation-pending')).toBeTruthy();
    expect(mockBegin).not.toHaveBeenCalled();
  });

  it('resumes Apple revocation after restart and requests a new Apple code only if needed', async () => {
    mockCurrentUser = {
      id: USER_ID,
      email: 'private@privaterelay.appleid.com',
      app_metadata: { provider: 'apple', providers: ['apple'] },
    };
    const pendingReceipt = {
      receipt: 'AGR-DEL-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      status: 'requested_manual_review',
      requestedAt: '2026-07-16T15:00:00.000Z',
      dueAt: '2026-07-31T15:00:00.000Z',
      appCleanupState: 'queued',
      appleAuthorizationStatus: 'retry_pending',
    };
    mockLoadPersistedState.mockResolvedValueOnce({
      version: 1,
      idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      receipt: pendingReceipt,
    });
    mockResumeAppleRevocation
      .mockRejectedValueOnce(new GlobalAccountDeletionError('APPLE_REAUTHENTICATION_REQUIRED'))
      .mockResolvedValueOnce({ ...pendingReceipt, appleAuthorizationStatus: 'revoked' });
    mockAppleReauthentication.mockResolvedValueOnce({
      session: { access_token: 'fresh-apple-token', user: { id: USER_ID } },
      authorizationCode: 'fresh.apple.authorization.code',
    });

    const { getByTestId, queryByTestId } = render(<AccountDeletionScreen />);
    await waitFor(() =>
      expect(getByTestId('account-deletion-retry-apple-revocation')).toBeTruthy(),
    );
    fireEvent.press(getByTestId('account-deletion-retry-apple-revocation'));

    await waitFor(() => expect(mockResumeAppleRevocation).toHaveBeenCalledTimes(2));
    expect(mockResumeAppleRevocation.mock.calls[0]).toEqual([
      oldSession,
      pendingReceipt,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ]);
    expect(mockResumeAppleRevocation.mock.calls[1]).toEqual([
      expect.objectContaining({ access_token: 'fresh-apple-token' }),
      pendingReceipt,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'fresh.apple.authorization.code',
    ]);
    await waitFor(() =>
      expect(queryByTestId('account-deletion-apple-revocation-pending')).toBeNull(),
    );
    expect(mockPersistState).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ appleAuthorizationStatus: 'revoked' }),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
  });
});
