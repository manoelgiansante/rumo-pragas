/**
 * IH-6 — IA Hub SDK wiring tests for the diagnosis flow.
 *
 * Covers:
 *   - feature flag OFF → legacy Supabase edge fn path is used (no SDK call);
 *   - feature flag ON  → SDK is called and the response is adapted to
 *     `DiagnosisResult`;
 *   - flag ON but no API key → silent fallback to legacy, with a breadcrumb;
 *   - adapter `adaptIAHubDiagnoseResponse` pinned for the result-screen
 *     contract (predictions, enrichment.chemical_treatment, top pest).
 */

// --- Module mocks --------------------------------------------------------

jest.mock('../../constants/config', () => ({
  Config: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  },
}));

jest.mock('../../services/userPreferences', () => ({
  hasLocationConsent: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../services/sentry-shim', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

// Mock the SDK before importing the service so the singleton picks it up.
const mockDiagnose = jest.fn();
jest.mock('@agrorumo/ia-hub-client', () => ({
  RumoIAHub: jest.fn().mockImplementation(() => ({
    diagnose: mockDiagnose,
  })),
}));

// Re-importable references so we can re-require the modules after toggling env.
const SERVICE_PATH = '../../services/diagnosis';
const IAHUB_PATH = '../../lib/ia-hub';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function smallBase64(): string {
  // Tiny payload — under the 5 MB validator.
  return 'A'.repeat(100);
}

function makeSdkResponse() {
  return {
    diagnosis: 'Ferrugem Asiatica da Soja',
    confidence: 0.91,
    candidates: [
      { label: 'Phakopsora pachyrhizi', confidence: 0.91 },
      { label: 'Cercospora kikuchii', confidence: 0.07 },
    ],
    recommendations: ['Aplicar fungicida triazol', 'Rotacionar culturas'],
    requestId: 'iahub_req_42',
  };
}

function makeLegacyResponse() {
  return {
    id: 'diag-legacy-1',
    user_id: 'user-1',
    crop: 'soja',
    pest_name: 'Ferrugem',
    confidence: 0.92,
    notes: '{"message":"ok"}',
    created_at: '2026-03-20T10:00:00Z',
  };
}

describe('IA Hub wiring (IH-6)', () => {
  // We mutate `process.env` in-place (never reassign `process.env = {...}`)
  // because `babel-preset-expo`'s inline-env-vars plugin rewrites
  // `process.env.EXPO_PUBLIC_*` reads in transformed modules to references
  // against the `process.env` object captured at module load. Reassigning
  // `process.env` would orphan those references and silently break our
  // test setup.
  beforeEach(() => {
    jest.resetModules();
    mockFetch.mockReset();
    mockDiagnose.mockReset();
    delete process.env.EXPO_PUBLIC_IA_HUB_API_KEY;
    delete process.env.EXPO_PUBLIC_IA_HUB_URL;
    delete process.env.EXPO_PUBLIC_IA_HUB_ENABLED;
  });

  afterAll(() => {
    delete process.env.EXPO_PUBLIC_IA_HUB_API_KEY;
    delete process.env.EXPO_PUBLIC_IA_HUB_URL;
    delete process.env.EXPO_PUBLIC_IA_HUB_ENABLED;
  });

  describe('feature flag OFF (default)', () => {
    it('uses the legacy Supabase edge function', async () => {
      // No IA Hub env → flag stays off → fetch is the only transport.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => makeLegacyResponse(),
      });

      const { sendDiagnosis } = require(SERVICE_PATH);
      const { __resetIAHubClientForTests } = require(IAHUB_PATH);
      __resetIAHubClientForTests();

      const result = await sendDiagnosis(smallBase64(), 'soja', null, null, 'token', 'user-1');

      expect(mockDiagnose).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/functions/v1/diagnose');
      expect(result.id).toBe('diag-legacy-1');
    });
  });

  describe('feature flag ON', () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_IA_HUB_API_KEY = 'test-iahub-key';
      process.env.EXPO_PUBLIC_IA_HUB_URL = 'https://iahub.example.com';
      process.env.EXPO_PUBLIC_IA_HUB_ENABLED = 'true';
    });

    it('routes the diagnose call through the IA Hub SDK', async () => {
      mockDiagnose.mockResolvedValueOnce(makeSdkResponse());

      const { sendDiagnosis } = require(SERVICE_PATH);
      const { __resetIAHubClientForTests } = require(IAHUB_PATH);
      __resetIAHubClientForTests();

      const result = await sendDiagnosis(smallBase64(), 'soja', null, null, 'token', 'user-1');

      // Legacy fetch must NOT be called when the SDK is in charge.
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockDiagnose).toHaveBeenCalledTimes(1);

      // Adapter contract: top candidate is surfaced as pest, recommendations
      // land on enrichment.chemical_treatment, parsedNotes is populated.
      expect(result.pest_id).toBe('Phakopsora pachyrhizi');
      expect(result.confidence).toBeCloseTo(0.91);
      expect(result.crop).toBe('soja');
      expect(result.user_id).toBe('user-1');
      expect(result.id).toBe('iahub_req_42');
      expect(result.parsedNotes?.enrichment?.chemical_treatment).toEqual([
        'Aplicar fungicida triazol',
        'Rotacionar culturas',
      ]);
      expect(result.parsedNotes?.predictions?.length).toBe(2);
    });

    it('falls back to legacy when API key is missing despite flag ON', async () => {
      delete process.env.EXPO_PUBLIC_IA_HUB_API_KEY;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => makeLegacyResponse(),
      });

      const { sendDiagnosis } = require(SERVICE_PATH);
      const { __resetIAHubClientForTests } = require(IAHUB_PATH);
      __resetIAHubClientForTests();

      const result = await sendDiagnosis(smallBase64(), 'soja', null, null, 'token', 'user-1');

      expect(mockDiagnose).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('diag-legacy-1');
    });

    it('translates SDK errors into i18n user-facing messages', async () => {
      const rateLimit: Error & { name: string } = new Error('limited');
      rateLimit.name = 'RumoIARateLimitError';
      mockDiagnose.mockRejectedValueOnce(rateLimit);

      const { sendDiagnosis } = require(SERVICE_PATH);
      const { __resetIAHubClientForTests } = require(IAHUB_PATH);
      __resetIAHubClientForTests();

      await expect(
        sendDiagnosis(smallBase64(), 'soja', null, null, 'token', 'user-1'),
      ).rejects.toThrow(/muita|too many|requisi|tentativas/i);
    });
  });

  describe('adapter (pure)', () => {
    it('maps SDK response onto DiagnosisResult shape', () => {
      const { __internal } = require(SERVICE_PATH);
      const out = __internal.adaptIAHubDiagnoseResponse(makeSdkResponse(), {
        cropType: 'soja',
        userId: 'user-9',
        latitude: -23.5,
        longitude: -46.6,
      });

      expect(out.crop).toBe('soja');
      expect(out.location_lat).toBe(-23.5);
      expect(out.location_lng).toBe(-46.6);
      expect(out.pest_name).toBe('Phakopsora pachyrhizi');
      expect(out.confidence).toBe(0.91);
      expect(out.parsedNotes?.predictions?.[0].confidence).toBe(0.91);
    });

    it('survives an empty candidates list', () => {
      const { __internal } = require(SERVICE_PATH);
      const out = __internal.adaptIAHubDiagnoseResponse(
        { diagnosis: 'Saudavel', confidence: 0.99, candidates: [] },
        { cropType: 'milho', userId: 'u', latitude: null, longitude: null },
      );
      expect(out.pest_name).toBe('Saudavel');
      expect(out.parsedNotes?.predictions).toEqual([]);
    });
  });
});
