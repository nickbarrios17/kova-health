import { describe, expect, it } from 'vitest';
import {
  atwaterKcal,
  kcalLooksInconsistent,
  macroProgress,
  scaleNutrients,
  sumNutrients,
} from '../src/nutrition.js';
import { completionRate, dailyStreak, weeklyProgress, weeklyStreak, weekStart, type HabitDay } from '../src/habits.js';
import { BodyMeasurementSchema, HealthObservationSchema, LogFoodSchema, SaveHabitSchema, FoodCreateSchema } from '../src/schemas.js';

const id = '7d3c6b2e-5a4f-4e1b-9c8d-0a1b2c3d4e5f';
const id2 = '0f1e2d3c-4b5a-4968-8776-655443322110';

describe('nutrition math', () => {
  // Prototype: Pechuga de pollo 150 g = 248 kcal, 47 P, 0 C, 5 G.
  const chicken = { ref_amount: 150, ref_unit: 'g' as const, kcal: 248, protein_g: 47, carbs_g: 0, fat_g: 5 };

  it('scales a food to the logged quantity like the server snapshot', () => {
    expect(scaleNutrients(chicken, 180)).toEqual({ kcal: 297.6, protein_g: 56.4, carbs_g: 0, fat_g: 6, fiber_g: null });
    const banana = { ref_amount: 1, ref_unit: 'serving' as const, kcal: 105, protein_g: 1, carbs_g: 27, fat_g: 0 };
    expect(scaleNutrients(banana, 2).kcal).toBe(210);
    expect(() => scaleNutrients(chicken, 0)).toThrow(RangeError);
  });

  it('sums meals and keeps unknown fiber unknown', () => {
    const t = sumNutrients([
      { kcal: 228, protein_g: 8, carbs_g: 40, fat_g: 4, fiber_g: 6 },
      { kcal: 105, protein_g: 1, carbs_g: 27, fat_g: 0 },
    ]);
    expect(t).toEqual({ kcal: 333, protein_g: 9, carbs_g: 67, fat_g: 4, fiber_g: null });
  });

  it('flags kcal that disagree with macros, without changing anything', () => {
    expect(atwaterKcal({ protein_g: 47, carbs_g: 0, fat_g: 5 })).toBe(233);
    expect(kcalLooksInconsistent(chicken)).toBe(false);
    expect(kcalLooksInconsistent({ kcal: 900, protein_g: 10, carbs_g: 10, fat_g: 1 })).toBe(true);
  });

  it('reports progress only against a goal that exists', () => {
    expect(macroProgress(112, 150)).toMatchObject({ ratio: 112 / 150, remaining: 38 });
    expect(macroProgress(112, null)).toEqual({ value: 112, goal: null, ratio: null, remaining: null });
  });
});

const day = (local_date: string, completed: boolean, scheduled = true, extra: Partial<HabitDay> = {}): HabitDay => ({
  local_date, frequency: 'daily', scheduled, times_per_week: null, target_value: 1, value: completed ? 1 : 0, completed, ...extra,
});

describe('habit streaks', () => {
  // 2026-10-19 is a Monday.
  it('counts completed scheduled days back from today and ignores an unfinished today', () => {
    const days = [day('2026-10-21', false), day('2026-10-22', true), day('2026-10-23', true), day('2026-10-24', false)];
    expect(dailyStreak(days, '2026-10-24')).toBe(2);
  });

  it('skips unscheduled days (e.g. a Mon/Wed/Fri habit)', () => {
    const days = [day('2026-10-19', true), day('2026-10-20', false, false), day('2026-10-21', true), day('2026-10-22', false, false), day('2026-10-23', true)];
    expect(dailyStreak(days, '2026-10-23')).toBe(3);
  });

  it('allows flexible misses per week when configured', () => {
    const days = [day('2026-10-19', true), day('2026-10-20', false), day('2026-10-21', true), day('2026-10-22', true)];
    expect(dailyStreak(days, '2026-10-22')).toBe(2);
    expect(dailyStreak(days, '2026-10-22', { allowedMissesPerWeek: 1 })).toBe(3);
  });

  it('evaluates weekly habits per ISO week', () => {
    const w = (d: string, done: boolean) => day(d, done, true, { frequency: 'weekly', times_per_week: 2 });
    const days = [w('2026-10-12', true), w('2026-10-14', true), w('2026-10-19', true), w('2026-10-21', false)];
    expect(weekStart('2026-10-25')).toBe('2026-10-19');
    expect(weeklyProgress(days).map((x) => [x.week_start, x.days_completed, x.met])).toEqual([
      ['2026-10-12', 2, true],
      ['2026-10-19', 1, false],
    ]);
    expect(weeklyStreak(days, '2026-10-21')).toBe(1); // current week not over yet
  });

  it('computes completion rate without penalising today', () => {
    const days = [day('2026-10-21', true), day('2026-10-22', false), day('2026-10-23', true), day('2026-10-24', false)];
    expect(completionRate(days, '2026-10-24')).toBeCloseTo(2 / 3);
    expect(completionRate([], '2026-10-24')).toBeNull();
  });
});

describe('phase 4 input schemas', () => {
  it('requires exactly one food source when logging', () => {
    const base = { id, local_date: '2026-10-24', slot: 'dinner', quantity: 150 };
    expect(LogFoodSchema.safeParse({ ...base, food_id: id2 }).success).toBe(true);
    expect(LogFoodSchema.safeParse(base).success).toBe(false);
    expect(LogFoodSchema.safeParse({ ...base, food_id: id2, recipe_id: id2 }).success).toBe(false);
    expect(LogFoodSchema.safeParse({ ...base, name: 'Tapas' }).success).toBe(false);
    expect(LogFoodSchema.safeParse({ ...base, name: 'Tapas', kcal: 400, protein_g: 20, carbs_g: 30, fat_g: 20 }).success).toBe(true);
  });

  it('never lets users claim verified data and rejects impossible macros', () => {
    const f = { id, name: 'Avena', ref_amount: 60, ref_unit: 'g', kcal: 228, protein_g: 8, carbs_g: 40, fat_g: 4 };
    expect(FoodCreateSchema.safeParse(f).success).toBe(true);
    expect(FoodCreateSchema.safeParse({ ...f, data_source: 'verified' }).success).toBe(false);
    expect(FoodCreateSchema.safeParse({ ...f, carbs_g: 80 }).success).toBe(false);
  });

  it('validates habit schedules', () => {
    expect(SaveHabitSchema.safeParse({ id, name: 'Agua', effective_from: '2026-10-24', kind: 'count', target_value: 8 }).success).toBe(true);
    expect(SaveHabitSchema.safeParse({ id, name: 'Yoga', effective_from: '2026-10-24', frequency: 'weekly' }).success).toBe(false);
    expect(SaveHabitSchema.safeParse({ id, name: 'Yoga', effective_from: '2026-10-24', times_per_week: 3 }).success).toBe(false);
  });

  it('applies per-metric ranges and interval rules', () => {
    const t = '2026-10-24T07:20:00Z';
    expect(BodyMeasurementSchema.safeParse({ id, metric: 'weight_kg', value: 78.4, measured_at: t }).success).toBe(true);
    expect(BodyMeasurementSchema.safeParse({ id, metric: 'body_fat_pct', value: 90, measured_at: t }).success).toBe(false);
    expect(HealthObservationSchema.safeParse({ id, metric: 'mood', value: 3.5, start_at: t }).success).toBe(false);
    expect(HealthObservationSchema.safeParse({ id, metric: 'steps', value: 7842, start_at: t }).success).toBe(false); // needs end_at
    expect(HealthObservationSchema.safeParse({
      id, metric: 'sleep_session', value: 432, start_at: '2026-10-23T21:48:00Z', end_at: '2026-10-24T05:20:00Z',
    }).success).toBe(true);
    expect(HealthObservationSchema.safeParse({
      id, metric: 'sleep_session', value: 500, start_at: '2026-10-23T21:48:00Z', end_at: '2026-10-24T05:20:00Z',
    }).success).toBe(false); // 500 min > 452 min in bed
  });
});
