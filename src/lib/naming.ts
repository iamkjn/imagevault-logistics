import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { validCalendarDate } from './photo-intelligence';
export const categories = ['Parcels', 'Pallets', 'Damaged', 'Other'] as const;
export type CategoryName = (typeof categories)[number];
export const timezone = () => process.env.TIMEZONE || 'Europe/London';
export function safeName(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 64) || 'unknown'
  );
}
export function folderPaths(
  category: CategoryName,
  date: Date | string | null,
  tz = timezone(),
) {
  if (date === null) return ['ImageVault', 'ImageVault/Misc'];
  const day =
    typeof date === 'string' ? date : formatInTimeZone(date, tz, 'yyyy-MM-dd');
  if (!validCalendarDate(day)) throw new Error('Invalid folder date.');
  return [
    'ImageVault',
    `ImageVault/${category}`,
    `ImageVault/${category}/${day.slice(0, 4)}`,
    `ImageVault/${category}/${day.slice(0, 4)}/${day}`,
  ];
}
export function imageName(
  category: string,
  reference: string,
  user: string,
  date: Date,
  tz = timezone(),
) {
  return `${safeName(category).toUpperCase()}_${safeName(reference)}_${formatInTimeZone(date, tz, 'HHmmss')}_${safeName(user)}.jpg`;
}
export function dateBounds(start: string, end: string, tz = timezone()) {
  const next = new Date(`${end}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    gte: fromZonedTime(`${start}T00:00:00`, tz),
    lt: fromZonedTime(`${next.toISOString().slice(0, 10)}T00:00:00`, tz),
  };
}
export function csvCell(value: unknown) {
  let s = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}
