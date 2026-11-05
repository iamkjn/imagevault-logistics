'use client';

import type { QueuedImage } from './queue';

const CLIENT_ID =
  '234145090777-1nugcnaa24ha7fh9j9bhb1rm8sp9clrp.apps.googleusercontent.com';
const LOGISTICS_FOLDER_ID = '1nKx73ZS6GLzIfR2O-VArm9cnlO1VD9JE';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
};
type TokenClient = {
  requestAccessToken(options?: { prompt?: string }): void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(options: {
            client_id: string;
            scope: string;
            callback(response: TokenResponse): void;
            error_callback?(error: unknown): void;
          }): TokenClient;
        };
      };
    };
  }
}

let accessToken = '';
let tokenExpiresAt = 0;
let scriptPromise: Promise<void> | null = null;

function loadGoogleIdentity() {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    const script = existing || document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google sign-in could not load.'));
    if (!existing) document.head.appendChild(script);
  });
  return scriptPromise;
}

export async function getDriveAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) return accessToken;
  await loadGoogleIdentity();
  return new Promise<string>((resolve, reject) => {
    const client = window.google?.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback(response) {
        if (!response.access_token) {
          reject(
            new Error(response.error || 'Google Drive access was not granted.'),
          );
          return;
        }
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + (response.expires_in || 3600) * 1000;
        resolve(accessToken);
      },
      error_callback: () => reject(new Error('Google sign-in was cancelled.')),
    });
    client?.requestAccessToken({ prompt: 'consent' });
  });
}

async function driveFetch<T>(token: string, url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    if (response.status === 401) {
      accessToken = '';
      tokenExpiresAt = 0;
    }
    const detail = await response.json().catch(() => null);
    throw new Error(
      detail?.error?.message ||
        `Google Drive upload failed (${response.status}).`,
    );
  }
  return (await response.json()) as T;
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function ensureFolder(token: string, parentId: string, name: string) {
  const params = new URLSearchParams({
    q: `'${escapeDriveQuery(parentId)}' in parents and name = '${escapeDriveQuery(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id,name)',
    spaces: 'drive',
  });
  const found = await driveFetch<{ files: Array<{ id: string }> }>(
    token,
    `https://www.googleapis.com/drive/v3/files?${params}`,
  );
  if (found.files[0]) return found.files[0].id;
  const created = await driveFetch<{ id: string }>(
    token,
    'https://www.googleapis.com/drive/v3/files?fields=id',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      }),
    },
  );
  return created.id;
}

async function destinationFolder(token: string, item: QueuedImage) {
  if (!item.filedDate) return ensureFolder(token, LOGISTICS_FOLDER_ID, 'Misc');
  const category = await ensureFolder(
    token,
    LOGISTICS_FOLDER_ID,
    item.category,
  );
  const year = await ensureFolder(token, category, item.filedDate.slice(0, 4));
  return ensureFolder(token, year, item.filedDate);
}

function driveFileName(item: QueuedImage) {
  const reference = (item.referenceId || item.orderName || 'UNSORTED')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(0, 70);
  const original = item.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-90);
  return `${item.category}_${reference}_${Date.now()}_${original}`;
}

export async function uploadDirectToDrive(token: string, item: QueuedImage) {
  const folderId = await destinationFolder(token, item);
  const boundary = `imagevault-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name: driveFileName(item),
    parents: [folderId],
    description: [item.orderName, item.referenceId, item.notes]
      .filter(Boolean)
      .join(' · '),
  });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`,
    item.file,
    `\r\n--${boundary}--`,
  ]);
  return driveFetch<{ id: string; name: string; webViewLink: string }>(
    token,
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
}
