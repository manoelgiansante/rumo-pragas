import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addToQueue,
  getQueue,
  removeFromQueue,
  getQueueCount,
  clearQueue,
  incrementRetry,
  readQueuedImageBase64,
  moveToFailedQueue,
  getFailedQueue,
  retryFailedDiagnosis,
  discardFailedDiagnosis,
  purgeDiagnosisQueuesForUser,
  purgeAllDiagnosisQueueData,
  prepareDiagnosisQueueForOwnerClaim,
  resumePendingDiagnosisQueueCleanup,
  DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY,
  MAX_DIAGNOSIS_QUEUE_ITEMS,
} from '../../services/diagnosisQueue';

// --- Mocks ---
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  multiSet: jest.fn().mockResolvedValue(undefined),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

// Mock expo-file-system
const mockGetInfoAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
const mockWriteAsStringAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
const mockReadDirectoryAsync = jest.fn();
const mockDeleteAsync = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/documents/',
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(...args),
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
  readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...args),
  readDirectoryAsync: (...args: unknown[]) => mockReadDirectoryAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
  EncodingType: { Base64: 'base64' },
}));

// Mock expo-crypto — native module returns undefined under Jest without a mock
let mockCryptoUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => {
    mockCryptoUuidCounter += 1;
    return `mock-uuid-${mockCryptoUuidCounter}`;
  }),
}));

const QUEUE_KEY = '@rumo_pragas_diagnosis_queue';
const FAILED_QUEUE_KEY = '@rumo_pragas_diagnosis_dlq';

function makePendingDiagnosis(overrides: Record<string, unknown> = {}) {
  const id = typeof overrides.id === 'string' ? overrides.id : '123abc';
  return {
    id,
    userId: 'user-1',
    idempotencyKey: id,
    imageUri: `/mock/documents/diagnosis-queue/${id}.jpg`,
    cropType: 'soja',
    latitude: -23.5,
    longitude: -46.6,
    createdAt: '2026-03-20T10:00:00.000Z',
    retryCount: 0,
    ...overrides,
  };
}

function mockQueueValues(
  active: string | null,
  failed: string | null = null,
  journal: string | null = null,
): void {
  mockAsyncStorage.getItem.mockImplementation(async (key) => {
    if (key === QUEUE_KEY) return active;
    if (key === FAILED_QUEUE_KEY) return failed;
    if (key === DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY) return journal;
    return null;
  });
}

function useStatefulStorage(initial: Record<string, string> = {}): Map<string, string> {
  const values = new Map(Object.entries(initial));
  mockAsyncStorage.getItem.mockImplementation(async (key) => values.get(key) ?? null);
  mockAsyncStorage.setItem.mockImplementation(async (key, value) => {
    values.set(key, value);
  });
  mockAsyncStorage.removeItem.mockImplementation(async (key) => {
    values.delete(key);
  });
  mockAsyncStorage.multiSet.mockImplementation(async (pairs) => {
    pairs.forEach(([key, value]) => values.set(key, value));
  });
  return values;
}

// --- Tests ---
describe('diagnosisQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
    mockAsyncStorage.removeItem.mockResolvedValue(undefined);
    mockAsyncStorage.multiSet.mockResolvedValue(undefined);
    mockGetInfoAsync.mockResolvedValue({ exists: true });
    mockMakeDirectoryAsync.mockResolvedValue(undefined);
    mockWriteAsStringAsync.mockResolvedValue(undefined);
    mockReadAsStringAsync.mockResolvedValue('base64data');
    mockReadDirectoryAsync.mockResolvedValue([]);
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
      mockQueueValues(JSON.stringify(items));
      const queue = await getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0]).toMatchObject({ cropType: 'soja' });
    });

    it('returns empty array on parse error', async () => {
      mockQueueValues('invalid json{{{');
      const queue = await getQueue();
      expect(queue).toEqual([]);
    });
  });

  describe('addToQueue', () => {
    it('writes image to file system and stores URI in AsyncStorage', async () => {
      await addToQueue({
        userId: 'user-1',
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
        userId: 'user-1',
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
      mockAsyncStorage.getItem.mockImplementation(async (key) =>
        key === QUEUE_KEY ? JSON.stringify(existing) : null,
      );

      await addToQueue({
        userId: 'user-1',
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

    it('never overwrites corrupt existing metadata or creates a new photo', async () => {
      mockQueueValues('corrupt{{');

      await expect(
        addToQueue({
          userId: 'user-1',
          imageBase64: 'newimg',
          cropType: 'soja',
          latitude: null,
          longitude: null,
        }),
      ).rejects.toThrow();

      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
      expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
      expect(mockDeleteAsync).not.toHaveBeenCalled();
    });

    it('enforces bounded active plus failed capacity before creating a photo', async () => {
      const active = Array.from({ length: 15 }, (_, index) =>
        makePendingDiagnosis({ id: `active-${index}` }),
      );
      const failed = Array.from(
        { length: MAX_DIAGNOSIS_QUEUE_ITEMS - active.length },
        (_, index) => ({
          ...makePendingDiagnosis({ id: `failed-${index}` }),
          movedToFailedAt: '2026-07-14T00:00:00.000Z',
        }),
      );
      mockAsyncStorage.getItem.mockImplementation(async (key) => {
        if (key === QUEUE_KEY) return JSON.stringify(active);
        if (key === FAILED_QUEUE_KEY) return JSON.stringify(failed);
        return null;
      });

      await expect(
        addToQueue({
          userId: 'user-1',
          imageBase64: 'must-not-be-written',
          cropType: 'soja',
          latitude: null,
          longitude: null,
        }),
      ).rejects.toMatchObject({ code: 'DIAGNOSIS_QUEUE_FULL' });

      expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
      expect(mockDeleteAsync).not.toHaveBeenCalled();
    });
  });

  describe('removeFromQueue', () => {
    it('removes specific item by id and cleans up image file', async () => {
      const items = [
        makePendingDiagnosis({ id: 'a', imageUri: '/mock/documents/diagnosis-queue/a.jpg' }),
        makePendingDiagnosis({ id: 'b', imageUri: '/mock/documents/diagnosis-queue/b.jpg' }),
      ];
      mockQueueValues(JSON.stringify(items));

      await removeFromQueue('a');

      expect(mockDeleteAsync).toHaveBeenCalledWith('/mock/documents/diagnosis-queue/a.jpg', {
        idempotent: true,
      });

      const savedData = JSON.parse(mockAsyncStorage.setItem.mock.calls[0]![1] as string);
      expect(savedData).toHaveLength(1);
      expect(savedData[0].id).toBe('b');
    });

    it('handles missing image file gracefully', async () => {
      const items = [makePendingDiagnosis({ id: 'a' })];
      mockQueueValues(JSON.stringify(items));
      mockGetInfoAsync.mockResolvedValueOnce({ exists: false });

      await expect(removeFromQueue('a')).resolves.not.toThrow();
    });

    it('removes item even if file deletion fails', async () => {
      const items = [makePendingDiagnosis({ id: 'a' })];
      mockQueueValues(JSON.stringify(items));
      mockGetInfoAsync.mockRejectedValueOnce(new Error('fs error'));

      await removeFromQueue('a');

      const savedData = JSON.parse(mockAsyncStorage.setItem.mock.calls[0]![1] as string);
      expect(savedData).toHaveLength(0);
    });

    it('can remove active metadata without deleting the preserved image', async () => {
      const items = [makePendingDiagnosis({ id: 'a' })];
      mockQueueValues(JSON.stringify(items));

      await removeFromQueue('a', { deleteImage: false });

      expect(mockDeleteAsync).not.toHaveBeenCalled();
      expect(JSON.parse(mockAsyncStorage.setItem.mock.calls[0]![1] as string)).toEqual([]);
    });

    it('keeps the photo when durable metadata removal fails', async () => {
      const items = [makePendingDiagnosis({ id: 'a' })];
      mockQueueValues(JSON.stringify(items));
      mockAsyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));

      await expect(removeFromQueue('a')).rejects.toThrow('disk full');
      expect(mockDeleteAsync).not.toHaveBeenCalled();
    });
  });

  describe('failed queue recovery', () => {
    it('persists failed metadata and preserves the image while leaving active removal explicit', async () => {
      const item = makePendingDiagnosis({ id: 'failed-1' });
      mockQueueValues(null);

      await moveToFailedQueue(item, 'network');

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        FAILED_QUEUE_KEY,
        expect.stringContaining('failed-1'),
      );
      expect(mockDeleteAsync).not.toHaveBeenCalled();
    });

    it('throws if failed metadata cannot be persisted so the caller keeps the active item', async () => {
      mockAsyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));
      await expect(moveToFailedQueue(makePendingDiagnosis(), 'fail')).rejects.toThrow('disk full');
      expect(mockDeleteAsync).not.toHaveBeenCalled();
    });

    it('requeues a failed diagnosis before removing it from the failed list', async () => {
      const failed = {
        ...makePendingDiagnosis({ id: 'failed-2', retryCount: 3 }),
        movedToFailedAt: '2026-07-14T00:00:00.000Z',
        lastError: 'timeout',
      };
      mockAsyncStorage.getItem.mockImplementation(async (key) => {
        if (key === FAILED_QUEUE_KEY) return JSON.stringify([failed]);
        if (key === QUEUE_KEY) return JSON.stringify([]);
        return null;
      });

      await retryFailedDiagnosis('failed-2');

      const activeWrite = mockAsyncStorage.setItem.mock.calls.find((call) => call[0] === QUEUE_KEY);
      expect(activeWrite).toBeDefined();
      expect(JSON.parse(activeWrite![1] as string)[0]).toMatchObject({
        id: 'failed-2',
        retryCount: 0,
      });
      const failedWrite = mockAsyncStorage.setItem.mock.calls.find(
        (call) => call[0] === FAILED_QUEUE_KEY,
      );
      expect(JSON.parse(failedWrite![1] as string)).toEqual([]);
      expect(mockDeleteAsync).not.toHaveBeenCalled();
    });

    it('deletes a failed photo only on explicit discard', async () => {
      const failed = {
        ...makePendingDiagnosis({ id: 'failed-3' }),
        movedToFailedAt: '2026-07-14T00:00:00.000Z',
      };
      mockAsyncStorage.getItem.mockImplementation(async (key) =>
        key === FAILED_QUEUE_KEY ? JSON.stringify([failed]) : null,
      );

      await discardFailedDiagnosis('failed-3');

      expect(mockDeleteAsync).toHaveBeenCalledWith('/mock/documents/diagnosis-queue/failed-3.jpg', {
        idempotent: true,
      });
    });

    it('keeps a failed photo when durable discard metadata cannot be saved', async () => {
      const failed = {
        ...makePendingDiagnosis({ id: 'failed-4' }),
        movedToFailedAt: '2026-07-14T00:00:00.000Z',
      };
      mockAsyncStorage.getItem.mockImplementation(async (key) =>
        key === FAILED_QUEUE_KEY ? JSON.stringify([failed]) : null,
      );
      mockAsyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));

      await expect(discardFailedDiagnosis('failed-4')).rejects.toThrow('disk full');
      expect(mockDeleteAsync).not.toHaveBeenCalled();
    });

    it('leaves a recoverable duplicate if DLQ removal fails after active requeue', async () => {
      const failed = {
        ...makePendingDiagnosis({ id: 'failed-5', retryCount: 3 }),
        movedToFailedAt: '2026-07-14T00:00:00.000Z',
      };
      mockAsyncStorage.getItem.mockImplementation(async (key) => {
        if (key === FAILED_QUEUE_KEY) return JSON.stringify([failed]);
        if (key === QUEUE_KEY) return JSON.stringify([]);
        return null;
      });
      mockAsyncStorage.setItem.mockImplementation(async (key) => {
        if (key === FAILED_QUEUE_KEY) throw new Error('disk full');
      });

      await expect(retryFailedDiagnosis('failed-5')).rejects.toThrow('disk full');
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        QUEUE_KEY,
        expect.stringContaining('failed-5'),
      );
      expect(mockDeleteAsync).not.toHaveBeenCalled();
    });

    it('reads the persisted failed queue', async () => {
      const failed = { ...makePendingDiagnosis(), movedToFailedAt: new Date().toISOString() };
      mockQueueValues(null, JSON.stringify([failed]));
      await expect(getFailedQueue()).resolves.toHaveLength(1);
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

    it.each([
      '/mock/documents/diagnosis-queue/../outside.jpg',
      '/mock/documents/diagnosis-queue-evil/test.jpg',
      '/mock/documents/diagnosis-queue/%2e%2e%2foutside.jpg',
    ])('rejects a non-canonical queue path: %s', async (imageUri) => {
      await expect(readQueuedImageBase64(imageUri)).rejects.toThrow(
        'Queued diagnosis photo path is invalid',
      );
      expect(mockReadAsStringAsync).not.toHaveBeenCalled();
    });
  });

  describe('path containment', () => {
    it('purges metadata without deleting traversal, prefix-collision or encoded paths', async () => {
      const malicious = [
        makePendingDiagnosis({
          id: 'traversal',
          imageUri: '/mock/documents/diagnosis-queue/../outside.jpg',
        }),
        makePendingDiagnosis({
          id: 'prefix',
          imageUri: '/mock/documents/diagnosis-queue-evil/prefix.jpg',
        }),
        makePendingDiagnosis({
          id: 'encoded',
          imageUri: '/mock/documents/diagnosis-queue/%2e%2e%2foutside.jpg',
        }),
      ];
      mockAsyncStorage.getItem.mockImplementation(async (key) =>
        key === QUEUE_KEY ? JSON.stringify(malicious) : null,
      );

      await purgeDiagnosisQueuesForUser('user-1');

      expect(mockDeleteAsync).not.toHaveBeenCalled();
      expect(mockAsyncStorage.multiSet).toHaveBeenCalledWith([
        [QUEUE_KEY, '[]'],
        [FAILED_QUEUE_KEY, '[]'],
      ]);
    });
  });

  describe('getQueueCount', () => {
    it('returns correct count', async () => {
      const items = [
        makePendingDiagnosis({ id: '1' }),
        makePendingDiagnosis({ id: '2' }),
        makePendingDiagnosis({ id: '3' }),
      ];
      mockQueueValues(JSON.stringify(items));
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
      mockQueueValues(JSON.stringify(items));

      await clearQueue();

      expect(mockDeleteAsync).toHaveBeenCalledTimes(2);
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(QUEUE_KEY);
    });

    it('completes even if file cleanup fails', async () => {
      const items = [makePendingDiagnosis({ id: 'z' })];
      mockQueueValues(JSON.stringify(items));
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
      mockQueueValues(JSON.stringify(items));

      await incrementRetry('x');

      const savedData = JSON.parse(mockAsyncStorage.setItem.mock.calls[0]![1] as string);
      const updated = savedData.find((d: { id: string }) => d.id === 'x');
      expect(updated.retryCount).toBe(3);
      const untouched = savedData.find((d: { id: string }) => d.id === 'y');
      expect(untouched.retryCount).toBe(0);
    });
  });

  describe('durable cleanup journal', () => {
    it('does not mutate queues or photos when the journal cannot be staged', async () => {
      const activeRaw = JSON.stringify([
        makePendingDiagnosis({ id: 'journal-stage', userId: undefined }),
      ]);
      const values = useStatefulStorage({ [QUEUE_KEY]: activeRaw });
      mockAsyncStorage.setItem.mockImplementation(async (key, value) => {
        if (key === DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY) throw new Error('storage full');
        values.set(key, value);
      });

      await expect(
        prepareDiagnosisQueueForOwnerClaim('user-b', { claimOwnerlessLegacy: false }),
      ).rejects.toThrow('storage full');

      expect(values.get(QUEUE_KEY)).toBe(activeRaw);
      expect(values.has(DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY)).toBe(false);
      expect(mockAsyncStorage.multiSet).not.toHaveBeenCalled();
      expect(mockDeleteAsync).not.toHaveBeenCalled();
    });

    it('replays a partial active/DLQ write before allowing a later queue mutation', async () => {
      const active = makePendingDiagnosis({ id: 'journal-active', userId: undefined });
      const failed = {
        ...makePendingDiagnosis({ id: 'journal-failed', userId: undefined }),
        movedToDLQAt: '2026-01-02T03:04:05.000Z',
      };
      const values = useStatefulStorage({
        [QUEUE_KEY]: JSON.stringify([active]),
        [FAILED_QUEUE_KEY]: JSON.stringify([failed]),
      });
      let allowCommit = false;
      mockAsyncStorage.multiSet.mockImplementation(async (pairs) => {
        values.set(pairs[0]![0], pairs[0]![1]);
        if (!allowCommit) throw new Error('failed queue store unavailable');
        values.set(pairs[1]![0], pairs[1]![1]);
      });

      await expect(
        prepareDiagnosisQueueForOwnerClaim('user-b', { claimOwnerlessLegacy: false }),
      ).rejects.toThrow('failed queue store unavailable');
      expect(values.get(QUEUE_KEY)).toBe('[]');
      expect(values.get(FAILED_QUEUE_KEY)).toBe(JSON.stringify([failed]));
      expect(values.has(DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY)).toBe(true);
      expect(mockDeleteAsync).not.toHaveBeenCalled();

      await expect(
        addToQueue({
          userId: 'user-b',
          imageBase64: 'new-photo',
          cropType: 'soja',
          latitude: null,
          longitude: null,
        }),
      ).rejects.toThrow('failed queue store unavailable');
      expect(mockWriteAsStringAsync).not.toHaveBeenCalled();

      allowCommit = true;
      await addToQueue({
        userId: 'user-b',
        imageBase64: 'new-photo',
        cropType: 'soja',
        latitude: null,
        longitude: null,
      });

      expect(values.has(DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY)).toBe(false);
      expect(JSON.parse(values.get(FAILED_QUEUE_KEY)!)).toEqual([]);
      expect(JSON.parse(values.get(QUEUE_KEY)!)).toEqual([
        expect.objectContaining({ userId: 'user-b', cropType: 'soja' }),
      ]);
      expect(mockDeleteAsync).toHaveBeenCalledWith(active.imageUri, { idempotent: true });
      expect(mockDeleteAsync).toHaveBeenCalledWith(failed.imageUri, { idempotent: true });
    });

    it('keeps the journal across delete and journal-removal failures, then resumes idempotently', async () => {
      const item = makePendingDiagnosis({ id: 'journal-retry', userId: undefined });
      const values = useStatefulStorage({ [QUEUE_KEY]: JSON.stringify([item]) });
      mockDeleteAsync.mockRejectedValueOnce(new Error('photo busy'));

      await expect(
        prepareDiagnosisQueueForOwnerClaim('user-b', { claimOwnerlessLegacy: false }),
      ).rejects.toThrow('photo busy');
      expect(values.get(QUEUE_KEY)).toBe('[]');
      expect(values.has(DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY)).toBe(true);

      let journalRemoveFailures = 1;
      mockAsyncStorage.removeItem.mockImplementation(async (key) => {
        if (key === DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY && journalRemoveFailures > 0) {
          journalRemoveFailures -= 1;
          throw new Error('journal fsync failed');
        }
        values.delete(key);
      });
      await expect(resumePendingDiagnosisQueueCleanup()).rejects.toThrow('journal fsync failed');
      expect(values.has(DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY)).toBe(true);

      await expect(resumePendingDiagnosisQueueCleanup()).resolves.toBeUndefined();
      expect(values.has(DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY)).toBe(false);
      expect(mockDeleteAsync).toHaveBeenCalledTimes(3);
    });

    it('sweeps only unreferenced canonical files and preserves directories/unknown names', async () => {
      const retained = makePendingDiagnosis({ id: 'retained-photo', userId: 'user-b' });
      useStatefulStorage({ [QUEUE_KEY]: JSON.stringify([retained]) });
      mockReadDirectoryAsync.mockResolvedValue([
        'retained-photo.jpg',
        'orphan-photo.jpg',
        'directory.jpg',
        '../outside.jpg',
        '%2e%2e.jpg',
        'safe.jpg.backup',
      ]);
      mockGetInfoAsync.mockImplementation(async (uri: string) => ({
        exists: true,
        isDirectory: uri.endsWith('diagnosis-queue/') || uri.endsWith('directory.jpg'),
      }));

      await prepareDiagnosisQueueForOwnerClaim('user-b', { claimOwnerlessLegacy: false });

      expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
      expect(mockDeleteAsync).toHaveBeenCalledWith(
        '/mock/documents/diagnosis-queue/orphan-photo.jpg',
        { idempotent: true },
      );
    });

    it('mode all erases the dedicated queue directory and resumes after delete failure', async () => {
      const values = useStatefulStorage({
        [QUEUE_KEY]: '{corrupt active',
        [FAILED_QUEUE_KEY]: '{corrupt failed',
      });
      mockDeleteAsync.mockRejectedValueOnce(new Error('directory busy'));

      await expect(purgeAllDiagnosisQueueData()).rejects.toThrow('directory busy');
      expect(values.get(QUEUE_KEY)).toBe('[]');
      expect(values.get(FAILED_QUEUE_KEY)).toBe('[]');
      expect(values.has(DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY)).toBe(true);

      await expect(resumePendingDiagnosisQueueCleanup()).resolves.toBeUndefined();
      expect(values.has(DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY)).toBe(false);
      expect(mockDeleteAsync).toHaveBeenCalledTimes(2);
      expect(mockDeleteAsync).toHaveBeenCalledWith('/mock/documents/diagnosis-queue/', {
        idempotent: true,
      });
    });
  });

  describe('legacy migration', () => {
    it('first durable owner claim preserves a valid ownerless UUID, idempotency and photo', async () => {
      const legacyId = '7c39a78a-08f7-4af5-a61c-cfd3ea51069e';
      const legacyRaw = JSON.stringify([
        null,
        {
          id: legacyId,
          idempotencyKey: legacyId,
          imageBase64: 'ownerless-photo',
          cropType: 'soja',
          latitude: -23.5,
          longitude: -46.6,
          createdAt: '2026-01-01T00:00:00Z',
          retryCount: 0,
        },
      ]);
      mockAsyncStorage.getItem.mockImplementation(async (key) =>
        key === QUEUE_KEY ? legacyRaw : null,
      );

      await prepareDiagnosisQueueForOwnerClaim('user-a', { claimOwnerlessLegacy: true });

      expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
        `/mock/documents/diagnosis-queue/${legacyId}.jpg`,
        'ownerless-photo',
        { encoding: 'base64' },
      );
      const saved = JSON.parse(mockAsyncStorage.setItem.mock.calls.at(-1)![1] as string);
      expect(saved).toEqual([
        expect.objectContaining({
          id: legacyId,
          idempotencyKey: legacyId,
          userId: 'user-a',
          imageUri: `/mock/documents/diagnosis-queue/${legacyId}.jpg`,
        }),
      ]);
    });

    it('account switch discards ownerless metadata and its canonical photo', async () => {
      const legacyRaw = JSON.stringify([
        {
          ...makePendingDiagnosis({ userId: undefined, id: 'legacy-ownerless' }),
          imageUri: '/mock/documents/diagnosis-queue/legacy-ownerless.jpg',
        },
      ]);
      mockAsyncStorage.getItem.mockImplementation(async (key) =>
        key === QUEUE_KEY ? legacyRaw : null,
      );

      await prepareDiagnosisQueueForOwnerClaim('user-b', { claimOwnerlessLegacy: false });

      const saved = JSON.parse(mockAsyncStorage.setItem.mock.calls.at(-1)![1] as string);
      expect(saved).toEqual([]);
      expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
      expect(mockDeleteAsync).toHaveBeenCalledWith(
        '/mock/documents/diagnosis-queue/legacy-ownerless.jpg',
        { idempotent: true },
      );
      expect(mockAsyncStorage.setItem.mock.invocationCallOrder[0]).toBeLessThan(
        mockAsyncStorage.multiSet.mock.invocationCallOrder[0]!,
      );
      expect(mockAsyncStorage.multiSet.mock.invocationCallOrder[0]).toBeLessThan(
        mockDeleteAsync.mock.invocationCallOrder[0]!,
      );
    });

    it('keeps a durable retry journal when canonical photo cleanup fails and retries safely', async () => {
      const legacyRaw = JSON.stringify([
        {
          ...makePendingDiagnosis({ userId: undefined, id: 'retry-ownerless' }),
          imageUri: '/mock/documents/diagnosis-queue/retry-ownerless.jpg',
        },
      ]);
      mockAsyncStorage.getItem.mockImplementation(async (key) =>
        key === QUEUE_KEY ? legacyRaw : null,
      );
      mockDeleteAsync.mockRejectedValueOnce(new Error('file busy'));

      await expect(
        prepareDiagnosisQueueForOwnerClaim('user-b', { claimOwnerlessLegacy: false }),
      ).rejects.toThrow('file busy');
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY,
        expect.stringContaining('retry-ownerless.jpg'),
      );
      expect(mockAsyncStorage.multiSet).toHaveBeenCalled();
      expect(mockAsyncStorage.removeItem).not.toHaveBeenCalledWith(
        DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY,
      );

      await expect(
        prepareDiagnosisQueueForOwnerClaim('user-b', { claimOwnerlessLegacy: false }),
      ).resolves.toBeUndefined();
      expect(mockDeleteAsync).toHaveBeenCalledTimes(2);
      expect(JSON.parse(mockAsyncStorage.setItem.mock.calls.at(-1)![1] as string)).toEqual([]);
    });

    it('never follows an ownerless external or traversal photo path', async () => {
      const legacyRaw = JSON.stringify([
        {
          ...makePendingDiagnosis({ userId: undefined, id: 'external-ownerless' }),
          imageUri: '/private/customer-photo.jpg',
        },
        {
          ...makePendingDiagnosis({ userId: undefined, id: 'traversal-ownerless' }),
          imageUri: '/mock/documents/diagnosis-queue/../customer-photo.jpg',
        },
      ]);
      mockAsyncStorage.getItem.mockImplementation(async (key) =>
        key === QUEUE_KEY ? legacyRaw : null,
      );

      await prepareDiagnosisQueueForOwnerClaim('user-b', { claimOwnerlessLegacy: false });

      expect(mockDeleteAsync).not.toHaveBeenCalled();
      expect(JSON.parse(mockAsyncStorage.setItem.mock.calls.at(-1)![1] as string)).toEqual([]);
    });

    it('drops malformed ownerless entries without targeting arbitrary photo paths', async () => {
      const legacyRaw = JSON.stringify([
        {
          id: '../outside',
          imageBase64: 'must-not-write',
          cropType: 'soja',
          latitude: null,
          longitude: null,
          createdAt: '2026-01-01T00:00:00Z',
          retryCount: 0,
        },
      ]);
      mockAsyncStorage.getItem.mockImplementation(async (key) =>
        key === QUEUE_KEY ? legacyRaw : null,
      );

      await prepareDiagnosisQueueForOwnerClaim('user-a', { claimOwnerlessLegacy: true });

      const saved = JSON.parse(mockAsyncStorage.setItem.mock.calls.at(-1)![1] as string);
      expect(saved).toEqual([]);
      expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
      expect(mockDeleteAsync).not.toHaveBeenCalled();
    });

    it('first durable owner claim preserves an ownerless legacy failed diagnosis', async () => {
      const legacyId = 'failed-upgrade-1';
      const movedToDLQAt = '2026-01-02T03:04:05.000Z';
      const legacyRaw = JSON.stringify([
        {
          ...makePendingDiagnosis({
            id: legacyId,
            userId: undefined,
            idempotencyKey: undefined,
            retryCount: 3,
          }),
          imageUri: `/mock/documents/diagnosis-queue/${legacyId}.jpg`,
          movedToDLQAt,
          lastError: 'network failure',
        },
      ]);
      mockAsyncStorage.getItem.mockImplementation(async (key) =>
        key === FAILED_QUEUE_KEY ? legacyRaw : null,
      );

      await prepareDiagnosisQueueForOwnerClaim('user-a', { claimOwnerlessLegacy: true });

      const write = mockAsyncStorage.setItem.mock.calls.find(([key]) => key === FAILED_QUEUE_KEY);
      expect(write).toBeDefined();
      const saved = JSON.parse(write![1] as string);
      expect(saved).toEqual([
        expect.objectContaining({
          id: legacyId,
          idempotencyKey: legacyId,
          userId: 'user-a',
          retryCount: 3,
          createdAt: '2026-03-20T10:00:00.000Z',
          movedToFailedAt: movedToDLQAt,
          imageUri: `/mock/documents/diagnosis-queue/${legacyId}.jpg`,
        }),
      ]);
      expect(mockDeleteAsync).not.toHaveBeenCalled();
    });

    it('account switch discards ownerless legacy failed metadata and its canonical photo', async () => {
      const legacyRaw = JSON.stringify([
        {
          ...makePendingDiagnosis({ id: 'failed-ownerless', userId: undefined }),
          imageUri: '/mock/documents/diagnosis-queue/failed-ownerless.jpg',
          movedToDLQAt: '2026-01-02T03:04:05.000Z',
        },
      ]);
      mockAsyncStorage.getItem.mockImplementation(async (key) =>
        key === FAILED_QUEUE_KEY ? legacyRaw : null,
      );

      await prepareDiagnosisQueueForOwnerClaim('user-b', { claimOwnerlessLegacy: false });

      const write = mockAsyncStorage.setItem.mock.calls.find(([key]) => key === FAILED_QUEUE_KEY);
      expect(JSON.parse(write![1] as string)).toEqual([]);
      expect(mockDeleteAsync).toHaveBeenCalledWith(
        '/mock/documents/diagnosis-queue/failed-ownerless.jpg',
        { idempotent: true },
      );
    });

    it('deletes a duplicated discarded active/DLQ photo only once', async () => {
      const duplicate = {
        ...makePendingDiagnosis({ id: 'duplicate-ownerless', userId: undefined }),
        imageUri: '/mock/documents/diagnosis-queue/duplicate-ownerless.jpg',
      };
      mockAsyncStorage.getItem.mockImplementation(async (key) => {
        if (key === QUEUE_KEY) return JSON.stringify([duplicate]);
        if (key === FAILED_QUEUE_KEY) {
          return JSON.stringify([{ ...duplicate, movedToDLQAt: '2026-01-02T03:04:05.000Z' }]);
        }
        return null;
      });

      await prepareDiagnosisQueueForOwnerClaim('user-b', { claimOwnerlessLegacy: false });

      expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
      expect(mockDeleteAsync).toHaveBeenCalledWith(duplicate.imageUri, { idempotent: true });
      const activeWrite = mockAsyncStorage.setItem.mock.calls.find(([key]) => key === QUEUE_KEY);
      const failedWrite = mockAsyncStorage.setItem.mock.calls.find(
        ([key]) => key === FAILED_QUEUE_KEY,
      );
      expect(JSON.parse(activeWrite![1] as string)).toEqual([]);
      expect(JSON.parse(failedWrite![1] as string)).toEqual([]);
    });

    it('protects a canonical path that is still referenced by a retained failed item', async () => {
      const sharedUri = '/mock/documents/diagnosis-queue/shared-claim.jpg';
      mockAsyncStorage.getItem.mockImplementation(async (key) => {
        if (key === QUEUE_KEY) {
          return JSON.stringify([
            {
              ...makePendingDiagnosis({ id: 'shared-claim', userId: undefined }),
              imageUri: sharedUri,
            },
          ]);
        }
        if (key === FAILED_QUEUE_KEY) {
          return JSON.stringify([
            {
              ...makePendingDiagnosis({ id: 'shared-claim', userId: 'user-b' }),
              imageUri: sharedUri,
              movedToFailedAt: '2026-01-02T03:04:05.000Z',
            },
          ]);
        }
        return null;
      });

      await prepareDiagnosisQueueForOwnerClaim('user-b', { claimOwnerlessLegacy: false });

      expect(mockDeleteAsync).not.toHaveBeenCalled();
      expect(mockAsyncStorage.setItem).not.toHaveBeenCalledWith(
        FAILED_QUEUE_KEY,
        expect.anything(),
      );
    });

    it('rejects failed-queue persistence failure without deleting its photo', async () => {
      const legacyRaw = JSON.stringify([
        {
          ...makePendingDiagnosis({ id: 'failed-persist', userId: undefined }),
          imageUri: '/mock/documents/diagnosis-queue/failed-persist.jpg',
          movedToDLQAt: '2026-01-02T03:04:05.000Z',
        },
      ]);
      mockAsyncStorage.getItem.mockImplementation(async (key) =>
        key === FAILED_QUEUE_KEY ? legacyRaw : null,
      );
      mockAsyncStorage.setItem.mockImplementation(async (key) => {
        if (key === FAILED_QUEUE_KEY) throw new Error('disk full');
      });

      await expect(
        prepareDiagnosisQueueForOwnerClaim('user-a', { claimOwnerlessLegacy: true }),
      ).rejects.toThrow('disk full');
      expect(mockDeleteAsync).not.toHaveBeenCalled();
    });

    it('migrates legacy base64 entries to file-based storage', async () => {
      jest.resetModules();

      jest.mock('@react-native-async-storage/async-storage', () => ({
        getItem: jest.fn().mockResolvedValue(null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      }));
      jest.mock('expo-file-system/legacy', () => ({
        documentDirectory: '/mock/documents/',
        getInfoAsync: jest.fn().mockResolvedValue({ exists: true }),
        makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
        writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
        readAsStringAsync: jest.fn().mockResolvedValue('base64data'),
        readDirectoryAsync: jest.fn().mockResolvedValue([]),
        deleteAsync: jest.fn().mockResolvedValue(undefined),
        EncodingType: { Base64: 'base64' },
      }));

      const AsyncStorageFresh =
        require('@react-native-async-storage/async-storage').default ||
        require('@react-native-async-storage/async-storage');

      const FileSystemFresh = require('expo-file-system/legacy');

      const { getQueue: getQueueFresh } = require('../../services/diagnosisQueue');

      const legacyItems = [
        {
          id: 'legacy1',
          userId: 'user-1',
          imageBase64: 'oldbase64data',
          cropType: 'soja',
          latitude: -23.5,
          longitude: -46.6,
          createdAt: '2026-01-01T00:00:00Z',
          retryCount: 0,
        },
      ];

      AsyncStorageFresh.getItem.mockImplementation(async (key: string) =>
        key === QUEUE_KEY ? JSON.stringify(legacyItems) : null,
      );

      await getQueueFresh();

      expect(FileSystemFresh.writeAsStringAsync).toHaveBeenCalledWith(
        expect.stringContaining('legacy1.jpg'),
        'oldbase64data',
        { encoding: 'base64' },
      );
      expect(AsyncStorageFresh.setItem).toHaveBeenCalled();
    });

    it('never derives a replacement idempotency key for a legacy traversal id', async () => {
      jest.resetModules();

      jest.mock('@react-native-async-storage/async-storage', () => ({
        getItem: jest.fn().mockResolvedValue(null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      }));
      jest.mock('expo-file-system/legacy', () => ({
        documentDirectory: '/mock/documents/',
        getInfoAsync: jest.fn().mockResolvedValue({ exists: true }),
        makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
        writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
        readAsStringAsync: jest.fn().mockResolvedValue('base64data'),
        readDirectoryAsync: jest.fn().mockResolvedValue([]),
        deleteAsync: jest.fn().mockResolvedValue(undefined),
        EncodingType: { Base64: 'base64' },
      }));

      const AsyncStorageFresh =
        require('@react-native-async-storage/async-storage').default ||
        require('@react-native-async-storage/async-storage');
      const FileSystemFresh = require('expo-file-system/legacy');
      const {
        prepareDiagnosisQueueForOwnerClaim: prepareOwnerFresh,
      } = require('../../services/diagnosisQueue');
      const traversalRaw = JSON.stringify([
        {
          id: '../outside',
          imageBase64: 'oldbase64data',
          cropType: 'soja',
          latitude: null,
          longitude: null,
          createdAt: '2026-01-01T00:00:00Z',
          retryCount: 0,
        },
      ]);
      AsyncStorageFresh.getItem.mockImplementation(async (key: string) =>
        key === QUEUE_KEY ? traversalRaw : null,
      );

      await prepareOwnerFresh('user-1', { claimOwnerlessLegacy: true });

      expect(FileSystemFresh.writeAsStringAsync).not.toHaveBeenCalled();
      expect(FileSystemFresh.deleteAsync).not.toHaveBeenCalled();
      const saved = JSON.parse(AsyncStorageFresh.setItem.mock.calls[0][1]);
      expect(saved).toEqual([]);
    });
  });
});
