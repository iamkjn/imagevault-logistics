import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import exifr from 'exifr';
import {
  captureFromTags,
  captureFromFilename,
  captureFromFileTimestamp,
  cameraCapture,
  detectOrder,
  validCalendarDate,
} from '../src/lib/photo-intelligence';
import { folderPaths } from '../src/lib/naming';
describe('original capture dates', () => {
  it('reads actual JPEG EXIF without shifting the device-local date', async () => {
    const original = await readFile(
      new URL('./fixtures/order-label.jpg', import.meta.url),
    );
    const tags = await exifr.parse(original, {
      pick: ['DateTimeOriginal', 'OffsetTimeOriginal'],
      reviveValues: false,
      translateValues: false,
    });
    expect(captureFromTags(tags)).toEqual({
      captureDate: '2024-12-31',
      capturedAtLocal: '2024-12-31T23:45:10',
      captureOffset: '-08:00',
      captureSource: 'EXIF',
    });
    expect(folderPaths('Parcels', '2024-12-31', 'Asia/Tokyo').at(-1)).toBe(
      'ImageVault/Parcels/2024/2024-12-31',
    );
  });
  it('does not mistake a generic modification time for capture time', () => {
    expect(
      captureFromTags({
        ModifyDate: '2026:10:18 12:00:00',
      }).captureDate,
    ).toBeNull();
  });
  it('uses HEIC creation metadata when the original exposure tag is absent', () => {
    expect(
      captureFromTags({ CreateDate: '2025:08:07 09:08:07' }),
    ).toMatchObject({
      captureDate: '2025-08-07',
      capturedAtLocal: '2025-08-07T09:08:07',
      captureSource: 'EXIF',
    });
  });
  it('reads common camera and WhatsApp dates from filenames', () => {
    expect(captureFromFilename('IMG_20250504_142530.jpg')).toMatchObject({
      captureDate: '2025-05-04',
      capturedAtLocal: '2025-05-04T14:25:30',
      captureSource: 'FILENAME',
    });
    expect(captureFromFilename('IMG-20240123-WA0001.jpg')).toMatchObject({
      captureDate: '2024-01-23',
      captureSource: 'FILENAME',
    });
    expect(
      captureFromFilename('WhatsApp Image 2026-11-04 at 19.53.53 (6).jpeg'),
    ).toMatchObject({
      captureDate: '2026-11-04',
      capturedAtLocal: '2026-11-04T19:53:53',
      captureSource: 'FILENAME',
    });
  });
  it('uses a plausible gallery timestamp as an explicitly estimated fallback', () => {
    const value = new Date(2025, 3, 2, 11, 12, 13);
    expect(
      captureFromFileTimestamp(value.getTime(), new Date(2026, 0, 1)),
    ).toMatchObject({
      captureDate: '2025-04-02',
      capturedAtLocal: '2025-04-02T11:12:13',
      captureSource: 'FILE_TIMESTAMP',
    });
  });
  it('keeps images without metadata unsorted', async () => {
    const tags = await exifr.parse(
      await readFile(
        new URL('./fixtures/order-label-no-date.png', import.meta.url),
      ),
      { reviveValues: false },
    );
    expect(captureFromTags(tags).captureDate).toBeNull();
    expect(folderPaths('Parcels', null)).toEqual([
      'ImageVault',
      'ImageVault/Misc',
    ]);
  });
  it('rejects impossible dates and hours', () => {
    expect(
      captureFromTags({ DateTimeOriginal: '2025:02:29 10:00:00' }).captureDate,
    ).toBeNull();
    expect(
      captureFromTags({ DateTimeOriginal: '2024:12:31 25:00:00' }).captureDate,
    ).toBeNull();
    expect(validCalendarDate('2024-02-29')).toBe(true);
  });
  it('marks direct camera fallback separately from EXIF', () => {
    const d = new Date(2026, 9, 18, 14, 30, 0);
    expect(cameraCapture(d)).toMatchObject({
      captureDate: '2026-10-18',
      capturedAtLocal: '2026-10-18T14:30:00',
      captureSource: 'CAMERA',
    });
  });
});
describe('order detection', () => {
  it('prioritizes a compound customer reference', () => {
    expect(
      detectOrder(
        'Buyer Order No: N73003324\nCustomer Ref:\n24690 / N73003324',
        91,
      ),
    ).toMatchObject({
      referenceId: '24690/N73003324',
      candidates: ['24690/N73003324'],
      needsReview: false,
    });
  });
  it('extracts a named order and labeled reference', () => {
    expect(
      detectOrder('Order ID: ORD-10482\nOrder Name: Blue Storage Boxes', 94),
    ).toMatchObject({
      referenceId: 'ORD-10482',
      orderName: 'Blue Storage Boxes',
      needsReview: false,
    });
  });
  it('does not treat phone numbers and addresses as order numbers', () => {
    expect(
      detectOrder('Call 020 1234 5678\n102 Warehouse Road', 95).referenceId,
    ).toBe('');
  });
  it('requires correction for ambiguous labels', () => {
    const d = detectOrder('Order ID: ORD-12345\nAWB: 98765432', 93);
    expect(d.referenceId).toBe('');
    expect(d.candidates).toHaveLength(2);
    expect(d.needsReview).toBe(true);
  });
  it('does not auto-fill low-confidence text', () => {
    expect(detectOrder('Order ID: ORD-10482', 40)).toMatchObject({
      referenceId: '',
      needsReview: true,
    });
  });
});
