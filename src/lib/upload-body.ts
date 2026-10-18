import { HttpError } from './auth';
/** Bound the stream before multipart parsing, including chunked requests without Content-Length. */
export async function readUploadForm(request: Request): Promise<FormData> {
  const maxBytes = Math.floor(3.7 * 1024 * 1024);
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.startsWith('multipart/form-data;'))
    throw new HttpError(400, 'Send the image as multipart form data.');
  if (Number(request.headers.get('content-length') || 0) > maxBytes)
    throw new HttpError(
      413,
      'The upload is too large. Compress the image to under 3 MB.',
    );
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'An image is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(
          413,
          'The upload is too large. Compress the image to under 3 MB.',
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return await new Response(bytes, {
      headers: { 'content-type': contentType },
    }).formData();
  } catch {
    throw new HttpError(
      400,
      'The upload could not be read. Select the image again.',
    );
  }
}
