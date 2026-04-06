import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

export function useOTAUpdate() {
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    // Only check in production builds, not in dev/expo go
    if (__DEV__) return;

    checkForUpdate();
  }, []);

  async function checkForUpdate() {
    try {
      setIsChecking(true);
      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable) {
        setIsDownloading(true);
        await Updates.fetchUpdateAsync();

        Alert.alert(
          'Atualizacao disponivel',
          'Uma nova versao do app esta pronta. Deseja reiniciar agora?',
          [
            { text: 'Depois', style: 'cancel' },
            { text: 'Reiniciar', onPress: () => Updates.reloadAsync() },
          ],
        );
      }
    } catch (e) {
      // Silently fail - OTA updates are not critical
      console.warn('OTA update check failed:', e);
    } finally {
      setIsChecking(false);
      setIsDownloading(false);
    }
  }

  return { isChecking, isDownloading, checkForUpdate };
}
