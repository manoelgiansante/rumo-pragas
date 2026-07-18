import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockOpenBrowserAsync = jest.fn().mockResolvedValue({ type: 'dismiss' });
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../../services/aiConsent', () => ({
  AI_CONSENT_VERSION: '2026-07-14.1',
}));

import { AIConsentModal } from '../../components/AIConsentModal';

describe('AIConsentModal legal documents', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens privacy in the system browser while keeping the consent available on return', async () => {
    const { getByTestId } = render(
      <AIConsentModal visible purpose="diagnosis" onAccept={jest.fn()} onCancel={jest.fn()} />,
    );

    fireEvent.press(getByTestId('ai-consent-privacy'));
    await waitFor(() =>
      expect(mockOpenBrowserAsync).toHaveBeenCalledWith('https://pragas.agrorumo.com/privacidade'),
    );
    expect(getByTestId('ai-consent-diagnosis')).toBeTruthy();
    expect(getByTestId('ai-consent-accept')).toBeTruthy();
  });

  it('opens terms without dismissing the consent', async () => {
    const { getByTestId } = render(
      <AIConsentModal visible purpose="chat" onAccept={jest.fn()} onCancel={jest.fn()} />,
    );

    fireEvent.press(getByTestId('ai-consent-terms'));
    await waitFor(() =>
      expect(mockOpenBrowserAsync).toHaveBeenCalledWith('https://pragas.agrorumo.com/termos'),
    );
    expect(getByTestId('ai-consent-chat')).toBeTruthy();
  });
});
