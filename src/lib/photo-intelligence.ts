/** Pure helpers: preserve a camera's local calendar date; never substitute file modification time. */
export type CaptureMetadata = {
  capturedAtLocal: string | null;
  captureDate: string | null;
  captureOffset: string | null;
  captureSource: 'EXIF' | 'CAMERA' | 'UNKNOWN';
};
export function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value &&
    value >= '1900-01-01' &&
    value <= '2199-12-31'
  );
}
export function captureFromTags(
  tags: Record<string, unknown> | undefined,
): CaptureMetadata {
  const unknown: CaptureMetadata = {
    capturedAtLocal: null,
    captureDate: null,
    captureOffset: null,
    captureSource: 'UNKNOWN',
  };
  // DateTimeOriginal is the original exposure, unlike ModifyDate/CreateDate or filesystem timestamps.
  const raw = tags?.DateTimeOriginal;
  if (typeof raw !== 'string') return unknown;
  const match = raw
    .trim()
    .match(
      /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:([+-]\d{2}:\d{2}|Z))?$/,
    );
  if (!match) return unknown;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  if (
    !validCalendarDate(date) ||
    Number(match[4]) > 23 ||
    Number(match[5]) > 59 ||
    Number(match[6]) > 59
  )
    return unknown;
  const offset =
    typeof tags?.OffsetTimeOriginal === 'string'
      ? tags.OffsetTimeOriginal
      : match[7] || null;
  return {
    captureDate: date,
    capturedAtLocal: `${date}T${match[4]}:${match[5]}:${match[6]}`,
    captureOffset:
      offset && /^(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(offset)
        ? offset
        : null,
    captureSource: 'EXIF',
  };
}
export function cameraCapture(now = new Date()): CaptureMetadata {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const minutes = -now.getTimezoneOffset();
  return {
    captureDate: date,
    capturedAtLocal: `${date}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    captureOffset: `${minutes >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`,
    captureSource: 'CAMERA',
  };
}
export type OrderDetection = {
  referenceId: string;
  orderName: string;
  confidence: number;
  candidates: string[];
  needsReview: boolean;
};
export function detectOrder(text: string, confidence: number): OrderDetection {
  const references = new Set<string>();
  const names = new Set<string>();
  for (const line of text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    const name = line.match(
      /^(?:order\s+name|product\s+name|item\s+name)\s*[:#=\-]\s*(.{3,100})$/i,
    );
    if (name) {
      names.add(name[1].trim());
      continue;
    }
    const labeled = line.match(
      /(?:order(?:\s*(?:id|number|no\.?|ref(?:erence)?))?|awb|tracking(?:\s*(?:id|number|no\.?))?|reference(?:\s*(?:id|number|no\.?))?|shipment(?:\s*(?:id|number))?)\s*[:#=\-]\s*([A-Z0-9][A-Z0-9._/-]{3,79})\b/i,
    );
    if (labeled && /\d/.test(labeled[1]))
      references.add(labeled[1].toUpperCase());
    // Common explicitly prefixed codes, never a random address/phone number.
    for (const match of line.matchAll(
      /\b(?:AWB|ORD|ORDER|INV|REF)[-_][A-Z0-9-]{4,50}\b/gi,
    ))
      if (/\d/.test(match[0])) references.add(match[0].toUpperCase());
  }
  const candidates = [...references];
  const certain = confidence >= 65;
  return {
    referenceId: certain && candidates.length === 1 ? candidates[0] : '',
    orderName: certain && names.size === 1 ? [...names][0] : '',
    confidence: Math.round(Math.max(0, Math.min(100, confidence))),
    candidates,
    needsReview: !certain || candidates.length !== 1 || names.size > 1,
  };
}
