import type { Prisma } from '@prisma/client';
import { db } from './db';
import { decrypt, encrypt } from './crypto';
import { HttpError } from './auth';
import { folderPaths, type CategoryName } from './naming';
const base = 'https://www.googleapis.com/drive/v3';
export async function driveToken() {
  const email = (
    process.env.DRIVE_OWNER_EMAIL ||
    process.env.ADMIN_EMAILS?.split(',')[0] ||
    ''
  )
    .trim()
    .toLowerCase();
  const owner = await db.user.findUnique({ where: { email } });
  if (
    !owner?.encryptedRefreshToken ||
    owner.status !== 'ACTIVE' ||
    owner.role !== 'ADMIN'
  )
    throw new HttpError(
      503,
      'The vault owner must sign in with Google and connect Drive first.',
    );
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: decrypt(owner.encryptedRefreshToken),
    }),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok)
    throw new HttpError(
      503,
      'Drive access has expired. Ask the vault owner to sign out and reconnect Google.',
    );
  if (data.refresh_token)
    await db.user.update({
      where: { id: owner.id },
      data: { encryptedRefreshToken: encrypt(data.refresh_token) },
    });
  return data.access_token as string;
}
export async function driveFetch(
  token: string,
  path: string,
  init: RequestInit = {},
  absolute = false,
): Promise<Response> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(absolute ? path : base + path, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (res.ok) return res;
    const body = await res.json().catch(() => ({}));
    const retry =
      res.status === 429 ||
      res.status >= 500 ||
      (res.status === 403 && JSON.stringify(body).includes('rateLimit'));
    if (retry && attempt < 3) {
      await new Promise((r) =>
        setTimeout(r, 500 * 2 ** attempt + Math.random() * 250),
      );
      continue;
    }
    if (res.status === 404)
      throw new HttpError(
        404,
        'This file or folder no longer exists in Google Drive.',
      );
    throw new HttpError(
      res.status === 401 ? 503 : 502,
      'Google Drive could not complete this request. Reconnect Drive or try again.',
    );
  }
  throw new HttpError(502, 'Google Drive is temporarily unavailable.');
}
export function escapeQuery(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
// Caller holds a transaction-scoped PostgreSQL advisory lock for the vault.
export async function ensureFolders(
  tx: Prisma.TransactionClient,
  token: string,
  category: CategoryName,
  date: Date | string | null,
) {
  let parent: string | undefined;
  let result: Awaited<ReturnType<typeof tx.driveFolder.upsert>> | undefined;
  for (const path of folderPaths(category, date)) {
    const cached = await tx.driveFolder.findUnique({ where: { path } });
    if (cached) {
      result = cached;
      parent = cached.driveFolderId;
      continue;
    }
    const name = path.split('/').at(-1)!;
    const q = `trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = '${escapeQuery(name)}' and '${escapeQuery(parent || 'root')}' in parents`;
    const found = await (
      await driveFetch(
        token,
        `/files?${new URLSearchParams({ q, fields: 'files(id)', pageSize: '100' })}`,
      )
    ).json();
    const folder =
      found.files?.[0] ||
      (await (
        await driveFetch(token, '/files?fields=id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parent || 'root'],
          }),
        })
      ).json());
    result = await tx.driveFolder.create({
      data: {
        path,
        driveFolderId: folder.id,
        categoryId:
          path === 'ImageVault' || path === 'ImageVault/Misc' ? null : category,
        date: path.split('/').length === 4 ? path.split('/').at(-1) : null,
      },
    });
    parent = folder.id;
  }
  return result!;
}
export async function vaultLock(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(73400291)`;
}
