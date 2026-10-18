import { demoRequest } from './demo';
export async function request<T = unknown>(
  path: string,
  demo = false,
  init: RequestInit = {},
): Promise<T> {
  const [base, query] = path.split('?');
  if (query) {
    const q = new URLSearchParams(query);
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    path = base + '?' + q.toString();
  }
  if (demo) return demoRequest(path, init) as Promise<T>;
  const res = await fetch(`/api/${path}`, {
    ...init,
    headers: {
      ...(init.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
export type Viewer = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
  status: string;
};
export type VaultImage = {
  id: string;
  driveFileId: string;
  fileName: string;
  categoryId: string;
  referenceId: string;
  orderName?: string | null;
  detectedReference?: string | null;
  ocrConfidence?: number | null;
  captureDate?: string | null;
  capturedAtLocal?: string | null;
  captureOffset?: string | null;
  captureSource?: string;
  filedDate?: string | null;
  notes: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: { id: string; name: string; email: string };
  sample?: number;
};
export type Stats = {
  total: number;
  today: number;
  week: number;
  month: number;
  activeUsers: number;
  filteredTotal: number;
  daily: ({ date: string; total: number } & Record<string, number | string>)[];
  categories: { name: string; value: number }[];
  users: { name: string; count: number }[];
  timezone: string;
};
export type VaultUser = Viewer & {
  createdAt: string;
  _count: { images: number };
};
export type Folder = {
  id: string;
  driveFolderId: string;
  path: string;
  date: string | null;
  _count: { images: number };
};
export type Activity = {
  id: string;
  action: string;
  entityId: string;
  createdAt: string;
  user: { name: string; email: string };
  meta: Record<string, unknown>;
};
