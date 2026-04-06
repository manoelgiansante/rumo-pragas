import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';

const DIAGNOSIS_COUNT_KEY = '@rumo_pragas_successful_diagnoses';
const REVIEW_PROMPTED_KEY = '@rumo_pragas_review_prompted';
const REVIEW_THRESHOLD = 3;

/**
 * Call this after each successful diagnosis.
 * After the 3rd successful diagnosis, shows a soft prompt asking the user
 * if the diagnosis was helpful. If they say yes, triggers the native
 * store review dialog (App Store / Google Play).
 */
export async function trackSuccessfulDiagnosis(): Promise<void> {
  try {
    const alreadyPrompted = await AsyncStorage.getItem(REVIEW_PROMPTED_KEY);
    if (alreadyPrompted === 'true') return;

    const currentCount = parseInt((await AsyncStorage.getItem(DIAGNOSIS_COUNT_KEY)) || '0', 10);
    const newCount = currentCount + 1;
    await AsyncStorage.setItem(DIAGNOSIS_COUNT_KEY, String(newCount));

    if (newCount < REVIEW_THRESHOLD) return;

    const isAvailable = await StoreReview.isAvailableAsync();
    if (!isAvailable) return;

    // Mark as prompted before showing — avoid double-prompting on rapid navigations
    await AsyncStorage.setItem(REVIEW_PROMPTED_KEY, 'true');

    if (Platform.OS === 'web') return;

    Alert.alert(
      'Este diagnóstico foi útil?',
      'Sua avaliação nos ajuda a melhorar o app para todos os produtores.',
      [
        { text: 'Agora não', style: 'cancel' },
        {
          text: 'Sim, avaliar!',
          onPress: async () => {
            try {
              await StoreReview.requestReview();
            } catch {
              // Native review dialog may fail silently — that's OK
            }
          },
        },
      ],
    );
  } catch {
    // Non-critical feature — never crash the app for a review prompt
  }
}

/**
 * Reset the review tracking (useful for testing).
 */
export async function resetReviewTracking(): Promise<void> {
  await AsyncStorage.multiRemove([DIAGNOSIS_COUNT_KEY, REVIEW_PROMPTED_KEY]);
}
