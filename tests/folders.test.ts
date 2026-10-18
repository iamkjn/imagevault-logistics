import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Prisma } from '@prisma/client';
import { ensureFolders, driveFetch } from '../src/lib/drive';
const date = new Date('2026-10-17T12:00:00Z');
function transaction(cached: Record<string, unknown> = {}) {
  return {
    driveFolder: {
      findUnique: vi.fn(
        async ({ where }: { where: { path: string } }) =>
          cached[where.path] || null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const result = { id: 'db-' + data.driveFolderId, ...data };
        cached[String(data.path)] = result;
        return result;
      }),
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('folder creation and recovery', () => {
  it('creates exactly four levels with the correct parent chain', async () => {
    let count = 0;
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
      Response.json(
        init?.method === 'POST' ? { id: `drive-${++count}` } : { files: [] },
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    const tx = transaction();
    const folder = await ensureFolders(
      tx as unknown as Prisma.TransactionClient,
      'token',
      'Parcels',
      date,
    );
    expect(folder.driveFolderId).toBe('drive-4');
    const posts = fetcher.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => JSON.parse(init!.body as string));
    expect(posts.map((p) => p.parents[0])).toEqual([
      'root',
      'drive-1',
      'drive-2',
      'drive-3',
    ]);
    expect(posts.map((p) => p.name)).toEqual([
      'ImageVault',
      'Parcels',
      '2026',
      '2026-10-17',
    ]);
  });
  it('uses cached folders without any Drive calls on a second upload', async () => {
    let n = 0;
    const fetcher = vi.fn(async (_u: string, i?: RequestInit) =>
      Response.json(i?.method === 'POST' ? { id: `d-${++n}` } : { files: [] }),
    );
    vi.stubGlobal('fetch', fetcher);
    const tx = transaction();
    await ensureFolders(
      tx as unknown as Prisma.TransactionClient,
      'token',
      'Parcels',
      date,
    );
    fetcher.mockClear();
    await ensureFolders(
      tx as unknown as Prisma.TransactionClient,
      'token',
      'Parcels',
      date,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('recovers Drive folders created before a DB rollback', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ files: [{ id: 'existing' }] }),
    );
    vi.stubGlobal('fetch', fetcher);
    const tx = transaction();
    await ensureFolders(
      tx as unknown as Prisma.TransactionClient,
      'token',
      'Other',
      date,
    );
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(tx.driveFolder.create).toHaveBeenCalledTimes(4);
  });
  it('does not retry permission errors', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ error: { message: 'Forbidden' } }, { status: 403 }),
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(driveFetch('token', '/files')).rejects.toThrow('Google Drive');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
