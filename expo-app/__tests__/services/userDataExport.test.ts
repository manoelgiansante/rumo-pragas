import fs from 'node:fs';
import path from 'node:path';

jest.mock('../../constants/config', () => ({
  Config: { SUPABASE_URL: 'https://test.supabase.co' },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { __internal, requestPragasUserDataExport } from '../../services/userDataExport';

const fixtureRaw = fs.readFileSync(
  path.resolve(__dirname, '../../../contracts/pragas-user-data-export-v2.json'),
  'utf8',
);
const payload = JSON.parse(fixtureRaw) as Record<string, unknown>;

describe('Pragas user-data export', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accepts the shared backend/client schema-v2 fixture', () => {
    expect(__internal.parseExport(fixtureRaw)).toMatchObject({
      schemaVersion: 2,
      app: 'rumo-pragas',
      manifest: { complete: true, truncated: false, totalRows: 0, totalBytes: 0 },
    });
  });

  it('uses authenticated app-scoped endpoint and stable idempotency key', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers(),
      text: async () => JSON.stringify(payload),
    });
    const key = ['a1b2c3d4', 'e5f6', '4789', '8abc', '1234567890ab'].join('-');
    const result = await requestPragasUserDataExport('jwt', key);
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://test.supabase.co/functions/v1/pragas-export-user-data',
    );
    expect(mockFetch.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer jwt',
      'Idempotency-Key': key,
    });
    expect(result.filename).toBe('rumo-pragas-export-2026-07-14.json');
  });

  it('rejects a sibling/wrong-schema payload', () => {
    expect(() => __internal.parseExport(JSON.stringify({ ...payload, app: 'rumo-vet' }))).toThrow(
      'invalid_export',
    );
    expect(() => __internal.parseExport(JSON.stringify({ ...payload, schemaVersion: 1 }))).toThrow(
      'invalid_export',
    );
  });

  it.each([
    { label: 'missing manifest', manifest: undefined },
    {
      label: 'incomplete',
      manifest: { complete: false, truncated: false, totalRows: 0, totalBytes: 0 },
    },
    {
      label: 'truncated',
      manifest: { complete: true, truncated: true, totalRows: 0, totalBytes: 0 },
    },
    {
      label: 'row mismatch',
      manifest: { complete: true, truncated: false, totalRows: 1, totalBytes: 0 },
    },
    {
      label: 'byte mismatch',
      manifest: { complete: true, truncated: false, totalRows: 0, totalBytes: 1 },
    },
  ])('fails closed for $label export', ({ manifest }) => {
    expect(() => __internal.parseExport(JSON.stringify({ ...payload, manifest }))).toThrow(
      'invalid_export',
    );
  });

  it('requires manifest budgets to match all returned records', () => {
    const row = { id: 'diagnosis-1', crop: 'soja' };
    const totalBytes = new TextEncoder().encode(JSON.stringify(row)).byteLength;
    const valid = {
      ...payload,
      data: { diagnoses: [row] },
      manifest: {
        complete: true,
        truncated: false,
        totalRows: 1,
        totalBytes,
        consistency: (payload.manifest as Record<string, unknown>).consistency,
        includedColumns: { diagnoses: ['id', 'crop'] },
        excludedBinaryFields: ['pragas_diagnoses.image_url'],
      },
    };
    expect(__internal.parseExport(JSON.stringify(valid)).manifest.totalBytes).toBe(totalBytes);
    expect(() =>
      __internal.parseExport(
        JSON.stringify({
          ...valid,
          manifest: { ...valid.manifest, includedColumns: { unknownDataset: ['id'] } },
        }),
      ),
    ).toThrow('invalid_export');
  });

  it('rejects an export whose snapshot proof is absent or does not match exportedAt', () => {
    const manifest = payload.manifest as Record<string, unknown>;
    expect(() =>
      __internal.parseExport(
        JSON.stringify({ ...payload, manifest: { ...manifest, consistency: undefined } }),
      ),
    ).toThrow('invalid_export');
    expect(() =>
      __internal.parseExport(
        JSON.stringify({
          ...payload,
          manifest: {
            ...manifest,
            consistency: {
              ...(manifest.consistency as Record<string, unknown>),
              snapshotAt: '2026-07-14T12:00:01.000Z',
            },
          },
        }),
      ),
    ).toThrow('invalid_export');
  });

  it('does not expose backend error bodies', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, headers: new Headers() });
    await expect(requestPragasUserDataExport('jwt', 'stable')).rejects.toThrow('unavailable');
  });
});
