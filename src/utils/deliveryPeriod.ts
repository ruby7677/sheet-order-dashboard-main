export type DeliveryPeriodShortcut = 'previous' | 'current' | 'next';

export interface DeliveryPeriodRange {
  startDate: string;
  endDate: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS_FROM_CURRENT: Record<DeliveryPeriodShortcut, number> = {
  previous: -1,
  current: 0,
  next: 1,
};

/**
 * Parses the date-only formats used by the order API and spreadsheet.
 * Timestamps are intentionally rejected; delivery dates are calendar dates.
 */
export function parseCalendarDateKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})(?:-(\d{2})-(\d{2})|\/(\d{1,2})\/(\d{1,2}))$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2] ?? match[4]);
  const day = Number(match[3] ?? match[5]);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day
  ) return null;

  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function taipeiCalendarParts(instant: Date): { year: number; month: number; day: number } {
  if (!Number.isFinite(instant.getTime())) {
    throw new RangeError('A valid instant is required to calculate a delivery period');
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value);
  const calendar = { year: value('year'), month: value('month'), day: value('day') };
  if (!Number.isInteger(calendar.year) || !Number.isInteger(calendar.month) || !Number.isInteger(calendar.day)) {
    throw new RangeError('Unable to read the Taipei calendar date');
  }
  return calendar;
}

function formatUtcCalendarDate(instant: number): string {
  const date = new Date(instant);
  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the Wednesday-to-Saturday period in the Monday-based calendar week
 * containing the supplied instant, interpreted as a Taipei date.
 */
export function getDeliveryPeriodRange(
  instant: Date,
  shortcut: DeliveryPeriodShortcut,
): DeliveryPeriodRange {
  const { year, month, day } = taipeiCalendarParts(instant);
  const taipeiMidnightUtc = Date.UTC(year, month - 1, day);
  const weekday = new Date(taipeiMidnightUtc).getUTCDay();
  const daysFromMonday = (weekday + 6) % 7;
  const mondayUtc = taipeiMidnightUtc - daysFromMonday * DAY_MS;
  const weekShift = WEEKS_FROM_CURRENT[shortcut];
  const startUtc = mondayUtc + (2 + weekShift * 7) * DAY_MS;
  const endUtc = mondayUtc + (5 + weekShift * 7) * DAY_MS;

  return {
    startDate: formatUtcCalendarDate(startUtc),
    endDate: formatUtcCalendarDate(endUtc),
  };
}
