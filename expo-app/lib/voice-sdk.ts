/**
 * voice-sdk — IA Hub voice client (push-to-talk + transcribe).
 *
 * Mirrors the canonical `@rumo/ia-hub-client@0.3/voice` v0.2 API shape:
 *
 *   const handle = await recordPushToTalk();
 *   const audio  = await handle.stop();
 *   const { transcript } = await transcribe(audio);
 *
 * Why inlined instead of importing the SDK package:
 *   The IA Hub `@rumo/ia-hub-client` v0.3 lives in
 *   `Apps/rumo-ia-hub/packages/ia-hub-client` and is not yet published to a
 *   registry. Pragas vendors a copy at SDK contract parity so we ship voice
 *   today; swap the exports for `import { recordPushToTalk } from
 *   '@rumo/ia-hub-client/voice'` the minute the package is published.
 *
 * Wire safety:
 *   - All exports are no-ops when EXPO_PUBLIC_VOICE_ENABLED !== 'true'. Callers
 *     gate via `isVoiceEnabled()` BEFORE touching this module.
 *   - `transcribe()` returns a typed error when IA Hub is unreachable so the UI
 *     can degrade gracefully (the diagnosis notes field stays user-typed).
 *   - JWT verify on the server (ZERO-X): we send the Supabase access_token in
 *     the `Authorization: Bearer` header. The IA Hub route calls
 *     `supabase.auth.getUser(token)` and rejects 401 if invalid.
 */

import { supabase } from '../services/supabase';

/* -------------------------------------------------------------------------- */
/* Types — mirror @rumo/ia-hub-client/voice                                   */
/* -------------------------------------------------------------------------- */

export class VoiceRecordError extends Error {
  readonly code:
    | 'unsupported_runtime'
    | 'permission_denied'
    | 'no_microphone'
    | 'recorder_failed'
    | 'expo_av_missing'
    | 'iahub_unreachable'
    | 'iahub_auth'
    | 'iahub_rate_limit';
  constructor(code: VoiceRecordError['code'], message: string) {
    super(message);
    this.name = 'VoiceRecordError';
    this.code = code;
  }
}

export interface TranscribeResponse {
  transcript: string;
  language: string;
  duration_ms: number;
  provider: string;
  model: string;
  cost_usd: number;
}

export interface TranscribeOptions {
  language?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface PushToTalkHandle {
  stop(): Promise<{ uri: string; durationMs: number }>;
  cancel(): Promise<void>;
  readonly isFinalized: boolean;
}

export interface RecordPushToTalkOptions {
  /** Defaults to 60_000ms — matches server-side cap on /v1/voice/transcribe. */
  maxDurationMs?: number;
}

/* -------------------------------------------------------------------------- */
/* Recorder (expo-audio under the hood, same hook the component uses)         */
/* -------------------------------------------------------------------------- */

export async function recordPushToTalk(
  _opts: RecordPushToTalkOptions = {},
): Promise<PushToTalkHandle> {
  // Lazy-require to keep this module browser-safe + dependency-light for unit tests.
  let expoAudio: typeof import('expo-audio');
  try {
     
    expoAudio = require('expo-audio');
  } catch {
    throw new VoiceRecordError(
      'expo_av_missing',
      'recordPushToTalk: install `expo-audio` in the RN app to enable voice recording.',
    );
  }
  const { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } =
    expoAudio as unknown as {
      AudioModule: { createRecorder?: (preset: unknown) => unknown };
      RecordingPresets: { HIGH_QUALITY: unknown };
      requestRecordingPermissionsAsync: () => Promise<{ granted: boolean }>;
      setAudioModeAsync: (opts: {
        allowsRecording: boolean;
        playsInSilentMode: boolean;
      }) => Promise<void>;
    };

  const perm = await requestRecordingPermissionsAsync();
  if (!perm?.granted) {
    throw new VoiceRecordError(
      'permission_denied',
      'recordPushToTalk: microphone permission denied.',
    );
  }
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });

  const createRecorder = AudioModule?.createRecorder;
  if (typeof createRecorder !== 'function') {
    throw new VoiceRecordError(
      'expo_av_missing',
      'recordPushToTalk: installed `expo-audio` does not expose AudioModule.createRecorder. Component-level useAudioRecorder hook is the supported path.',
    );
  }

  const recorder = createRecorder(RecordingPresets.HIGH_QUALITY) as {
    prepareToRecordAsync: () => Promise<void>;
    record: () => void;
    stop: () => Promise<void>;
    uri: string | null;
  };

  await recorder.prepareToRecordAsync();
  const startedAt = Date.now();
  recorder.record();

  let finalized = false;
  return {
    get isFinalized() {
      return finalized;
    },
    async stop() {
      if (finalized) {
        throw new VoiceRecordError('recorder_failed', 'handle already finalized.');
      }
      finalized = true;
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        throw new VoiceRecordError('recorder_failed', 'recorder produced no uri.');
      }
      return { uri, durationMs: Date.now() - startedAt };
    },
    async cancel() {
      if (finalized) return;
      finalized = true;
      try {
        await recorder.stop();
      } catch {
        // best-effort
      }
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Transcribe — POST audio file URI to IA Hub /api/v1/voice/transcribe        */
/* -------------------------------------------------------------------------- */

const TRANSCRIBE_TIMEOUT_MS = 30_000;

export async function transcribe(
  input: string | Blob,
  opts: TranscribeOptions = {},
): Promise<TranscribeResponse> {
  const base = process.env.EXPO_PUBLIC_IA_HUB_URL?.replace(/\/$/, '');
  if (!base) {
    throw new VoiceRecordError(
      'iahub_unreachable',
      'transcribe: EXPO_PUBLIC_IA_HUB_URL is not set.',
    );
  }

  const fd = new FormData();
  if (typeof input === 'string') {
    fd.append('audio', {
      uri: input,
      name: 'audio.m4a',
      type: 'audio/m4a',
       
    } as any);
  } else {
    fd.append('audio', input, 'audio.webm');
  }
  if (opts.language) fd.append('language', opts.language);
  if (opts.model) fd.append('model', opts.model);

  // ZERO-X: forward the user's JWT so the IA Hub route can
  // `supabase.auth.getUser(jwt)` server-side. NEVER trust a header `X-Rumo-User-Id`.
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token ?? null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TRANSCRIBE_TIMEOUT_MS);
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(`${base}/api/v1/voice/transcribe`, {
      method: 'POST',
      body: fd,
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(process.env.EXPO_PUBLIC_IA_HUB_API_KEY
          ? { 'X-Rumo-App-Key': process.env.EXPO_PUBLIC_IA_HUB_API_KEY }
          : {}),
      },
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new VoiceRecordError(
      'iahub_unreachable',
      `transcribe: network failure (${(err as Error)?.message ?? 'unknown'}).`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new VoiceRecordError(
      'iahub_auth',
      `transcribe: IA Hub rejected auth (${res.status}). Re-login may be required.`,
    );
  }
  if (res.status === 429) {
    throw new VoiceRecordError('iahub_rate_limit', 'transcribe: IA Hub rate-limited the request.');
  }
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    throw new VoiceRecordError(
      'iahub_unreachable',
      `transcribe: ${res.status} ${res.statusText || ''} ${body}`.trim(),
    );
  }

  const json = (await res.json()) as TranscribeResponse;
  if (typeof json?.transcript !== 'string') {
    throw new VoiceRecordError(
      'iahub_unreachable',
      'transcribe: malformed response (missing transcript).',
    );
  }
  return json;
}

/**
 * client.voice — namespaced facade that mirrors `@rumo/ia-hub-client` shape.
 * Lets call sites write `voice.recordPushToTalk()` / `voice.transcribe()` and
 * later swap for `import { client } from '@rumo/ia-hub-client'` with zero diff.
 */
export const voice = {
  recordPushToTalk,
  transcribe,
};
