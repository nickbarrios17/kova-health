import { describe, expect, it } from 'vitest';
import { currentStreak, metricValue, periodChange, series, stats, weekly } from '../src/index.js';

const row = (date: string, o: Record<string, unknown>) => ({ local_date: date, ...o });

describe('progress', () => {
  it('reads each metric and keeps missing days null', () => {
    expect(metricValue(row('2026-10-01', { steps: 8000 }), 'steps')).toBe(8000);
    expect(metricValue(row('2026-10-01', { steps: null }), 'steps')).toBeNull();
    expect(metricValue(row('2026-10-01', { habits_scheduled: 4, habits_completed: 3 }), 'habits')).toBe(75);
    expect(metricValue(row('2026-10-01', { habits_scheduled: 0, habits_completed: 0 }), 'habits')).toBeNull();
    expect(metricValue(row('2026-10-01', { kcal: '1850.5' }), 'food')).toBe(1850.5);
  });

  it('sorts by date and averages only days with data', () => {
    const s = series([row('2026-10-03', { sleep_min: 420 }), row('2026-10-01', { sleep_min: 480 }), row('2026-10-02', { sleep_min: null })], 'sleep');
    expect(s.map((p) => p.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(stats(s)).toMatchObject({ days: 2, avg: 450, min: 420, max: 480, first: 480, last: 420 });
    expect(stats([{ date: 'x', value: null }]).avg).toBeNull();
  });

  it('compares with the previous period (totals for training)', () => {
    const pts = Array.from({ length: 14 }, (_, i) => ({ date: '2026-10-' + String(i + 1).padStart(2, '0'), value: i < 7 ? 1 : i % 2 }));
    expect(periodChange(pts, 7, 'training')).toEqual({ now: 4, before: 7, delta: -3 });
    expect(periodChange(pts.slice(-7), 7, 'steps')).toBeNull(); // no previous period
  });

  it('groups by Monday-first weeks', () => {
    const pts = [{ date: '2026-10-25', value: 1 }, { date: '2026-10-26', value: 1 }, { date: '2026-10-27', value: 1 }]; // Sun, Mon, Tue
    expect(weekly(pts, 'training')).toEqual([{ date: '2026-10-19', value: 1 }, { date: '2026-10-26', value: 2 }]);
  });

  it('streak ending today or yesterday', () => {
    const pts = [{ date: '2026-10-26', value: 9000 }, { date: '2026-10-27', value: 11000 }, { date: '2026-10-28', value: 12000 }, { date: '2026-10-29', value: 2000 }];
    expect(currentStreak(pts, (v) => v >= 10000)).toBe(2); // today not met yet: counts from yesterday
    expect(currentStreak(pts, (v) => v >= 1000)).toBe(4);
  });
});
