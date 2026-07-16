import React from 'react';
import { render } from '@testing-library/react-native';
import { PragasAccountGate } from '../../components/PragasAccountGate';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('PragasAccountGate', () => {
  it('shows global deletion as terminal and never offers app reactivation', () => {
    const screen = render(
      <PragasAccountGate
        status="global_deletion_pending"
        onReactivate={jest.fn()}
        onRetry={jest.fn()}
        onSignOut={jest.fn()}
      />,
    );

    expect(screen.getByText('accountGate.globalDeletionTitle')).toBeTruthy();
    expect(screen.getByText('accountGate.globalDeletionDescription')).toBeTruthy();
    expect(screen.queryByTestId('reactivate-pragas-account')).toBeNull();
    expect(screen.getByTestId('pragas-gate-sign-out')).toBeTruthy();
  });
});
