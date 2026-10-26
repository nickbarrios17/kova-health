/** Mirrors SQL `(ts at time zone tz)::date` (ADR 0004). Returns YYYY-MM-DD. */
export function localDate(ts: Date | string | number, timeZone: string): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) throw new RangeError('Invalid timestamp');
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** ISO weekday 1 (Monday) … 7 (Sunday) of a YYYY-MM-DD local date. */
export function isoWeekday(localDateStr: string): number {
  const [y, m, d] = localDateStr.split('-').map(Number) as [number, number, number];
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}
