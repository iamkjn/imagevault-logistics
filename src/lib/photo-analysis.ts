'use client';
import {
  captureFromTags,
  cameraCapture,
  detectOrder,
  type CaptureMetadata,
  type OrderDetection,
} from './photo-intelligence';
export async function readCapture(
  original: File,
  source: 'gallery' | 'camera',
): Promise<CaptureMetadata> {
  try {
    const exifr = await import('exifr');
    const tags = await exifr.parse(original, {
      pick: ['DateTimeOriginal', 'OffsetTimeOriginal'],
      reviveValues: false,
      translateValues: false,
    });
    const capture = captureFromTags(tags);
    if (capture.captureDate) return capture;
  } catch {
    /* Malformed/stripped metadata is an unsorted image, not today's date. */
  }
  return source === 'camera' ? cameraCapture() : captureFromTags(undefined);
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
    const { data } = await worker.recognize(file);
    return detectOrder(data.text, data.confidence);
  } finally {
    await worker.terminate();
  }
}
