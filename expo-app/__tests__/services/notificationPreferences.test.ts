/**
 * Tests for services/notificationPreferences.ts
 *
 * Covers:
 *  - defaults are returned when row is missing / coerce of partial JSONB
 *  - cache fallback when supabase returns an error
 *  - optimistic save + rollback on server failure
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

// AsyncStorage mock with a real in-mockMemory store so cache reads/writes work.
const mockMemory = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockMemory.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockMemory.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      mockMemory.delete(k);
    }),
  },
}));

// Sentry mock
const mockSentryCaptureMessage = jest.fn();
const mockSentryCaptureException = jest.fn();
jest.mock('@sentry/react-native', () => ({
  captureMessage: (...args: unknown[]) => mockSentryCaptureMessage(...args),
  captureException: (...args: unknown[]) => mockSentryCaptureException(...args),
}));

// Supabase mock — chainable builder
type Resp = { data?: unknown; error?: { code: string; message: string } | null };
const mockSelectResponses: Resp[] = [];
const mockUpdateResponses: Resp[] = [];
const mockSelectCalls: Array<{
  table: string;
  column: string;
  equ: { col: string; val: unknown };
}> = [];
const mockUpdateCalls: Array<{
  table: string;
  patch: unknown;
  equ: { col: string; val: unknown };
}> = [];

jest.mock('../../services/supabase', () => {
  const eqSelect = (table: string, column: string) => {
    return (col: string, val: unknown) => {
      mockSelectCalls.push({ table, column, equ: { col, val } });
      const next = mockSelectResponses.shift() ?? { data: null, error: null };
      return {
        maybeSingle: async () => next,
      };
    };
  };
  const fromImpl = (table: string) => ({
    select: (column: string) => ({
      eq: eqSelect(table, column),
    }),
    update: (patch: unknown) => ({
      eq: (col: string, val: unknown) => {
        mockUpdateCalls.push({ table, patch, equ: { col, val } });
        const next = mockUpdateResponses.shift() ?? { error: null };
        return Promise.resolve(next);
      },
    }),
  });
  return {
    supabase: {
      from: (table: string) => fromImpl(table),
    },
  };
});

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  loadNotificationPreferences,
  saveNotificationPreferences,
  __resetNotificationPreferencesCache,
} from '../../services/notificationPreferences';

beforeEach(async () => {
  mockMemory.clear();
  mockSelectResponses.length = 0;
  mockUpdateResponses.length = 0;
  mockSelectCalls.length = 0;
  mockUpdateCalls.length = 0;
  mockSentryCaptureMessage.mockReset();
  mockSentryCaptureException.mockReset();
  await __resetNotificationPreferencesCache();
});

describe('loadNotificationPreferences', () => {
  it('returns defaults when the profile row is missing', async () => {
    mockSelectResponses.push({ data: null, error: null });
    const prefs = await loadNotificationPreferences('user-1');
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(mockSelectCalls[0]).toEqual({
      table: 'pragas_profiles',
      column: 'notification_preferences',
      equ: { col: 'user_id', val: 'user-1' },
    });
  });

  it('coerces partial JSONB into a full object', async () => {
    mockSelectResponses.push({
      data: { notification_preferences: { outbreaks_regional: false, news: false } },
      error: null,
    });
    const prefs = await loadNotificationPreferences('user-1');
    expect(prefs).toEqual({
      outbreaks_regional: false,
      daily_reminder: true,
      news: false,
      marketing: false,
    });
  });

  it('falls back to cache when supabase returns an error', async () => {
    // Pre-seed cache with a non-default value
    mockMemory.set(
      '@rumo_pragas_notification_prefs',
      JSON.stringify({
        outbreaks_regional: false,
        daily_reminder: false,
        news: false,
        marketing: true,
      }),
    );
    mockSelectResponses.push({ data: null, error: { code: 'PGRST116', message: 'fail' } });
    const prefs = await loadNotificationPreferences('user-1');
    expect(prefs).toEqual({
      outbreaks_regional: false,
      daily_reminder: false,
      news: false,
      marketing: true,
    });
    expect(mockSentryCaptureMessage).toHaveBeenCalled();
  });

  it('persists the loaded prefs to cache for offline reads', async () => {
    mockSelectResponses.push({
      data: {
        notification_preferences: {
          outbreaks_regional: true,
          daily_reminder: false,
          news: true,
          marketing: false,
        },
      },
      error: null,
    });
    await loadNotificationPreferences('user-1');
    const cached = mockMemory.get('@rumo_pragas_notification_prefs');
    expect(cached).not.toBeNull();
    const parsed = JSON.parse(cached!);
    expect(parsed.daily_reminder).toBe(false);
  });
});

describe('saveNotificationPreferences', () => {
  it('writes the merged prefs to supabase + cache and returns the new state', async () => {
    // Seed an existing cache so the merge has a base
    mockMemory.set(
      '@rumo_pragas_notification_prefs',
      JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES),
    );
    mockUpdateResponses.push({ error: null });
    const next = await saveNotificationPreferences('user-1', { marketing: true });
    expect(next.marketing).toBe(true);
    expect(next.outbreaks_regional).toBe(true); // unchanged from default
    expect(mockUpdateCalls).toHaveLength(1);
    const patch = mockUpdateCalls[0]!.patch as {
      notification_preferences: Record<string, unknown>;
    };
    expect(patch.notification_preferences.marketing).toBe(true);
    // updated_at must be sent so we can audit when the user opted in
    expect(typeof patch.notification_preferences.updated_at).toBe('string');
  });

  it('rolls back cache and throws when server returns an error', async () => {
    mockMemory.set(
      '@rumo_pragas_notification_prefs',
      JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES),
    );
    mockUpdateResponses.push({ error: { code: '42501', message: 'permission denied' } });
    await expect(saveNotificationPreferences('user-1', { marketing: true })).rejects.toThrow(
      /permission denied/,
    );
    const cached = JSON.parse(mockMemory.get('@rumo_pragas_notification_prefs')!);
    expect(cached.marketing).toBe(false); // rolled back to the default
    expect(mockSentryCaptureMessage).toHaveBeenCalled();
  });
});
