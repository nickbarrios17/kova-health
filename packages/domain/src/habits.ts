/**
 * Habit completion, streaks and weekly progress over rows returned by `habit_days(from, to)`.
 * Each day is judged by the schedule that applied on that day, so editing a habit never
 * rewrites its history.
 */
import { isoWeekday } from './time.js';

export interface HabitDay {
  local_date: string; // YYYY-MM-DD
  frequency: 'daily' | 'weekly';
  scheduled: boolean;
  times_per_week: number | null;
  target_value: number;
  value: number;
  completed: boolean;
}

export interface StreakOptions {
  /**
   * Flexible streaks: scheduled days that may be missed per ISO week without breaking the
   * streak (they still don't count towards it). Default 0 = strict.
   */
  allowedMissesPerWeek?: number;
}

const addDays = (d: string, n: number) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
};

/** Monday (ISO) of the week containing `d`. */
export const weekStart = (d: string) => addDays(d, 1 - isoWeekday(d));

const byDate = (days: HabitDay[]) => [...days].sort((a, b) => a.local_date.localeCompare(b.local_date));

/**
 * Current streak of a daily habit, in completed scheduled days, ending today.
 * Today counts if done, but an unfinished today does not break the streak (the day isn't over).
 * Unscheduled days are skipped.
 */
export function dailyStreak(days: HabitDay[], today: string, opts: StreakOptions = {}): number {
  const allowed = opts.allowedMissesPerWeek ?? 0;
  const misses = new Map<string, number>();
  let streak = 0;
  for (const d of byDate(days).reverse()) {
    if (d.local_date > today || !d.scheduled) continue;
    if (d.completed) {
      streak++;
      continue;
    }
    if (d.local_date === today) continue;
    const wk = weekStart(d.local_date);
    const used = (misses.get(wk) ?? 0) + 1;
    if (used > allowed) break;
    misses.set(wk, used);
  }
  return streak;
}

export interface WeekProgress {
  week_start: string;
  days_completed: number;
  target: number;
  met: boolean;
}

/** For weekly habits: how many days were completed in each ISO week vs. times_per_week. */
export function weeklyProgress(days: HabitDay[]): WeekProgress[] {
  const weeks = new Map<string, WeekProgress>();
  for (const d of byDate(days)) {
    const ws = weekStart(d.local_date);
    const w = weeks.get(ws) ?? { week_start: ws, days_completed: 0, target: d.times_per_week ?? 1, met: false };
    if (d.times_per_week != null) w.target = d.times_per_week; // latest schedule within the week
    if (d.completed) w.days_completed++;
    w.met = w.days_completed >= w.target;
    weeks.set(ws, w);
  }
  return [...weeks.values()];
}

/** Consecutive weeks that met their target, ending this week (an unmet current week doesn't break it). */
export function weeklyStreak(days: HabitDay[], today: string): number {
  const current = weekStart(today);
  let streak = 0;
  for (const w of weeklyProgress(days.filter((d) => d.local_date <= today)).reverse()) {
    if (w.met) streak++;
    else if (w.week_start === current) continue;
    else break;
  }
  return streak;
}

/** Share of scheduled days completed (daily habits), or of weeks met (weekly). null with no data. */
export function completionRate(days: HabitDay[], today: string): number | null {
  const past = days.filter((d) => d.local_date <= today);
  if (past.length === 0) return null;
  if (past[0]!.frequency === 'weekly') {
    const weeks = weeklyProgress(past).filter((w) => w.met || w.week_start !== weekStart(today));
    return weeks.length ? weeks.filter((w) => w.met).length / weeks.length : null;
  }
  const scheduled = past.filter((d) => d.scheduled && (d.completed || d.local_date !== today));
  return scheduled.length ? scheduled.filter((d) => d.completed).length / scheduled.length : null;
}
