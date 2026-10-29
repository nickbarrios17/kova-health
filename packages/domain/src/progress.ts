/**
 * Progress over time from daily_summaries rows: one series per metric, its averages and the change
 * against the previous period. Missing days stay null (never zero-filled), so an average only counts
 * days with data and the UI can say how many days that was.
 */

export type MetricKey = 'steps' | 'sleep' | 'food' | 'weight' | 'mood' | 'training' | 'heart' | 'habits';

export interface DayPoint {
  date: string; // local_date, YYYY-MM-DD
  value: number | null;
}

type Row = Record<string, unknown> & { local_date: string };

const n = (v: unknown): number | null => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** Daily value of a metric. food = kcal, training = sessions, habits = % of scheduled habits done. */
export function metricValue(row: Row, key: MetricKey): number | null {
  switch (key) {
    case 'steps': return n(row.steps);
    case 'sleep': return n(row.sleep_min);
    case 'food': return n(row.kcal);
    case 'weight': return n(row.weight_kg);
    case 'mood': return n(row.mood);
    case 'training': return n(row.workouts_completed);
    case 'heart': return n(row.resting_hr_bpm);
    case 'habits': {
      const s = n(row.habits_scheduled), d = n(row.habits_completed);
      return s && s > 0 ? Math.round(((d ?? 0) / s) * 100) : null;
    }
  }
}

export function series(rows: Row[], key: MetricKey): DayPoint[] {
  return [...rows].sort((a, b) => a.local_date.localeCompare(b.local_date)).map((r) => ({ date: r.local_date, value: metricValue(r, key) }));
}

export interface SeriesStats {
  days: number; // days with data
  avg: number | null;
  min: number | null;
  max: number | null;
  total: number | null;
  first: number | null; // first and last values with data (for weight change)
  last: number | null;
}

export function stats(points: DayPoint[]): SeriesStats {
  const v = points.map((p) => p.value).filter((x): x is number => x != null);
  if (!v.length) return { days: 0, avg: null, min: null, max: null, total: null, first: null, last: null };
  const total = v.reduce((a, b) => a + b, 0);
  return { days: v.length, avg: total / v.length, min: Math.min(...v), max: Math.max(...v), total, first: v[0]!, last: v[v.length - 1]! };
}

/**
 * Change of the average between the last `period` days and the `period` days before (needs both).
 * Training compares totals (sessions in the period), everything else averages.
 */
export function periodChange(points: DayPoint[], period: number, key: MetricKey): { now: number; before: number; delta: number } | null {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const cur = stats(sorted.slice(-period)), prev = stats(sorted.slice(-2 * period, -period));
  const pick = (s: SeriesStats) => (key === 'training' ? s.total : s.avg);
  const now = pick(cur), before = pick(prev);
  if (now == null || before == null || prev.days === 0) return null;
  return { now, before, delta: now - before };
}

/** Points grouped into ISO weeks (Monday first): sum for training, average otherwise. */
export function weekly(points: DayPoint[], key: MetricKey): DayPoint[] {
  const groups = new Map<string, number[]>();
  for (const p of points) {
    const d = new Date(p.date + 'T12:00:00Z');
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
    if (!groups.has(monday)) groups.set(monday, []);
    if (p.value != null) groups.get(monday)!.push(p.value);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({
    date,
    value: v.length ? (key === 'training' ? v.reduce((a, b) => a + b, 0) : v.reduce((a, b) => a + b, 0) / v.length) : key === 'training' ? 0 : null,
  }));
}

/** Days in a row, ending today or yesterday, where `ok` holds (e.g. step goal met, trained…). */
export function currentStreak(points: DayPoint[], ok: (v: number) => boolean): number {
  const sorted = [...points].sort((a, b) => b.date.localeCompare(a.date));
  let i = 0, streak = 0;
  if (sorted[0] && (sorted[0].value == null || !ok(sorted[0].value))) i = 1; // today may still be in progress
  for (; i < sorted.length; i++) {
    const v = sorted[i]!.value;
    if (v == null || !ok(v)) break;
    streak++;
  }
  return streak;
}
