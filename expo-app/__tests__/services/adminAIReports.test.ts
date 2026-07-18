const mockFetch = jest.fn();

import {
  isPragasAdmin,
  listAdminAIReports,
  updateAdminAIReport,
} from '../../services/adminAIReports';

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = mockFetch;
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: jest
      .fn()
      .mockResolvedValue({ reports: [], pagination: { page: 1, limit: 20, total: 0 } }),
  });
});

describe('admin AI reports service', () => {
  it('lists reports with authenticated, encoded filters', async () => {
    await listAdminAIReports('token-1', { page: 2, limit: 10, status: 'reviewing' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/functions/v1/admin-ai-content-reports?page=2&limit=10&status=reviewing',
      ),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('updates a report with the exact backend contract and idempotency key', async () => {
    await updateAdminAIReport(
      'token-1',
      {
        id: 'report-1',
        status: 'resolved',
        note: '  Confirmed and corrected  ',
      },
      'idempotency-uuid',
    );

    const [, init] = mockFetch.mock.calls[0];
    expect(init).toMatchObject({
      method: 'PATCH',
      headers: expect.objectContaining({
        Authorization: 'Bearer token-1',
        'Idempotency-Key': 'idempotency-uuid',
      }),
      body: JSON.stringify({
        id: 'report-1',
        status: 'resolved',
        note: 'Confirmed and corrected',
      }),
    });
  });

  it('fails closed without an authenticated token', async () => {
    await expect(listAdminAIReports('   ')).rejects.toThrow('unauthorized');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('maps backend errors without exposing its raw body', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: jest.fn().mockResolvedValue({ error: 'internal database detail' }),
    });
    await expect(listAdminAIReports('token-1')).rejects.toThrow('forbidden');
    await expect(listAdminAIReports('token-1')).rejects.not.toThrow('internal database detail');
  });

  it('requires the exact pragas_admin app metadata claim', () => {
    expect(isPragasAdmin({ app_metadata: { pragas_admin: true } })).toBe(true);
    expect(isPragasAdmin({ app_metadata: { pragas_admin: 'true' } })).toBe(false);
    expect(isPragasAdmin({ app_metadata: {} })).toBe(false);
    expect(isPragasAdmin(null)).toBe(false);
  });
});
