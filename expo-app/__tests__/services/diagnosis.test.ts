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
    user_id: 'user-1',
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
  });

  it('throws when base64 image exceeds 5 MB', async () => {
    const bigImage = makeBase64(6 * 1024 * 1024);
    await expect(sendDiagnosis(bigImage, 'soja', null, null, 'token')).rejects.toThrow(
      /muito grande/,
    );
  });

  it('does not throw for images under 5 MB', async () => {
    const smallImage = makeBase64(1 * 1024 * 1024);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeDiagnosisRow(),
    });
    await expect(sendDiagnosis(smallImage, 'soja', null, null, 'token')).resolves.toBeDefined();
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
    await expect(sendInsecure(smallImage, 'soja', null, null, 'token')).rejects.toThrow(
      /servidor inv|invalid/i,
    );
    jest.resetModules();
  });

  it('returns DiagnosisResult on success', async () => {
    const row = makeDiagnosisRow();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => row,
    });

    const smallImage = makeBase64(100);
    const result = await sendDiagnosis(smallImage, 'soja', -23.5, -46.6, 'token');

    expect(result).toMatchObject({ id: 'diag-1', crop: 'soja' });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/functions/v1/diagnose');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer token');
  });

  it('handles 403 with subscription limit details', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ limit: 5, plan: 'free' }),
    });

    const smallImage = makeBase64(100);
    await expect(sendDiagnosis(smallImage, 'soja', null, null, 'token')).rejects.toThrow(
      /limite de 5/,
    );
  });

  it('handles 401 with sanitized message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'secret internal detail' }),
    });

    const smallImage = makeBase64(100);
    await expect(sendDiagnosis(smallImage, 'soja', null, null, 'token')).rejects.toThrow(
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
    await expect(sendDiagnosis(smallImage, 'soja', null, null, 'token')).rejects.toThrow(
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
      json: async () => rows,
    });

    const result = await fetchDiagnoses('token', 'user-1');
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('id', 'diag-1');
    expect(result[1]).toHaveProperty('id', 'diag-2');
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
    expect(url).toContain('pragas_diagnoses?id=eq.diag-abc');
    expect(options.method).toBe('DELETE');
    expect(options.headers.Authorization).toBe('Bearer token');
  });

  it('throws on failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(deleteDiagnosis('token', 'diag-abc')).rejects.toThrow(/excluir diagn/i);
  });
});
