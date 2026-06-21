import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addToQueue,
  getQueue,
  removeFromQueue,
  getQueueCount,
  clearQueue,
  incrementRetry,
  readQueuedImageBase64,
} from '../../services/diagnosisQueue';

// --- Mocks ---
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

// Mock expo-file-system
const mockGetInfoAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
const mockWriteAsStringAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
const mockDeleteAsync = jest.fn();

jest.mock('expo-file-system', () => ({
  documentDirectory: '/mock/documents/',
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(...args),
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
  readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
  EncodingType: { Base64: 'base64' },
}));

// Mock expo-crypto — native module returns undefined under Jest without a mock
let cryptoUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => {
    cryptoUuidCounter += 1;
    return `mock-uuid-${cryptoUuidCounter}`;
  }),
}));

const QUEUE_KEY = '@rumo_pragas_diagnosis_queue';

function makePendingDiagnosis(overrides: Record<string, unknown> = {}) {
  return {
    id: '123abc',
    imageUri: '/mock/documents/diagnosis-queue/123abc.jpg',
    cropType: 'soja',
    latitude: -23.5,
    longitude: -46.6,
    createdAt: '2026-03-20T10:00:00.000Z',
    retryCount: 0,
    ...overrides,
  };
}

// --- Tests ---
describe('diagnosisQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
    mockAsyncStorage.removeItem.mockResolvedValue(undefined);
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    mockMakeDirectoryAsync.mockResolvedValue(undefined);
    mockWriteAsStringAsync.mockResolvedValue(undefined);
    mockReadAsStringAsync.mockResolvedValue('base64data');
    mockDeleteAsync.mockResolvedValue(undefined);
    // Default: getItem returns null (empty queue, no migration needed)
    mockAsyncStorage.getItem.mockResolvedValue(null);
  });

  describe('getQueue', () => {
    it('returns empty array when no items stored', async () => {
      const queue = await getQueue();
      expect(queue).toEqual([]);
    });

    it('returns stored items', async () => {
      const items = [makePendingDiagnosis()];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(items));
      const queue = await getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0]).toMatchObject({ cropType: 'soja' });
    });

    it('returns empty array on parse error', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('invalid json{{{');
      const queue = await getQueue();
      expect(queue).toEqual([]);
    });
  });

  describe('addToQueue', () => {
    it('writes image to file system and stores URI in AsyncStorage', async () => {
      await addToQueue({
        imageBase64: 'imgdata',
        cropType: 'milho',
        latitude: null,
        longitude: null,
      });

      expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
        expect.stringContaining('/mock/documents/diagnosis-queue/'),
        'imgdata',
        { encoding: 'base64' },
      );

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(QUEUE_KEY, expect.any(String));
      const savedData = JSON.parse(mockAsyncStorage.setItem.mock.calls[0]![1] as string);
      expect(savedData).toHaveLength(1);
      expect(savedData[0]).toMatchObject({ cropType: 'milho', retryCount: 0 });
      expect(savedData[0].imageUri).toContain('/mock/documents/diagnosis-queue/');
      expect(savedData[0].id).toBeDefined();
      expect(savedData[0].createdAt).toBeDefined();
    });

    it('creates queue directory if it does not exist', async () => {
      mockGetInfoAsync.mockResolvedValueOnce({ exists: false });

      await addToQueue({
        imageBase64: 'img',
        cropType: 'soja',
        latitude: null,
        longitude: null,
      });

      expect(mockMakeDirectoryAsync).toHaveBeenCalledWith(
        expect.stringContaining('diagnosis-queue'),
        { intermediates: true },
      );
    });

    it('appends to existing queue', async () => {
      const existing = [makePendingDiagnosis({ id: 'existing1' })];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existing));

      await addToQueue({
        imageBase64: 'newimg',
        cropType: 'cafe',
        latitude: -20.0,
        longitude: -44.0,
      });

      const savedData = JSON.parse(mockAsyncStorage.setItem.mock.calls[0]![1] as string);
      expect(savedData).toHaveLength(2);
      expect(savedData[0].id).toBe('existing1');
      expect(savedData[1].cropType).toBe('cafe');
    });
  });

  describe('removeFromQueue', () => {
    it('removes specific item by id and cleans up image file', async () => {
      const items = [
        makePendingDiagnosis({ id: 'a', imageUri: '/mock/documents/diagnosis-queue/a.jpg' }),
        makePendingDiagnosis({ id: 'b', imageUri: '/mock/documents/diagnosis-queue/b.jpg' }),
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(items));

      await removeFromQueue('a');

      expect(mockDeleteAsync).toHaveBeenCalledWith('/mock/documents/diagnosis-queue/a.jpg', {
        idempotent: true,
      });

      const savedData = JSON.parse(mockAsyncStorage.setItem.mock.calls[0]![1] as string);
      expect(savedData).toHaveLength(1);
      expect(savedData[0].id).toBe('b');
    });

    it('handles missing image file gracefully', async () => {
      const items = [makePendingDiagnosis({ id: 'a', imageUri: '/some/path.jpg' })];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(items));
      mockGetInfoAsync.mockResolvedValueOnce({ exists: false });

      await expect(removeFromQueue('a')).resolves.not.toThrow();
    });

    it('removes item even if file deletion fails', async () => {
      const items = [makePendingDiagnosis({ id: 'a', imageUri: '/mock/path.jpg' })];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(items));
      mockGetInfoAsync.mockRejectedValueOnce(new Error('fs error'));

      await removeFromQueue('a');

      const savedData = JSON.parse(mockAsyncStorage.setItem.mock.calls[0]![1] as string);
      expect(savedData).toHaveLength(0);
    });
  });

  describe('readQueuedImageBase64', () => {
    it('reads base64 content from file on disk', async () => {
      mockReadAsStringAsync.mockResolvedValueOnce('abcdef1234');

      const result = await readQueuedImageBase64('/mock/documents/diagnosis-queue/test.jpg');

      expect(result).toBe('abcdef1234');
      expect(mockReadAsStringAsync).toHaveBeenCalledWith(
        '/mock/documents/diagnosis-queue/test.jpg',
        { encoding: 'base64' },
      );
    });
  });

  describe('getQueueCount', () => {
    it('returns correct count', async () => {
      const items = [
        makePendingDiagnosis({ id: '1' }),
        makePendingDiagnosis({ id: '2' }),
        makePendingDiagnosis({ id: '3' }),
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(items));
      const count = await getQueueCount();
      expect(count).toBe(3);
    });

    it('returns 0 for empty queue', async () => {
      const count = await getQueueCount();
      expect(count).toBe(0);
    });
  });

  describe('clearQueue', () => {
    it('removes all image files and the queue key from storage', async () => {
      const items = [
        makePendingDiagnosis({ id: 'x', imageUri: '/mock/documents/diagnosis-queue/x.jpg' }),
        makePendingDiagnosis({ id: 'y', imageUri: '/mock/documents/diagnosis-queue/y.jpg' }),
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(items));

      await clearQueue();

      expect(mockDeleteAsync).toHaveBeenCalledTimes(2);
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(QUEUE_KEY);
    });

    it('completes even if file cleanup fails', async () => {
      const items = [makePendingDiagnosis({ id: 'z', imageUri: '/mock/path.jpg' })];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(items));
      mockDeleteAsync.mockRejectedValueOnce(new Error('fs error'));

      await expect(clearQueue()).resolves.not.toThrow();
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(QUEUE_KEY);
    });
  });

  describe('incrementRetry', () => {
    it('increases retry count for the given item', async () => {
      const items = [
        makePendingDiagnosis({ id: 'x', retryCount: 2 }),
        makePendingDiagnosis({ id: 'y', retryCount: 0 }),
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(items));

      await incrementRetry('x');

      const savedData = JSON.parse(mockAsyncStorage.setItem.mock.calls[0]![1] as string);
      const updated = savedData.find((d: { id: string }) => d.id === 'x');
      expect(updated.retryCount).toBe(3);
      const untouched = savedData.find((d: { id: string }) => d.id === 'y');
      expect(untouched.retryCount).toBe(0);
    });
  });

  describe('legacy migration', () => {
    it('migrates legacy base64 entries to file-based storage', async () => {
      jest.resetModules();

      jest.mock('@react-native-async-storage/async-storage', () => ({
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      }));
      jest.mock('expo-file-system', () => ({
        documentDirectory: '/mock/documents/',
        getInfoAsync: jest.fn().mockResolvedValue({ exists: true }),
        makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
        writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
        readAsStringAsync: jest.fn().mockResolvedValue('base64data'),
        deleteAsync: jest.fn().mockResolvedValue(undefined),
        EncodingType: { Base64: 'base64' },
      }));

      const AsyncStorageFresh =
        require('@react-native-async-storage/async-storage').default ||
        require('@react-native-async-storage/async-storage');

      const FileSystemFresh = require('expo-file-system');

      const { getQueue: getQueueFresh } = require('../../services/diagnosisQueue');

      const legacyItems = [
        {
          id: 'legacy1',
          imageBase64: 'oldbase64data',
          cropType: 'soja',
          latitude: -23.5,
          longitude: -46.6,
          createdAt: '2026-01-01T00:00:00Z',
          retryCount: 0,
        },
      ];

      AsyncStorageFresh.getItem.mockResolvedValueOnce(JSON.stringify(legacyItems));

      await getQueueFresh();

      expect(FileSystemFresh.writeAsStringAsync).toHaveBeenCalledWith(
        expect.stringContaining('legacy1.jpg'),
        'oldbase64data',
        { encoding: 'base64' },
      );
      expect(AsyncStorageFresh.setItem).toHaveBeenCalled();
    });
  });
});
