/** Pure helpers: preserve a camera's local calendar date; never substitute file modification time. */
export type CaptureMetadata = {
  capturedAtLocal: string | null;
  captureDate: string | null;
  captureOffset: string | null;
  captureSource: 'EXIF' | 'FILENAME' | 'FILE_TIMESTAMP' | 'CAMERA' | 'UNKNOWN';
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
  // Prefer the exposure timestamp. Some HEIC/edited images expose only a
  // digitized/creation timestamp, which is still a better capture candidate
  // than making the user file every image manually.
  const candidates = [
    tags?.DateTimeOriginal,
    tags?.DateTimeDigitized,
    tags?.CreateDate,
    tags?.CreationDate,
    tags?.MediaCreateDate,
  ];
  const raw = candidates.find(
    (value) => typeof value === 'string' || value instanceof Date,
  );
  if (!raw) return unknown;
  if (raw instanceof Date && Number.isFinite(raw.getTime())) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const date = `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`;
    if (!validCalendarDate(date)) return unknown;
    return {
      captureDate: date,
      capturedAtLocal: `${date}T${pad(raw.getHours())}:${pad(raw.getMinutes())}:${pad(raw.getSeconds())}`,
      captureOffset: null,
      captureSource: 'EXIF',
    };
  }
  const match = String(raw)
    .trim()
    .match(
      /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:([+-]\d{2}:?\d{2}|Z))?$/,
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
      : typeof tags?.OffsetTimeDigitized === 'string'
        ? tags.OffsetTimeDigitized
        : match[7]
          ? match[7].replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
          : null;
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

export function captureFromFilename(fileName: string): CaptureMetadata {
  const unknown: CaptureMetadata = {
    capturedAtLocal: null,
    captureDate: null,
    captureOffset: null,
    captureSource: 'UNKNOWN',
  };
  const match = fileName.match(
    /(?:^|\D)((?:19|20)\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?([0-2]\d|3[01])(?:(?:T|[_ .-]*at[_ .-]*|[_ .-])?([01]\d|2[0-3])[-_.:]?([0-5]\d)[-_.:]?([0-5]\d))?(?:\D|$)/i,
  );
  if (!match) return unknown;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  if (!validCalendarDate(date)) return unknown;
  return {
    captureDate: date,
    capturedAtLocal: match[4]
      ? `${date}T${match[4]}:${match[5]}:${match[6]}`
      : null,
    captureOffset: null,
    captureSource: 'FILENAME',
  };
}

export function captureFromFileTimestamp(
  lastModified: number,
  now = new Date(),
): CaptureMetadata {
  const value = new Date(lastModified);
  if (
    !Number.isFinite(value.getTime()) ||
    value.getFullYear() < 1990 ||
    value.getTime() > now.getTime() + 24 * 60 * 60 * 1000
  )
    return captureFromTags(undefined);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  return {
    captureDate: date,
    capturedAtLocal: `${date}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`,
    captureOffset: null,
    captureSource: 'FILE_TIMESTAMP',
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
  const customerReferences = new Set<string>();
  const names = new Set<string>();
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const cleanReference = (value: string) =>
    value
      .trim()
      .replace(/\s*([./_-])\s*/g, '$1')
      .replace(/\s+/g, ' ')
      .replace(/[.,;:]+$/, '')
      .toUpperCase();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const name = line.match(
      /^(?:order\s+name|product\s+name|item\s+name)\s*[:#=\-]\s*(.{3,100})$/i,
    );
    if (name) {
      names.add(name[1].trim());
      continue;
    }
    const customer = line.match(
      /customer\s*(?:ref(?:erence)?|number|no\.?)\s*[:#=\-]?\s*([A-Z0-9][A-Z0-9._/\- ]{3,79})$/i,
    );
    const customerValue =
      customer?.[1] ||
      (/^customer\s*(?:ref(?:erence)?|number|no\.?)\s*[:#=\-]?\s*$/i.test(line)
        ? lines[index + 1]
        : '');
    if (customerValue) {
      const value = cleanReference(customerValue);
      if (/\d/.test(value)) customerReferences.add(value);
      continue;
    }
    const labeled = line.match(
      /(?:buyer\s+order(?:\s*(?:id|number|no\.?))?|purchase\s+order(?:\s*(?:id|number|no\.?|numbers?))?|order(?:\s*(?:id|number|no\.?|ref(?:erence)?))?|awb|tracking(?:\s*(?:id|number|no\.?))?|reference(?:\s*(?:id|number|no\.?))?|shipment(?:\s*(?:id|number))?)\s*[:#=\-]\s*([A-Z0-9][A-Z0-9._/\-]{3,79})\b/i,
    );
    if (labeled && /\d/.test(labeled[1]))
      references.add(cleanReference(labeled[1]));
    // Common explicitly prefixed codes, never a random address/phone number.
    for (const match of line.matchAll(
      /\b(?:AWB|ORD|ORDER|INV|REF)[-_][A-Z0-9-]{4,50}\b/gi,
    ))
      if (/\d/.test(match[0])) references.add(match[0].toUpperCase());
  }
  const candidates = customerReferences.size
    ? [...customerReferences]
    : [...references];
  const certain = confidence >= 65;
  return {
    referenceId: certain && candidates.length === 1 ? candidates[0] : '',
    orderName: certain && names.size === 1 ? [...names][0] : '',
    confidence: Math.round(Math.max(0, Math.min(100, confidence))),
    candidates,
    needsReview: !certain || candidates.length !== 1 || names.size > 1,
  };
}
