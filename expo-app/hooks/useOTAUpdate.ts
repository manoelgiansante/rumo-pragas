import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import i18n from '../i18n';

/**
 * Apple 2.1(a) iPad iOS 26 reviewer hardening (2026-05-16):
 *
 * Reviewer rejected v1.0.6 b36 with "an error message was displayed when we
 * attempted to login". One root cause: the OTA Alert could fire on cold-launch
 * BEFORE the login screen mounted, surfacing a system dialog the reviewer
 * interpreted as a login error.
 *
 * We now gate the entire OTA flow behind `isReady` (caller passes
 * isAuthenticated + onboardingComplete). On the login screen the hook is a
 * no-op; only after auth + onboarding do we even ask Updates.checkForUpdateAsync.
 *
 * Backwards compatible: omitting `isReady` keeps old behaviour (true) so
 * tests + non-shell callers don't regress.
 */
export function useOTAUpdate(isReady: boolean = true) {
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    // Only check in production builds, not in dev/expo go
    if (__DEV__) return;
    // Defer until caller signals user is past auth + onboarding gates.
    if (!isReady) return;

    checkForUpdate();
  }, [isReady]);

  async function checkForUpdate() {
    try {
      setIsChecking(true);
      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable) {
        setIsDownloading(true);
        await Updates.fetchUpdateAsync();

        Alert.alert(i18n.t('common.updateAvailable'), i18n.t('common.updateMessage'), [
          { text: i18n.t('common.later'), style: 'cancel' },
          { text: i18n.t('common.restart'), onPress: () => Updates.reloadAsync() },
        ]);
      }
    } catch (e) {
      // Silently fail - OTA updates are not critical
      if (__DEV__) console.warn('OTA update check failed:', e);
    } finally {
      setIsChecking(false);
      setIsDownloading(false);
    }
  }

  return { isChecking, isDownloading, checkForUpdate };
}
