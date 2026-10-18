import { it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}));
vi.mock('../src/lib/auth', () => ({
  requireUser: mocks.requireUser,
  HttpError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock('../src/lib/db', () => ({
  db: { image: { findMany: mocks.findMany, count: mocks.count } },
}));
import { handle } from '../src/lib/api';
import { HttpError } from '../src/lib/auth';
beforeEach(() => {
  mocks.requireUser.mockResolvedValue({ id: 'member-1', role: 'USER' });
  mocks.findMany.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
});
it('ignores a member’s request to view another uploader', async () => {
  const res = await handle(
    new NextRequest('http://localhost:3000/api/images?user=admin-id'),
    ['images'],
  );
  expect(res.status).toBe(200);
  expect(mocks.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ uploadedById: 'member-1' }),
    }),
  );
});
it('requires administrator access before reading team data', async () => {
  mocks.requireUser.mockRejectedValue(
    new HttpError(403, 'Administrator access required.'),
  );
  const res = await handle(
    new NextRequest('http://localhost:3000/api/admin/users'),
    ['admin', 'users'],
  );
  expect(mocks.requireUser).toHaveBeenCalledWith(true);
  expect(res.status).toBe(403);
});
it('blocks cross-origin writes before any data access', async () => {
  const res = await handle(
    new NextRequest('http://localhost:3000/api/images/bulk', {
      method: 'POST',
      headers: { origin: 'https://attacker.example' },
      body: '{}',
    }),
    ['images', 'bulk'],
  );
  expect(res.status).toBe(403);
  expect(mocks.requireUser).not.toHaveBeenCalled();
});
it('rejects an inverted date range', async () => {
  const res = await handle(
    new NextRequest(
      'http://localhost:3000/api/images?start=2026-10-17&end=2026-10-16',
    ),
    ['images'],
  );
  expect(res.status).toBe(400);
  expect(mocks.findMany).not.toHaveBeenCalled();
});
