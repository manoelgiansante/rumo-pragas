import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import { trackSuccessfulDiagnosis, resetReviewTracking } from '../../services/storeReview';

// AsyncStorage is globally mocked via jest.setup.ts
const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(),
  requestReview: jest.fn(),
}));

const StoreReview = require('expo-store-review') as {
  isAvailableAsync: jest.Mock;
  requestReview: jest.Mock;
};

const DIAGNOSIS_COUNT_KEY = '@rumo_pragas_successful_diagnoses';
const REVIEW_PROMPTED_KEY = '@rumo_pragas_review_prompted';

describe('storeReview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
    mockAsyncStorage.multiRemove.mockResolvedValue(undefined);
    (Platform as any).OS = 'ios';
  });

  describe('trackSuccessfulDiagnosis', () => {
    it('increments the counter on each call', async () => {
      mockAsyncStorage.getItem.mockImplementation((key: string) => {
        if (key === REVIEW_PROMPTED_KEY) return Promise.resolve(null);
        if (key === DIAGNOSIS_COUNT_KEY) return Promise.resolve('1');
        return Promise.resolve(null);
      });

      await trackSuccessfulDiagnosis();
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(DIAGNOSIS_COUNT_KEY, '2');
    });

    it('does not prompt review before threshold (count < 3)', async () => {
      mockAsyncStorage.getItem.mockImplementation((key: string) => {
        if (key === REVIEW_PROMPTED_KEY) return Promise.resolve(null);
        if (key === DIAGNOSIS_COUNT_KEY) return Promise.resolve('0');
        return Promise.resolve(null);
      });

      const alertSpy = jest.spyOn(Alert, 'alert');
      await trackSuccessfulDiagnosis();
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('prompts review at threshold (3rd diagnosis)', async () => {
      mockAsyncStorage.getItem.mockImplementation((key: string) => {
        if (key === REVIEW_PROMPTED_KEY) return Promise.resolve(null);
        if (key === DIAGNOSIS_COUNT_KEY) return Promise.resolve('2');
        return Promise.resolve(null);
      });

      StoreReview.isAvailableAsync.mockResolvedValueOnce(true);
      const alertSpy = jest.spyOn(Alert, 'alert');
      await trackSuccessfulDiagnosis();

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(REVIEW_PROMPTED_KEY, 'true');
      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringMatching(/til/),
        expect.any(String),
        expect.any(Array),
      );
    });

    it('does not prompt again after already prompted', async () => {
      mockAsyncStorage.getItem.mockImplementation((key: string) => {
        if (key === REVIEW_PROMPTED_KEY) return Promise.resolve('true');
        if (key === DIAGNOSIS_COUNT_KEY) return Promise.resolve('5');
        return Promise.resolve(null);
      });

      const alertSpy = jest.spyOn(Alert, 'alert');
      await trackSuccessfulDiagnosis();
      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('does not show alert on web even at threshold', async () => {
      (Platform as any).OS = 'web';

      mockAsyncStorage.getItem.mockImplementation((key: string) => {
        if (key === REVIEW_PROMPTED_KEY) return Promise.resolve(null);
        if (key === DIAGNOSIS_COUNT_KEY) return Promise.resolve('2');
        return Promise.resolve(null);
      });

      StoreReview.isAvailableAsync.mockResolvedValueOnce(true);
      const alertSpy = jest.spyOn(Alert, 'alert');
      await trackSuccessfulDiagnosis();

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(REVIEW_PROMPTED_KEY, 'true');
      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  describe('resetReviewTracking', () => {
    it('clears both storage keys', async () => {
      await resetReviewTracking();
      expect(mockAsyncStorage.multiRemove).toHaveBeenCalledWith([
        DIAGNOSIS_COUNT_KEY,
        REVIEW_PROMPTED_KEY,
      ]);
    });
  });
});
