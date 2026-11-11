import { describe, expect, it } from 'vitest';
import { footFuel, postWorkoutProtein, rideFuel, waterGoalMl, slotsFor, weekStartOf, weekTargets, workoutFuelTips } from '../src/mealPlan.js';

const base = { weekStart: '2026-11-09', baseKcal: 2200, proteinG: 150, fatG: 70, trainingDays: [1, 4], trainingKcal: 200, events: [], floorKcal: 1500 };
const total = (d: Array<{ kcal: number }>) => d.reduce((a, x) => a + x.kcal, 0);

describe('meal plan helpers', () => {
  it('adds training kcal (as carbs) on routine days', () => {
    const w = weekTargets(base);
    expect(w.map((d) => d.kind)).toEqual(['fuerza', 'descanso', 'descanso', 'fuerza', 'descanso', 'descanso', 'descanso']);
    expect(w[0]!.kcal).toBe(2400);
    expect(w[1]!.kcal).toBe(2200);
    expect(w[0]!.carbsG - w[1]!.carbsG).toBe(50);
  });

  it('pays for an asado with the rest of the week, keeping the week total', () => {
    const plain = weekTargets(base);
    const w = weekTargets({ ...base, events: [{ date: '2026-11-14', kind: 'asado' }] });
    expect(w[5]!.kind).toBe('evento');
    expect(w[5]!.kcal).toBe(2200 + 900);
    expect(Math.abs(total(w) - total(plain))).toBeLessThanOrEqual(40);
    // No other day loses more than 10 %.
    w.filter((d) => d.kind !== 'evento').forEach((d, k) => expect(d.kcal).toBeGreaterThanOrEqual(plain.filter((x) => x.kind !== 'evento' && x.date !== '2026-11-14')[k]!.kcal * 0.9 - 10));
  });

  it('never goes under the floor', () => {
    const w = weekTargets({ ...base, baseKcal: 1550, trainingKcal: 0, events: [{ date: '2026-11-10', kind: 'asado' }, { date: '2026-11-13', kind: 'salida' }] });
    w.filter((d) => d.kind !== 'evento').forEach((d) => expect(d.kcal).toBeGreaterThanOrEqual(1500));
  });

  it('lists the meals of a day and the week start', () => {
    expect(slotsFor(3)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(slotsFor(5)).toHaveLength(5);
    expect(weekStartOf('2026-11-12')).toBe('2026-11-09');
    expect(weekStartOf('2026-11-09')).toBe('2026-11-09');
    expect(weekStartOf('2026-11-15')).toBe('2026-11-09');
  });

  it('fuels a ride by duration', () => {
    expect(rideFuel(15000, 45 * 60, 75)).toMatchObject({ carbsG: 0, suggestion: null });
    const two = rideFuel(50000, 2 * 3600, 75);
    expect(two.carbsG).toBe(120);
    expect(two.waterMl).toBe(1000);
    expect(two.suggestion).toBe('3 bananas y 2 geles');
    // 25 km/h → 10 METs: (10 − 1) × 75 kg × 2 h.
    expect(two.kcal).toBe(1350);
  });

  it('says what to eat around a workout', () => {
    expect(postWorkoutProtein(80)).toBe(25);
    expect(postWorkoutProtein(150)).toBe(40);
    const t = workoutFuelTips({ routineName: 'Pecho', weightKg: 80, proteinLeftG: 60 });
    expect(t.before).toContain('Antes de Pecho');
    expect(t.after).toBe('Después: unos 25 g de proteína en la próxima comida. Hoy te faltan 60 g de proteína.');
  });

  it('sets a water goal', () => {
    expect(waterGoalMl(80, false)).toBe(2800);
    expect(waterGoalMl(80, true, 60)).toBe(3800);
    expect(waterGoalMl(null, false)).toBe(2450);
  });

  it('fuels a run or a walk', () => {
    expect(footFuel(10000, 3600, 70, 'run')).toEqual({ kcal: 700, carbsG: 0, waterMl: 500, suggestion: null });
    expect(footFuel(5000, 3600, 70, 'walk').kcal).toBe(180);
    expect(footFuel(21000, 7200, 70, 'run').suggestion).toBe('3 geles');
  });
});
