import { openDB } from 'idb';
export type QueuedImage = {
  id: string;
  userId: string;
  file: Blob;
  name: string;
  category: string;
  referenceId: string;
  notes: string;
  status: 'review' | 'queued' | 'uploading' | 'failed';
  orderName?: string;
  detectedReference?: string;
  ocrConfidence?: number;
  captureDate?: string | null;
  capturedAtLocal?: string | null;
  captureOffset?: string | null;
  captureSource?: 'EXIF' | 'CAMERA' | 'UNKNOWN';
  filedDate?: string | null;
  analysisNote?: string;
  error?: string;
  createdAt: number;
};
async function database() {
  return openDB('imagevault-uploads', 1, {
    upgrade(db) {
      db.createObjectStore('queue', { keyPath: 'id' });
    },
  });
}
export async function listQueue(userId: string): Promise<QueuedImage[]> {
  return (await (await database()).getAll('queue'))
    .filter((i: QueuedImage) => i.userId === userId)
    .sort((a, b) => a.createdAt - b.createdAt);
}
export async function saveQueue(item: QueuedImage) {
  await (await database()).put('queue', item);
}
export async function deleteQueue(id: string) {
  await (await database()).delete('queue', id);
}
