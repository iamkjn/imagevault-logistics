import { describe, it, expect } from 'vitest';
import { folderPaths, imageName, dateBounds, csvCell } from '../src/lib/naming';
describe('Drive naming and timezone boundaries', () => {
  it('creates the exact category/year/date hierarchy', () => {
    expect(
      folderPaths('Parcels', new Date('2026-10-17T12:00:00Z'), 'Europe/London'),
    ).toEqual([
      'ImageVault',
      'ImageVault/Parcels',
      'ImageVault/Parcels/2026',
      'ImageVault/Parcels/2026/2026-10-17',
    ]);
  });
  it('uses local date at a UTC year boundary', () => {
    expect(
      folderPaths(
        'Pallets',
        new Date('2025-12-31T23:30:00Z'),
        'Asia/Kolkata',
      ).at(-1),
    ).toBe('ImageVault/Pallets/2026/2026-01-01');
  });
  it('sanitizes paths, usernames and extension tricks', () => {
    const name = imageName(
      'Parcels',
      '../../AWB?1',
      'A / Smith.exe',
      new Date('2026-07-17T22:01:02Z'),
      'Europe/London',
    );
    expect(name).toBe('PARCELS__AWB_1_230102_A_Smith_exe.jpg');
    expect(name).not.toContain('/');
  });
  it('builds a 23-hour day at the spring DST boundary', () => {
    const b = dateBounds('2026-03-29', '2026-03-29', 'Europe/London');
    expect(b.gte.toISOString()).toBe('2026-03-29T00:00:00.000Z');
    expect(b.lt.toISOString()).toBe('2026-03-29T23:00:00.000Z');
  });
  it('builds a 25-hour day at the autumn DST boundary', () => {
    const b = dateBounds('2026-10-25', '2026-10-25', 'Europe/London');
    expect(b.lt.getTime() - b.gte.getTime()).toBe(25 * 60 * 60 * 1000);
  });
  it('prevents CSV formula injection and escapes quotes', () => {
    expect(csvCell(' =HYPERLINK("bad")')).toBe('"\' =HYPERLINK(""bad"")"');
    expect(csvCell('ordinary, text')).toBe('"ordinary, text"');
  });
});
