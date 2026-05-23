/**
 * VoiceRecorderButton — flag gate tests.
 *
 * The component MUST render null when EXPO_PUBLIC_VOICE_ENABLED is anything
 * other than the literal string 'true'. That is the entire safety contract
 * shipped in this PR; the recording path itself is exercised manually until
 * IA Hub PR #18 lands.
 */

import React from 'react';
import { render } from '@testing-library/react-native';

// expo-audio is required by the component when the flag is ON; we mock the
// SDK 55 hook-based API so jest doesn't try to resolve the native module.
jest.mock('expo-audio', () => ({
  useAudioRecorder: () => ({
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    record: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
    uri: 'file:///tmp/mock.m4a',
  }),
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

import { VoiceRecorderButton, isVoiceEnabled } from '../../components/VoiceRecorderButton';

describe('VoiceRecorderButton — feature flag gate', () => {
  const ORIGINAL_ENV = process.env.EXPO_PUBLIC_VOICE_ENABLED;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.EXPO_PUBLIC_VOICE_ENABLED;
    } else {
      process.env.EXPO_PUBLIC_VOICE_ENABLED = ORIGINAL_ENV;
    }
  });

  it('returns null (no UI) when EXPO_PUBLIC_VOICE_ENABLED is undefined', () => {
    delete process.env.EXPO_PUBLIC_VOICE_ENABLED;
    expect(isVoiceEnabled()).toBe(false);
    const { queryByTestId } = render(<VoiceRecorderButton testID="vrb" />);
    expect(queryByTestId('vrb')).toBeNull();
  });

  it('returns null when EXPO_PUBLIC_VOICE_ENABLED is the string "false"', () => {
    process.env.EXPO_PUBLIC_VOICE_ENABLED = 'false';
    expect(isVoiceEnabled()).toBe(false);
    const { queryByTestId } = render(<VoiceRecorderButton testID="vrb" />);
    expect(queryByTestId('vrb')).toBeNull();
  });

  it('returns null on truthy-but-not-"true" values (defensive)', () => {
    process.env.EXPO_PUBLIC_VOICE_ENABLED = '1';
    expect(isVoiceEnabled()).toBe(false);
    const { queryByTestId } = render(<VoiceRecorderButton testID="vrb" />);
    expect(queryByTestId('vrb')).toBeNull();
  });

  it('renders the button when EXPO_PUBLIC_VOICE_ENABLED === "true"', () => {
    process.env.EXPO_PUBLIC_VOICE_ENABLED = 'true';
    expect(isVoiceEnabled()).toBe(true);
    const { queryByTestId } = render(<VoiceRecorderButton testID="vrb" />);
    expect(queryByTestId('vrb')).not.toBeNull();
  });
});
