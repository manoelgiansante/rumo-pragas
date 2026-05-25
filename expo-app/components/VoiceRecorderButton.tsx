/**
 * VoiceRecorderButton — push-to-talk recorder, gated behind EXPO_PUBLIC_VOICE_ENABLED.
 *
 * Wave AA5 voice integration 2026-05-24 (retry of Y12):
 *   Upgrades the prior STUB (which just Alert-ed the local URI) to wire the
 *   real IA Hub voice contract through `lib/voice-sdk.ts`. On release of the
 *   press, the recorded audio file URI is POSTed to `/api/v1/voice/transcribe`;
 *   the resolved transcript is handed to the caller via `onTranscribed`, which
 *   typically appends it to a notes / description field in the diagnosis flow.
 *
 * Behavior:
 *   - When EXPO_PUBLIC_VOICE_ENABLED !== 'true' → returns null (zero render impact).
 *   - When ON → hold-to-record: starts expo-audio recorder on pressIn, stops on
 *     pressOut, transcribes via IA Hub, then calls `onTranscribed(transcript)`.
 *   - Errors (no mic, permission denied, IA Hub unreachable / 401 / 429) degrade
 *     gracefully — the user keeps the typed form value; an Alert explains what
 *     happened so they can retry.
 *
 * Activation procedure (ZERO-P Ship Verification):
 *   1. IA Hub voice endpoints deployed + 48h Sentry soak GREEN.
 *   2. `eas env:create --visibility plaintext` (ZERO-L) for:
 *        EXPO_PUBLIC_VOICE_ENABLED=true
 *        EXPO_PUBLIC_IA_HUB_URL=https://iahub.agrorumo.com
 *        EXPO_PUBLIC_IA_HUB_API_KEY=<pragas-scoped token>
 *   3. EAS local rebuild + TestFlight + Play Internal smoke per app.
 *
 * Tests: __tests__/voice-sdk.test.ts + __tests__/components/VoiceRecorderButton.test.tsx
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { Colors, BorderRadius, Spacing, FontSize } from '../constants/theme';
import { isVoiceEnabled } from './voiceFlag';
import { transcribe, VoiceRecordError } from '../lib/voice-sdk';

// Re-export so call sites can still `import { isVoiceEnabled } from '../components/VoiceRecorderButton'`.
export { isVoiceEnabled };

interface VoiceRecorderButtonProps {
  /**
   * Optional context tag (e.g. 'diagnosis_camera', 'diagnosis_notes').
   */
  context?: string;
  /**
   * Optional callback fired after a successful LOCAL recording. Receives
   * { uri, durationMs }. Useful for analytics or local persistence.
   */
  onRecorded?: (result: { uri: string; durationMs: number }) => void;
  /**
   * Required for SDK voice integration: receives the transcribed text. The
   * caller typically appends/prefills a notes / description field.
   */
  onTranscribed?: (transcript: string) => void;
  /** Optional override; defaults to 'pt'. */
  language?: string;
  style?: ViewStyle;
  testID?: string;
}

export function VoiceRecorderButton({
  context = 'unknown',
  onRecorded,
  onTranscribed,
  language = 'pt',
  style,
  testID,
}: VoiceRecorderButtonProps) {
  // Gate FIRST — zero impact on prod render tree when flag is off.
  // CRITICAL: this early-return is BEFORE any hook call. The Impl below uses
  // useAudioRecorder which would otherwise pull native modules on every mount.
  if (!isVoiceEnabled()) {
    return null;
  }

  return (
    <VoiceRecorderButtonImpl
      context={context}
      onRecorded={onRecorded}
      onTranscribed={onTranscribed}
      language={language}
      style={style}
      testID={testID}
    />
  );
}

/**
 * Real implementation isolated so the expo-audio hook is only mounted when the
 * flag is ON. Avoids pulling native module init paths on cold start in prod.
 */
function VoiceRecorderButtonImpl({
  context: _context,
  onRecorded,
  onTranscribed,
  language,
  style,
  testID,
}: Required<Pick<VoiceRecorderButtonProps, 'context'>> &
  Omit<VoiceRecorderButtonProps, 'context'>) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const recordStartRef = useRef<number>(0);

  // SDK 55 expo-audio: hook-based recorder. Returns a stable AudioRecorder instance.
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const status = await requestRecordingPermissionsAsync();
        if (!mounted) return;
        setPermissionGranted(status.granted);
        if (status.granted) {
          await setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: true,
          });
        }
      } catch (err) {
        if (__DEV__) {
           
          console.warn('[VoiceRecorderButton] expo-audio init failed:', err);
        }
        if (mounted) setPermissionGranted(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (permissionGranted !== true) {
      Alert.alert('Microfone', 'Permissão de microfone é necessária para gravar.');
      return;
    }
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordStartRef.current = Date.now();
      setIsRecording(true);
    } catch (err) {
      if (__DEV__) {
         
        console.warn('[VoiceRecorderButton] startRecording failed:', err);
      }
    }
  }, [permissionGranted, recorder]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) return;
    try {
      await recorder.stop();
      const durationMs = Date.now() - recordStartRef.current;
      const uri = recorder.uri ?? null;
      setIsRecording(false);

      if (uri && onRecorded) {
        onRecorded({ uri, durationMs });
      }

      // Empty recordings (button tapped, not held) — skip transcribe.
      if (!uri || durationMs < 350) {
        return;
      }

      if (onTranscribed) {
        setIsTranscribing(true);
        try {
          const result = await transcribe(uri, { language });
          const text = (result.transcript ?? '').trim();
          if (text.length === 0) {
            Alert.alert(
              'Áudio sem fala detectada',
              'Não capturei texto reconhecível. Tente novamente segurando o botão e falando próximo ao microfone.',
            );
          } else {
            onTranscribed(text);
          }
        } catch (err) {
          const code = err instanceof VoiceRecordError ? err.code : 'recorder_failed';
          if (__DEV__) {
             
            console.warn(`[VoiceRecorderButton] transcribe failed (${code}):`, err);
          }
          const message =
            code === 'iahub_auth'
              ? 'Sessão expirada. Faça login novamente para usar a voz.'
              : code === 'iahub_rate_limit'
                ? 'Muitas gravações em sequência. Aguarde alguns segundos e tente de novo.'
                : 'Não foi possível transcrever no momento. Digite a observação manualmente — o diagnóstico segue normal.';
          Alert.alert('Transcrição indisponível', message);
        } finally {
          setIsTranscribing(false);
        }
      }
    } catch (err) {
      if (__DEV__) {
         
        console.warn('[VoiceRecorderButton] stopRecording failed:', err);
      }
      setIsRecording(false);
      setIsTranscribing(false);
    }
  }, [isRecording, language, onRecorded, onTranscribed, recorder]);

  return (
    <Pressable
      testID={testID ?? 'voice-recorder-button'}
      accessibilityRole="button"
      accessibilityLabel={
        isTranscribing
          ? 'Transcrevendo áudio'
          : isRecording
            ? 'Gravando — solte para parar'
            : 'Segure para gravar voz'
      }
      accessibilityState={{ busy: isRecording || isTranscribing, disabled: isTranscribing }}
      disabled={isTranscribing}
      onPressIn={startRecording}
      onPressOut={stopRecording}
      style={[
        styles.button,
        isRecording && styles.buttonActive,
        isTranscribing && styles.buttonBusy,
        style,
      ]}
    >
      <View style={styles.row}>
        <Ionicons
          name={isTranscribing ? 'hourglass' : isRecording ? 'radio-button-on' : 'mic'}
          size={22}
          color={isTranscribing ? Colors.systemGray : isRecording ? Colors.coral : Colors.accent}
        />
        <Text style={styles.label}>
          {isTranscribing ? 'Transcrevendo…' : isRecording ? 'Gravando…' : 'Segure para gravar'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  buttonActive: {
    borderColor: Colors.coral,
    backgroundColor: '#FFF5F0',
  },
  buttonBusy: {
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: FontSize.subheadline ?? 15,
    color: Colors.text,
    fontWeight: '600',
  },
});

export default VoiceRecorderButton;
