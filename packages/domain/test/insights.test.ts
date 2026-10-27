import { describe, expect, it } from 'vitest';
import { evidenceFor, generateInsights, scoreInsight, type DaySummary, type HabitDayLite } from '../src/insights.js';
import { addDays } from '../src/format.js';

const blank = (local_date: string): DaySummary => ({
  local_date, workouts_completed: 0, kcal: null, protein_g: null, protein_goal_g: null, weight_kg: null, steps: null, sleep_min: null, mood: null,
});
const series = (n: number, start = '2026-09-01', f: (d: DaySummary, i: number) => Partial<DaySummary> = () => ({})) =>
  Array.from({ length: n }, (_, i) => {
    const d = blank(addDays(start, i));
    return { ...d, ...f(d, i) };
  });

describe('evidence levels', () => {
  it('requires both samples and a real effect', () => {
    expect(evidenceFor(2, 5, 0.5)).toBe('insufficient');
    expect(evidenceFor(10, 0.1, 0.5)).toBe('insufficient');
    expect(evidenceFor(3, 0.6, 0.5)).toBe('weak');
    expect(evidenceFor(5, 0.6, 0.5)).toBe('emerging');
    expect(evidenceFor(8, 1.2, 0.5)).toBe('confirmed');
  });
});

describe('generateInsights', () => {
  it('returns nothing for an empty history (no invented insights)', () => {
    expect(generateInsights(series(30))).toEqual([]);
  });

  it('reports training as a fact comparing two weeks', () => {
    const days = series(14, '2026-09-01', (_d, i) => ({ workouts_completed: i >= 7 ? (i % 2) : (i === 0 ? 1 : 0) }));
    const t = generateInsights(days).find((x) => x.key === 'training-week')!;
    expect(t.kind).toBe('fact');
    expect(t.title).toBe('Entrenaste 4 veces esta semana, 3 más que la anterior.');
  });

  it('turns a sleep/mood association into a pattern only with enough days, never causal wording', () => {
    const few = series(8, '2026-09-01', (_d, i) => ({ sleep_min: i % 2 ? 360 : 450, mood: i % 2 ? 2 : 4 }));
    const weak = generateInsights(few).find((x) => x.key === 'sleep-mood')!;
    expect(weak.kind).toBe('hypothesis');
    expect(weak.title).toMatch(/podría/);

    const many = series(20, '2026-09-01', (_d, i) => ({ sleep_min: i % 2 ? 360 : 450, mood: i % 2 ? 2 : 4 }));
    const strong = generateInsights(many).find((x) => x.key === 'sleep-mood')!;
    expect(strong.kind).toBe('pattern');
    expect(strong.evidence).toBe('confirmed');
    for (const i of [weak, strong]) {
      const text = (i.title + ' ' + i.detail).replace('no una causa', '');
      expect(text).not.toMatch(/porque|causa/i);
    }
    expect(strong.detail).toMatch(/no una causa/);
  });

  it('projects weight with its assumption stated', () => {
    const days = series(21, '2026-09-01', (_d, i) => (i % 3 === 0 ? { weight_kg: 80 - i * 0.05 } : {}));
    const w = generateInsights(days).find((x) => x.key === 'weight-trend')!;
    expect(w.kind).toBe('prediction');
    expect(w.title).toMatch(/^Si mantienes este ritmo/);
  });

  it('finds the weakest weekday for daily habits', () => {
    const habit: HabitDayLite[] = Array.from({ length: 42 }, (_, i) => {
      const local_date = addDays('2026-09-07', i); // 2026-09-07 is a Monday
      return { habit_id: 'h', local_date, frequency: 'daily', scheduled: true, completed: i % 7 !== 1 }; // Tuesdays missed
    });
    const w = generateInsights([], habit).find((x) => x.key.startsWith('habit-weekday'))!;
    expect(w.title).toMatch(/^Los martes/);
  });

  it('is honest about missing data instead of guessing', () => {
    const days = series(14, '2026-09-01', (_d, i) => (i < 7 ? { sleep_min: 420 } : {}));
    const i = generateInsights(days).find((x) => x.key === 'sleep-missing');
    expect(i?.title).toMatch(/No hay datos de sueño/);
    expect(i?.detail).toMatch(/No significa que hayas dormido poco/);
  });

  it('penalises repetition (fatigue) and caps the list', () => {
    const days = series(14, '2026-09-01', (_d, i) => ({ workouts_completed: i % 2 }));
    const fresh = generateInsights(days)[0]!;
    expect(scoreInsight(fresh, 3)).toBeLessThan(scoreInsight(fresh, 0));
    expect(generateInsights(days, [], {}, 1)).toHaveLength(1);
  });
});
