/**
 * voice-sdk — unit tests for transcribe() error contract + flag gating.
 *
 * Mocks `services/supabase` so the IA Hub call shape is exercised without
 * pulling in `react-native-url-polyfill/auto`. Recorder integration
 * (expo-audio native module) is exercised on-device only.
 */
import { isVoiceEnabled } from '../components/voiceFlag';

jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: 'test-jwt-token' } },
        error: null,
      }),
    },
  },
}));

// Defer import until after jest.mock setup
 
const { transcribe, VoiceRecordError } =
  require('../lib/voice-sdk') as typeof import('../lib/voice-sdk');

describe('voiceFlag.isVoiceEnabled', () => {
  const ORIGINAL = process.env.EXPO_PUBLIC_VOICE_ENABLED;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_VOICE_ENABLED;
    else process.env.EXPO_PUBLIC_VOICE_ENABLED = ORIGINAL;
  });

  it('returns false when env var is undefined (DEFAULT — ZERO-N compliance)', () => {
    delete process.env.EXPO_PUBLIC_VOICE_ENABLED;
    expect(isVoiceEnabled()).toBe(false);
  });

  it('returns false for any non-literal-"true" value', () => {
    process.env.EXPO_PUBLIC_VOICE_ENABLED = 'false';
    expect(isVoiceEnabled()).toBe(false);
    process.env.EXPO_PUBLIC_VOICE_ENABLED = '1';
    expect(isVoiceEnabled()).toBe(false);
    process.env.EXPO_PUBLIC_VOICE_ENABLED = 'TRUE';
    expect(isVoiceEnabled()).toBe(false);
    process.env.EXPO_PUBLIC_VOICE_ENABLED = '';
    expect(isVoiceEnabled()).toBe(false);
  });

  it('returns true only for the literal string "true"', () => {
    process.env.EXPO_PUBLIC_VOICE_ENABLED = 'true';
    expect(isVoiceEnabled()).toBe(true);
  });
});

describe('voice-sdk.transcribe', () => {
  const ORIGINAL_URL = process.env.EXPO_PUBLIC_IA_HUB_URL;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_IA_HUB_URL = 'https://iahub.test';
     
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    if (ORIGINAL_URL === undefined) delete process.env.EXPO_PUBLIC_IA_HUB_URL;
    else process.env.EXPO_PUBLIC_IA_HUB_URL = ORIGINAL_URL;
    jest.clearAllMocks();
  });

  it('throws iahub_unreachable when EXPO_PUBLIC_IA_HUB_URL is missing', async () => {
    delete process.env.EXPO_PUBLIC_IA_HUB_URL;
    await expect(transcribe('file:///tmp/x.m4a')).rejects.toMatchObject({
      code: 'iahub_unreachable',
    });
  });

  it('throws iahub_auth on 401', async () => {
     
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve(''),
    });
    await expect(transcribe('file:///tmp/x.m4a')).rejects.toMatchObject({
      code: 'iahub_auth',
    });
  });

  it('throws iahub_rate_limit on 429', async () => {
     
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: () => Promise.resolve(''),
    });
    await expect(transcribe('file:///tmp/x.m4a')).rejects.toMatchObject({
      code: 'iahub_rate_limit',
    });
  });

  it('throws iahub_unreachable on network failure', async () => {
     
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(transcribe('file:///tmp/x.m4a')).rejects.toMatchObject({
      code: 'iahub_unreachable',
    });
  });

  it('returns transcript on 200', async () => {
     
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          transcript: 'mancha amarela nas folhas da soja',
          language: 'pt',
          duration_ms: 2400,
          provider: 'openai',
          model: 'whisper-1',
          cost_usd: 0.0001,
        }),
    });
    const r = await transcribe('file:///tmp/x.m4a', { language: 'pt' });
    expect(r.transcript).toBe('mancha amarela nas folhas da soja');
    expect(r.language).toBe('pt');
  });

  it('throws iahub_unreachable on malformed response (missing transcript)', async () => {
     
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ language: 'pt' }),
    });
    await expect(transcribe('file:///tmp/x.m4a')).rejects.toMatchObject({
      code: 'iahub_unreachable',
    });
  });
});

describe('VoiceRecordError', () => {
  it('preserves the typed error code', () => {
    const err = new VoiceRecordError('permission_denied', 'no mic');
    expect(err.code).toBe('permission_denied');
    expect(err.name).toBe('VoiceRecordError');
    expect(err.message).toBe('no mic');
  });
});
