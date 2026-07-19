/**
 * Decision-flow tests for the SOFT photo-quality gate in the capture screen:
 * warning shown pre-upload, "Tirar outra" (default) keeps the user on the
 * screen, "Usar assim mesmo" always proceeds (never a hard block), telemetry
 * records both the warning and the choice.
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { AlertButton } from 'react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockSetImage = jest.fn();
const mockShowAlert = jest.fn();
const mockManipulateAsync = jest.fn();
const mockLaunchImageLibraryAsync = jest.fn();
const mockLaunchCameraAsync = jest.fn();
const mockRequestCameraPermissionsAsync = jest.fn();
const mockTrackWarningShown = jest.fn();
const mockTrackChoice = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: (...args: unknown[]) => mockBack(...args),
  },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'pt-BR' } }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native');
  return { LinearGradient: View };
});
jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-linking', () => ({ openSettings: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibraryAsync(...args),
  launchCameraAsync: (...args: unknown[]) => mockLaunchCameraAsync(...args),
  requestCameraPermissionsAsync: (...args: unknown[]) => mockRequestCameraPermissionsAsync(...args),
}));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: (...args: unknown[]) => mockManipulateAsync(...args),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));
jest.mock('../../services/dialog', () => ({
  showAlert: (...args: unknown[]) => mockShowAlert(...args),
}));
jest.mock('../../services/sentry-shim', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));
jest.mock('../../services/analytics', () => ({
  trackPhotoQualityWarningShown: (...args: unknown[]) => mockTrackWarningShown(...args),
  trackPhotoQualityChoice: (...args: unknown[]) => mockTrackChoice(...args),
}));
jest.mock('../../contexts/DiagnosisContext', () => ({
  useDiagnosis: () => ({ setImage: mockSetImage }),
}));

import CameraScreen from '../../app/diagnosis/camera';

/** base64 length that decodes to roughly `bytes` bytes. */
const base64LengthForBytes = (bytes: number): number => Math.ceil((bytes * 4) / 3);

const pickerResult = (asset: { width: number; height: number }) => ({
  canceled: false,
  assets: [{ uri: 'file://asset.jpg', width: asset.width, height: asset.height }],
});

const manipulated = (width: number, height: number, base64Length: number) => ({
  uri: 'file://compressed.jpg',
  width,
  height,
  base64: 'a'.repeat(base64Length),
});

const lastAlertButtons = (): AlertButton[] => {
  const call = mockShowAlert.mock.calls.at(-1);
  return (call?.[2] ?? []) as AlertButton[];
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('diagnosis camera — soft photo quality gate', () => {
  it('good photo: no warning, goes straight to crop-select', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValue(pickerResult({ width: 4000, height: 3000 }));
    // ~0.2 B/px on 1024×768 → healthy.
    mockManipulateAsync.mockResolvedValue(
      manipulated(1024, 768, base64LengthForBytes(Math.floor(1024 * 768 * 0.2))),
    );

    const { getByTestId } = render(<CameraScreen />);
    fireEvent.press(getByTestId('diagnosis-camera-gallery'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/diagnosis/crop-select'));
    expect(mockShowAlert).not.toHaveBeenCalled();
    expect(mockTrackWarningShown).not.toHaveBeenCalled();
    expect(mockSetImage).toHaveBeenCalledWith('file://compressed.jpg', expect.any(String));
  });

  it('low-res photo: warning shown with retake (default/cancel) + use-anyway options', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValue(pickerResult({ width: 320, height: 240 }));
    mockManipulateAsync.mockResolvedValue(
      manipulated(320, 240, base64LengthForBytes(Math.floor(320 * 240 * 0.2))),
    );

    const { getByTestId } = render(<CameraScreen />);
    fireEvent.press(getByTestId('diagnosis-camera-gallery'));

    await waitFor(() => expect(mockShowAlert).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockTrackWarningShown).toHaveBeenCalledWith(['low_resolution'], 'gallery');

    const [title, message] = mockShowAlert.mock.calls.at(-1)!;
    expect(title).toBe('diagnosis.photoQualityTitle');
    expect(message).toContain('diagnosis.photoQualityLowRes');

    const buttons = lastAlertButtons();
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toMatchObject({ text: 'diagnosis.photoQualityRetake', style: 'cancel' });
    expect(buttons[1]).toMatchObject({ text: 'diagnosis.photoQualityUseAnyway' });
  });

  it('choosing "Tirar outra" stays on the screen and records the choice', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValue(pickerResult({ width: 320, height: 240 }));
    mockManipulateAsync.mockResolvedValue(
      manipulated(320, 240, base64LengthForBytes(Math.floor(320 * 240 * 0.2))),
    );

    const { getByTestId } = render(<CameraScreen />);
    fireEvent.press(getByTestId('diagnosis-camera-gallery'));
    await waitFor(() => expect(mockShowAlert).toHaveBeenCalled());

    lastAlertButtons()[0]!.onPress?.();

    await waitFor(() =>
      expect(mockTrackChoice).toHaveBeenCalledWith('retake', ['low_resolution'], 'gallery'),
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockSetImage).not.toHaveBeenCalled();
  });

  it('choosing "Usar assim mesmo" proceeds (soft gate never hard-blocks)', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValue(pickerResult({ width: 320, height: 240 }));
    mockManipulateAsync.mockResolvedValue(
      manipulated(320, 240, base64LengthForBytes(Math.floor(320 * 240 * 0.2))),
    );

    const { getByTestId } = render(<CameraScreen />);
    fireEvent.press(getByTestId('diagnosis-camera-gallery'));
    await waitFor(() => expect(mockShowAlert).toHaveBeenCalled());

    lastAlertButtons()[1]!.onPress?.();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/diagnosis/crop-select'));
    expect(mockTrackChoice).toHaveBeenCalledWith('use_anyway', ['low_resolution'], 'gallery');
    expect(mockSetImage).toHaveBeenCalledWith('file://compressed.jpg', expect.any(String));
  });

  it('dark/flat photo from the CAMERA reports source camera with low_detail', async () => {
    mockRequestCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockLaunchCameraAsync.mockResolvedValue(pickerResult({ width: 4000, height: 3000 }));
    // ~0.01 B/px on 1024×768 → near-flat frame.
    mockManipulateAsync.mockResolvedValue(
      manipulated(1024, 768, base64LengthForBytes(Math.floor(1024 * 768 * 0.01))),
    );

    const { getByTestId } = render(<CameraScreen />);
    fireEvent.press(getByTestId('diagnosis-camera-capture'));

    await waitFor(() => expect(mockShowAlert).toHaveBeenCalled());
    expect(mockTrackWarningShown).toHaveBeenCalledWith(['low_detail'], 'camera');
    const [, message] = mockShowAlert.mock.calls.at(-1)!;
    expect(message).toContain('diagnosis.photoQualityLowDetail');
  });
});
