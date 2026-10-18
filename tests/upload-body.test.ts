import { it, expect } from 'vitest';
import { readUploadForm } from '../src/lib/upload-body';
it('rejects an oversized stream without a content-length header', async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(4 * 1024 * 1024));
      controller.close();
    },
  });
  const req = new Request('https://example.test/upload', {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=abc' },
    body,
    duplex: 'half',
  } as RequestInit);
  await expect(readUploadForm(req)).rejects.toMatchObject({ status: 413 });
});
it('accepts a bounded multipart body', async () => {
  const form = new FormData();
  form.set('referenceId', 'AWB-123');
  form.set('file', new Blob(['bytes'], { type: 'image/jpeg' }), 'photo.jpg');
  const parsed = await readUploadForm(
    new Request('https://example.test/upload', { method: 'POST', body: form }),
  );
  expect(parsed.get('referenceId')).toBe('AWB-123');
  expect((parsed.get('file') as File).size).toBe(5);
});
it('rejects non-multipart requests', async () => {
  await expect(
    readUploadForm(
      new Request('https://example.test/upload', {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json' },
      }),
    ),
  ).rejects.toMatchObject({ status: 400 });
});
