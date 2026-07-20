/**
 * Web regression guard for the P0 (2026-07-20): after login on
 * app.pragas.agrorumo.com the account owner-claim purged the offline diagnosis
 * queue, whose expo-file-system/legacy backend is a no-op shim on web
 * (`documentDirectory === null`, every file method throws `UnavailabilityError`).
 * The throw propagated up through useAuth's completeSessionLink and stranded
 * every web login on the "local_data_purge_failed" gate.
 *
 * On web there is no on-disk photo of any user, so the file-backed queue must be
 * treated as empty (fail-open) and must never touch the (unavailable) filesystem.
 * A null `documentDirectory` is exactly the runtime signal the web shim exposes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockGetInfoAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
const mockWriteAsStringAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
const mockReadDirectoryAsync = jest.fn();
const mockDeleteAsync = jest.fn();

// Web shim shape: `documentDirectory` is null on web. The file methods are spied
// so the test can prove the fail-open path never reaches the filesystem.
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: null,
  getInfoAsync: (...a: unknown[]) => mockGetInfoAsync(...a),
  makeDirectoryAsync: (...a: unknown[]) => mockMakeDirectoryAsync(...a),
  writeAsStringAsync: (...a: unknown[]) => mockWriteAsStringAsync(...a),
  readAsStringAsync: (...a: unknown[]) => mockReadAsStringAsync(...a),
  readDirectoryAsync: (...a: unknown[]) => mockReadDirectoryAsync(...a),
  deleteAsync: (...a: unknown[]) => mockDeleteAsync(...a),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  multiSet: jest.fn().mockResolvedValue(undefined),
  multiRemove: jest.fn().mockResolvedValue(undefined),
  getAllKeys: jest.fn().mockResolvedValue([]),
}));

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'mock-uuid') }));

import {
  prepareDiagnosisQueueForOwnerClaim,
  purgeDiagnosisQueuesForUser,
  purgeAllDiagnosisQueueData,
  resumePendingDiagnosisQueueCleanup,
  DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY,
} from '../../services/diagnosisQueue';

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const OWNER = '11111111-1111-4111-8111-111111111111';

const FS_METHODS = [
  mockGetInfoAsync,
  mockMakeDirectoryAsync,
  mockWriteAsStringAsync,
  mockReadAsStringAsync,
  mockReadDirectoryAsync,
  mockDeleteAsync,
];

function expectNoFilesystemAccess(): void {
  for (const fn of FS_METHODS) expect(fn).not.toHaveBeenCalled();
}

describe('diagnosisQueue on web (no device filesystem)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.getAllKeys.mockResolvedValue([]);
  });

  it('prepareDiagnosisQueueForOwnerClaim resolves without touching the filesystem (unblocks web login)', async () => {
    await expect(
      prepareDiagnosisQueueForOwnerClaim(OWNER, { claimOwnerlessLegacy: false }),
    ).resolves.toBeUndefined();
    expectNoFilesystemAccess();
  });

  it('purgeDiagnosisQueuesForUser resolves without touching the filesystem (unblocks web sign-out)', async () => {
    await expect(purgeDiagnosisQueuesForUser(OWNER)).resolves.toBeUndefined();
    expectNoFilesystemAccess();
  });

  it('purgeAllDiagnosisQueueData resolves without touching the filesystem (corrupt-owner recovery)', async () => {
    await expect(purgeAllDiagnosisQueueData()).resolves.toBeUndefined();
    expectNoFilesystemAccess();
  });

  it('resumePendingDiagnosisQueueCleanup discards a stale journal instead of applying it', async () => {
    mockAsyncStorage.getItem.mockResolvedValueOnce(
      JSON.stringify({ version: 1, mode: 'references', cleanup: [] }),
    );
    await expect(resumePendingDiagnosisQueueCleanup()).resolves.toBeUndefined();
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(DIAGNOSIS_QUEUE_CLEANUP_JOURNAL_KEY);
    expectNoFilesystemAccess();
  });
});
