/**
 * voiceFlag — single source of truth for the voice UI feature flag.
 *
 * Lives in its own RN-free module so unit tests can import it without
 * dragging in `react-native`, `@expo/vector-icons`, or theme constants.
 *
 * The flag MUST be the literal string 'true' to enable. Anything else
 * (undefined, 'false', '1', 'TRUE', empty) keeps the UI hidden.
 *
 * @returns boolean — true iff EXPO_PUBLIC_VOICE_ENABLED === 'true'
 */
export function isVoiceEnabled(): boolean {
  return process.env.EXPO_PUBLIC_VOICE_ENABLED === 'true';
}
