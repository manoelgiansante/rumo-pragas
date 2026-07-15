const mockMaybeSingle = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn((_table: string) => ({
  select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: mockMaybeSingle })) })),
}));
const mockTrackEvent = jest.fn();
let mockDecisionCounter = 0;

jest.mock('../../services/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    rpc: (name: string, args: unknown) => mockRpc(name, args),
  },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => {
    mockDecisionCounter += 1;
    return `61000000-0000-4000-8000-${mockDecisionCounter.toString().padStart(12, '0')}`;
  }),
}));
jest.mock('../../services/analytics', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearPendingLocationConsent,
  enqueuePendingLocationConsent,
  flushPendingLocationConsent,
  getLocationConsentRevision,
  getUserPreferences,
  hasLocationConsent,
  LOCATION_CONSENT_PURPOSE,
  pendingLocationConsentDecisionStorageKey,
  pendingLocationConsentStorageKey,
  PENDING_LOCATION_CONSENT_STORAGE_KEY,
  PENDING_LOCATION_CONSENT_STORAGE_PREFIX,
  preparePendingLocationConsentOwnerClaim,
  setLocationConsent,
} from '../../services/userPreferences';

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const values = new Map<string, string>();
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const CONSENTED_AT_A = '2026-07-14T12:00:00.000Z';
const CONSENTED_AT_B = '2026-07-14T13:00:00.000Z';
const DECISION_A = '61000000-0000-4000-8000-000000000101';
const DECISION_B = '61000000-0000-4000-8000-000000000102';

function pendingPayload(
  userId: string,
  shareLocation: boolean,
  consentedAt: string,
  decisionId: string = DECISION_A,
  observedRevision: number | null = shareLocation ? 0 : null,
) {
  return {
    version: 2,
    userId,
    decisionId,
    shareLocation,
    purpose: LOCATION_CONSENT_PURPOSE,
    consentedAt,
    observedRevision,
  };
}

function rpcSuccess(args: { p_decision_id: string; p_share_location: boolean }) {
  return {
    data: {
      applied: true,
      replayed: false,
      code: 'applied',
      decision_id: args.p_decision_id,
      decision_revision: 1,
      current_revision: 1,
      current_share_location: args.p_share_location,
    },
    error: null,
  };
}

function pendingDecisionKeys(userId: string): string[] {
  const prefix = `${pendingLocationConsentStorageKey(userId)}:`;
  return [...values.keys()].filter((key) => key.startsWith(prefix));
}

function pendingDecisions(userId: string): Array<ReturnType<typeof pendingPayload>> {
  return pendingDecisionKeys(userId).map((key) => JSON.parse(values.get(key) ?? '{}'));
}

function onlyPendingDecision(userId: string): ReturnType<typeof pendingPayload> {
  const decisions = pendingDecisions(userId);
  expect(decisions).toHaveLength(1);
  return decisions[0]!;
}

describe('Pragas location preferences namespace and offline queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDecisionCounter = 0;
    values.clear();
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockRpc.mockImplementation(
      async (_name, args: { p_decision_id: string; p_share_location: boolean }) => rpcSuccess(args),
    );
    storage.getItem.mockImplementation(async (key) => values.get(key) ?? null);
    storage.setItem.mockImplementation(async (key, value) => {
      values.set(key, value);
    });
    storage.removeItem.mockImplementation(async (key) => {
      values.delete(key);
    });
    storage.getAllKeys.mockImplementation(async () => [...values.keys()]);
    storage.multiRemove.mockImplementation(async (keys) => {
      keys.forEach((key) => values.delete(key));
    });
  });

  it('reads only the dedicated Pragas table', async () => {
    await getUserPreferences(USER_A);
    expect(mockFrom).toHaveBeenCalledWith('pragas_user_preferences');
    expect(mockFrom).not.toHaveBeenCalledWith('user_preferences');
  });

  it('writes explicit opt-out only through the idempotent consent RPC', async () => {
    await setLocationConsent(USER_A, false, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_A);
    expect(mockRpc).toHaveBeenCalledWith(
      'set_pragas_location_consent',
      expect.objectContaining({
        p_share_location: false,
        p_observed_revision: null,
        p_decision_id: expect.any(String),
      }),
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('lets a queued withdrawal override a stale server opt-in immediately', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        share_location: true,
        share_location_purpose: LOCATION_CONSENT_PURPOSE,
        consented_at: CONSENTED_AT_A,
      },
      error: null,
    });
    await enqueuePendingLocationConsent(USER_A, false, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_B);

    await expect(hasLocationConsent(USER_A)).resolves.toBe(false);
  });

  it('uses serialized choice order even if the device wall clock moves backward', async () => {
    await enqueuePendingLocationConsent(USER_A, true, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_B, 0);
    await enqueuePendingLocationConsent(USER_A, false, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_A);

    expect(onlyPendingDecision(USER_A)).toMatchObject({
      shareLocation: false,
      consentedAt: CONSENTED_AT_A,
    });
  });

  it('rechecks the local override after an in-flight stale server read', async () => {
    let releaseRead:
      | ((value: {
          data: {
            share_location: true;
            share_location_purpose: string;
            consented_at: string;
          };
          error: null;
        }) => void)
      | undefined;
    mockMaybeSingle.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRead = resolve;
        }),
    );

    const consent = hasLocationConsent(USER_A);
    for (let attempt = 0; attempt < 20 && mockMaybeSingle.mock.calls.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await enqueuePendingLocationConsent(USER_A, false, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_B);
    releaseRead?.({
      data: {
        share_location: true,
        share_location_purpose: LOCATION_CONSENT_PURPOSE,
        consented_at: CONSENTED_AT_A,
      },
      error: null,
    });

    await expect(consent).resolves.toBe(false);
  });

  it('preserves A and B independently and replays only the current owner', async () => {
    await expect(
      enqueuePendingLocationConsent(USER_A, true, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_A, 0),
    ).resolves.toBe(true);
    await expect(
      enqueuePendingLocationConsent(USER_B, false, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_B),
    ).resolves.toBe(true);

    expect(pendingDecisionKeys(USER_A)).toHaveLength(1);
    expect(pendingDecisionKeys(USER_B)).toHaveLength(1);

    await flushPendingLocationConsent(USER_B);
    expect(mockRpc).toHaveBeenCalledWith(
      'set_pragas_location_consent',
      expect.objectContaining({ p_share_location: false, p_observed_revision: null }),
    );
    expect(pendingDecisionKeys(USER_B)).toHaveLength(0);
    expect(pendingDecisionKeys(USER_A)).toHaveLength(1);
  });

  it('serializes remote writes so a delayed grant can never finish after a newer withdrawal', async () => {
    await enqueuePendingLocationConsent(USER_A, true, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_A, 0);
    let releaseGrant: (() => void) | undefined;
    const serverWrites: boolean[] = [];
    mockRpc
      .mockImplementationOnce(
        (_name, args: { p_decision_id: string; p_share_location: boolean }) =>
          new Promise((resolve) => {
            releaseGrant = () => {
              serverWrites.push(args.p_share_location);
              resolve(rpcSuccess(args));
            };
          }),
      )
      .mockImplementationOnce(async (_name, args) => {
        serverWrites.push(args.p_share_location);
        return rpcSuccess(args);
      });

    const grantFlush = flushPendingLocationConsent(USER_A);
    for (let attempt = 0; attempt < 20 && mockRpc.mock.calls.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    await expect(
      enqueuePendingLocationConsent(USER_A, false, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_B),
    ).resolves.toBe(true);
    const withdrawalFlush = flushPendingLocationConsent(USER_A);

    // The withdrawal is durable immediately, but its remote write cannot race
    // ahead of the already-started grant write for this user.
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(onlyPendingDecision(USER_A)).toMatchObject({
      userId: USER_A,
      shareLocation: false,
    });

    releaseGrant?.();
    await expect(grantFlush).resolves.toBe(true);
    await expect(withdrawalFlush).resolves.toBe(true);

    expect(mockRpc.mock.calls.map(([, args]) => args.p_share_location)).toEqual([true, false]);
    expect(serverWrites).toEqual([true, false]);
    expect(pendingDecisionKeys(USER_A)).toHaveLength(0);
  });

  it('never lets tab A remove tab B withdrawal injected after A server response', async () => {
    await enqueuePendingLocationConsent(USER_A, true, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_A, 0);
    const grantKey = pendingDecisionKeys(USER_A)[0]!;
    const withdrawalKey = pendingLocationConsentDecisionStorageKey(USER_A, DECISION_B);
    const withdrawal = pendingPayload(USER_A, false, CONSENTED_AT_B, DECISION_B, null);
    storage.removeItem
      .mockImplementationOnce(async (key) => {
        expect(key).toBe(grantKey);
        // Separate-tab write occurs after grant RPC success but before tab A
        // removes its own immutable key.
        values.set(withdrawalKey, JSON.stringify(withdrawal));
        values.delete(key);
      })
      .mockImplementation(async (key) => {
        values.delete(key);
      });

    await expect(flushPendingLocationConsent(USER_A)).resolves.toBe(true);

    expect(mockRpc.mock.calls.map(([, args]) => args.p_share_location)).toEqual([true, false]);
    expect(storage.removeItem.mock.calls.map(([key]) => key)).toEqual([grantKey, withdrawalKey]);
    expect(pendingDecisionKeys(USER_A)).toHaveLength(0);
  });

  it('keeps the newer withdrawal queued when its second serialized server write fails', async () => {
    await enqueuePendingLocationConsent(USER_A, true, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_A, 0);
    let releaseGrant: (() => void) | undefined;
    mockRpc
      .mockImplementationOnce(
        (_name, args: { p_decision_id: string; p_share_location: boolean }) =>
          new Promise((resolve) => {
            releaseGrant = () => resolve(rpcSuccess(args));
          }),
      )
      .mockResolvedValueOnce({ data: null, error: { message: 'offline' } });

    const flush = flushPendingLocationConsent(USER_A);
    for (let attempt = 0; attempt < 20 && mockRpc.mock.calls.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await enqueuePendingLocationConsent(USER_A, false, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_B);

    releaseGrant?.();
    await expect(flush).resolves.toBe(false);

    const pending = onlyPendingDecision(USER_A);
    expect(pending).toMatchObject({ userId: USER_A, shareLocation: false });
    expect(mockRpc.mock.calls.map(([, args]) => args.p_share_location)).toEqual([true, false]);
  });

  it('keeps boot replay fail-closed while the server write is still in flight', async () => {
    await enqueuePendingLocationConsent(USER_A, false, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_B);
    let releaseWrite: (() => void) | undefined;
    mockRpc.mockImplementationOnce(
      (_name, args: { p_decision_id: string; p_share_location: boolean }) =>
        new Promise((resolve) => {
          releaseWrite = () => resolve(rpcSuccess(args));
        }),
    );

    const bootReplay = flushPendingLocationConsent(USER_A);
    for (let attempt = 0; attempt < 20 && mockRpc.mock.calls.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    await expect(hasLocationConsent(USER_A)).resolves.toBe(false);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
    releaseWrite?.();
    await expect(bootReplay).resolves.toBe(true);
  });

  it('keeps a withdrawal override after a failed server write and clears it only after retry', async () => {
    await enqueuePendingLocationConsent(USER_A, false, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_B);
    const key = pendingDecisionKeys(USER_A)[0]!;
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });

    await expect(flushPendingLocationConsent(USER_A)).resolves.toBe(false);
    expect(values.has(key)).toBe(true);

    mockRpc.mockImplementationOnce(async (_name, args) => rpcSuccess(args));
    await expect(flushPendingLocationConsent(USER_A)).resolves.toBe(true);
    expect(values.has(key)).toBe(false);
  });

  it('migrates a legacy withdrawal by embedded owner without replaying it as foreign B', async () => {
    values.set(
      PENDING_LOCATION_CONSENT_STORAGE_KEY,
      JSON.stringify({
        userId: USER_A,
        shareLocation: false,
        purpose: LOCATION_CONSENT_PURPOSE,
        consentedAt: CONSENTED_AT_A,
      }),
    );

    await flushPendingLocationConsent(USER_B);

    expect(mockRpc).not.toHaveBeenCalled();
    expect(values.has(PENDING_LOCATION_CONSENT_STORAGE_KEY)).toBe(false);
    expect(pendingDecisionKeys(USER_A)).toHaveLength(1);
    await flushPendingLocationConsent(USER_A);
    expect(mockRpc).toHaveBeenCalledWith(
      'set_pragas_location_consent',
      expect.objectContaining({ p_share_location: false, p_observed_revision: null }),
    );
  });

  it('migrates the previous v2 owner slot to its immutable decision key', async () => {
    const legacyOwnerKey = pendingLocationConsentStorageKey(USER_A);
    values.set(
      legacyOwnerKey,
      JSON.stringify(pendingPayload(USER_A, false, CONSENTED_AT_A, DECISION_A, null)),
    );

    await flushPendingLocationConsent(USER_B);

    expect(values.has(legacyOwnerKey)).toBe(false);
    expect(values.has(pendingLocationConsentDecisionStorageKey(USER_A, DECISION_A))).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('purges a legacy grant without revision instead of silently rebasing it', async () => {
    values.set(
      PENDING_LOCATION_CONSENT_STORAGE_KEY,
      JSON.stringify({
        userId: USER_A,
        shareLocation: true,
        purpose: LOCATION_CONSENT_PURPOSE,
        consentedAt: CONSENTED_AT_A,
      }),
    );

    await expect(flushPendingLocationConsent(USER_A)).resolves.toBe(true);
    expect(values.has(PENDING_LOCATION_CONSENT_STORAGE_KEY)).toBe(false);
    expect(pendingDecisionKeys(USER_A)).toHaveLength(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('drops corrupt or foreign payloads from the current slot without touching B', async () => {
    const keyA = pendingLocationConsentDecisionStorageKey(USER_A, DECISION_A);
    const keyB = pendingLocationConsentDecisionStorageKey(USER_B, DECISION_B);
    values.set(keyA, '{corrupt');
    values.set(keyB, JSON.stringify(pendingPayload(USER_B, true, CONSENTED_AT_B)));
    await flushPendingLocationConsent(USER_A);
    expect(values.has(keyA)).toBe(false);
    expect(values.has(keyB)).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();

    values.set(keyA, JSON.stringify(pendingPayload(USER_B, false, CONSENTED_AT_A)));
    await flushPendingLocationConsent(USER_A);
    expect(values.has(keyA)).toBe(false);
    expect(values.has(keyB)).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('neutralizes a process-restarted stale grant without changing its durable revision', async () => {
    await enqueuePendingLocationConsent(USER_A, true, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_A, 0);
    const key = pendingDecisionKeys(USER_A)[0]!;
    const persisted = JSON.parse(values.get(key) ?? '{}');
    mockRpc.mockResolvedValueOnce({
      data: {
        applied: false,
        replayed: false,
        code: 'stale_grant',
        decision_id: persisted.decisionId,
        decision_revision: 1,
        current_revision: 1,
        current_share_location: false,
      },
      error: null,
    });

    await expect(flushPendingLocationConsent(USER_A)).resolves.toBe(true);
    expect(values.has(key)).toBe(false);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      'set_pragas_location_consent',
      expect.objectContaining({
        p_decision_id: persisted.decisionId,
        p_observed_revision: 0,
      }),
    );
    expect(mockMaybeSingle).not.toHaveBeenCalled();
    await expect(flushPendingLocationConsent(USER_A)).resolves.toBe(true);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('binds an explicit fresh grant to the strict server revision', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { location_consent_revision: 7 },
      error: null,
    });

    await setLocationConsent(USER_A, true, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_B);

    expect(mockRpc).toHaveBeenCalledWith(
      'set_pragas_location_consent',
      expect.objectContaining({ p_share_location: true, p_observed_revision: 7 }),
    );
  });

  it('clears a terminal stale grant but rejects the synchronous settings choice', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { location_consent_revision: 0 },
      error: null,
    });
    mockRpc.mockImplementationOnce(async (_name, args) => ({
      data: {
        applied: false,
        replayed: false,
        code: 'stale_grant',
        decision_id: args.p_decision_id,
        decision_revision: 1,
        current_revision: 1,
        current_share_location: false,
      },
      error: null,
    }));

    await expect(
      setLocationConsent(USER_A, true, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_B),
    ).rejects.toThrow('LOCATION_CONSENT_STALE_GRANT');
    expect(pendingDecisionKeys(USER_A)).toHaveLength(0);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc.mock.calls[0]?.[1]).toMatchObject({ p_observed_revision: 0 });
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
  });

  it('fails a revision read closed instead of defaulting a grant to revision zero', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });

    await expect(getLocationConsentRevision(USER_A)).rejects.toThrow(
      'LOCATION_CONSENT_REVISION_READ_FAILED',
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('marker-free cold boot preserves only current A and removes foreign or malformed slots', async () => {
    const keyA = pendingLocationConsentDecisionStorageKey(USER_A, DECISION_A);
    const keyB = pendingLocationConsentDecisionStorageKey(USER_B, DECISION_B);
    const malformedKey = `${PENDING_LOCATION_CONSENT_STORAGE_PREFIX}not-a-uuid`;
    values.set(keyA, JSON.stringify(pendingPayload(USER_A, false, CONSENTED_AT_A, DECISION_A)));
    values.set(keyB, JSON.stringify(pendingPayload(USER_B, false, CONSENTED_AT_B, DECISION_B)));
    values.set(malformedKey, '{corrupt');

    await preparePendingLocationConsentOwnerClaim(USER_A);

    expect(values.has(keyA)).toBe(true);
    expect(values.has(keyB)).toBe(false);
    expect(values.has(malformedKey)).toBe(false);
  });

  it('marker-free interactive B preserves B but never transfers pending consent from A', async () => {
    const keyA = pendingLocationConsentDecisionStorageKey(USER_A, DECISION_A);
    const keyB = pendingLocationConsentDecisionStorageKey(USER_B, DECISION_B);
    values.set(keyA, JSON.stringify(pendingPayload(USER_A, false, CONSENTED_AT_A, DECISION_A)));
    values.set(keyB, JSON.stringify(pendingPayload(USER_B, false, CONSENTED_AT_B, DECISION_B)));

    await preparePendingLocationConsentOwnerClaim(USER_B);

    expect(values.has(keyA)).toBe(false);
    expect(values.has(keyB)).toBe(true);
    expect(JSON.parse(values.get(keyB) ?? '{}')).toMatchObject({ userId: USER_B });
  });

  it('caps pending grants locally but always admits and prioritizes a withdrawal', async () => {
    for (let index = 0; index < 32; index += 1) {
      await expect(
        enqueuePendingLocationConsent(
          USER_A,
          true,
          LOCATION_CONSENT_PURPOSE,
          new Date(Date.parse(CONSENTED_AT_A) + index).toISOString(),
          0,
        ),
      ).resolves.toBe(true);
    }
    await expect(
      enqueuePendingLocationConsent(
        USER_A,
        true,
        LOCATION_CONSENT_PURPOSE,
        '2026-07-14T12:01:00.000Z',
        0,
      ),
    ).resolves.toBe(false);

    await expect(
      enqueuePendingLocationConsent(USER_A, false, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_B),
    ).resolves.toBe(true);
    expect(pendingDecisions(USER_A)).toHaveLength(1);
    expect(onlyPendingDecision(USER_A).shareLocation).toBe(false);
  });

  it('purges only the current owner queue', async () => {
    values.set(
      pendingLocationConsentDecisionStorageKey(USER_A, DECISION_A),
      JSON.stringify(pendingPayload(USER_A, true, CONSENTED_AT_A)),
    );
    values.set(
      pendingLocationConsentDecisionStorageKey(USER_B, DECISION_B),
      JSON.stringify(pendingPayload(USER_B, false, CONSENTED_AT_B)),
    );

    await clearPendingLocationConsent(USER_A);

    expect(pendingDecisionKeys(USER_A)).toHaveLength(0);
    expect(pendingDecisionKeys(USER_B)).toHaveLength(1);
  });

  it('rejects invalid owners without creating attacker-controlled storage keys', async () => {
    await expect(
      enqueuePendingLocationConsent('../foreign', true, LOCATION_CONSENT_PURPOSE, CONSENTED_AT_A),
    ).resolves.toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
