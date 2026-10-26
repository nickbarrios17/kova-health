import { describe, expect, it } from 'vitest';
import { isoWeekday, isValidTimeZone, localDate } from '../src/time.js';

describe('localDate', () => {
  it('keeps a late-evening workout on its local day', () => {
    // 23:30 in Madrid (CEST, UTC+2) is 21:30 UTC the same day.
    expect(localDate('2026-07-10T21:30:00Z', 'Europe/Madrid')).toBe('2026-07-10');
    // 00:30 Madrid next day is still 22:30 UTC the previous day.
    expect(localDate('2026-07-10T22:30:00Z', 'Europe/Madrid')).toBe('2026-07-11');
  });

  it('handles the DST spring-forward night', () => {
    // Europe/Madrid jumps 02:00 → 03:00 on 2026-03-29.
    expect(localDate('2026-03-28T22:59:59Z', 'Europe/Madrid')).toBe('2026-03-28'); // 23:59:59 CET
    expect(localDate('2026-03-28T23:00:00Z', 'Europe/Madrid')).toBe('2026-03-29'); // 00:00 CET
    expect(localDate('2026-03-29T21:59:59Z', 'Europe/Madrid')).toBe('2026-03-29'); // 23:59:59 CEST
    expect(localDate('2026-03-29T22:00:00Z', 'Europe/Madrid')).toBe('2026-03-30');
  });

  it('handles the DST fall-back night', () => {
    // 2026-10-25: 03:00 CEST → 02:00 CET.
    expect(localDate('2026-10-25T22:59:59Z', 'Europe/Madrid')).toBe('2026-10-25'); // 23:59:59 CET
    expect(localDate('2026-10-25T23:00:00Z', 'Europe/Madrid')).toBe('2026-10-26');
  });

  it('differs across zones for the same instant', () => {
    const t = '2026-10-26T03:00:00Z';
    expect(localDate(t, 'UTC')).toBe('2026-10-26');
    expect(localDate(t, 'America/Argentina/Buenos_Aires')).toBe('2026-10-26'); // 00:00 −03
    expect(localDate(t, 'America/Los_Angeles')).toBe('2026-10-25'); // 20:00 PDT
  });

  it('rejects invalid input', () => {
    expect(() => localDate('not a date', 'UTC')).toThrow(RangeError);
    expect(isValidTimeZone('Europe/Madrid')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('computes ISO weekdays (Monday = 1)', () => {
    expect(isoWeekday('2026-10-26')).toBe(1);
    expect(isoWeekday('2026-10-25')).toBe(7);
  });
});
