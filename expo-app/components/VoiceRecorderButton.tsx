/**
 * VoiceRecorderButton — STUB component, gated behind EXPO_PUBLIC_VOICE_ENABLED.
 *
 * Why this exists (2026-05-23):
 *   The IA Hub voice endpoints (PR #18) are still OPEN — wiring them up now would
 *   be a ghost ship per ZERO-P. This component ships the UI surface only,
 *   feature-flagged to OFF by default, so the build is ready to flip ON the
 *   minute the IA Hub deploy + 48h soak completes.
 *
 * Behavior:
 *   - When EXPO_PUBLIC_VOICE_ENABLED !== 'true' → returns null (zero render impact).
 *   - When ON → hold-to-record: starts expo-audio recorder on pressIn, stops on
 *     pressOut, shows a "Voice em ativação" Alert with the local URI + duration.
 *   - NO network call. Upload is a commented stub waiting on the IA Hub endpoint.
 *
 * Activation procedure:
 *   1. Merge IA Hub PR #18 (voice endpoints) to main.
 *   2. Deploy IA Hub web (rumo-ia-hub) + 48h Sentry soak (ZERO-P).
 *   3. Set EXPO_PUBLIC_VOICE_ENABLED=true in EAS env (--visibility plaintext, ZERO-L).
 *   4. Flip the `uploadAudio` stub below to POST to `/api/voice/transcribe` (or
 *      whatever endpoint the IA Hub exposes).
 *   5. EAS local rebuild + TestFlight + Play Internal smoke (ZERO-P).
 *
 * Tests: __tests__/components/VoiceRecorderButton.test.tsx
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

// Re-export so call sites can still `import { isVoiceEnabled } from '../components/VoiceRecorderButton'`.
export { isVoiceEnabled };

interface VoiceRecorderButtonProps {
  /**
   * Optional context tag (e.g. 'diagnosis_camera', 'consulta_sintomas') passed
   * to the future upload payload. Wired now so we don't rebuild later.
   */
  context?: string;
  /**
   * Optional callback fired after a successful local recording. The future
   * upload step will live here. Receives { uri, durationMs }.
   */
  onRecorded?: (result: { uri: string; durationMs: number }) => void;
  style?: ViewStyle;
  testID?: string;
}

export function VoiceRecorderButton({
  context = 'unknown',
  onRecorded,
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
  context,
  onRecorded,
  style,
  testID,
}: Required<Pick<VoiceRecorderButtonProps, 'context'>> &
  Omit<VoiceRecorderButtonProps, 'context'>) {
  const [isRecording, setIsRecording] = useState(false);
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

      // STUB: when IA Hub voice endpoint is live, replace this Alert with:
      //   await fetch(`${IA_HUB_URL}/api/voice/transcribe`, { method: 'POST', body: formData })
      //   passing { uri, context, durationMs }.
      Alert.alert(
        'Voice em ativação',
        `Áudio capturado localmente (${Math.round(durationMs / 100) / 10}s).\n\nContexto: ${context}\n\nUpload para IA Hub virá em breve.`,
      );

      if (uri && onRecorded) {
        onRecorded({ uri, durationMs });
      }
    } catch (err) {
      if (__DEV__) {
         
        console.warn('[VoiceRecorderButton] stopRecording failed:', err);
      }
      setIsRecording(false);
    }
  }, [context, isRecording, onRecorded, recorder]);

  return (
    <Pressable
      testID={testID ?? 'voice-recorder-button'}
      accessibilityRole="button"
      accessibilityLabel={isRecording ? 'Gravando — solte para parar' : 'Segure para gravar voz'}
      accessibilityState={{ busy: isRecording }}
      onPressIn={startRecording}
      onPressOut={stopRecording}
      style={[styles.button, isRecording && styles.buttonActive, style]}
    >
      <View style={styles.row}>
        <Ionicons
          name={isRecording ? 'radio-button-on' : 'mic'}
          size={22}
          color={isRecording ? Colors.coral : Colors.accent}
        />
        <Text style={styles.label}>{isRecording ? 'Gravando…' : 'Segure para gravar'}</Text>
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
