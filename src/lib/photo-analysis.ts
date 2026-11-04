'use client';
import {
  captureFromTags,
  captureFromFilename,
  captureFromFileTimestamp,
  cameraCapture,
  detectOrder,
  type CaptureMetadata,
  type OrderDetection,
} from './photo-intelligence';
export async function readCapture(
  original: File,
  source: 'gallery' | 'camera',
): Promise<CaptureMetadata> {
  // A file returned by a live camera input was captured now. Do not let stale
  // metadata supplied by a device or image-processing app override that fact.
  if (source === 'camera') return cameraCapture();
  try {
    const exifr = await import('exifr');
    const tags = await exifr.parse(original, {
      pick: [
        'DateTimeOriginal',
        'DateTimeDigitized',
        'CreateDate',
        'CreationDate',
        'MediaCreateDate',
        'OffsetTimeOriginal',
        'OffsetTimeDigitized',
      ],
      reviveValues: false,
      translateValues: false,
    });
    const capture = captureFromTags(tags);
    if (capture.captureDate) return capture;
  } catch {
    /* Continue through safe fallbacks for malformed or stripped metadata. */
  }
  const named = captureFromFilename(original.name);
  if (named.captureDate) return named;
  const timestamp = captureFromFileTimestamp(original.lastModified);
  return timestamp.captureDate ? timestamp : captureFromTags(undefined);
}
export async function recognizeOrder(
  file: Blob,
  onProgress: (message: string) => void,
): Promise<OrderDetection> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/core',
    langPath: '/ocr/lang',
    workerBlobURL: false,
    logger: (event) => {
      if (event.status === 'recognizing text')
        onProgress(`Reading label ${Math.round(event.progress * 100)}%`);
    },
  });
  try {
    const texts: string[] = [];
    const confidences: number[] = [];
    const rotations = [null, Math.PI / 2, -Math.PI / 2] as const;
    for (let index = 0; index < rotations.length; index += 1) {
      if (index > 0)
        onProgress(`Checking rotated labels ${index === 1 ? '90°' : '270°'}`);
      const rotation = rotations[index];
      const { data } = await worker.recognize(
        file,
        rotation === null ? { rotateAuto: true } : { rotateRadians: rotation },
      );
      texts.push(data.text);
      confidences.push(data.confidence);
      const detection = detectOrder(texts.join('\n'), Math.max(...confidences));
      if (detection.referenceId || detection.candidates.length)
        return detection;
    }
    return detectOrder(texts.join('\n'), Math.max(...confidences));
  } finally {
    await worker.terminate();
  }
}
