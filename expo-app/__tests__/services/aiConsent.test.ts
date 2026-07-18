import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AI_CONSENT_VERSION,
  AIConsentRequiredError,
  assertAIConsent,
  grantAIConsent,
  hasAIConsent,
  revokeAIConsent,
  revokeAIConsentEverywhere,
} from '../../services/aiConsent';

const mockMemory = new Map<string, string>();
const mockRpc = jest.fn();

jest.mock('../../services/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockMemory.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockMemory.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockMemory.delete(key);
    }),
  },
}));

beforeEach(() => {
  mockMemory.clear();
  jest.clearAllMocks();
  mockRpc.mockImplementation(async (name: string, args: { p_purpose: string }) => {
    if (name === 'grant_pragas_ai_consent') {
      return {
        data: {
          granted: true,
          purpose: args.p_purpose,
          version: AI_CONSENT_VERSION,
          accepted_at: '2026-07-14T00:00:00Z',
        },
        error: null,
      };
    }
    return {
      data: {
        revoked: true,
        purpose: args.p_purpose,
        revoked_at: '2026-07-14T00:00:00Z',
      },
      error: null,
    };
  });
});

describe('AI consent', () => {
  it('fails closed before the current version is accepted', async () => {
    await expect(assertAIConsent('user-1', 'diagnosis')).rejects.toBeInstanceOf(
      AIConsentRequiredError,
    );
  });

  it('persists consent separately for diagnosis and chat', async () => {
    await grantAIConsent('user-1', 'diagnosis');
    expect(mockRpc).toHaveBeenCalledWith('grant_pragas_ai_consent', {
      p_purpose: 'diagnosis',
      p_version: AI_CONSENT_VERSION,
    });
    expect(await hasAIConsent('user-1', 'diagnosis')).toBe(true);
    expect(await hasAIConsent('user-1', 'chat')).toBe(false);
    const write = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
    expect(JSON.parse(write[1])).toMatchObject({ version: AI_CONSENT_VERSION });
  });

  it('invalidates an older disclosure version', async () => {
    mockMemory.set(
      '@rumo_pragas_ai_consent:user-1',
      JSON.stringify({ version: 'old', acceptedAt: { diagnosis: new Date().toISOString() } }),
    );
    expect(await hasAIConsent('user-1', 'diagnosis')).toBe(false);
  });

  it('supports revoking one scope without revoking the other', async () => {
    await grantAIConsent('user-1', 'diagnosis');
    await grantAIConsent('user-1', 'chat');
    await revokeAIConsent('user-1', 'diagnosis');
    expect(await hasAIConsent('user-1', 'diagnosis')).toBe(false);
    expect(await hasAIConsent('user-1', 'chat')).toBe(true);
  });

  it('does not treat a failed persistence as consent', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await expect(grantAIConsent('user-1', 'chat')).rejects.toThrow('disk full');
    expect(await hasAIConsent('user-1', 'chat')).toBe(false);
  });

  it('does not persist consent when the server ledger rejects the grant', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'private database detail' } });
    await expect(grantAIConsent('user-1', 'chat')).rejects.toThrow('AI_CONSENT_GRANT_FAILED');
    expect(await hasAIConsent('user-1', 'chat')).toBe(false);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('revokes server first and only then blocks the local purpose', async () => {
    await grantAIConsent('user-1', 'diagnosis');
    await revokeAIConsentEverywhere('user-1', 'diagnosis');
    expect(mockRpc).toHaveBeenCalledWith('revoke_pragas_ai_consent', {
      p_purpose: 'diagnosis',
    });
    expect(await hasAIConsent('user-1', 'diagnosis')).toBe(false);
  });

  it('keeps local consent when server withdrawal fails', async () => {
    await grantAIConsent('user-1', 'chat');
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'db detail' } });
    await expect(revokeAIConsentEverywhere('user-1', 'chat')).rejects.toThrow(
      'AI_CONSENT_REVOCATION_FAILED',
    );
    expect(await hasAIConsent('user-1', 'chat')).toBe(true);
  });

  it('fails closed with a tombstone after a server-success/local partial failure', async () => {
    await grantAIConsent('user-1', 'diagnosis');
    (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await expect(revokeAIConsentEverywhere('user-1', 'diagnosis')).rejects.toThrow('disk full');
    expect(await hasAIConsent('user-1', 'diagnosis')).toBe(false);
  });
});
