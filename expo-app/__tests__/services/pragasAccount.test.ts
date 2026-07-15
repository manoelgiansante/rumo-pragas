jest.mock('../../constants/config', () => ({
  Config: { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'anon' },
}));
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { linkPragasAccount, reactivatePragasAccount } from '../../services/pragasAccount';

describe('Pragas account link/reactivation contracts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('links through the authenticated dedicated PostgREST RPC', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ linked: true, app: 'rumo-pragas', code: 'already_linked' }),
    });
    const result = await linkPragasAccount('jwt', 'stable-link-key');
    expect(result.linked).toBe(true);
    expect(mockFetch.mock.calls[0][0]).toContain('/rest/v1/rpc/pragas_link_account');
    expect(mockFetch.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer jwt',
      'Idempotency-Key': 'stable-link-key',
    });
  });

  it('returns the explicit reactivation-required state without recreating data', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        linked: false,
        app: 'rumo-pragas',
        code: 'deleted_reactivation_required',
      }),
    });
    await expect(linkPragasAccount('jwt')).resolves.toMatchObject({
      linked: false,
      code: 'deleted_reactivation_required',
    });
  });

  it('reactivates only with explicit confirmation and a stable key', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        code: 'PRAGAS_ACCOUNT_REACTIVATED',
        reactivated: true,
        dataRestored: false,
      }),
    });
    await reactivatePragasAccount('jwt', 'stable-reactivation-key');
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      confirm: 'REACTIVATE_RUMO_PRAGAS',
    });
    expect(mockFetch.mock.calls[0][1].headers['Idempotency-Key']).toBe('stable-reactivation-key');
  });
});
