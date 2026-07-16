const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockCreateSignedUrl = jest.fn();
const mockSaveProfile = jest.fn();
const mockProfileMaybeSingle = jest.fn();
const mockCaptureMessage = jest.fn();

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '11111111-2222-4333-8444-555555555555'),
}));

jest.mock('../../constants/config', () => ({
  Config: { SUPABASE_URL: 'https://project.supabase.co' },
}));

jest.mock('../../services/pragasProfile', () => ({
  savePragasProfileFields: (...args: unknown[]) => mockSaveProfile(...args),
}));

jest.mock('../../services/sentry-shim', () => ({
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
}));

jest.mock('../../services/supabase', () => ({
  timeoutHeader: (ms: number) => ({ 'x-rumo-timeout-ms': String(ms) }),
  supabase: {
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, bytes: ArrayBuffer, options: unknown) =>
          mockUpload(bucket, path, bytes, options),
        remove: (paths: string[]) => mockRemove(bucket, paths),
        createSignedUrl: (path: string, expiresIn: number) =>
          mockCreateSignedUrl(bucket, path, expiresIn),
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => mockProfileMaybeSingle() }),
      }),
    }),
  },
}));

import {
  getPragasAvatarSignedUrl,
  parseOwnedLegacyAvatarUrl,
  PRAGAS_AVATAR_SIGNED_URL_SECONDS,
  replacePragasAvatar,
} from '../../services/avatar';

const userId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const newPath = `${userId}/avatar-11111111-2222-4333-8444-555555555555.jpg`;
const oldPath = `${userId}/avatar-1700000000000.jpg`;

beforeEach(() => {
  jest.clearAllMocks();
  mockUpload.mockResolvedValue({ error: null });
  mockRemove.mockResolvedValue({ error: null });
  mockSaveProfile.mockResolvedValue(undefined);
  mockProfileMaybeSingle.mockResolvedValue({ data: { avatar_path: null }, error: null });
  mockCreateSignedUrl.mockResolvedValue({
    data: {
      signedUrl: `https://project.supabase.co/storage/v1/object/sign/pragas-avatars/${newPath}?token=signed`,
    },
    error: null,
  });
});

describe('private Pragas avatars', () => {
  it('creates only a bounded signed URL for an owned path', async () => {
    await expect(getPragasAvatarSignedUrl(userId, newPath)).resolves.toContain('?token=signed');
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      'pragas-avatars',
      newPath,
      PRAGAS_AVATAR_SIGNED_URL_SECONDS,
    );
    await expect(
      getPragasAvatarSignedUrl(userId, `another-user/avatar-123.jpg`),
    ).resolves.toBeNull();
  });

  it('persists the new path before deleting exact prior Pragas objects', async () => {
    const legacyUrl =
      `https://project.supabase.co/storage/v1/object/public/avatars/${oldPath}` +
      '?t=1700000000000';
    const result = await replacePragasAvatar({
      userId,
      bytes: new ArrayBuffer(128),
      mimeType: 'image/jpeg',
      previousPath: oldPath,
      previousLegacyUrl: legacyUrl,
    });

    expect(result.path).toBe(newPath);
    expect(mockUpload).toHaveBeenCalledWith(
      'pragas-avatars',
      newPath,
      expect.any(ArrayBuffer),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: false }),
    );
    expect(mockSaveProfile).toHaveBeenCalledWith(userId, {
      avatar_path: newPath,
      avatar_url: null,
    });
    expect(mockRemove).toHaveBeenCalledWith('pragas-avatars', [oldPath]);
    expect(mockRemove).toHaveBeenCalledWith('avatars', [oldPath]);
    expect(mockSaveProfile.mock.invocationCallOrder[0]).toBeLessThan(
      mockRemove.mock.invocationCallOrder[0]!,
    );
  });

  it('rolls back only the newly uploaded object when profile persistence fails', async () => {
    mockSaveProfile.mockRejectedValueOnce(new Error('private database detail'));
    await expect(
      replacePragasAvatar({
        userId,
        bytes: new ArrayBuffer(128),
        mimeType: 'image/jpeg',
        previousPath: oldPath,
        previousLegacyUrl: null,
      }),
    ).rejects.toThrow('AVATAR_PROFILE_SAVE_FAILED');

    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalledWith('pragas-avatars', [newPath]);
    expect(mockRemove).not.toHaveBeenCalledWith('pragas-avatars', [oldPath]);
  });

  it('keeps the new object when a lost response makes commit status uncertain', async () => {
    mockSaveProfile.mockRejectedValueOnce(new Error('network response lost'));
    mockProfileMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'network unavailable' },
    });

    await expect(
      replacePragasAvatar({
        userId,
        bytes: new ArrayBuffer(128),
        mimeType: 'image/jpeg',
        previousPath: oldPath,
        previousLegacyUrl: null,
      }),
    ).rejects.toThrow('AVATAR_PROFILE_SAVE_UNCERTAIN');

    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'avatar profile persistence verification failed',
      expect.any(Object),
    );
  });

  it('continues when read-back proves that a failed response actually committed', async () => {
    mockSaveProfile.mockRejectedValueOnce(new Error('network response lost'));
    mockProfileMaybeSingle.mockResolvedValueOnce({
      data: { avatar_path: newPath },
      error: null,
    });

    const result = await replacePragasAvatar({
      userId,
      bytes: new ArrayBuffer(128),
      mimeType: 'image/jpeg',
      previousPath: null,
      previousLegacyUrl: null,
    });

    expect(result.path).toBe(newPath);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('surfaces a deferred rollback when Storage returns an error result', async () => {
    mockSaveProfile.mockRejectedValueOnce(new Error('database rejected write'));
    mockRemove.mockResolvedValueOnce({ error: { message: 'storage unavailable' } });

    await expect(
      replacePragasAvatar({
        userId,
        bytes: new ArrayBuffer(128),
        mimeType: 'image/jpeg',
        previousPath: oldPath,
        previousLegacyUrl: null,
      }),
    ).rejects.toThrow('AVATAR_PROFILE_SAVE_FAILED_ROLLBACK_PENDING');

    expect(mockRemove).toHaveBeenCalledWith('pragas-avatars', [newPath]);
    expect(mockRemove).not.toHaveBeenCalledWith('pragas-avatars', [oldPath]);
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'avatar object cleanup deferred',
      expect.any(Object),
    );
  });

  it('never deletes a foreign, malformed or differently hosted legacy URL', () => {
    expect(
      parseOwnedLegacyAvatarUrl(
        userId,
        `https://evil.example/storage/v1/object/public/avatars/${oldPath}?t=1`,
      ),
    ).toBeNull();
    expect(
      parseOwnedLegacyAvatarUrl(
        userId,
        `https://project.supabase.co/storage/v1/object/public/avatars/${oldPath}?x=1`,
      ),
    ).toBeNull();
    expect(
      parseOwnedLegacyAvatarUrl(
        userId,
        'https://project.supabase.co/storage/v1/object/public/avatars/other/avatar-1.jpg?t=1',
      ),
    ).toBeNull();
  });

  it('rejects an oversized object before any storage mutation', async () => {
    await expect(
      replacePragasAvatar({
        userId,
        bytes: new ArrayBuffer(2 * 1024 * 1024 + 1),
        mimeType: 'image/jpeg',
        previousPath: null,
        previousLegacyUrl: null,
      }),
    ).rejects.toThrow('AVATAR_INVALID_SIZE');
    expect(mockUpload).not.toHaveBeenCalled();
  });
});
