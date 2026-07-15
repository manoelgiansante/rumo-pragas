import {
  sendDiagnosis,
  fetchDiagnoses,
  fetchDiagnosisCount,
  deleteDiagnosis,
} from '../../services/diagnosis';

// --- Mocks ---

jest.mock('../../constants/config', () => ({
  Config: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  },
}));

jest.mock('../../types/diagnosis', () => ({
  parseNotes: jest.fn((notes: string | undefined) => {
    if (!notes) return undefined;
    try {
      return JSON.parse(notes);
    } catch {
      return undefined;
    }
  }),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
}));

const mockAssertAIConsent = jest.fn().mockResolvedValue(undefined);
const mockRevokeAIConsent = jest.fn().mockResolvedValue(undefined);
jest.mock('../../services/aiConsent', () => ({
  AI_CONSENT_VERSION: '2026-07-14.1',
  assertAIConsent: (...args: unknown[]) => mockAssertAIConsent(...args),
  revokeAIConsent: (...args: unknown[]) => mockRevokeAIConsent(...args),
}));

const mockHasLocationConsent = jest.fn().mockResolvedValue(true);
jest.mock('../../services/userPreferences', () => ({
  hasLocationConsent: (...args: unknown[]) => mockHasLocationConsent(...args),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

// --- Helpers ---

function makeBase64(sizeBytes: number): string {
  const chars = Math.ceil(sizeBytes * (4 / 3));
  return 'A'.repeat(chars);
}

function makeDiagnosisRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'diag-1',
    crop: 'soja',
    pest_name: 'Ferrugem',
    confidence: 0.92,
    notes: '{"message":"ok"}',
    created_at: '2026-03-20T10:00:00Z',
    ...overrides,
  };
}

// --- Tests ---

describe('sendDiagnosis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAssertAIConsent.mockResolvedValue(undefined);
    mockHasLocationConsent.mockResolvedValue(true);
  });

  it('throws when base64 image exceeds 5 MB', async () => {
    const bigImage = makeBase64(6 * 1024 * 1024);
    await expect(sendDiagnosis(bigImage, 'soja', null, null, 'token', 'user-1')).rejects.toThrow(
      /muito grande/,
    );
  });

  it('does not transmit a photo before versioned AI consent', async () => {
    mockAssertAIConsent.mockRejectedValueOnce(new Error('AI_CONSENT_REQUIRED'));
    await expect(
      sendDiagnosis(makeBase64(100), 'soja', null, null, 'token', 'user-1'),
    ).rejects.toThrow('AI_CONSENT_REQUIRED');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not throw for images under 5 MB', async () => {
    const smallImage = makeBase64(1 * 1024 * 1024);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify(makeDiagnosisRow()),
    });
    await expect(
      sendDiagnosis(smallImage, 'soja', null, null, 'token', 'user-1'),
    ).resolves.toBeDefined();
  });

  it('validates that the endpoint URL uses HTTPS', async () => {
    jest.resetModules();
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      getItem: jest.fn().mockResolvedValue(null),
      setItem: jest.fn().mockResolvedValue(undefined),
      removeItem: jest.fn().mockResolvedValue(undefined),
      multiRemove: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock('expo-localization', () => ({
      getLocales: () => [{ languageTag: 'pt-BR', languageCode: 'pt' }],
    }));
    jest.doMock('../../constants/config', () => ({
      Config: {
        SUPABASE_URL: 'http://insecure.example.com',
        SUPABASE_ANON_KEY: 'key',
      },
    }));
    jest.doMock('../../types/diagnosis', () => ({
      parseNotes: jest.fn((notes: string | undefined) => {
        if (!notes) return undefined;
        try {
          return JSON.parse(notes);
        } catch {
          return undefined;
        }
      }),
    }));

    const { sendDiagnosis: sendInsecure } = require('../../services/diagnosis');
    const smallImage = makeBase64(100);
    await expect(sendInsecure(smallImage, 'soja', null, null, 'token', 'user-1')).rejects.toThrow(
      /servidor inv|invalid/i,
    );
    jest.resetModules();
  });

  it('returns DiagnosisResult on success', async () => {
    const row = makeDiagnosisRow();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify(row),
    });

    const smallImage = makeBase64(100);
    const result = await sendDiagnosis(smallImage, 'soja', -23.5, -46.6, 'token', 'user-1');

    expect(result).toMatchObject({ id: 'diag-1', crop: 'soja' });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/functions/v1/diagnose-pragas');
    expect(url).not.toMatch(/\/functions\/v1\/diagnose(?:$|[?#])/);
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer token');
    expect(options.headers['X-Pragas-AI-Consent-Version']).toBe('2026-07-14.1');
    expect(options.headers['X-Pragas-AI-Consent-Purpose']).toBe('diagnosis');
  });

  it('never transmits coordinates while app-level location consent is withdrawn', async () => {
    mockHasLocationConsent.mockResolvedValueOnce(false);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify(makeDiagnosisRow()),
    });

    await sendDiagnosis(makeBase64(100), 'soja', -23.55052, -46.633308, 'token', 'user-1');

    const [, options] = mockFetch.mock.calls[0];
    expect(JSON.parse(options.body)).toMatchObject({ latitude: null, longitude: null });
  });

  it('maps backend consent precondition failures to a safe local message', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 428, json: async () => ({}) });

    await expect(
      sendDiagnosis(makeBase64(100), 'soja', null, null, 'token', 'user-1'),
    ).rejects.toThrow(/autorize|consent/i);
    expect(mockRevokeAIConsent).toHaveBeenCalledWith('user-1', 'diagnosis');
  });

  // FREE BUILD (2026-06-30) — fix/pragas-free-2026-06-30: the app ships 100%
  // FREE with UNLIMITED diagnoses, so a 403 must surface as a plain error and
  // NEVER a paywall/upgrade prompt ("limite de X, faça upgrade") or redirect.
  it('handles 403 as a plain error without a paywall/upgrade prompt', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ limit: 5, plan: 'free' }),
    });

    const smallImage = makeBase64(100);
    let caught: unknown;
    await sendDiagnosis(smallImage, 'soja', null, null, 'token', 'user-1').catch((e) => {
      caught = e;
    });

    expect(caught).toBeInstanceOf(Error);
    // No metered-limit / upgrade wording — just a plain permission error.
    expect((caught as Error).message).not.toMatch(/limite de/i);
    expect((caught as Error).message).not.toMatch(/upgrade|assinar|comprar/i);
  });

  it('handles 401 with sanitized message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'secret internal detail' }),
    });

    const smallImage = makeBase64(100);
    await expect(sendDiagnosis(smallImage, 'soja', null, null, 'token', 'user-1')).rejects.toThrow(
      /[Ss]ess[aã]o expirad/,
    );
  });

  it('handles 500 with sanitized message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const smallImage = makeBase64(100);
    await expect(sendDiagnosis(smallImage, 'soja', null, null, 'token', 'user-1')).rejects.toThrow(
      /servidor.*indispon|temporariamente/i,
    );
  });
});

describe('fetchDiagnoses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns array of diagnoses on success', async () => {
    const rows = [makeDiagnosisRow(), makeDiagnosisRow({ id: 'diag-2' })];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify(rows),
    });

    const result = await fetchDiagnoses('token', 'user-1');
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('id', 'diag-1');
    expect(result[1]).toHaveProperty('id', 'diag-2');
    const requestUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(requestUrl.searchParams.get('select')).toBe(
      'id,crop,pest_id,pest_name,confidence,notes,created_at',
    );
    expect(requestUrl.searchParams.get('select')).not.toMatch(/user_id|image_url|location_/);
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(fetchDiagnoses('token', 'user-1')).rejects.toThrow(/buscar diagn/i);
  });
});

describe('fetchDiagnosisCount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns count from content-range header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: {
        get: (name: string) => (name === 'content-range' ? '0-0/42' : null),
      },
    });

    const count = await fetchDiagnosisCount('token', 'user-1');
    expect(count).toBe(42);
  });

  it('returns 0 when content-range header is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
    });

    const count = await fetchDiagnosisCount('token', 'user-1');
    expect(count).toBe(0);
  });
});

describe('deleteDiagnosis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls correct endpoint with DELETE method', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await deleteDiagnosis('token', 'diag-abc');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(decodeURIComponent(url)).toContain('pragas_diagnoses?id=eq.diag-abc');
    expect(options.method).toBe('DELETE');
    expect(options.headers.Authorization).toBe('Bearer token');
  });

  it('throws on failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(deleteDiagnosis('token', 'diag-abc')).rejects.toThrow(/excluir diagn/i);
  });
});
