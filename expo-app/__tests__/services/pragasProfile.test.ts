const mockFrom = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockMaybeSingle = jest.fn();
const mockInsert = jest.fn();
const mockUpsert = jest.fn((..._args: unknown[]) => {
  throw new Error('UPSERT_MUST_NOT_BE_USED');
});

jest.mock('../../services/supabase', () => ({
  supabase: {
    from: (table: string) => {
      mockFrom(table);
      return {
        update: (fields: unknown) => {
          mockUpdate(fields);
          return {
            eq: (column: string, value: string) => {
              mockEq(column, value);
              return {
                select: (columns: string) => {
                  mockSelect(columns);
                  return { maybeSingle: () => mockMaybeSingle() };
                },
              };
            },
          };
        },
        insert: (fields: unknown) => mockInsert(fields),
        upsert: (...args: unknown[]) => mockUpsert(...args),
      };
    },
  },
}));

import {
  savePragasProfileFields,
  type PragasProfileMutableFields,
} from '../../services/pragasProfile';

const userId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

beforeEach(() => {
  jest.clearAllMocks();
  mockMaybeSingle.mockResolvedValue({ data: { user_id: userId }, error: null });
  mockInsert.mockResolvedValue({ error: null });
});

describe('savePragasProfileFields', () => {
  it('updates an existing profile without sending immutable identity columns', async () => {
    await savePragasProfileFields(userId, {
      full_name: 'Maria',
      city: 'Londrina',
      crops: ['soja'],
    });

    expect(mockFrom).toHaveBeenCalledWith('pragas_profiles');
    expect(mockUpdate).toHaveBeenCalledWith({
      full_name: 'Maria',
      city: 'Londrina',
      crops: ['soja'],
    });
    expect(mockEq).toHaveBeenCalledWith('user_id', userId);
    expect(mockSelect).toHaveBeenCalledWith('user_id');
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('inserts the owner only when the profile row does not exist', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await savePragasProfileFields(userId, { phone: null, state: 'PR' });

    expect(mockUpdate).toHaveBeenCalledWith({ phone: null, state: 'PR' });
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: userId,
      phone: null,
      state: 'PR',
    });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('retries the mutable UPDATE when a concurrent INSERT wins the race', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { user_id: userId }, error: null });
    mockInsert.mockResolvedValueOnce({
      error: { code: '23505', message: 'duplicate key detail must not escape' },
    });

    await savePragasProfileFields(userId, { avatar_path: 'owned/avatar.jpg' });

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenNthCalledWith(1, { avatar_path: 'owned/avatar.jpg' });
    expect(mockUpdate).toHaveBeenNthCalledWith(2, { avatar_path: 'owned/avatar.jpg' });
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('rejects when a unique-violation race cannot be recovered by UPDATE', async () => {
    const uniqueViolation = { code: '23505', message: 'duplicate key' };
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockInsert.mockResolvedValueOnce({ error: uniqueViolation });

    await expect(savePragasProfileFields(userId, { city: 'Maringá' })).rejects.toBe(
      uniqueViolation,
    );
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it('whitelists mutable fields even if an untyped caller injects identity keys', async () => {
    const injectedFields = {
      city: 'Cascavel',
      id: 'forged-profile-id',
      user_id: 'forged-owner-id',
    } as unknown as PragasProfileMutableFields;

    await savePragasProfileFields(userId, injectedFields);

    expect(mockUpdate).toHaveBeenCalledWith({ city: 'Cascavel' });
    expect(mockUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ id: expect.anything() }));
    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ user_id: expect.anything() }),
    );
  });
});
